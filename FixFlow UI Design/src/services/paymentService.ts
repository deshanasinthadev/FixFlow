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
import { invoiceDoc, paymentDoc, paymentsCol } from '../firebase/firestore'
import { computeInvoice } from '../utils/formatters'
import { parseMoneyToCents, validatePayment } from '../utils/validation'
import { notifyMany } from './notificationService'
import type { Cents, InvoiceDoc, PaymentDoc, PaymentMethod, PaymentStatus, Role } from '../firebase/types'
import { ROLE_PERMISSIONS } from '../firebase/types'

/**
 * Payments.
 *
 * Every payment write runs inside a transaction that reads the invoice, checks
 * the balance against the CURRENT stored total, writes the payment, and
 * updates `amountPaid` + `invoiceStatus` in the same commit. Two simultaneous
 * payments therefore cannot over-collect, and the invoice can never disagree
 * with its payments.
 */

export class OverpaymentError extends Error {
  constructor(amount: Cents, balance: Cents) {
    super(`Payment of Rs. ${(amount / 100).toFixed(2)} exceeds the outstanding balance of Rs. ${(balance / 100).toFixed(2)}.`)
    this.name = 'OverpaymentError'
  }
}

export const PAYMENT_METHODS: PaymentMethod[] = ['cash', 'card', 'bank_transfer', 'online']

export interface RecordPaymentInput {
  invoiceId: string
  amount: number | string
  paymentMethod: PaymentMethod
  paymentStatus?: PaymentStatus
  /** Gateway reference; optional for cash. */
  transactionId?: string
  note?: string
  recordedBy: string
}

/**
 * Records a payment against an invoice.
 * Returns the updated invoice so the caller can refresh the UI immediately.
 */
export const recordPayment = async (input: RecordPaymentInput, actorRole: Role): Promise<{ paymentId: string; invoice: InvoiceDoc }> => {
  if (!ROLE_PERMISSIONS[actorRole]?.isStaff) {
    throw new Error('Only staff can record payments.')
  }

  const amount = parseMoneyToCents(input.amount)
  const status: PaymentStatus = input.paymentStatus ?? 'paid'

  const result = validatePayment({
    amount: input.amount,
    paymentMethod: input.paymentMethod,
    paymentStatus: status,
    remainingCents: Number.MAX_SAFE_INTEGER,
  })
  if (!result.ok) {
    const err = new Error(Object.values(result.errors).join(' '))
    ;(err as { errors?: Record<string, string> }).errors = result.errors
    throw err
  }
  if (amount === null || amount <= 0) throw new Error('Enter an amount greater than zero.')

  const ref = doc(paymentsCol())

  // runTransaction resolves with whatever the callback returns, so the
  // post-payment invoice comes back typed instead of via a mutable capture.
  const updated = await runTransaction(getDb(), async (tx): Promise<InvoiceDoc> => {
    const invRef = invoiceDoc(input.invoiceId)
    const invSnap = await tx.get(invRef)
    if (!invSnap.exists()) throw new Error('That invoice no longer exists.')
    const invoice = invSnap.data() as InvoiceDoc

    const balance = Math.max(0, invoice.totalAmount - invoice.amountPaid)
    if (status === 'paid' && amount > balance) throw new OverpaymentError(amount, balance)

    // A local reference keeps cash payments traceable without a gateway.
    const transactionId =
      input.transactionId?.trim() || (input.paymentMethod === 'cash' ? `CASH-${ref.id.slice(-8).toUpperCase()}` : '')

    tx.set(ref, {
      paymentId: ref.id,
      invoiceId: input.invoiceId,
      requestId: invoice.requestId,
      customerId: invoice.customerId,
      amount,
      paymentMethod: input.paymentMethod,
      paymentStatus: status,
      transactionId,
      note: (input.note ?? '').trim(),
      paidAt: status === 'paid' ? serverTimestamp() : null,
      createdAt: serverTimestamp(),
    } satisfies Omit<PaymentDoc, 'paidAt' | 'createdAt'> & { paidAt: unknown; createdAt: unknown })

    const newPaid = status === 'paid' ? invoice.amountPaid + amount : invoice.amountPaid
    const totals = computeInvoice(
      { laborCost: invoice.laborCost, partsCost: invoice.partsCost, discount: invoice.discount, taxRate: invoice.taxRate },
      newPaid,
    )
    tx.update(invRef, {
      amountPaid: newPaid,
      invoiceStatus: totals.invoiceStatus,
      updatedAt: serverTimestamp(),
    })
    return { ...invoice, amountPaid: newPaid, invoiceStatus: totals.invoiceStatus }
  })

  if (status === 'paid') {
    const invoice = updated
    await notifyMany([
      {
        userId: invoice.customerId,
        event: 'payment_completed',
        body:
          invoice.amountPaid >= invoice.totalAmount
            ? `Payment received in full. Thank you — your invoice is settled.`
            : `Payment of Rs. ${(amount / 100).toFixed(2)} received. Balance due: Rs. ${((invoice.totalAmount - invoice.amountPaid) / 100).toFixed(2)}.`,
        link: `invoice:${input.invoiceId}`,
        requestId: invoice.requestId,
      },
    ]).catch(() => {
      /* a failed notification must never lose a recorded payment */
    })
  }

  return { paymentId: ref.id, invoice: updated }
}

