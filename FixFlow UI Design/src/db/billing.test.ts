import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { createDb } from './dexie'
import type { Db } from './repository'

/**
 * Invoices and the payments recorded against them (§10).
 *
 * The rules that matter: a payment must reference an invoice, the balance due is
 * derived rather than stored, prior payments are never overwritten, an
 * overpayment is rejected, and reversing a payment preserves the original row.
 */
let db: Db
let uid = 0

beforeEach(async () => {
  db = createDb(`fixflow-bill-test-${++uid}`)
  await db.ready()
})

/** A repair to bill, parked where a charge would normally be raised. */
let billSeq = 0

async function repairToBill() {
  // Unique per call: customers are de-duplicated on phone, and several tests
  // need two of them.
  const phone = `+9477000${String(2200 + ++billSeq)}`
  const customer = await db.customers.create({
    fullName: `Test Buyer ${billSeq}`, phone, email: '', address: '', notes: '', status: 'active',
  })
  const device = await db.devices.create({
    customerId: customer.id, category: 'laptop', brand: 'Dell', model: 'Latitude',
    serialNumber: 'DL-LAT-1', purchaseDate: '', notes: '',
  })
  const job = await db.repairs.create({
    branchId: 'br_colombo', customerId: customer.id, deviceId: device.id,
    customerName: customer.fullName, phone: customer.phone, email: '',
    deviceSummary: 'Dell Latitude', serialNumber: 'DL-LAT-1',
    reportedIssue: 'Will not charge.',
    deviceCondition: 'Good', accessoriesReceived: [], intakePhotoUrls: [],
    completionPhotoUrls: [], priority: 'normal', status: 'received', technicianId: '',
    receivedAt: new Date().toISOString(), expectedCompletion: '', internalNotes: '',
    customerVisibleNotes: [], labourCost: 0,
  })
  await db.repairs.changeStatus(job.id, 'diagnosing', 'usr_tech_1')
  return db.repairs.changeStatus(job.id, 'waiting_for_approval', 'usr_tech_1')
}

/**
 * Ordering is by `createdAt`, which has millisecond resolution. Two invoices
 * raised back to back can land in the same millisecond, and then "newest first"
 * has nothing to sort on. Yielding a real timer makes the assertion depend on
 * the code rather than on how fast the machine happens to be. A real timer, not
 * fake timers — faking the clock breaks the promise scheduling Dexie and
 * IndexedDB rely on.
 */
const tick = () => new Promise((resolve) => setTimeout(resolve, 5))

/** Rs. 15,000.00 total: 12,000 panel + 3,000 labour, tax off. */
const bill = (repairId: string, over: Record<string, unknown> = {}) =>
  db.invoices.create({
    repairId,
    items: [{ description: 'DC jack', quantity: 1, unitPrice: 12000_00 }],
    labourCost: 3000_00,
    taxEnabled: false,
    actorId: 'usr_cashier',
    ...over,
  } as never)

/** Issues an invoice so it can take payments, and returns it. */
async function issuedBill() {
  const repair = await repairToBill()
  const draft = await bill(repair.id)
  return db.invoices.issue(draft.id, 'usr_cashier')
}

describe('invoices.create', () => {
  it('starts as a draft with a branch invoice number', async () => {
    const repair = await repairToBill()
    const invoice = await bill(repair.id)
    expect(invoice.status).toBe('draft')
    expect(invoice.invoiceNumber).toMatch(/^INV-CMB-\d{4}-\d{4}$/)
  })

  it('takes its customer and branch from the repair', async () => {
    const repair = await repairToBill()
    const invoice = await bill(repair.id)
    expect(invoice.customerId).toBe(repair.customerId)
    expect(invoice.branchId).toBe(repair.branchId)
  })

  it('totals the lines plus labour with nothing outstanding yet', async () => {
    const repair = await repairToBill()
    const invoice = await bill(repair.id)
    expect(invoice.total).toBe(15000_00)
    expect(invoice.balanceDue).toBe(15000_00)
    expect(invoice.paidTotal).toBe(0)
  })

  it('rejects an invoice with no lines and no labour', async () => {
    const repair = await repairToBill()
    await expect(bill(repair.id, { items: [], labourCost: 0 })).rejects.toThrow(/at least one line/)
  })

  it('rejects a zero or fractional quantity', async () => {
    const repair = await repairToBill()
    await expect(
      bill(repair.id, { items: [{ description: 'DC jack', quantity: 0, unitPrice: 100_00 }] }),
    ).rejects.toThrow(/positive whole-number quantity/)
    await expect(
      bill(repair.id, { items: [{ description: 'DC jack', quantity: 1.5, unitPrice: 100_00 }] }),
    ).rejects.toThrow(/positive whole-number quantity/)
  })

  it('rejects a blank description', async () => {
    const repair = await repairToBill()
    await expect(
      bill(repair.id, { items: [{ description: '   ', quantity: 1, unitPrice: 100_00 }] }),
    ).rejects.toThrow(/needs a description/)
  })

  it('rejects an unknown repair', async () => {
    await expect(bill('rep_nope')).rejects.toThrow(/No repair rep_nope/)
  })

  it('numbers sequentially within the branch', async () => {
    const repair = await repairToBill()
    const first = await bill(repair.id)
    const second = await bill(repair.id)
    expect(Number(first.invoiceNumber.slice(-4))).toBe(1)
    expect(Number(second.invoiceNumber.slice(-4))).toBe(2)
  })
})

