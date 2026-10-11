import type { RepairJob, RepairPriority, RepairStatus, User } from '../../domain/types'
import { formatLKR } from '../../lib/format'
import { REPAIR_STATUS_LABEL } from '../../domain/workflows'

/**
 * Maps persisted RepairJob records into the exact row shape the existing
 * repair screens render, so wiring the UI to real data changes no markup.
 *
 * The `status` string doubles as the badge's CSS class: `Badge` derives the
 * class from the label via `label.toLowerCase().replaceAll(' ', '-')`. Labels
 * are therefore chosen to land on classes that exist in index.css, and the few
 * that did not exist have been added there.
 */

export interface RepairRow {
  id: string
  customerId: string
  technicianId: string
  branchId: string
  customer: string
  device: string
  tech: string
  priority: string
  status: string
  amount: string
  eta: string
}

/** Domain status -> the label the UI shows (and the badge class it implies). */
export const STATUS_LABEL: Record<RepairStatus, string> = {
  received: 'Received',
  diagnosing: 'Diagnosing',
  waiting_for_approval: 'Awaiting Approval',
  waiting_for_parts: 'Awaiting Parts',
  approved: 'Approved',
  repairing: 'In Progress',
  testing: 'Testing',
  completed: 'Completed',
  ready_for_collection: 'Ready for Pickup',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
}

/** The badge class `Badge` will compute for each status. */
export const statusBadgeTone = (status: RepairStatus): string =>
  STATUS_LABEL[status].toLowerCase().replaceAll(' ', '-')

export const PRIORITY_LABEL: Record<RepairPriority, string> = {
  low: 'Low',
  normal: 'Normal',
  high: 'High',
  urgent: 'Urgent',
}

/**
 * A short, human ETA — the existing UI shows phrases like "Ready now".
 *
 * Day differences are computed between calendar dates, not raw millisecond
 * deltas. Comparing instants makes the answer depend on the time of day: a job
 * promised for 14:30 today, viewed at 08:00, is 0.27 days away and would read
 * as "Tomorrow".
 */