/** Reverses a payment: marks it refunded and reduces `amountPaid`. */
export const refundPayment = async (paymentId: string, actorRole: Role, note?: string): Promise<void> => {
  if (!ROLE_PERMISSIONS[actorRole]?.canManageUsers) {
    throw new Error('Only an administrator can refund payments.')
  }

  await runTransaction(getDb(), async (tx) => {
    const payRef = paymentDoc(paymentId)
    const paySnap = await tx.get(payRef)
    if (!paySnap.exists()) throw new Error('That payment no longer exists.')
    const payment = paySnap.data() as PaymentDoc
    if (payment.paymentStatus === 'refunded') throw new Error('This payment has already been refunded.')
    if (payment.paymentStatus !== 'paid') throw new Error('Only a completed payment can be refunded.')

    const invRef = invoiceDoc(payment.invoiceId)
    const invSnap = await tx.get(invRef)
    if (!invSnap.exists()) throw new Error('The invoice for this payment no longer exists.')
    const invoice = invSnap.data() as InvoiceDoc

    const newPaid = Math.max(0, invoice.amountPaid - payment.amount)
    const totals = computeInvoice(
      { laborCost: invoice.laborCost, partsCost: invoice.partsCost, discount: invoice.discount, taxRate: invoice.taxRate },
      newPaid,
    )

    tx.update(payRef, { paymentStatus: 'refunded', note: note?.trim() || payment.note })
    tx.update(invRef, { amountPaid: newPaid, invoiceStatus: totals.invoiceStatus, updatedAt: serverTimestamp() })
  })
}

export const fetchPayment = async (paymentId: string): Promise<PaymentDoc | null> => {
  const snap = await getDoc(paymentDoc(paymentId))
  return snap.exists() ? (snap.data() as PaymentDoc) : null
}

export const listPayments = async (opts: { invoiceId?: string; customerId?: string; status?: PaymentStatus; n?: number } = {}): Promise<
  (PaymentDoc & { id: string })[]
> => {
  const constraints = []
  if (opts.invoiceId) constraints.push(where('invoiceId', '==', opts.invoiceId))
  else if (opts.customerId) constraints.push(where('customerId', '==', opts.customerId))
  if (opts.status) constraints.push(where('paymentStatus', '==', opts.status))
  const snap = await getDocs(query(paymentsCol(), ...constraints, orderBy('createdAt', 'desc'), limit(opts.n ?? 200)))
  return snap.docs.map((d) => ({ ...(d.data() as PaymentDoc), id: d.id }))
}

export const subscribePayments = (
  opts: { invoiceId?: string; customerId?: string } = {},
  onChange: (items: (PaymentDoc & { id: string })[]) => void,
  onError: (message: string) => void,
): (() => void) => {
  const constraints = []
  if (opts.invoiceId) constraints.push(where('invoiceId', '==', opts.invoiceId))
  else if (opts.customerId) constraints.push(where('customerId', '==', opts.customerId))
  return onSnapshot(
    query(paymentsCol(), ...constraints, orderBy('createdAt', 'desc'), limit(200)),
    (snap) => onChange(snap.docs.map((d) => ({ ...(d.data() as PaymentDoc), id: d.id }))),
    (err) => onError(err.message),
  )
}

/** What is still owed on an invoice, read fresh. */
export const fetchBalanceDue = async (invoiceId: string): Promise<Cents> => {
  const snap = await getDoc(invoiceDoc(invoiceId))
  if (!snap.exists()) throw new Error('That invoice no longer exists.')
  const invoice = snap.data() as InvoiceDoc
  return Math.max(0, invoice.totalAmount - invoice.amountPaid)
}

export const deletePayment = async (paymentId: string, actorRole: Role): Promise<void> => {
  if (!ROLE_PERMISSIONS[actorRole]?.canManageUsers) {
    throw new Error('Only an administrator can delete payment records.')
  }
  const snap = await getDoc(paymentDoc(paymentId))
  if (!snap.exists()) return
  const payment = snap.data() as PaymentDoc
  if (payment.paymentStatus === 'paid') {
    throw new Error('Refund this payment instead of deleting it, so the audit trail stays intact.')
  }
  await deleteDoc(paymentDoc(paymentId))
}

/** Convenience for the POS: writes a draft invoice-less cash receipt. */
export const recordStandalonePayment = async (
  input: Omit<RecordPaymentInput, 'invoiceId'> & { requestId: string; customerId: string },
  actorRole: Role,
): Promise<string> => {
  if (!ROLE_PERMISSIONS[actorRole]?.isStaff) throw new Error('Only staff can record payments.')
  const amount = parseMoneyToCents(input.amount)
  if (amount === null || amount <= 0) throw new Error('Enter an amount greater than zero.')

  const ref = doc(paymentsCol())
  await setDoc(ref, {
    paymentId: ref.id,
    invoiceId: '',
    requestId: input.requestId,
    customerId: input.customerId,
    amount,
    paymentMethod: input.paymentMethod,
    paymentStatus: input.paymentStatus ?? 'paid',
    transactionId: input.transactionId?.trim() || `CASH-${ref.id.slice(-8).toUpperCase()}`,
    note: (input.note ?? '').trim(),
    paidAt: serverTimestamp(),
    createdAt: serverTimestamp(),
  })
  return ref.id
}

/** Kept for callers that want to correct a gateway reference later. */
export const updatePaymentReference = async (paymentId: string, transactionId: string, actorRole: Role): Promise<void> => {
  if (!ROLE_PERMISSIONS[actorRole]?.isStaff) throw new Error('Only staff can edit payments.')
  await updateDoc(paymentDoc(paymentId), { transactionId: transactionId.trim() })
}
