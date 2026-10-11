import type { RepairJob, Sale } from '../../domain/types'
import type { Product } from '../../db/schema'

/**
 * Dashboard figures (§6).
 *
 * Every number on the dashboard must come from saved records, not a literal.
 * The previous dashboard hardcoded "Rs. 184,500 / 38 / 12 / Rs. 326,400 / 8 /
 * Rs. 24,800" regardless of what was in the database.
 *
 * This module is deliberately framework-free so the figures are testable
 * without rendering React.
 */

export interface DashboardFigures {
  /** Minor units. Sales whose receipt is dated today. */
  todaySales: number
  todaySaleCount: number
  /** Repairs the shop is actively working on. */
  activeRepairs: number
  readyForPickup: number
  awaitingApproval: number
  /** Active repairs with no technician assigned — the queue nobody owns. */
  unassignedRepairs: number
  /** Available stock at or below the reorder level. */
  lowStockItems: number
  /** Available stock of zero. */
  criticalStockItems: number
}

const startOfDay = (d: Date): number => {
  const copy = new Date(d)
  copy.setHours(0, 0, 0, 0)
  return copy.getTime()
}

/** Statuses that mean the shop is working the job, matching countRepairs. */
const ACTIVE = new Set(['diagnosing', 'approved', 'repairing', 'testing', 'waiting_for_parts'])

/**
 * Units that can actually be sold. Stock reserved for a repair is not
 * available, so a reorder warning based on `stockOnHand` alone would fire
 * late (§28.3).
 */
export const availableUnits = (product: Product): number =>
  Math.max(0, product.stockOnHand - product.reserved)

export const computeDashboardFigures = (
  input: { repairs: RepairJob[]; sales: Sale[]; products: Product[] },
  now: Date = new Date(),
): DashboardFigures => {
  const dayStart = startOfDay(now)
  const dayEnd = dayStart + 86_400_000

  let todaySales = 0
  let todaySaleCount = 0
  for (const sale of input.sales) {
    const at = new Date(sale.createdAt).getTime()
    if (Number.isNaN(at)) continue
    if (at >= dayStart && at < dayEnd) {
      todaySales += sale.total
      todaySaleCount += 1
    }
  }

  let activeRepairs = 0
  let readyForPickup = 0
  let awaitingApproval = 0
  let unassignedRepairs = 0
  for (const job of input.repairs) {
    const working = ACTIVE.has(job.status)
    if (working) {
      activeRepairs += 1
      if (!job.technicianId) unassignedRepairs += 1
    }
    if (job.status === 'ready_for_collection') readyForPickup += 1
    if (job.status === 'waiting_for_approval') awaitingApproval += 1
  }

  let lowStockItems = 0
  let criticalStockItems = 0
  for (const product of input.products) {
    const available = availableUnits(product)
    if (available <= product.minStock) lowStockItems += 1
    if (available <= 0) criticalStockItems += 1
  }

  return {
    todaySales,
    todaySaleCount,
    activeRepairs,
    readyForPickup,
    awaitingApproval,
    unassignedRepairs,
    lowStockItems,
    criticalStockItems,
  }
}
