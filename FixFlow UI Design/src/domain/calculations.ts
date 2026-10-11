import type {
  Estimate,
  Invoice,
  InvoiceStatus,
  MinorUnits,
  Payment,
  Refund,
  Sale,
  SaleItem,
} from './types'

/**
 * All money arithmetic lives here and nowhere else (§26).
 *
 * Every amount is integer minor units. Nothing in this file parses a string or
 * formats a number — that happens in `utils/format.ts`, at the edge.
 */

const int = (n: unknown): number => Math.round(Number(n) || 0)

/** Never let a rounding step produce a fractional cent. */
export const money = (n: number): MinorUnits => Math.round(n)

/** Subtotal of a line list. */
export const sumLines = (lines: { quantity: number; unitPrice: MinorUnits }[]): MinorUnits =>
  lines.reduce((s, l) => s + int(l.quantity) * int(l.unitPrice), 0)

/**
 * THE DOCUMENT FORMULA, in one place:
 *
 *     Total = Labour + Parts/Subtotal − Discount + Tax
 *
 * Tax applies to the discounted base, which is the Sri Lankan treatment and
 * the order §9/§10/§16 imply. A discount can never exceed the base it is taken
 * from — it is clamped rather than allowed to produce a negative taxable
 * amount.
 *
 * Used by estimates (§9), invoices (§15) and POS checkout (§10) so the three
 * can never disagree.
 */
export interface DocumentAmounts {
  /** Labour or service component. */
  labourCost?: MinorUnits
  /** Parts or goods component. */
  partsCost?: MinorUnits
  discount?: MinorUnits
  /** Percent, e.g. 15. */
  taxRate?: number
}

export interface DocumentTotals extends Required<DocumentAmounts> {
  subtotal: MinorUnits
  /** Labour + parts, before discount. */
  gross: MinorUnits
  taxAmount: MinorUnits
  total: MinorUnits
}

export const computeDocument = (amounts: DocumentAmounts, taxEnabled = true): DocumentTotals => {
  const labourCost = Math.max(0, int(amounts.labourCost))
  const partsCost = Math.max(0, int(amounts.partsCost))
  const gross = labourCost + partsCost
  const discount = Math.min(Math.max(0, int(amounts.discount)), gross)
  const taxable = gross - discount
  const rate = taxEnabled ? Math.min(100, Math.max(0, Number(amounts.taxRate) || 0)) : 0
  const taxAmount = money((taxable * rate) / 100)
  return {
    labourCost,
    partsCost,
    discount,
    taxRate: rate,
    subtotal: taxable,
    gross,
    taxAmount,
    total: taxable + taxAmount,
  }
}

/** §11 — the one definition of availability. */
export const availableQuantity = (quantityOnHand: number, reservedQuantity: number): number =>
  Math.max(0, int(quantityOnHand) - int(reservedQuantity))

export const isLowStock = (quantityOnHand: number, minStockLevel: number): boolean =>
  int(quantityOnHand) <= int(minStockLevel)

/**
 * §16 — Balance Due = Invoice Total − Successful Payments − Applicable Credits.
 *
 * Only payments with status 'paid' reduce the balance. A refunded payment is
 * subtracted back out, so refunding cannot silently leave an invoice marked
 * settled.
 */
export const balanceDue = (
  invoiceTotal: MinorUnits,
  payments: Pick<Payment, 'amount' | 'status'>[],
  credits: MinorUnits = 0,
): MinorUnits => {
  const settled = payments.reduce((sum, p) => {
    if (p.status === 'paid') return sum + int(p.amount)
    if (p.status === 'refunded') return sum - int(p.amount)
    return sum
  }, 0)
  return Math.max(0, int(invoiceTotal) - settled - Math.max(0, int(credits)))
}

