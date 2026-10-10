import type { Role, Session } from "./types";

/**
 * Centralised permission model.
 *
 * The UI consults `can()` to decide what to render, and every service function
 * re-checks the same permission before mutating data — hiding a button is not
 * a security control, it is only the first line of defence.
 */

export type Permission =
  | "dashboard.view"
  | "dashboard.financials"
  | "repairs.view"
  | "repairs.create"
  | "repairs.edit"
  | "repairs.assign"
  | "repairs.diagnose"
  | "repairs.add_parts"
  | "repairs.test"
  | "repairs.complete"
  | "repairs.deliver"
  | "repairs.cancel"
  | "repairs.view_financials"
  | "estimates.view"
  | "estimates.create"
  | "estimates.send"
  | "estimates.decide"
  | "pos.access"
  | "pos.sell"
  | "pos.discount"
  | "pos.refund"
  | "inventory.view"
  | "inventory.edit"
  | "inventory.adjust"
  | "inventory.transfer"
  | "purchasing.view"
  | "purchasing.create"
  | "purchasing.receive"
  | "customers.view"
  | "customers.edit"
  | "customers.view_financials"
  | "devices.view"
  | "devices.edit"
  | "invoices.view"
  | "invoices.create"
  | "payments.view"
  | "payments.record"
  | "warranties.view"
  | "warranties.create"
  | "warranties.manage_claims"
  | "finance.view"
  | "finance.expenses"
  | "reports.view"
  | "reports.financial"
  | "ai.diagnose"
  | "notifications.view"
  | "branches.view"
  | "branches.manage"
  | "users.view"
  | "users.manage"
  | "users.permissions"
  | "audit.view"
  | "settings.view"
  | "settings.manage"
  | "portal.access"
  | "portal.approve_estimate"
  | "portal.claim_warranty";

const STAFF_BASE: Permission[] = [
  "dashboard.view",
  "notifications.view",
  "customers.view",
  "inventory.view",
  "devices.view",
];

const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  admin: [
    ...STAFF_BASE,
    "dashboard.financials",
    "repairs.view",
    "repairs.create",
    "repairs.edit",
    "repairs.assign",
    "repairs.diagnose",
    "repairs.add_parts",
    "repairs.test",
    "repairs.complete",
    "repairs.deliver",
    "repairs.cancel",
    "repairs.view_financials",
    "estimates.view",
    "estimates.create",
    "estimates.send",
    "estimates.decide",
    "pos.access",
    "pos.sell",
    "pos.discount",
    "pos.refund",
    "inventory.edit",
    "inventory.adjust",
    "inventory.transfer",
    "purchasing.view",
    "purchasing.create",
    "purchasing.receive",
    "customers.edit",
    "customers.view_financials",
    "devices.edit",
    "invoices.view",
    "invoices.create",
    "payments.view",
    "payments.record",
    "warranties.view",
    "warranties.create",
    "warranties.manage_claims",
    "finance.view",
    "finance.expenses",
    "reports.view",
    "reports.financial",
    "ai.diagnose",
    "branches.view",
    "branches.manage",
    "users.view",
    "users.manage",
    "users.permissions",
    "audit.view",
    "settings.view",
    "settings.manage",
  ],
  manager: [
    ...STAFF_BASE,
    "dashboard.financials",
    "repairs.view",
    "repairs.create",
    "repairs.edit",
    "repairs.assign",
    "repairs.diagnose",
    "repairs.add_parts",
    "repairs.test",
    "repairs.complete",
    "repairs.deliver",
    "repairs.cancel",
    "repairs.view_financials",
    "estimates.view",
    "estimates.create",
    "estimates.send",
    "estimates.decide",
    "pos.access",
    "pos.sell",
    "pos.discount",
    "pos.refund",
    "inventory.edit",
    "inventory.adjust",
    "inventory.transfer",
    "purchasing.view",
    "purchasing.create",
    "purchasing.receive",
    "customers.edit",
    "customers.view_financials",
    "devices.edit",
    "invoices.view",
    "invoices.create",
    "payments.view",
    "payments.record",
    "warranties.view",
    "warranties.create",
    "warranties.manage_claims",
    "finance.view",
    "finance.expenses",
    "reports.view",
    "reports.financial",
    "ai.diagnose",
    "branches.view",
    "users.view",
    "settings.view",
  ],
  technician: [
    ...STAFF_BASE,
    "repairs.view",
    "repairs.diagnose",
    "repairs.add_parts",
    "repairs.test",
    "repairs.complete",
    "estimates.view",
    "warranties.view",
    "ai.diagnose",
    "branches.view",
  ],
  cashier: [
    ...STAFF_BASE,
    "pos.access",
    "pos.sell",
    "pos.refund",
    "invoices.view",
    "payments.view",
    "payments.record",
    "warranties.view",
    "branches.view",
  ],
  customer: ["portal.access", "portal.approve_estimate", "portal.claim_warranty", "notifications.view"],
};

export function permissionsForRole(role: Role): ReadonlySet<Permission> {
  return new Set(ROLE_PERMISSIONS[role] ?? []);
}

export function roleCan(role: Role, permission: Permission): boolean {
  return permissionsForRole(role).has(permission);
}

/** Convenience for components that already hold a session. */
export function can(session: Session | null, permission: Permission): boolean {
  if (!session) return false;
  return roleCan(session.role, permission);
}

export function requirePermission(session: Session | null, permission: Permission): void {
  if (!can(session, permission)) {
    throw new Error(`Permission denied: ${session?.role ?? "anonymous"} cannot ${permission}`);
  }
}

/**
 * Row-level scoping. Every list query must pass its rows through this: the
 * permission says *what* you can see, the scope says *which records*.
 */
export type DataScope = {
  /** "all" bypasses branch filtering (admins with the all-branches selector). */
  branchId: string | "all";
  /** Technicians only see repairs assigned to them. */
  technicianId?: string;
  /** Customers only see their own records. */
  customerId?: string;
};

export function scopeFor(session: Session | null): DataScope {
  if (!session) return { branchId: "all" };
  if (session.role === "customer") {
    return { branchId: "all", customerId: session.customerId };
  }
  if (session.role === "technician") {
    return { branchId: session.branchId, technicianId: session.userId };
  }
  if (session.role === "admin") {
    return { branchId: session.activeBranchId };
  }
  return { branchId: session.branchId };
}

/** True when `rowBranchId` is visible under the given scope. */
export function inBranchScope(scope: DataScope, rowBranchId: string): boolean {
  return scope.branchId === "all" || scope.branchId === rowBranchId;
}

/**
 * The identity performing an action. Services receive this and re-check
 * permissions themselves, so a service call is safe regardless of which
 * component invoked it.
 */
export type Actor = {
  userId: string;
  name: string;
  role: Role;
  branchId: string;
  permissions: ReadonlySet<Permission>;
};

export function actorCan(actor: Actor, permission: Permission): boolean {
  return actor.permissions.has(permission);
}

export function assertCan(actor: Actor, permission: Permission): void {
  if (!actorCan(actor, permission)) {
    throw new Error(`${actor.role} does not have permission to ${permission}.`);
  }
}

/** Branch rows are only writable by someone scoped to that branch. */
export function assertBranchAccess(actor: Actor, branchId: string): void {
  if (actor.role === "admin") return;
  if (actor.role === "customer") throw new Error("Customers cannot access branch records.");
  if (actor.branchId !== branchId) {
    throw new Error("You can only modify records belonging to your branch.");
  }
}
