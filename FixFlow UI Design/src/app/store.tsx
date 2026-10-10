import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { permissionsForRole, type Actor, type Permission } from "../domain/permissions";
import type { Database, PersistedState, Role, Session } from "../domain/types";
import { audit, type Result } from "../services/repairService";
import { load, resetToSeed, save, saveNow, SCHEMA_VERSION } from "../persistence/storage";

/**
 * Application store.
 *
 * Owns the database and the signed-in session, and exposes exactly one way to
 * change data: `run()`. Mutations are cloned before they run and only committed
 * when the service reports success, so a failed operation can never leave the
 * database half-updated — and a double-click cannot apply twice.
 */

export type Toast = { id: string; tone: "success" | "error" | "info"; message: string };

type StoreValue = {
  db: Database;
  session: Session | null;
  actor: Actor | null;
  can: (permission: Permission) => boolean;
  login: (email: string, password: string) => Result<Session>;
  logout: () => void;
  setActiveBranch: (branchId: string | "all") => void;
  /** Runs a service function against a cloned draft. Commit only on success. */
  run: <T>(fn: (db: Database, actor: Actor) => Result<T>) => Result<T>;
  resetDemo: () => void;
  toasts: Toast[];
  pushToast: (tone: Toast["tone"], message: string) => void;
  dismissToast: (id: string) => void;
};

const StoreContext = createContext<StoreValue | null>(null);

function buildActor(db: Database, session: Session): Actor {
  const user = db.users.find((item) => item.id === session.userId);
  const role: Role = user?.role ?? session.role;
  return {
    userId: session.userId,
    name: user?.name ?? "Unknown user",
    role,
    branchId: session.branchId === "all" ? session.activeBranchId : session.branchId,
    permissions: permissionsForRole(role),
  };
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<PersistedState>(() => load());
  const [toasts, setToasts] = useState<Toast[]>([]);

  // Mirrors state.db so consecutive mutations in the same tick see fresh data.
  const dbRef = useRef<Database>(state.db);
  dbRef.current = state.db;

  useEffect(() => {
    save(state);
  }, [state]);

  // A pending save must not be lost if the tab closes mid-debounce.
  useEffect(() => {
    const flush = () => saveNow({ ...state, db: dbRef.current });
    window.addEventListener("beforeunload", flush);
    return () => window.removeEventListener("beforeunload", flush);
  }, [state]);

  const pushToast = useCallback((tone: Toast["tone"], message: string) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setToasts((current) => [...current, { id, tone, message }]);
    window.setTimeout(() => setToasts((current) => current.filter((toast) => toast.id !== id)), 4500);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const session = state.session;

  const actor = useMemo(() => (session ? buildActor(state.db, session) : null), [state.db, session]);

  const can = useCallback(
    (permission: Permission) => (actor ? actor.permissions.has(permission) : false),
    [actor],
  );

  const login = useCallback(
    (email: string, password: string): Result<Session> => {
      const db = dbRef.current;
      const user = db.users.find((item) => item.email.toLowerCase() === email.trim().toLowerCase());
      if (!user || user.demoPassword !== password) {
        return { ok: false, error: "Incorrect email or password." };
      }
      if (!user.isActive) {
        return { ok: false, error: "This account has been deactivated." };
      }
      const customer = db.customers.find((item) => item.portalUserId === user.id);
      const nextSession: Session = {
        userId: user.id,
        role: user.role,
        branchId: user.branchId,
        activeBranchId: user.role === "admin" ? "all" : user.branchId === "all" ? "all" : user.branchId,
        customerId: customer?.id,
        loggedInAt: new Date().toISOString(),
      };

      const draft = structuredClone(db);
      const signedInUser = draft.users.find((item) => item.id === user.id);
      if (signedInUser) signedInUser.lastLoginAt = nextSession.loggedInAt;
      audit(draft, {
        action: "auth.login",
        actor: buildActor(draft, nextSession),
        entityType: "user",
        entityId: user.id,
        branchId: user.branchId === "all" ? undefined : user.branchId,
        summary: `${user.name} signed in.`,
      });
      dbRef.current = draft;
      setState((current) => ({ ...current, db: draft, session: nextSession }));
      return { ok: true, value: nextSession };
    },
    [],
  );

  const logout = useCallback(() => {
    const current = dbRef.current;
    if (session) {
      const draft = structuredClone(current);
      audit(draft, {
        action: "auth.logout",
        actor: buildActor(draft, session),
        entityType: "user",
        entityId: session.userId,
        summary: "Signed out.",
      });
      dbRef.current = draft;
      setState((prev) => ({ ...prev, db: draft, session: null }));
      return;
    }
    setState((prev) => ({ ...prev, session: null }));
  }, [session]);

  const setActiveBranch = useCallback((branchId: string | "all") => {
    setState((prev) =>
      prev.session ? { ...prev, session: { ...prev.session, activeBranchId: branchId } } : prev,
    );
  }, []);

  const run = useCallback(
    <T,>(fn: (db: Database, actor: Actor) => Result<T>): Result<T> => {
      const currentSession = dbRef.current ? state.session : null;
      if (!currentSession) return { ok: false, error: "You are not signed in." };
      const currentActor = buildActor(dbRef.current, {
        ...currentSession,
        activeBranchId: currentSession.activeBranchId,
      });
      const draft = structuredClone(dbRef.current);
      let result: Result<T>;
      try {
        result = fn(draft, currentActor);
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : "Something went wrong." };
      }
      if (!result.ok) return result;
      dbRef.current = draft;
      setState((prev) => ({ ...prev, db: draft }));
      return result;
    },
    [state.session],
  );

  const resetDemo = useCallback(() => {
    const fresh = resetToSeed();
    dbRef.current = fresh.db;
    setState({ schemaVersion: SCHEMA_VERSION, db: fresh.db, session: null });
    pushToast("info", "Demo data has been restored to the seeded dataset.");
  }, [pushToast]);

  const value = useMemo<StoreValue>(
    () => ({
      db: state.db,
      session: state.session,
      actor,
      can,
      login,
      logout,
      setActiveBranch,
      run,
      resetDemo,
      toasts,
      pushToast,
      dismissToast,
    }),
    [state.db, state.session, actor, can, login, logout, setActiveBranch, run, resetDemo, toasts, pushToast, dismissToast],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreValue {
  const value = useContext(StoreContext);
  if (!value) throw new Error("useStore must be used inside <StoreProvider>.");
  return value;
}

export function useDatabase(): Database {
  return useStore().db;
}

export function useSession(): Session | null {
  return useStore().session;
}

export function useActor(): Actor | null {
  return useStore().actor;
}

export function useCan(): (permission: Permission) => boolean {
  return useStore().can;
}
