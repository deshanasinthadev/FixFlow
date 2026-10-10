import type { Timestamp } from 'firebase/firestore'
import {
  REPAIR_STATUS_LABEL,
  type Cents,
  type InvoiceStatus,
  type NotificationEvent,
  type PartStatus,
  type PaymentStatus,
  type RepairPriority,
  type RepairStatus,
  type Role,
} from '../firebase/types'

/**
 * Display + money helpers. Money is integer cents everywhere internally and
 * only becomes a string here, at the edge.
 */

const LKR = new Intl.NumberFormat('en-LK', {
  style: 'currency',
  currency: 'LKR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const LKR_COMPACT = new Intl.NumberFormat('en-LK', {
  style: 'currency',
  currency: 'LKR',
  notation: 'compact',
  maximumFractionDigits: 1,
})

export const formatLKR = (cents: Cents | null | undefined): string =>
  LKR.format(((cents ?? 0) as number) / 100)

export const formatLKRCompact = (cents: Cents | null | undefined): string =>
  LKR_COMPACT.format(((cents ?? 0) as number) / 100)

/** Cents -> a plain number suitable for a form input. */
export const centsToInput = (cents: Cents | null | undefined): string =>
  cents === null || cents === undefined ? '' : ((cents as number) / 100).toFixed(2)

/**
 * THE INVOICE FORMULA, in exactly one place:
 *
 *     Total = Labor + Parts + Tax - Discount
 *
 * Tax is charged on the discounted subtotal, not the gross — that is the
 * Sri Lankan treatment and it is also the order the spec's wording implies
 * (discount is subtracted, not added). Every caller must use this; no screen
 * is allowed to recompute the total inline.
 *
 * Returns integer cents. Rounding happens once, at the tax step.
 */
export interface InvoiceAmounts {
  laborCost: Cents
  partsCost: Cents
  discount: Cents
  /** Percent, e.g. 18. */
  taxRate: number
}

export interface InvoiceTotals extends InvoiceAmounts {
  /** Labor + parts. */
  subtotal: Cents
  tax: Cents
  totalAmount: Cents
  /** What is still owed given `amountPaid`. */
  balanceDue: Cents
  invoiceStatus: InvoiceStatus
}

export const computeInvoice = (amounts: InvoiceAmounts, amountPaid: Cents = 0): InvoiceTotals => {
  const laborCost = Math.max(0, Math.round(amounts.laborCost || 0))
  const partsCost = Math.max(0, Math.round(amounts.partsCost || 0))
  const subtotal = laborCost + partsCost
  // A discount larger than the subtotal would produce a negative taxable
  // base; clamp rather than store nonsense.
  const discount = Math.min(Math.max(0, Math.round(amounts.discount || 0)), subtotal)
  const taxRate = Math.min(100, Math.max(0, Number(amounts.taxRate) || 0))
  const taxable = subtotal - discount
  const tax = Math.round((taxable * taxRate) / 100)
  const totalAmount = taxable + tax
  const paid = Math.max(0, Math.round(amountPaid || 0))
  const balanceDue = Math.max(0, totalAmount - paid)

  let invoiceStatus: InvoiceStatus
  if (totalAmount === 0 && paid === 0) invoiceStatus = 'draft'
  else if (paid <= 0) invoiceStatus = 'issued'
  else if (paid >= totalAmount) invoiceStatus = 'paid'
  else invoiceStatus = 'partially_paid'

  return { laborCost, partsCost, subtotal, discount, taxRate, tax, totalAmount, balanceDue, invoiceStatus }
}

/** Parts cost from the repair's used-parts list. */
export const computePartsCost = (lines: { quantity: number; unitPrice: Cents }[]): Cents =>
  lines.reduce((sum, l) => sum + Math.max(0, Math.round(l.quantity || 0)) * Math.max(0, Math.round(l.unitPrice || 0)), 0)

/** Derives the part's stock status from its quantity vs reorder point. */
export const partStatusFor = (quantity: number, minQuantity: number): PartStatus => {
  if (quantity <= 0) return 'out_of_stock'
  if (quantity <= minQuantity) return 'low_stock'
  return 'in_stock'
}

/** Firestore Timestamp | ISO string | null -> Date | null. */
export type DateLike = Timestamp | Date | string | number | null | undefined

export const toDate = (v: DateLike): Date | null => {
  if (!v) return null
  if (v instanceof Date) return v
  if (typeof v === 'object' && typeof (v as Timestamp).toDate === 'function') return (v as Timestamp).toDate()
  const d = new Date(v as string | number)
  return Number.isNaN(d.getTime()) ? null : d
}

export const formatDate = (v: DateLike): string => {
  const d = toDate(v)
  return d ? d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'
}

export const formatDateTime = (v: DateLike): string => {
  const d = toDate(v)
  return d
    ? d.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '—'
}

/** ISO date (yyyy-mm-dd) only — used for `preferredDate`. */
export const toIsoDate = (d: Date): string => {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export const relativeTime = (v: DateLike): string => {
  const d = toDate(v)
  if (!d) return '—'
  const diff = Date.now() - d.getTime()
  const mins = Math.round(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  if (days < 30) return `${days}d ago`
  return formatDate(d)
}

export const initials = (name: string): string =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('') || '?'

/** Labels for enums, so the UI never hardcodes a display string. */
export const ROLE_LABEL: Record<Role, string> = {
  customer: 'Customer',
  technician: 'Technician',
  cashier: 'Cashier',
  manager: 'Manager',
  admin: 'Admin',
}

export const PRIORITY_LABEL: Record<RepairPriority, string> = {
  low: 'Low',
  normal: 'Normal',
  high: 'High',
  urgent: 'Urgent',
}

export const repairStatusLabel = (s: RepairStatus): string => REPAIR_STATUS_LABEL[s] ?? s

export const INVOICE_STATUS_LABEL: Record<InvoiceStatus, string> = {
  draft: 'Draft',
  issued: 'Issued',
  paid: 'Paid',
  partially_paid: 'Partially paid',
  overdue: 'Overdue',
  cancelled: 'Cancelled',
}

export const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  pending: 'Pending',
  paid: 'Paid',
  failed: 'Failed',
  refunded: 'Refunded',
}

export const PART_STATUS_LABEL: Record<PartStatus, string> = {
  in_stock: 'In stock',
  low_stock: 'Low stock',
  out_of_stock: 'Out of stock',
}

export const NOTIFICATION_LABEL: Record<NotificationEvent, string> = {
  repair_created: 'Repair request created',
  repair_approved: 'Repair request approved',
  technician_assigned: 'Technician assigned',
  diagnosis_completed: 'Diagnosis completed',
  status_changed: 'Status updated',
  repair_completed: 'Repair completed',
  payment_requested: 'Payment requested',
  payment_completed: 'Payment received',
}

/** Maps an internal enum to the CSS badge class the UI already defines. */
export const statusBadgeClass = (s: RepairStatus): string => {
  switch (s) {
    case 'pending':
      return 'badge pending'
    case 'approved':
    case 'diagnosing':
    case 'repairing':
      return 'badge in-progress'
    case 'waiting_for_parts':
      return 'badge awaiting-parts'
    case 'completed':
    case 'delivered':
      return 'badge completed'
    case 'cancelled':
      return 'badge cancelled'
  }
}

/** Human-readable repair id, matching the existing UI's FX-YYYY-###### shape. */
export const formatRequestId = (id: string, createdAt: DateLike): string => {
  const year = toDate(createdAt)?.getFullYear() ?? new Date().getFullYear()
  const tail = id.slice(-6).toUpperCase().padStart(6, '0')
  return `FX-${year}-${tail}`
}