export const invoiceStatusFor = (total: MinorUnits, due: MinorUnits): InvoiceStatus => {
  if (int(total) === 0) return 'draft'
  if (due <= 0) return 'paid'
  if (due < total) return 'partially_paid'
  return 'issued'
}

/**
 * §10 — validate a cart against what is actually available before checkout.
 * Returns the offending lines so the POS can name them, not just fail.
 */
export interface StockCheckFailure {
  productId: string
  productName: string
  requested: number
  available: number
}

export const checkStockAvailability = (
  lines: { productId: string; productName: string; quantity: number }[],
  availability: Record<string, number>,
): StockCheckFailure[] =>
  lines.flatMap((line) => {
    const available = int(availability[line.productId])
    return int(line.quantity) > available
      ? [{ productId: line.productId, productName: line.productName, requested: int(line.quantity), available }]
      : []
  })

/**
 * §10 / §18 — cost of goods sold for a sale, from the line costs captured at
 * the moment of sale. Selling price must not be used here: profit computed
 * from revenue minus revenue is always zero.
 */
export const saleCostOfGoods = (items: Pick<SaleItem, 'quantity' | 'unitCost'>[]): MinorUnits =>
  items.reduce((s, i) => s + int(i.quantity) * int(i.unitCost), 0)

export const saleRevenue = (sale: Pick<Sale, 'subtotal' | 'discount'>): MinorUnits =>
  Math.max(0, int(sale.subtotal) - int(sale.discount))

/**
 * §18 — gross profit. Tax is excluded: it is collected for the government, not
 * earned. The spec explicitly warns against deriving profit by subtracting all
 * purchases from all sales; this is per-transaction instead.
 */
/** The narrowest shape these functions actually read, so callers need not build a full Sale. */
export interface SaleLike {
  subtotal: MinorUnits
  discount: MinorUnits
  items: Pick<SaleItem, 'quantity' | 'unitCost'>[]
}

export const grossProfit = (sale: SaleLike): MinorUnits =>
  saleRevenue(sale) - saleCostOfGoods(sale.items)

/**
 * §18 — operating result. Expenses and COGS are separate concepts and must not
 * be conflated.
 */
export interface OperatingResult {
  revenue: MinorUnits
  costOfGoods: MinorUnits
  grossProfit: MinorUnits
  operatingExpenses: MinorUnits
  operatingResult: MinorUnits
}

export const operatingResult = (
  sales: SaleLike[],
  expenses: MinorUnits,
): OperatingResult => {
  const revenue = sales.reduce((s, x) => s + saleRevenue(x), 0)
  const costOfGoods = sales.reduce((s, x) => s + saleCostOfGoods(x.items), 0)
  const gross = revenue - costOfGoods
  const opex = Math.max(0, int(expenses))
  return {
    revenue,
    costOfGoods,
    grossProfit: gross,
    operatingExpenses: opex,
    operatingResult: gross - opex,
  }
}

/**
 * §12 — a purchase order's total is the ordered quantity. Receiving fewer
 * units does not change what was ordered; it changes what is payable and what
 * enters stock.
 */
export const purchaseOrderTotal = (
  items: { quantityOrdered: number; unitCost: MinorUnits }[],
): MinorUnits => items.reduce((s, i) => s + int(i.quantityOrdered) * int(i.unitCost), 0)

/** §12 — only the received quantity may increase stock. */
export const purchaseQuantityReceived = (
  items: { quantityReceived: number }[],
): number => items.reduce((s, i) => s + Math.max(0, int(i.quantityReceived)), 0)

/** §17 — months between two ISO dates, whole months. */
export const monthsBetween = (fromIso: string, toIso: string): number => {
  const a = new Date(fromIso)
  const b = new Date(toIso)
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return 0
  return (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth())
}

export const addMonths = (iso: string, months: number): string => {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  d.setMonth(d.getMonth() + int(months))
  return d.toISOString()
}

