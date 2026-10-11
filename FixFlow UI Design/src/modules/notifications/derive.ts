import type { RepairJob } from '../../domain/types'
import type { Product } from '../../db/schema'
import type { NotificationKind } from '../../domain/types'

/**
 * Notifications derived from what is actually in the database (§21).
 *
 * The previous screen showed a fixed three-line script per role, naming job
 * numbers that had nothing to do with the signed-in user. A notification that
 * cannot be traced to a record is worse than none, because it trains people to
 * ignore the panel.
 *
 * Deliberately presentational-free: the caller maps `kind` to an icon, so the
 * database-facing module never mentions the UI.
 */

export interface DerivedNotification {
  id: string
  kind: NotificationKind
  title: string
  body: string
  severity: 'info' | 'warning' | 'success'
  /** Where the notification should take the user, as a page label. */
  link: string
}

export interface NotificationSource {
  role: string
  /** Set for a technician, so their queue can be filtered to their own work. */
  technicianId?: string
  repairs: RepairJob[]
  products: Product[]
}

const jobList = (jobs: RepairJob[], limit = 3): string => {
  const numbers = jobs.slice(0, limit).map((job) => job.jobNumber)
  const rest = jobs.length - numbers.length
  return rest > 0 ? `${numbers.join(', ')} and ${rest} more` : numbers.join(', ')
}

const plural = (count: number, singular: string, pluralForm?: string) =>
  `${count} ${count === 1 ? singular : pluralForm ?? `${singular}s`}`

export const deriveNotifications = (source: NotificationSource): DerivedNotification[] => {
  const { role, technicianId, repairs, products } = source
  const out: DerivedNotification[] = []

  const lowStock = products.filter((p) => p.stockOnHand - p.reserved <= p.minStock)
  const outOfStock = lowStock.filter((p) => p.stockOnHand - p.reserved <= 0)
  const awaitingApproval = repairs.filter((r) => r.status === 'waiting_for_approval')
  const waitingForParts = repairs.filter((r) => r.status === 'waiting_for_parts')
  const readyForPickup = repairs.filter((r) => r.status === 'ready_for_collection')
  const unassigned = repairs.filter(
    (r) => !r.technicianId && ['diagnosing', 'approved', 'repairing', 'testing', 'waiting_for_parts'].includes(r.status),
  )
  const mine = technicianId ? repairs.filter((r) => r.technicianId === technicianId) : []
  const myActive = mine.filter((r) => !['delivered', 'cancelled'].includes(r.status))

  const isStaff = ['Admin', 'Manager', 'Cashier'].includes(role)

  if (lowStock.length && isStaff) {
    out.push({
      id: 'low-stock',
      kind: 'low_stock',
      title: outOfStock.length ? 'Stock has run out' : 'Stock below reorder level',
      body: outOfStock.length
        ? `${plural(outOfStock.length, 'item')} at zero and ${plural(lowStock.length, 'item')} at or below minimum.`
        : `${plural(lowStock.length, 'item')} at or below its minimum level.`,
      severity: outOfStock.length ? 'warning' : 'info',
      link: 'Inventory',
    })
  }

  if (awaitingApproval.length && ['Admin', 'Manager'].includes(role)) {
    out.push({
      id: 'awaiting-approval',
      kind: 'estimate_approval_request',
      title: 'Estimates awaiting a decision',
      body: `${plural(awaitingApproval.length, 'repair')} waiting for customer approval: ${jobList(awaitingApproval)}.`,
      severity: 'info',
      link: 'Repairs',
    })
  }

  if (unassigned.length && ['Admin', 'Manager'].includes(role)) {
    out.push({
      id: 'unassigned',
      kind: 'new_repair',
      title: 'Work with no technician',
      body: `${plural(unassigned.length, 'repair')} in progress but unassigned: ${jobList(unassigned)}.`,
      severity: 'warning',
      link: 'Repair Board',
    })
  }

  if (waitingForParts.length && ['Admin', 'Manager', 'Technician'].includes(role)) {
    const relevant = role === 'Technician' ? waitingForParts.filter((r) => r.technicianId === technicianId) : waitingForParts
    if (relevant.length) {
      out.push({
        id: 'waiting-parts',
        kind: 'parts_available',
        title: 'Waiting on parts',
        body: `${plural(relevant.length, 'repair')} on hold for parts: ${jobList(relevant)}.`,
        severity: 'info',
        link: 'Repairs',
      })
    }
  }

  if (readyForPickup.length && isStaff) {
    out.push({
      id: 'ready-pickup',
      kind: 'repair_status',
      title: 'Ready for collection',
      body: `${plural(readyForPickup.length, 'repair')} ready to hand back: ${jobList(readyForPickup)}.`,
      severity: 'success',
      link: 'Repairs',
    })
  }

  if (role === 'Technician' && myActive.length) {
    out.push({
      id: 'my-queue',
      kind: 'repair_status',
      title: 'Your assigned work',
      body: `${plural(myActive.length, 'repair')} assigned to you: ${jobList(myActive)}.`,
      severity: 'info',
      link: 'My Repairs',
    })
  }

  return out
}
