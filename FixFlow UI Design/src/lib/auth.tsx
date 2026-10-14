import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import {
  User as FirebaseUser,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  getIdTokenResult,
  UserCredential,
} from "firebase/auth";
import { auth, functions } from "./firebase.js";
import { httpsCallable } from "firebase/functions";
import type { Session, Role } from "../domain/types.js";

interface Claims {
  role: Role;
  branchId?: string;
  customerId?: string;
  technicianId?: string;
}

interface AuthContextValue {
  session: Session | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  signOut: () => Promise<void>;
  refreshToken: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        try {
          const tokenResult = await getIdTokenResult(firebaseUser, true);
          const claims = tokenResult.claims as unknown as Claims;

          const newSession: Session = {
            userId: firebaseUser.uid,
            role: claims.role,
            branchId: claims.branchId ?? "default",
            activeBranchId: claims.role === "admin" && claims.branchId === "all" ? "all" : claims.branchId ?? "default",
            customerId: claims.customerId,
            loggedInAt: new Date().toISOString(),
          };
          setSession(newSession);
        } catch (error) {
          console.error("Failed to get token claims:", error);
          setSession(null);
        }
      } else {
        setSession(null);
      }
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  const signIn = async (email: string, password: string): Promise<{ ok: boolean; error?: string }> => {
    try {
      const userCredential: UserCredential = await signInWithEmailAndPassword(auth, email, password);
      // The onAuthStateChanged listener will handle setting the session
      return { ok: true };
    } catch (error: any) {
      let message = "Sign in failed";
      if (error.code === "auth/user-not-found" || error.code === "auth/wrong-password" || error.code === "auth/invalid-credential") {
        message = "Incorrect email or password.";
      } else if (error.code === "auth/user-disabled") {
        message = "This account has been deactivated.";
      } else if (error.code === "auth/too-many-requests") {
        message = "Too many failed attempts. Please try again later.";
      }
      return { ok: false, error: message };
    }
  };

  const signOut = async (): Promise<void> => {
    await firebaseSignOut(auth);
    setSession(null);
  };

  const refreshToken = async (): Promise<void> => {
    if (auth.currentUser) {
      await getIdTokenResult(auth.currentUser, true);
    }
  };

  return (
    <AuthContext.Provider value={{ session, loading, signIn, signOut, refreshToken }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}

export function useSession(): Session | null {
  return useAuth().session;
}

export function useAuthLoading(): boolean {
  return useAuth().loading;
}

/** Call a Cloud Function with the current user's auth token. */
export async function callFunction<T>(name: string, data: unknown): Promise<T> {
  const callable = httpsCallable(functions, name);
  const result = await callable(data);
  return result.data as T;
}