/** §17 — days until expiry; negative means already expired. */
export const daysUntil = (iso: string, from: Date = new Date()): number => {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return 0
  return Math.ceil((d.getTime() - from.getTime()) / 86_400_000)
}

/**
 * §7 — average turnaround in hours, over repairs that reached `delivered`.
 * Returns null when there is nothing to measure, so the UI shows "—" rather
 * than a misleading zero.
 */
export const averageTurnaroundHours = (
  jobs: { receivedAt: string; deliveredAt: string }[],
): number | null => {
  const measured = jobs
    .map((j) => (new Date(j.deliveredAt).getTime() - new Date(j.receivedAt).getTime()) / 3_600_000)
    .filter((h) => Number.isFinite(h) && h >= 0)
  if (!measured.length) return null
  return measured.reduce((s, h) => s + h, 0) / measured.length
}

/** Refund validation — §28.6, a refund may not exceed the original sale. */
export const refundableAmount = (sale: Pick<Sale, 'total' | 'amountPaid'>, existingRefunds: Pick<Refund, 'amount'>[]): MinorUnits => {
  const refunded = existingRefunds.reduce((s, r) => s + int(r.amount), 0)
  return Math.max(0, Math.min(int(sale.total), int(sale.amountPaid)) - refunded)
}

/** Convenience for estimate expiry (§9). */
export const isEstimateExpired = (estimate: Pick<Estimate, 'expiresAt' | 'status'>, now: Date = new Date()): boolean =>
  estimate.status !== 'approved' &&
  estimate.status !== 'rejected' &&
  !!estimate.expiresAt &&
  new Date(estimate.expiresAt).getTime() < now.getTime()

/** Convenience for invoice totals from an existing estimate. */
export const estimateToInvoiceAmounts = (e: Pick<Estimate, 'labourCost' | 'items' | 'discount' | 'taxRate'>): DocumentAmounts => ({
  labourCost: e.labourCost,
  partsCost: sumLines(e.items),
  discount: e.discount,
  taxRate: e.taxRate,
})

/** Convenience for invoice totals from a sale. */
export const saleToInvoiceAmounts = (s: Pick<Sale, 'discount' | 'taxRate'> & { items: Pick<SaleItem, 'quantity' | 'unitPrice'>[] }): DocumentAmounts => ({
  labourCost: 0,
  partsCost: sumLines(s.items),
  discount: s.discount,
  taxRate: s.taxRate,
})

export type { Invoice }

// ---------------------------------------------------------------------------
// Warranty (§17)
// ---------------------------------------------------------------------------

/**
 * §17 — whether a warranty is live.
 *
 * Derived from the dates stored on the warranty, never recomputed from the
 * product's current policy. Editing a product's warranty period after the fact
 * must not silently extend or shorten cover somebody already has; the row is
 * the contract, and the policy is only what new cover is sold under.
 */
export const isWarrantyActive = (
  warranty: { startsAt: string; expiresAt: string },
  now: Date = new Date(),
): boolean => {
  const start = new Date(warranty.startsAt).getTime()
  const end = new Date(warranty.expiresAt).getTime()
  if (Number.isNaN(start) || Number.isNaN(end)) return false
  const at = now.getTime()
  return at >= start && at <= end
}

/**
 * §17 — cover ending soon, so it can be surfaced before the customer finds out
 * by being refused a claim. The default window is 30 days.
 */
export const isWarrantyExpiringSoon = (
  warranty: { expiresAt: string },
  now: Date = new Date(),
  withinDays = 30,
): boolean => {
  const days = daysUntil(warranty.expiresAt, now)
  return days >= 0 && days <= withinDays
}

/**
 * §17 — the expiry date for a policy, given when cover starts.
 *
 * A zero-month policy has no cover, and the caller should not create a warranty
 * at all rather than one that expires the moment it starts.
 */
export const warrantyExpiry = (startsAt: string, durationMonths: number): string =>
  addMonths(startsAt, int(durationMonths))