describe('invoices.issue', () => {
  it('moves a draft to issued', async () => {
    const repair = await repairToBill()
    const draft = await bill(repair.id)
    const issued = await db.invoices.issue(draft.id, 'usr_cashier')
    expect(issued.status).toBe('issued')
  })

  it('refuses to issue twice', async () => {
    const issued = await issuedBill()
    await expect(db.invoices.issue(issued.id, 'usr_cashier')).rejects.toThrow(/cannot be issued/)
  })
})

describe('payments.record', () => {
  it('records against an invoice and reduces the balance due', async () => {
    const issued = await issuedBill()
    const payment = await db.payments.record({
      invoiceId: issued.id, amount: 5000_00, method: 'cash', receivedBy: 'usr_cashier',
    })
    expect(payment.status).toBe('paid')

    const after = await db.invoices.get(issued.id)
    expect(after?.paidTotal).toBe(5000_00)
    expect(after?.balanceDue).toBe(10000_00)
    expect(after?.status).toBe('partially_paid')
  })

  it('marks the invoice paid once the balance reaches zero', async () => {
    const issued = await issuedBill()
    await db.payments.record({
      invoiceId: issued.id, amount: 15000_00, method: 'cash', receivedBy: 'usr_cashier',
    })
    const after = await db.invoices.get(issued.id)
    expect(after?.balanceDue).toBe(0)
    expect(after?.status).toBe('paid')
  })

  it('§28.11 — rejects a payment against an unknown invoice', async () => {
    await expect(
      db.payments.record({ invoiceId: 'inv_nope', amount: 100_00, method: 'cash', receivedBy: 'usr_cashier' }),
    ).rejects.toThrow(/No invoice inv_nope/)
  })

  it('rejects a payment against a draft invoice', async () => {
    const repair = await repairToBill()
    const draft = await bill(repair.id)
    await expect(
      db.payments.record({ invoiceId: draft.id, amount: 100_00, method: 'cash', receivedBy: 'usr_cashier' }),
    ).rejects.toThrow(/Issue the invoice before recording a payment/)
  })

  it('rejects an overpayment', async () => {
    const issued = await issuedBill()
    await expect(
      db.payments.record({ invoiceId: issued.id, amount: 15000_01, method: 'cash', receivedBy: 'usr_cashier' }),
    ).rejects.toThrow(/only Rs\. 15000\.00 is still due/)
  })

  it('rejects a second payment once the invoice is settled', async () => {
    const issued = await issuedBill()
    await db.payments.record({
      invoiceId: issued.id, amount: 15000_00, method: 'cash', receivedBy: 'usr_cashier',
    })
    await expect(
      db.payments.record({ invoiceId: issued.id, amount: 100_00, method: 'cash', receivedBy: 'usr_cashier' }),
    ).rejects.toThrow(/only Rs\. 0\.00 is still due/)
  })

  it('rejects a zero or negative amount', async () => {
    const issued = await issuedBill()
    await expect(
      db.payments.record({ invoiceId: issued.id, amount: 0, method: 'cash', receivedBy: 'usr_cashier' }),
    ).rejects.toThrow(/greater than zero/)
    await expect(
      db.payments.record({ invoiceId: issued.id, amount: -500, method: 'cash', receivedBy: 'usr_cashier' }),
    ).rejects.toThrow(/greater than zero/)
  })

  it('§28.15 — keeps every prior payment intact', async () => {
    const issued = await issuedBill()
    const first = await db.payments.record({
      invoiceId: issued.id, amount: 5000_00, method: 'cash', receivedBy: 'usr_cashier',
    })
    await db.payments.record({
      invoiceId: issued.id, amount: 4000_00, method: 'card', receivedBy: 'usr_cashier',
    })

    const rows = await db.payments.forInvoice(issued.id)
    expect(rows).toHaveLength(2)
    // The first payment was not merged into or overwritten by the second.
    expect(rows.find((pay) => pay.id === first.id)).toMatchObject({ amount: 5000_00, method: 'cash' })
  })

  it('rejects a payment against a voided invoice', async () => {
    const repair = await repairToBill()
    const draft = await bill(repair.id)
    const issued = await db.invoices.issue(draft.id, 'usr_cashier')
    await db.invoices.cancel(issued.id, 'usr_manager', 'Raised in error.')
    await expect(
      db.payments.record({ invoiceId: issued.id, amount: 100_00, method: 'cash', receivedBy: 'usr_cashier' }),
    ).rejects.toThrow(/voided/)
  })
})

