import type { RepairJob, Sale } from '../../domain/types'
import type { Product } from '../../db/schema'
import { saleCostOfGoods, saleRevenue } from '../../domain/calculations'

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

// ---------------------------------------------------------------------------
// Money on the dashboard (§1 dashboard, §18 profit)
// ---------------------------------------------------------------------------

export interface MoneyFigures {
  /** Minor units. POS sales dated today. */
  todaySales: number
  /** Minor units. Repair invoices paid today. */
  todayRepairIncome: number
  /** Minor units. Expenses dated today. */
  todayExpenses: number
  /**
   * Sales revenue + repair income − cost of goods sold − expenses.
   *
   * Cost of goods comes from the recorded unit cost on each sale line, not from
   * subtracting purchases from sales. §18 is explicit that treating all sales
   * revenue as profit, or netting total purchases against total sales, is the
   * wrong calculation — both hide what a sale actually cost to make.
   */
  todayProfit: number
}

export interface SeriesPoint {
  /** Short label for the axis, e.g. "Mon" or "Mar". */
  label: string
  /** Day or month start, so a caller can key off it. */
  key: string
  revenue: number
  expenses: number
}

/** The narrowest invoice shape these figures read. */
export interface RepairInvoiceLike {
  repairId: string
  /** What has actually been collected, not what was billed. */
  paidTotal: number
  createdAt: string
}

export interface ExpenseLike {
  amount: number
  spentAt: string
}

const dayKey = (d: Date): string => {
  const copy = new Date(d)
  copy.setHours(0, 0, 0, 0)
  return copy.toISOString().slice(0, 10)
}

const monthKey = (d: Date): string => d.toISOString().slice(0, 7)

/**
 * Income booked today, from records only.
 *
 * Repair income counts what has been *paid*, not what has been billed: an
 * unpaid invoice is a receivable, and showing it as income would overstate the
 * day by whatever nobody has handed over yet.
 */
export const computeMoneyFigures = (
  input: { sales: Sale[]; invoices: RepairInvoiceLike[]; expenses: ExpenseLike[] },
  now: Date = new Date(),
): MoneyFigures => {
  const today = dayKey(now)

  let todaySales = 0
  let costOfGoods = 0
  for (const sale of input.sales) {
    if (dayKey(new Date(sale.createdAt)) !== today) continue
    todaySales += saleRevenue(sale)
    costOfGoods += saleCostOfGoods(sale.items)
  }

  let todayRepairIncome = 0
  for (const invoice of input.invoices) {
    if (!invoice.repairId) continue
    if (dayKey(new Date(invoice.createdAt)) !== today) continue
    todayRepairIncome += invoice.paidTotal
  }

  let todayExpenses = 0
  for (const expense of input.expenses) {
    if (dayKey(new Date(expense.spentAt)) !== today) continue
    todayExpenses += expense.amount
  }

  return {
    todaySales,
    todayRepairIncome,
    todayExpenses,
    todayProfit: todaySales + todayRepairIncome - costOfGoods - todayExpenses,
  }
}

/**
 * Revenue and expenses bucketed by day (weekly view) or month (monthly view).
 *
 * Buckets are generated for the whole window, including ones with nothing in
 * them. Dropping empty days would make a quiet week look like a busy one by
 * compressing the gaps out of the chart.
 */
export const computeSeries = (
  input: { sales: Sale[]; invoices: RepairInvoiceLike[]; expenses: ExpenseLike[] },
  granularity: 'day' | 'month',
  buckets: number,
  now: Date = new Date(),
): SeriesPoint[] => {
  const keyOf = granularity === 'day' ? dayKey : monthKey
  const labels = granularity === 'day'
    ? ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
    : ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

  // Build the window oldest-first so the chart reads left to right in time.
  const keys: string[] = []
  for (let i = buckets - 1; i >= 0; i--) {
    const cursor = new Date(now)
    if (granularity === 'day') {
      cursor.setDate(cursor.getDate() - i)
    } else {
      cursor.setMonth(cursor.getMonth() - i, 1)
    }
    keys.push(keyOf(cursor))
  }

  const revenueBy = new Map<string, number>()
  const expensesBy = new Map<string, number>()
  const add = (map: Map<string, number>, key: string, amount: number) =>
    map.set(key, (map.get(key) ?? 0) + amount)

  for (const sale of input.sales) {
    const key = keyOf(new Date(sale.createdAt))
    if (keys.includes(key)) add(revenueBy, key, saleRevenue(sale))
  }
  for (const invoice of input.invoices) {
    if (!invoice.repairId) continue
    const key = keyOf(new Date(invoice.createdAt))
    if (keys.includes(key)) add(revenueBy, key, invoice.paidTotal)
  }
  for (const expense of input.expenses) {
    const key = keyOf(new Date(expense.spentAt))
    if (keys.includes(key)) add(expensesBy, key, expense.amount)
  }

  return keys.map((key) => {
    // key is "YYYY-MM-DD" or "YYYY-MM"; parse it as a local date, not UTC, so
    // the label matches the day the bucket represents.
    const parts = key.split('-').map(Number)
    const date = new Date(parts[0], parts[1] - 1, parts[2] ?? 1)
    return {
      key,
      label: granularity === 'day' ? labels[date.getDay()] : labels[date.getMonth()],
      revenue: revenueBy.get(key) ?? 0,
      expenses: expensesBy.get(key) ?? 0,
    }
  })
}

/**
 * Repairs whose promised date has passed and are still not with the customer.
 *
 * Delivered and cancelled jobs are excluded: a job nobody is waiting for is not
 * overdue, and counting it would train staff to ignore the warning.
 */
export const countOverdueRepairs = (repairs: RepairJob[], now: Date = new Date()): number => {
  const today = dayKey(now)
  let count = 0
  for (const job of repairs) {
    if (job.status === 'delivered' || job.status === 'cancelled') continue
    if (!job.expectedCompletion) continue
    if (dayKey(new Date(job.expectedCompletion)) < today) count += 1
  }
  return count
}
