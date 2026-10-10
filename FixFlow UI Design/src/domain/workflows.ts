import type { RepairStatus } from "./types";

/**
 * Repair workflow definition.
 *
 * Statuses and transitions live here so the board, the detail page, the
 * services and the validation rules all agree on one source of truth. Callers
 * must go through `canTransition` — never assign a status directly.
 */

export type StatusMeta = {
  id: RepairStatus;
  label: string;
  /** CSS tone class used by <Badge />. */
  tone: string;
  /** Column order on the repair board. */
  order: number;
  /** Terminal statuses cannot be left. */
  terminal?: boolean;
};

export const REPAIR_STATUSES: StatusMeta[] = [
  { id: "received", label: "Received", tone: "slate", order: 1 },
  { id: "diagnosing", label: "Diagnosing", tone: "diagnosing", order: 2 },
  { id: "waiting_approval", label: "Waiting for Approval", tone: "awaiting-approval", order: 3 },
  { id: "approved", label: "Approved", tone: "approved", order: 4 },
  { id: "waiting_parts", label: "Waiting for Parts", tone: "awaiting-parts", order: 5 },
  { id: "repairing", label: "Repairing", tone: "in-progress", order: 6 },
  { id: "testing", label: "Testing", tone: "testing", order: 7 },
  { id: "completed", label: "Completed", tone: "completed", order: 8 },
  { id: "ready_for_collection", label: "Ready for Collection", tone: "ready-for-pickup", order: 9 },
  { id: "delivered", label: "Delivered", tone: "delivered", order: 10, terminal: true },
  { id: "cancelled", label: "Cancelled", tone: "cancelled", order: 11, terminal: true },
];

export const STATUS_META: Record<RepairStatus, StatusMeta> = Object.fromEntries(
  REPAIR_STATUSES.map((status) => [status.id, status]),
) as Record<RepairStatus, StatusMeta>;

export function statusLabel(status: RepairStatus): string {
  return STATUS_META[status]?.label ?? status;
}

export function statusTone(status: RepairStatus): string {
  return STATUS_META[status]?.tone ?? "slate";
}

/** Statuses that represent work already started — these sit behind the approval gate. */
export const POST_APPROVAL_STATUSES: RepairStatus[] = [
  "approved",
  "waiting_parts",
  "repairing",
  "testing",
  "completed",
  "ready_for_collection",
  "delivered",
];

/**
 * Allowed transitions. Anything not listed here is rejected, which is what
 * stops a job jumping from "Received" straight to "Delivered".
 */
const TRANSITIONS: Record<RepairStatus, RepairStatus[]> = {
  received: ["diagnosing", "waiting_approval", "cancelled"],
  diagnosing: ["waiting_approval", "waiting_parts", "repairing", "cancelled"],
  waiting_approval: ["approved", "waiting_parts", "repairing", "diagnosing", "cancelled"],
  approved: ["waiting_parts", "repairing", "cancelled"],
  waiting_parts: ["repairing", "cancelled"],
  repairing: ["testing", "waiting_parts", "cancelled"],
  testing: ["repairing", "completed", "cancelled"],
  completed: ["ready_for_collection"],
  ready_for_collection: ["delivered", "repairing"],
  delivered: [],
  cancelled: [],
};

export function allowedNextStatuses(status: RepairStatus): RepairStatus[] {
  return TRANSITIONS[status] ?? [];
}

export function canTransition(from: RepairStatus, to: RepairStatus): boolean {
  if (from === to) return false;
  return allowedNextStatuses(from).includes(to);
}

export type TransitionCheck = { ok: true } | { ok: false; reason: string };

/**
 * Full validation for a transition, including the approval gate.
 *
 * A job may only move into a post-approval status when a customer approval has
 * been recorded, or when the caller records an authorised policy exception
 * (e.g. work explicitly covered by the shop's policy without approval).
 */
export function validateTransition(options: {
  from: RepairStatus;
  to: RepairStatus;
  hasApproval: boolean;
  policyException?: { granted: boolean; reason: string };
}): TransitionCheck {
  const { from, to, hasApproval, policyException } = options;

  if (STATUS_META[from]?.terminal) {
    return { ok: false, reason: `A ${statusLabel(from).toLowerCase()} job cannot change status.` };
  }
  if (!canTransition(from, to)) {
    return {
      ok: false,
      reason: `Invalid transition: ${statusLabel(from)} → ${statusLabel(to)} is not allowed.`,
    };
  }
  if (POST_APPROVAL_STATUSES.includes(to) && !hasApproval) {
    if (policyException?.granted && policyException.reason.trim()) return { ok: true };
    return {
      ok: false,
      reason: "Customer approval is required before work can start. Record the approval or a policy exception.",
    };
  }
  return { ok: true };
}

/** Progress index for the customer-facing timeline (0-based). */
export const PORTAL_TIMELINE: RepairStatus[] = [
  "received",
  "diagnosing",
  "approved",
  "repairing",
  "testing",
  "ready_for_collection",
  "delivered",
];

export function portalProgress(status: RepairStatus): number {
  if (status === "cancelled") return -1;
  const index = PORTAL_TIMELINE.indexOf(status);
  if (index >= 0) return index;
  // waiting_parts and completed sit between their neighbouring stages.
  if (status === "waiting_parts") return 2;
  if (status === "completed") return 5;
  return 0;
}

export const PRIORITIES = [
  { id: "urgent", label: "Urgent" },
  { id: "high", label: "High" },
  { id: "normal", label: "Normal" },
  { id: "low", label: "Low" },
] as const;

export const DEVICE_CATEGORIES = [
  { id: "laptop", label: "Laptop" },
  { id: "desktop", label: "Desktop" },
  { id: "mobile", label: "Mobile phone" },
  { id: "tablet", label: "Tablet" },
  { id: "printer", label: "Printer" },
  { id: "other", label: "Other electronics" },
] as const;
