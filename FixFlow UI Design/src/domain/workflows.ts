import {
  ESTIMATE_STATUSES,
  PURCHASE_ORDER_STATUSES,
  WARRANTY_CLAIM_STATUSES,
  type EstimateStatus,
  type PurchaseOrderStatus,
  type RepairStatus,
  type Role,
  type WarrantyClaimStatus,
} from './types'

/**
 * State machines for every workflow in the spec (§7, §9, §12, §17).
 *
 * Transitions are data, not scattered `if` statements, so the UI can render
 * "what can I do next?" from the same table the validator consults. A screen
 * can never offer a transition the rules would reject.
 */

// ---------------------------------------------------------------------------
// Repairs (§7)
// ---------------------------------------------------------------------------

/**
 * The §7 workflow. `waiting_for_approval` gates the start of paid work, and
 * `cancelled` is reachable from any non-terminal state. `delivered` and
 * `cancelled` are terminal.
 *
 * A repair may return from `waiting_for_parts` to `repairing`, and from
 * `testing` back to `repairing` when a test fails — both are real shop
 * movements, not errors.
 */
export const REPAIR_TRANSITIONS: Record<RepairStatus, RepairStatus[]> = {
  received: ['diagnosing', 'cancelled'],
  diagnosing: ['waiting_for_approval', 'waiting_for_parts', 'cancelled'],
  waiting_for_approval: ['approved', 'cancelled'],
  waiting_for_parts: ['approved', 'repairing', 'cancelled'],
  approved: ['repairing', 'waiting_for_parts', 'cancelled'],
  repairing: ['testing', 'waiting_for_parts', 'cancelled'],
  testing: ['completed', 'repairing', 'cancelled'],
  // A device the customer abandons before collection is a real shop case, so
  // cancellation stays available until the handover is recorded.
  completed: ['ready_for_collection', 'cancelled'],
  ready_for_collection: ['delivered', 'cancelled'],
  delivered: [],
  cancelled: [],
}

export const REPAIR_STATUS_LABEL: Record<RepairStatus, string> = {
  received: 'Received',
  diagnosing: 'Diagnosing',
  waiting_for_approval: 'Waiting for Approval',
  waiting_for_parts: 'Waiting for Parts',
  approved: 'Approved',
  repairing: 'Repairing',
  testing: 'Testing',
  completed: 'Completed',
  ready_for_collection: 'Ready for Collection',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
}

/** Statuses that mean "the shop is actively working on it". */
export const ACTIVE_REPAIR_STATUSES: RepairStatus[] = [
  'diagnosing',
  'waiting_for_approval',
  'waiting_for_parts',
  'approved',
  'repairing',
  'testing',
]

export const TERMINAL_REPAIR_STATUSES: RepairStatus[] = ['delivered', 'cancelled']

export const canTransitionRepair = (from: RepairStatus, to: RepairStatus): boolean =>
  REPAIR_TRANSITIONS[from]?.includes(to) ?? false

export const nextRepairStatuses = (from: RepairStatus): RepairStatus[] => REPAIR_TRANSITIONS[from] ?? []

export const isActiveRepair = (s: RepairStatus): boolean => ACTIVE_REPAIR_STATUSES.includes(s)
export const isTerminalRepair = (s: RepairStatus): boolean => TERMINAL_REPAIR_STATUSES.includes(s)

export class InvalidTransitionError extends Error {
  readonly from: string
  readonly to: string
  constructor(from: string, to: string, label: string) {
    super(`A ${label} cannot move from "${from}" to "${to}".`)
    this.name = 'InvalidTransitionError'
    this.from = from
    this.to = to
  }
}

export const assertRepairTransition = (from: RepairStatus, to: RepairStatus): void => {
  if (!canTransitionRepair(from, to)) {
    throw new InvalidTransitionError(REPAIR_STATUS_LABEL[from], REPAIR_STATUS_LABEL[to], 'repair')
  }
}

/**
 * §7/§9 — paid work must not begin until the customer has approved, unless an
 * authorized policy exception is recorded. This is the single gate; the repair
 * screen and the technician view both consult it.
 */
export const STATUSES_REQUIRING_APPROVAL: RepairStatus[] = ['repairing', 'testing', 'completed']

export const canStartWork = (
  status: RepairStatus,
  hasCustomerApproval: boolean,
  policyExceptionRecorded: boolean,
): { allowed: boolean; reason: string } => {
  if (!STATUSES_REQUIRING_APPROVAL.includes(status)) {
    return { allowed: true, reason: '' }
  }
  if (hasCustomerApproval) {
    return { allowed: true, reason: '' }
  }
  if (policyExceptionRecorded) {
    return { allowed: true, reason: 'Proceeding under a recorded policy exception.' }
  }
  return {
    allowed: false,
    reason: 'The customer has not approved the estimate. Obtain approval or record an authorized policy exception first.',
  }
}

// ---------------------------------------------------------------------------
// Estimates (§9)
// ---------------------------------------------------------------------------

