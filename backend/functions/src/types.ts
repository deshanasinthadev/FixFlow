/**
 * Shared type definitions for FixFlow Cloud Functions.
 * These mirror the Firestore schema from docs/DATABASE-PLAN.md.
 */

import * as admin from "firebase-admin";
import { HttpsError } from "firebase-functions/v2/https";

export type Cents = number;
export type ID = string;
export type IsoDateTime = string;
export type IsoDate = string;

export type StaffRole = "admin" | "manager" | "technician" | "cashier";
export type Role = StaffRole | "customer";
export type BranchRef = ID | "all";

/** Custom claims on the Firebase Auth ID token. */
export type Claims = {
  role: Role;
  branchId: string; // "all" for admin
  customerId?: string; // customers only
  technicianId?: string; // technicians only
};

/** Request context with validated claims. */
export type CallContext = {
  uid: string;
  claims: Claims;
  isAdmin: boolean;
  isStaff: boolean;
  isCustomer: boolean;
  isTechnician: boolean;
  isManager: boolean;
  isCashier: boolean;
  branchId: string;
  customerId?: string;
  technicianId?: string;
};

/** Standardized error codes for client handling. */
export const ErrorCode = {
  UNAUTHENTICATED: "unauthenticated",
  PERMISSION_DENIED: "permission-denied",
  NOT_FOUND: "not-found",
  INVALID_ARGUMENT: "invalid-argument",
  FAILED_PRECONDITION: "failed-precondition",
  ALREADY_EXISTS: "already-exists",
  INTERNAL: "internal",
  RESOURCE_EXHAUSTED: "resource-exhausted",
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

/** Helper to create a typed HttpsError. */
export function throwError(code: ErrorCode, message: string, details?: unknown): never {
  throw new HttpsError(code, message, details);
}

/** Validate that the caller has the required role(s). */
export function requireRole(context: CallContext, ...allowedRoles: Role[]): void {
  if (!allowedRoles.includes(context.claims.role)) {
    throwError(ErrorCode.PERMISSION_DENIED, `Requires one of: ${allowedRoles.join(", ")}`);
  }
}

/** Validate branch access. */
export function requireBranchAccess(context: CallContext, branchId: string): void {
  if (!context.isAdmin && context.branchId !== branchId && context.branchId !== "all") {
    throwError(ErrorCode.PERMISSION_DENIED, "You can only access records in your branch");
  }
}

/** Generate a sequential document number (non-transactional, for use outside transactions). */
export async function getNextSequence(counterId: string): Promise<number> {
  const counterRef = db.collection("counters").doc(counterId);
  const snap = await counterRef.get();
  const current = snap.exists ? (snap.data()?.seq ?? 0) : 0;
  const next = current + 1;
  await counterRef.set({ seq: next, updatedAt: serverTimestamp() }, { merge: true });
  return next;
}

/** Generate a sequential document number within a transaction. */
export async function getNextSequenceTx(
  transaction: admin.firestore.Transaction,
  counterId: string
): Promise<number> {
  const counterRef = db.collection("counters").doc(counterId);
  const snap = await transaction.get(counterRef);
  const current = snap.exists ? (snap.data()?.seq ?? 0) : 0;
  const next = current + 1;
  transaction.set(counterRef, { seq: next, updatedAt: serverTimestamp() }, { merge: true });
  return next;
}

/** Format a document number: PREFIX-YYYY-NNNNNN */
export function formatDocNumber(prefix: string, year: number, seq: number): string {
  return `${prefix}-${year}-${String(seq).padStart(6, "0")}`;
}

/** Current year for numbering. */
export function currentYear(): number {
  return new Date().getFullYear();
}

/** Firestore server timestamp. */
export const serverTimestamp = admin.firestore.FieldValue.serverTimestamp;

/** Increment a numeric field atomically. */
export const increment = admin.firestore.FieldValue.increment;

const db = admin.firestore();
const auth = admin.auth();

export { db, auth };