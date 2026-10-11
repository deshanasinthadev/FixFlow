import type { RepairJob, RepairPriority, RepairStatus, User } from '../../domain/types'
import { formatLKR } from '../../lib/format'

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
