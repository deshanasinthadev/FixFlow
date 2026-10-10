import {
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore'
import { getDb } from '../firebase/config'
import { invoiceDoc, invoicesCol, paymentsCol, repairsCol } from '../firebase/firestore'
import { computeInvoice, computePartsCost } from '../utils/formatters'
import { parseMoneyToCents, parsePercent, validateInvoice } from '../utils/validation'
import { notifyMany } from './notificationService'
import { listRepairParts } from './partsService'
import type { Cents, InvoiceDoc, InvoiceStatus, PaymentDoc, RepairRequestDoc, Role } from '../firebase/types'
import { ROLE_PERMISSIONS } from '../firebase/types'

/**
 * Invoices.
 *
 * The total is NEVER accepted from the client. Every write recomputes
 *     Total = Labor + Parts + Tax - Discount
 * through `computeInvoice`, and `partsCost` is itself recomputed from the
 * repair's live parts lines. A client that posts a wrong total is simply
 * overruled.
 */

/** Sri Lanka standard VAT. Configurable per invoice, never hardcoded in the UI. */
export const DEFAULT_TAX_RATE = 18

export interface CreateInvoiceInput {
  requestId: string
  customerId: string
  branchId: string
  laborCost: number | string
  discount?: number | string
  taxRate?: number | string
  /** Override only if you must; normally derived from the parts lines. */
  partsCost?: number | string
  documentUrl?: string
}

/**
 * Creates (or refreshes) the invoice for a repair.
 *
 * Wrapped in a transaction so a payment landing at the same moment cannot
 * produce an `amountPaid` that contradicts the totals.
 */
export const createInvoice = async (input: CreateInvoiceInput, actorRole: Role): Promise<string> => {
  if (!ROLE_PERMISSIONS[actorRole]?.isStaff) {
    throw new Error('Only staff can create invoices.')
  }

  const labor = parseMoneyToCents(input.laborCost)
  const discount = parseMoneyToCents(input.discount ?? 0) ?? 0
  const taxRate = parsePercent(input.taxRate ?? DEFAULT_TAX_RATE)
  if (labor === null) throw new Error('Enter a valid labor cost.')
  if (taxRate === null) throw new Error('Tax rate must be between 0 and 100.')

  const result = validateInvoice({ laborCost: labor / 100, partsCost: 0, discount: discount / 100, taxRate })
  if (!result.ok) {
    const err = new Error(Object.values(result.errors).join(' '))
    ;(err as { errors?: Record<string, string> }).errors = result.errors
    throw err
  }

  // Parts cost always comes from the actual parts on the repair.
  const parts = await listRepairParts(input.requestId)
  const partsCost: Cents = input.partsCost !== undefined
    ? (parseMoneyToCents(input.partsCost) ?? 0)
    : computePartsCost(parts)

  const existing = await getDocs(query(invoicesCol(), where('requestId', '==', input.requestId), limit(1)))
  const ref = existing.empty ? doc(invoicesCol()) : existing.docs[0].ref
  const paid: Cents = existing.empty ? 0 : ((existing.docs[0].data() as InvoiceDoc).amountPaid ?? 0)
  const totals = computeInvoice({ laborCost: labor, partsCost, discount, taxRate }, paid)

  await runTransaction(getDb(), async (tx) => {
    const data: Omit<InvoiceDoc, 'createdAt' | 'updatedAt'> & { createdAt: unknown; updatedAt: unknown } = {
      invoiceId: ref.id,
      requestId: input.requestId,
      customerId: input.customerId,
      branchId: input.branchId || 'all',
      laborCost: totals.laborCost,
      partsCost,
      discount: totals.discount,
      taxRate: totals.taxRate,
      tax: totals.tax,
      totalAmount: totals.totalAmount,
      amountPaid: paid,
      invoiceStatus: totals.invoiceStatus,
      documentUrl: input.documentUrl ?? '',
      createdAt: existing.empty ? serverTimestamp() : (existing.docs[0].data() as InvoiceDoc).createdAt,
      updatedAt: serverTimestamp(),
    }
    if (existing.empty) tx.set(ref, data)
    else tx.update(ref, data)
  })

  return ref.id
}

/** Edits labor/discount/tax and recomputes. `totalAmount` is not settable. */
export const updateInvoice = async (
  invoiceId: string,
  patch: Partial<Pick<InvoiceDoc, 'laborCost' | 'discount' | 'taxRate' | 'documentUrl'>>,
  actorRole: Role,
): Promise<void> => {
  if (!ROLE_PERMISSIONS[actorRole]?.isStaff) throw new Error('Only staff can edit invoices.')

  const snap = await getDoc(invoiceDoc(invoiceId))
  if (!snap.exists()) throw new Error('That invoice no longer exists.')
  const invoice = snap.data() as InvoiceDoc

  const totals = computeInvoice(
    {
      laborCost: patch.laborCost ?? invoice.laborCost,
      partsCost: invoice.partsCost,
      discount: patch.discount ?? invoice.discount,
      taxRate: patch.taxRate ?? invoice.taxRate,
    },
    invoice.amountPaid,
  )

  await updateDoc(invoiceDoc(invoiceId), {
    laborCost: totals.laborCost,
    discount: totals.discount,
    taxRate: totals.taxRate,
    tax: totals.tax,
    totalAmount: totals.totalAmount,
    invoiceStatus: totals.invoiceStatus,
    ...(patch.documentUrl !== undefined ? { documentUrl: patch.documentUrl } : {}),
    updatedAt: serverTimestamp(),
  })
}

/**
 * Re-derives partsCost from the live parts lines.
 * Call after a technician adds or removes a part so the invoice never drifts.
 */
export const recalcPartsCost = async (invoiceId: string): Promise<Cents> => {
  const snap = await getDoc(invoiceDoc(invoiceId))
  if (!snap.exists()) throw new Error('That invoice no longer exists.')
  const invoice = snap.data() as InvoiceDoc
  const partsCost = computePartsCost(await listRepairParts(invoice.requestId))
  const totals = computeInvoice(
    { laborCost: invoice.laborCost, partsCost, discount: invoice.discount, taxRate: invoice.taxRate },
    invoice.amountPaid,
  )
  await updateDoc(invoiceDoc(invoiceId), {
    partsCost,
    tax: totals.tax,
    totalAmount: totals.totalAmount,
    invoiceStatus: totals.invoiceStatus,
    updatedAt: serverTimestamp(),
  })
  return partsCost
}

/** Recomputes amountPaid + status from the payment records. Single source of truth. */
export const syncInvoiceFromPayments = async (invoiceId: string): Promise<InvoiceDoc | null> => {
  const snap = await getDoc(invoiceDoc(invoiceId))
  if (!snap.exists()) return null
  const invoice = snap.data() as InvoiceDoc

  const payments = await getDocs(query(paymentsCol(), where('invoiceId', '==', invoiceId)))
  const paid = payments.docs.reduce((sum, d) => {
    const p = d.data() as PaymentDoc
    return p.paymentStatus === 'paid' ? sum + p.amount : p.paymentStatus === 'refunded' ? sum - p.amount : sum
  }, 0)

  const totals = computeInvoice(
    { laborCost: invoice.laborCost, partsCost: invoice.partsCost, discount: invoice.discount, taxRate: invoice.taxRate },
    Math.max(0, paid),
  )
  await updateDoc(invoiceDoc(invoiceId), {
    amountPaid: Math.max(0, paid),
    invoiceStatus: totals.invoiceStatus,
    updatedAt: serverTimestamp(),
  })
  return { ...invoice, amountPaid: Math.max(0, paid), invoiceStatus: totals.invoiceStatus }
}

export const fetchInvoice = async (invoiceId: string): Promise<InvoiceDoc | null> => {
  const snap = await getDoc(invoiceDoc(invoiceId))
  return snap.exists() ? (snap.data() as InvoiceDoc) : null
}

export const fetchInvoiceForRepair = async (requestId: string): Promise<(InvoiceDoc & { id: string }) | null> => {
  const snap = await getDocs(query(invoicesCol(), where('requestId', '==', requestId), limit(1)))
  return snap.empty ? null : { ...(snap.docs[0].data() as InvoiceDoc), id: snap.docs[0].id }
}

export const listInvoices = async (opts: { customerId?: string; status?: InvoiceStatus; n?: number } = {}): Promise<
  (InvoiceDoc & { id: string })[]
> => {
  const constraints = []
  if (opts.customerId) constraints.push(where('customerId', '==', opts.customerId))
  if (opts.status) constraints.push(where('invoiceStatus', '==', opts.status))
  const snap = await getDocs(query(invoicesCol(), ...constraints, orderBy('createdAt', 'desc'), limit(opts.n ?? 200)))
  return snap.docs.map((d) => ({ ...(d.data() as InvoiceDoc), id: d.id }))
}

export const subscribeInvoices = (
  opts: { customerId?: string } = {},
  onChange: (items: (InvoiceDoc & { id: string })[]) => void,
  onError: (message: string) => void,
): (() => void) => {
  const constraints = []
  if (opts.customerId) constraints.push(where('customerId', '==', opts.customerId))
  return onSnapshot(
    query(invoicesCol(), ...constraints, orderBy('createdAt', 'desc'), limit(200)),
    (snap) => onChange(snap.docs.map((d) => ({ ...(d.data() as InvoiceDoc), id: d.id }))),
    (err) => onError(err.message),
  )
}

/**
 * Revenue figures for the admin dashboard, computed from paid payments only.
 * No static numbers anywhere: this is a live aggregate.
 */
export interface RevenueStats {
  totalRevenue: Cents
  outstanding: Cents
  invoiceCount: number
}

export const fetchRevenueStats = async (): Promise<RevenueStats> => {
  const [invoices, payments] = await Promise.all([
    getDocs(query(invoicesCol(), limit(1000))),
    getDocs(query(paymentsCol(), where('paymentStatus', '==', 'paid'), limit(1000))),
  ])
  const totalRevenue = payments.docs.reduce((s, d) => s + ((d.data() as PaymentDoc).amount ?? 0), 0)
  const invoiced = invoices.docs.reduce((s, d) => s + ((d.data() as InvoiceDoc).totalAmount ?? 0), 0)
  const paidAgainstInvoices = invoices.docs.reduce((s, d) => s + ((d.data() as InvoiceDoc).amountPaid ?? 0), 0)
  return { totalRevenue, outstanding: Math.max(0, invoiced - paidAgainstInvoices), invoiceCount: invoices.size }
}

/** Live revenue so the KPI cards move as payments land. */
export const subscribeRevenue = (
  onChange: (stats: RevenueStats) => void,
  onError: (message: string) => void,
): (() => void) =>
  onSnapshot(
    query(paymentsCol(), where('paymentStatus', '==', 'paid')),
    async () => {
      try {
        onChange(await fetchRevenueStats())
      } catch (err) {
        onError((err as Error).message)
      }
    },
    (err) => onError(err.message),
  )

/** Asks the customer to pay — writes the notification, nothing else. */
export const requestPayment = async (invoiceId: string, actorRole: Role): Promise<void> => {
  if (!ROLE_PERMISSIONS[actorRole]?.isStaff) throw new Error('Only staff can request payment.')
  const invoice = await fetchInvoice(invoiceId)
  if (!invoice) throw new Error('That invoice no longer exists.')
  const balance = Math.max(0, invoice.totalAmount - invoice.amountPaid)
  if (balance === 0) throw new Error('This invoice is already fully paid.')

  await notifyMany([
    {
      userId: invoice.customerId,
      event: 'payment_requested',
      body: `A payment of Rs. ${(balance / 100).toFixed(2)} is due for your repair.`,
      link: `invoice:${invoiceId}`,
      requestId: invoice.requestId,
    },
  ])
}

export const setInvoiceStatus = async (invoiceId: string, status: InvoiceStatus, actorRole: Role): Promise<void> => {
  if (!ROLE_PERMISSIONS[actorRole]?.isStaff) throw new Error('Only staff can change invoice status.')
  await updateDoc(invoiceDoc(invoiceId), { invoiceStatus: status, updatedAt: serverTimestamp() })
}

export const deleteInvoice = async (invoiceId: string, actorRole: Role): Promise<void> => {
  if (!ROLE_PERMISSIONS[actorRole]?.canManageUsers) throw new Error('Only an administrator can delete invoices.')
  const snap = await getDoc(invoiceDoc(invoiceId))
  if (!snap.exists()) return
  const invoice = snap.data() as InvoiceDoc
  if (invoice.amountPaid > 0) throw new Error('This invoice has payments recorded. Refund them first.')
  await deleteDoc(invoiceDoc(invoiceId))
}

/** Repair ids, for the admin "invoice this repair" picker. */
export const listBillableRepairs = async (n = 100): Promise<(RepairRequestDoc & { id: string })[]> => {
  const snap = await getDocs(
    query(repairsCol(), where('status', 'in', ['completed', 'delivered']), orderBy('updatedAt', 'desc'), limit(n)),
  )
  return snap.docs.map((d) => ({ ...(d.data() as RepairRequestDoc), id: d.id }))
}

/** Exposed for screens that write the generated PDF URL back to Storage. */
export const attachInvoiceDocument = async (invoiceId: string, url: string): Promise<void> => {
  await setDoc(invoiceDoc(invoiceId), { documentUrl: url, updatedAt: serverTimestamp() }, { merge: true })
}