describe('payments.refund', () => {
  it('§28.18 — reverses by appending, leaving the original on the record', async () => {
    const issued = await issuedBill()
    const payment = await db.payments.record({
      invoiceId: issued.id, amount: 5000_00, method: 'cash', receivedBy: 'usr_cashier',
    })

    const reversal = await db.payments.refund(issued.id, payment.id, 'usr_manager')
    expect(reversal.id).not.toBe(payment.id)
    expect(reversal.reversesPaymentId).toBe(payment.id)
    expect(reversal.status).toBe('refunded')

    const rows = await db.payments.forInvoice(issued.id)
    expect(rows).toHaveLength(2)
    // The original was not edited — it still reads as paid.
    expect(rows.find((pay) => pay.id === payment.id)?.status).toBe('paid')
  })

  it('puts the balance back up and reopens the invoice', async () => {
    const issued = await issuedBill()
    await db.payments.record({
      invoiceId: issued.id, amount: 15000_00, method: 'cash', receivedBy: 'usr_cashier',
    })
    expect((await db.invoices.get(issued.id))?.status).toBe('paid')

    const [payment] = await db.payments.forInvoice(issued.id)
    await db.payments.refund(issued.id, payment.id, 'usr_manager')

    const after = await db.invoices.get(issued.id)
    expect(after?.balanceDue).toBe(15000_00)
    expect(after?.status).toBe('issued')
  })

  it('refuses to reverse the same payment twice', async () => {
    const issued = await issuedBill()
    const payment = await db.payments.record({
      invoiceId: issued.id, amount: 5000_00, method: 'cash', receivedBy: 'usr_cashier',
    })
    await db.payments.refund(issued.id, payment.id, 'usr_manager')
    await expect(db.payments.refund(issued.id, payment.id, 'usr_manager')).rejects.toThrow(
      /already been reversed/,
    )
  })

  it('refuses to reverse a payment that is not on the invoice', async () => {
    const issued = await issuedBill()
    const payment = await db.payments.record({
      invoiceId: issued.id, amount: 5000_00, method: 'cash', receivedBy: 'usr_cashier',
    })
    const other = await issuedBill()
    await expect(db.payments.refund(other.id, payment.id, 'usr_manager')).rejects.toThrow(
      /not on this invoice/,
    )
  })

  it('refuses to reverse an already-reversed row', async () => {
    const issued = await issuedBill()
    const payment = await db.payments.record({
      invoiceId: issued.id, amount: 5000_00, method: 'cash', receivedBy: 'usr_cashier',
    })
    const reversal = await db.payments.refund(issued.id, payment.id, 'usr_manager')
    await expect(db.payments.refund(issued.id, reversal.id, 'usr_manager')).rejects.toThrow(
      /cannot be reversed/,
    )
  })
})

describe('invoices.cancel', () => {
  it('voids an unpaid invoice without deleting it', async () => {
    const issued = await issuedBill()
    const cancelled = await db.invoices.cancel(issued.id, 'usr_manager', 'Raised in error.')
    expect(cancelled.status).toBe('cancelled')
    // §28.18 — the row survives so the void is auditable.
    expect(await db.invoices.get(issued.id)).toBeDefined()
  })

  it('requires a reason', async () => {
    const issued = await issuedBill()
    await expect(db.invoices.cancel(issued.id, 'usr_manager', '   ')).rejects.toThrow(/Record why/)
  })

  it('refuses to void an invoice with payments recorded', async () => {
    const issued = await issuedBill()
    await db.payments.record({
      invoiceId: issued.id, amount: 5000_00, method: 'cash', receivedBy: 'usr_cashier',
    })
    await expect(db.invoices.cancel(issued.id, 'usr_manager', 'Mistake.')).rejects.toThrow(
      /Reverse the payments first/,
    )
  })

  it('refuses to void twice', async () => {
    const issued = await issuedBill()
    await db.invoices.cancel(issued.id, 'usr_manager', 'Raised in error.')
    await expect(db.invoices.cancel(issued.id, 'usr_manager', 'Again.')).rejects.toThrow(/already voided/)
  })
})

describe('invoices.list', () => {
  it('filters by branch and customer', async () => {
    const repair = await repairToBill()
    await bill(repair.id)

    expect(await db.invoices.list({ branchId: 'br_colombo' })).toHaveLength(1)
    expect(await db.invoices.list({ branchId: 'br_kandy' })).toHaveLength(0)
    expect(await db.invoices.list({ customerId: repair.customerId })).toHaveLength(1)
    expect(await db.invoices.list({ customerId: 'cus_nobody' })).toHaveLength(0)
  })

  it('returns newest first', async () => {
    const repair = await repairToBill()
    const first = await bill(repair.id)
    await tick()
    const second = await bill(repair.id)

    // If this ever fails the assertion below is meaningless: it would be
    // asserting an order the data does not actually establish.
    expect(first.createdAt < second.createdAt).toBe(true)

    const all = await db.invoices.list({ branchId: 'br_colombo' })
    expect(all[0].id).toBe(second.id)
    expect(all[1].id).toBe(first.id)
  })
})
