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
import type { Database, Role, Session } from "../domain/types";
import { callFunction } from "../lib/auth";
import type { Result } from "../services/repairService";

export type Toast = { id: string; tone: "success" | "error" | "info"; message: string };

type StoreValue = {
  db: Database;
  session: Session | null;
  actor: Actor | null;
  can: (permission: Permission) => boolean;
  /** Runs a service function against the backend via Cloud Functions. */
  run: <T>(fn: (db: Database, actor: Actor) => Result<T> | Promise<Result<T>>) => Promise<Result<T>>;
  toasts: Toast[];
  pushToast: (tone: Toast["tone"], message: string) => void;
  dismissToast: (id: string) => void;
  setActiveBranch: (branchId: string | "all") => void;
  resetDemo: () => void;
  logout: () => void;
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
  const businessSettings = { name: "FixFlow Repair", tagline: "One connected workflow", address: "", phone: "", email: "", registrationNo: "", currency: "LKR" as const, currencySymbol: "Rs", locale: "en-LK", timezone: "Asia/Colombo", taxEnabled: false, taxLabel: "VAT", taxRatePercent: 15, receiptFooter: "Thank you for your business!", defaultWarranty: { repairMonths: 3, productMonths: 12, partMonths: 6 }, numbering: { repair: "FX", estimate: "EST", invoice: "INV", sale: "POS", payment: "PAY", purchaseOrder: "PO", warranty: "WAR", claim: "CLM" }, paymentMethods: [{ id: "cash" as const, label: "Cash", enabled: true }, { id: "card" as const, label: "Card", enabled: true }, { id: "bank" as const, label: "Bank Transfer", enabled: true }, { id: "other" as const, label: "Other", enabled: true }] };

  const initialDb = {
    business: businessSettings,
    branches: [],
    users: [],
    customers: [],
    devices: [],
    repairs: [],
    repairParts: [],
    repairEvents: [],
    diagnoses: [],
    estimates: [],
    approvals: [],
    categories: [],
    products: [],
    inventory: [],
    stockMovements: [],
    stockReservations: [],
    suppliers: [],
    purchaseOrders: [],
    goodsReceipts: [],
    sales: [],
    invoices: [],
    payments: [],
    refunds: [],
    warranties: [],
    warrantyClaims: [],
    expenses: [],
    cashSessions: [],
    notifications: [],
    attachments: [],
    auditLogs: [],
    sequences: {},
  };

  const [db, setDb] = useState<Database>(initialDb);
  const [session, setSession] = useState<Session | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);

  // Keep a ref to the latest db for concurrent mutations
  const dbRef = useRef<Database>(db);
  dbRef.current = db;

  const pushToast = useCallback((tone: Toast["tone"], message: string) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setToasts((current) => [...current, { id, tone, message }]);
    window.setTimeout(() => setToasts((current) => current.filter((toast) => toast.id !== id)), 4500);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const setActiveBranch = useCallback((branchId: string | "all") => {
    setSession((prev) => (prev ? { ...prev, activeBranchId: branchId } : null));
  }, []);

  const resetDemo = useCallback(() => {
    // Reset local DB to empty state - in real app this would call a backend function
    const businessSettings = { name: "FixFlow Repair", tagline: "One connected workflow", address: "", phone: "", email: "", registrationNo: "", currency: "LKR" as const, currencySymbol: "Rs", locale: "en-LK", timezone: "Asia/Colombo", taxEnabled: false, taxLabel: "VAT", taxRatePercent: 15, receiptFooter: "Thank you for your business!", defaultWarranty: { repairMonths: 3, productMonths: 12, partMonths: 6 }, numbering: { repair: "FX", estimate: "EST", invoice: "INV", sale: "POS", payment: "PAY", purchaseOrder: "PO", warranty: "WAR", claim: "CLM" }, paymentMethods: [{ id: "cash" as const, label: "Cash", enabled: true }, { id: "card" as const, label: "Card", enabled: true }, { id: "bank" as const, label: "Bank Transfer", enabled: true }, { id: "other" as const, label: "Other", enabled: true }] };
    setDb({
      business: businessSettings,
      branches: [],
      users: [],
      customers: [],
      devices: [],
      repairs: [],
      repairParts: [],
      repairEvents: [],
      diagnoses: [],
      estimates: [],
      approvals: [],
      categories: [],
      products: [],
      inventory: [],
      stockMovements: [],
      stockReservations: [],
      suppliers: [],
      purchaseOrders: [],
      goodsReceipts: [],
      sales: [],
      invoices: [],
      payments: [],
      refunds: [],
      warranties: [],
      warrantyClaims: [],
      expenses: [],
      cashSessions: [],
      notifications: [],
      attachments: [],
      auditLogs: [],
      sequences: {},
    });
    setSession(null);
    setToasts([]);
    pushToast("info", "Demo data has been restored to the seeded dataset.");
  }, [pushToast]);

  const logout = useCallback(() => {
    setSession(null);
  }, []);

  const actor = useMemo(() => (session ? buildActor(db, session) : null), [db, session]);

  const can = useCallback(
    (permission: Permission) => (actor ? actor.permissions.has(permission) : false),
    [actor],
  );

  const run = useCallback(
    <T,>(fn: (db: Database, actor: Actor) => Result<T> | Promise<Result<T>>): Promise<Result<T>> => {
      const currentSession = session;
      if (!currentSession) return Promise.resolve({ ok: false, error: "You are not signed in." });
      const currentActor = buildActor(dbRef.current, {
        ...currentSession,
        activeBranchId: currentSession.activeBranchId,
      });
      try {
        const result = fn(dbRef.current, currentActor);
        const promise = Promise.resolve(result);
        return promise.then((resolvedResult) => {
          if (resolvedResult.ok) {
            // Refresh local cache after successful mutation if needed
          }
          return resolvedResult;
        });
      } catch (error) {
        return Promise.resolve({ ok: false, error: error instanceof Error ? error.message : "Something went wrong." });
      }
    },
    [session],
  );

  const value = useMemo<StoreValue>(
    () => ({
      db,
      session,
      actor,
      can,
      run,
      toasts,
      pushToast,
      dismissToast,
      setActiveBranch,
      resetDemo,
      logout,
    }),
    [db, session, actor, can, run, toasts, pushToast, dismissToast, setActiveBranch, resetDemo, logout],
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