export const ESTIMATE_TRANSITIONS: Record<EstimateStatus, EstimateStatus[]> = {
  draft: ['sent', 'revised'],
  sent: ['approved', 'rejected', 'expired', 'revised'],
  approved: [],
  rejected: ['revised'],
  expired: ['revised'],
  revised: [],
}

export const ESTIMATE_STATUS_LABEL: Record<EstimateStatus, string> = {
  draft: 'Draft',
  sent: 'Sent',
  approved: 'Approved',
  rejected: 'Rejected',
  expired: 'Expired',
  revised: 'Revised',
}

export const canTransitionEstimate = (from: EstimateStatus, to: EstimateStatus): boolean =>
  ESTIMATE_TRANSITIONS[from]?.includes(to) ?? false

/** A decision may only be recorded on an estimate the customer has received. */
export const canRecordApproval = (status: EstimateStatus): boolean => status === 'sent'

/**
 * §9 — revising preserves history: the old estimate is marked `revised` and
 * points at its successor rather than being deleted or edited in place.
 */
export const assertEstimateRevision = (from: EstimateStatus): void => {
  if (!canTransitionEstimate(from, 'revised')) {
    throw new InvalidTransitionError(from, 'revised', 'estimate')
  }
}

export { ESTIMATE_STATUSES }

// ---------------------------------------------------------------------------
// Purchase orders (§12)
// ---------------------------------------------------------------------------

export const PURCHASE_ORDER_TRANSITIONS: Record<PurchaseOrderStatus, PurchaseOrderStatus[]> = {
  draft: ['sent', 'cancelled'],
  sent: ['partially_received', 'received', 'cancelled'],
  partially_received: ['received', 'cancelled'],
  received: [],
  cancelled: [],
}

export const canTransitionPurchaseOrder = (from: PurchaseOrderStatus, to: PurchaseOrderStatus): boolean =>
  PURCHASE_ORDER_TRANSITIONS[from]?.includes(to) ?? false

/**
 * §12 / §28.4-5 — a purchase order must NOT increase stock when created, and
 * receiving increases stock only for the quantities actually received.
 */
export const isPurchaseOrderReceivable = (status: PurchaseOrderStatus): boolean =>
  status === 'sent' || status === 'partially_received'

export const purchaseOrderStatusFor = (
  received: number,
  ordered: number,
): PurchaseOrderStatus => {
  if (received <= 0) return 'sent'
  return received >= ordered ? 'received' : 'partially_received'
}

// ---------------------------------------------------------------------------
// Warranty claims (§17)
// ---------------------------------------------------------------------------

export const WARRANTY_CLAIM_TRANSITIONS: Record<WarrantyClaimStatus, WarrantyClaimStatus[]> = {
  submitted: ['under_inspection', 'rejected'],
  under_inspection: ['approved', 'rejected'],
  approved: ['in_progress'],
  rejected: [],
  in_progress: ['resolved'],
  resolved: ['closed'],
  closed: [],
}

export const WARRANTY_CLAIM_STATUS_LABEL: Record<WarrantyClaimStatus, string> = {
  submitted: 'Submitted',
  under_inspection: 'Under Inspection',
  approved: 'Approved',
  rejected: 'Rejected',
  in_progress: 'In Progress',
  resolved: 'Resolved',
  closed: 'Closed',
}

export const canTransitionClaim = (from: WarrantyClaimStatus, to: WarrantyClaimStatus): boolean =>
  WARRANTY_CLAIM_TRANSITIONS[from]?.includes(to) ?? false

/** §17 — findings must be recorded before a decision is made. */
export const canDecideClaim = (status: WarrantyClaimStatus, findings: string): boolean =>
  status === 'under_inspection' && findings.trim().length > 0

export const isOpenClaim = (status: WarrantyClaimStatus): boolean =>
  status !== 'closed' && status !== 'rejected'

export { WARRANTY_CLAIM_STATUSES, PURCHASE_ORDER_STATUSES }

// ---------------------------------------------------------------------------
// Role capability summary used by workflow guards
// ---------------------------------------------------------------------------

/**
 * Who may push a repair along. Technicians work the job but cannot approve the
 * estimate on the customer's behalf, and cannot mark a device delivered
 * without the handover being recorded by staff.
 */
export const mayPerformRepairTransition = (
  role: Role,
  from: RepairStatus,
  to: RepairStatus,
): { allowed: boolean; reason: string } => {
  if (!canTransitionRepair(from, to)) {
    return { allowed: false, reason: 'That is not a valid next status for this repair.' }
  }
  if (role === 'admin' || role === 'manager') return { allowed: true, reason: '' }

  if (role === 'technician') {
    const TECH_ALLOWED: RepairStatus[] = ['diagnosing', 'waiting_for_approval', 'waiting_for_parts', 'repairing', 'testing', 'completed']
    if (TECH_ALLOWED.includes(to)) return { allowed: true, reason: '' }
    return { allowed: false, reason: 'Only a manager or administrator can perform that handover step.' }
  }

  return { allowed: false, reason: 'Your role cannot change repair status.' }
}