export const formatEta = (job: RepairJob, now: Date = new Date()): string => {
  if (job.status === 'ready_for_collection') return 'Ready now'
  if (job.status === 'delivered') return 'Collected'
  if (job.status === 'cancelled') return 'Cancelled'
  if (!job.expectedCompletion) return 'Not set'

  const target = new Date(job.expectedCompletion)
  if (Number.isNaN(target.getTime())) return 'Not set'

  const startOfToday = new Date(now)
  startOfToday.setHours(0, 0, 0, 0)
  const startOfTarget = new Date(target)
  startOfTarget.setHours(0, 0, 0, 0)
  const days = Math.round((startOfTarget.getTime() - startOfToday.getTime()) / 86_400_000)

  if (days < 0) return `${Math.abs(days)}d overdue`
  if (days === 0) {
    const time = target.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
    return `Today, ${time}`
  }
  if (days === 1) return 'Tomorrow'
  return target.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

export interface RowContext {
  /** Technician id -> display name. */
  technicians: Record<string, string>
  now?: Date
}

/** One persisted job -> one table row. */
export const toRepairRow = (job: RepairJob, ctx: RowContext): RepairRow => ({
  id: job.jobNumber,
  customerId: job.customerId,
  technicianId: job.technicianId,
  branchId: job.branchId,
  customer: job.customerName,
  device: job.deviceSummary,
  tech: job.technicianId ? (ctx.technicians[job.technicianId] ?? 'Unassigned') : 'Unassigned',
  priority: PRIORITY_LABEL[job.priority],
  status: STATUS_LABEL[job.status],
  amount: formatLKR(job.labourCost),
  eta: formatEta(job, ctx.now),
})

export const toRepairRows = (jobs: RepairJob[], ctx: RowContext): RepairRow[] =>
  jobs.map((job) => toRepairRow(job, ctx))

/** Builds the id -> name lookup from a user list. */
export const technicianNames = (users: User[]): Record<string, string> => {
  const map: Record<string, string> = {}
  users.forEach((u) => {
    map[u.id] = u.fullName
  })
  return map
}

/**
 * Role scoping, mirroring what `recordsFor` did over the hardcoded array.
 *
 * A customer sees only their own jobs; a technician only their assigned work;
 * a manager or cashier only their branch; an admin everything. This is the
 * read-side filter — `domain/permissions.ts` remains the authority for what a
 * role may *do*.
 */
/**
 * The UI stores roles in display case ("Technician"); the domain layer uses
 * lowercase. Permission checks live in domain/permissions.ts, so anything
 * calling them needs this mapping rather than a second, drifting copy of the
 * role list.
 */
export const toDomainRole = (uiRole: string): 'admin' | 'manager' | 'technician' | 'cashier' | 'customer' => {
  switch (uiRole) {
    case 'Admin': return 'admin'
    case 'Manager': return 'manager'
    case 'Technician': return 'technician'
    case 'Cashier': return 'cashier'
    case 'Customer': return 'customer'
    default: return 'customer'
  }
}

export const scopeRepairsFor = (
  jobs: RepairJob[],
  viewer: { role: string; customerId?: string; technicianId?: string; branchId?: string },
): RepairJob[] => {
  switch (viewer.role) {
    case 'Admin':
      return jobs
    case 'Customer':
      return jobs.filter((j) => j.customerId === viewer.customerId)
    case 'Technician':
      return jobs.filter((j) => j.technicianId === viewer.technicianId)
    default:
      return jobs.filter((j) => j.branchId === viewer.branchId)
  }
}

/** Dashboard tiles (§6) — every figure derived from the supplied records. */
export interface RepairCounts {
  total: number
  active: number
  awaitingApproval: number
  waitingForParts: number
  readyForPickup: number
  completed: number
  delivered: number
  cancelled: number
}

export const countRepairs = (jobs: RepairJob[]): RepairCounts => {
  const counts: RepairCounts = {
    total: jobs.length,
    active: 0,
    awaitingApproval: 0,
    waitingForParts: 0,
    readyForPickup: 0,
    completed: 0,
    delivered: 0,
    cancelled: 0,
  }
  const ACTIVE: RepairStatus[] = ['diagnosing', 'approved', 'repairing', 'testing', 'waiting_for_parts']
  jobs.forEach((j) => {
    if (ACTIVE.includes(j.status)) counts.active += 1
    if (j.status === 'waiting_for_approval') counts.awaitingApproval += 1
    if (j.status === 'waiting_for_parts') counts.waitingForParts += 1
    if (j.status === 'ready_for_collection') counts.readyForPickup += 1
    if (j.status === 'completed') counts.completed += 1
    if (j.status === 'delivered') counts.delivered += 1
    if (j.status === 'cancelled') counts.cancelled += 1
  })
  return counts
}

/**
 * Kanban columns, in workflow order, for the rows given.
 *
 * Every status actually present in the data gets a column. A status outside
 * the active workflow — a delivered or cancelled job, say — appears at the end
 * under its own heading rather than vanishing. The previous board hard-coded
 * six column names and duplicated rows with `data[i % data.length]`, which both
 * invented cards and hid five of the eleven statuses.
 */
/** Every status in workflow order, `received` first and the terminal ones last. */
const WORKFLOW_ORDER = Object.keys(REPAIR_STATUS_LABEL) as RepairStatus[]

export const boardColumns = (rows: RepairRow[]): { label: string; rows: RepairRow[] }[] => {
  // Order comes from the domain, but the heading text must be STATUS_LABEL:
  // that is the label toRepairRow puts on the row, and the two maps differ
  // ("Awaiting Approval" vs "Waiting for Approval", "In Progress" vs
  // "Repairing"). Heading columns with the domain wording would leave four
  // columns permanently empty.
  const order = WORKFLOW_ORDER.map((s) => STATUS_LABEL[s])
  const extra = rows
    .map((r) => r.status)
    .filter((label) => !order.includes(label))
    .filter((label, i, all) => all.indexOf(label) === i)
  return [...order, ...extra].map((label) => ({
    label,
    rows: rows.filter((r) => r.status === label),
  }))
}

/** Total cards, so the board can show a count that matches what it renders. */
export const boardTotal = (rows: RepairRow[]): number => rows.length

/**
 * The customer portal shows five steps, not eleven (§20). Internal statuses
 * collapse onto them so the customer sees "Repairing" rather than "Approved",
 * "Repairing" and "Testing" separately.
 *
 * Cancelled is reported on its own: it is not a position on the line, and
 * rendering it as step 0 would tell a customer their cancelled repair had only
 * just been received.
 */
export const CUSTOMER_STEPS = ['Received', 'Diagnosing', 'Repairing', 'Ready for Pickup', 'Delivered'] as const

export const customerProgress = (
  status: RepairStatus,
): { steps: readonly string[]; current: number; cancelled: boolean } => {
  const MAP: Record<RepairStatus, number> = {
    received: 0,
    diagnosing: 1,
    waiting_for_approval: 1,
    waiting_for_parts: 1,
    approved: 2,
    repairing: 2,
    testing: 2,
    completed: 3,
    ready_for_collection: 3,
    delivered: 4,
    cancelled: -1,
  }
  const current = MAP[status]
  if (current === undefined) {
    // Unmapped status: surface it rather than defaulting to "Received", which
    // would silently claim the repair has barely started.
    throw new Error(`customerProgress: no customer-facing step for status "${status}"`)
  }
  return { steps: CUSTOMER_STEPS, current, cancelled: current === -1 }
}
