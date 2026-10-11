import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { createDb } from './dexie'
import type { Db } from './repository'

/**
 * The audit trail (§10, §23).
 *
 * The point of a log is that it says who did what when, and that nobody can
 * quietly make it say otherwise. These tests check both halves: that the
 * actions which move money, stock or cover leave a row naming the actor, and
 * that the row cannot be edited away afterwards.
 */
let db: Db
let uid = 0

beforeEach(async () => {
  db = createDb(`fixflow-audit-test-${++uid}`)
  await db.ready()
})

async function customer() {
  return db.customers.create({
    fullName: 'Audit Subject', phone: `+947700${String(5500 + ++uid)}`, email: '', address: '', notes: '', status: 'active',
  })
}

async function stocked(qty = 10) {
  return db.products.create({
    sku: `SKU-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
    name: 'USB-C cable', category: 'Cables',
    costCents: 400_00, priceCents: 900_00, taxRate: 0,
    stockOnHand: qty, minStock: 2, barcode: '', isService: false,
    branchId: 'br_colombo',
  } as never)
}

describe('audit.record', () => {
  it('stores who did what against which record', async () => {
    await db.audit.record({
      actorId: 'usr_manager',
      action: 'product.price_changed',
      targetType: 'product',
      targetId: 'prd_1',
      detail: 'Rs. 900.00 → Rs. 950.00',
      branchId: 'br_colombo',
    })

    const rows = await db.audit.list()
    expect(rows).toHaveLength(1)
    expect(rows[0].action).toBe('product.price_changed')
    expect(rows[0].targetId).toBe('prd_1')
    expect(rows[0].detail).toContain('Rs. 900.00')
  })

  it('names the actor by name and role, not just by id', async () => {
    await db.audit.record({ actorId: 'usr_manager', action: 'test', targetType: 'test', targetId: 'x' })
    const rows = await db.audit.list()
    // Denormalised on purpose: if the user is renamed or deleted later, the
    // trail must still say who acted at the time.
    expect(rows[0].actorName).toContain('manager')
    expect(rows[0].actorId).toBe('usr_manager')
  })

  it('still records an entry when the actor is not a known user', async () => {
    await db.audit.record({ actorId: 'usr_unknown', action: 'test', targetType: 'test', targetId: 'x' })
    const rows = await db.audit.list()
    expect(rows[0].actorName).toBe('usr_unknown')
  })

  it('refuses an entry with no actor', async () => {
    await expect(db.audit.record({ actorId: '', action: 'test', targetType: 'test', targetId: 'x' }))
      .rejects.toThrow(/needs to name who did it/i)
  })

  it('refuses an entry with no action', async () => {
    await expect(db.audit.record({ actorId: 'usr_manager', action: '  ', targetType: 'test', targetId: 'x' }))
      .rejects.toThrow(/needs an action/i)
  })

  it('returns newest first', async () => {
    await db.audit.record({ actorId: 'usr_admin', action: 'first', targetType: 't', targetId: '1' })
    await new Promise((r) => setTimeout(r, 5))
    await db.audit.record({ actorId: 'usr_admin', action: 'second', targetType: 't', targetId: '2' })

    const rows = await db.audit.list()
    expect(rows[0].action).toBe('second')
    expect(rows[1].action).toBe('first')
  })
})

describe('audit.list filters', () => {
  beforeEach(async () => {
    await db.audit.record({ actorId: 'usr_admin', action: 'a', targetType: 'product', targetId: '1', branchId: 'br_colombo' })
    await db.audit.record({ actorId: 'usr_manager', action: 'b', targetType: 'invoice', targetId: '2', branchId: 'br_kandy' })
    await db.audit.record({ actorId: 'usr_admin', action: 'a', targetType: 'invoice', targetId: '3', branchId: 'br_colombo' })
  })

  it('filters by branch', async () => {
    expect(await db.audit.list({ branchId: 'br_kandy' })).toHaveLength(1)
  })

  it('filters by actor', async () => {
    expect(await db.audit.list({ actorId: 'usr_manager' })).toHaveLength(1)
  })

  it('filters by action', async () => {
    expect(await db.audit.list({ action: 'a' })).toHaveLength(2)
  })

  it('filters by target type', async () => {
    expect(await db.audit.list({ targetType: 'invoice' })).toHaveLength(2)
  })

  it('combines filters', async () => {
    expect(await db.audit.list({ branchId: 'br_colombo', actorId: 'usr_admin', action: 'a' })).toHaveLength(2)
    expect(await db.audit.list({ branchId: 'br_colombo', actorId: 'usr_manager' })).toHaveLength(0)
  })
})

describe('the trail records the actions that matter', () => {
  it('records a refund against the sale', async () => {
    const buyer = await customer()
    const cable = await stocked(5)
    const sale = await db.sales.checkout({
      branchId: 'br_colombo',
      customerId: buyer.id,
      lines: [{ productId: cable.id, quantity: 2 }],
      paymentMethod: 'cash',
      cashierId: 'usr_cashier',
    })

    await db.sales.refund(sale.id, {
      amount: 900_00, reason: 'Customer changed their mind.', approvedBy: 'usr_manager', restoreStock: true,
    })

    const rows = await db.audit.list({ action: 'sale.refunded' })
    expect(rows).toHaveLength(1)
    expect(rows[0].targetId).toBe(sale.id)
    // §23 — the trail names the person who approved it, not just that it happened.
    expect(rows[0].actorId).toBe('usr_manager')
    expect(rows[0].detail).toContain('Rs. 900.00')
    expect(rows[0].detail).toContain('stock restored')
  })

  it('records an invoice being voided, with the reason', async () => {
    const buyer = await customer()
    // An invoice must hang off a repair — invoices.create refuses one without.
    const device = await db.devices.create({
      customerId: buyer.id, category: 'mobile', brand: 'Samsung', model: 'A54',
      serialNumber: 'SS-A54-2', purchaseDate: '', notes: '',
    })
    const job = await db.repairs.create({
      branchId: 'br_colombo', customerId: buyer.id, deviceId: device.id,
      customerName: buyer.fullName, phone: buyer.phone, email: '',
      deviceSummary: 'Samsung A54', serialNumber: 'SS-A54-2',
      reportedIssue: 'Cracked screen.', deviceCondition: 'Fair',
      accessoriesReceived: [], intakePhotoUrls: [], completionPhotoUrls: [],
      priority: 'normal', status: 'received', technicianId: '',
      receivedAt: new Date().toISOString(), expectedCompletion: '',
      internalNotes: '', customerVisibleNotes: [], labourCost: 0,
    })
    const invoice = await db.invoices.create({
      repairId: job.id,
      items: [{ productId: '', description: 'Screen replacement', quantity: 1, unitPrice: 1500_00 }],
      labourCost: 0, discount: 0, taxRate: 0,
      actorId: 'usr_manager',
    })

    await db.invoices.cancel(invoice.id, 'usr_manager', 'Raised against the wrong job.')

    const rows = await db.audit.list({ action: 'invoice.voided' })
    expect(rows).toHaveLength(1)
    expect(rows[0].actorId).toBe('usr_manager')
    expect(rows[0].detail).toContain(invoice.invoiceNumber)
    expect(rows[0].detail).toContain('wrong job')
  })

  it('records an expense reversal', async () => {
    const expense = await db.expenses.create({
      branchId: 'br_colombo', category: 'rent', amount: 40000_00,
      description: 'Shop rent, March', method: 'bank_transfer',
      spentAt: new Date().toISOString(), recordedBy: 'usr_manager',
    })

    await db.expenses.reverse(expense.id, 'usr_admin', 'Wrong month selected.')

    const rows = await db.audit.list({ action: 'expense.reversed' })
    expect(rows).toHaveLength(1)
    expect(rows[0].actorId).toBe('usr_admin')
    expect(rows[0].detail).toContain('Wrong month')
  })

  it('records a part being consumed on a repair', async () => {
    const buyer = await customer()
    const device = await db.devices.create({
      customerId: buyer.id, category: 'laptop', brand: 'Lenovo', model: 'ThinkPad',
      serialNumber: 'LN-TP-7', purchaseDate: '', notes: '',
    })
    const job = await db.repairs.create({
      branchId: 'br_colombo', customerId: buyer.id, deviceId: device.id,
      customerName: buyer.fullName, phone: buyer.phone, email: '',
      deviceSummary: 'Lenovo ThinkPad', serialNumber: 'LN-TP-7',
      reportedIssue: "Won't charge.", deviceCondition: 'Good',
      accessoriesReceived: [], intakePhotoUrls: [], completionPhotoUrls: [],
      priority: 'normal', status: 'received', technicianId: '',
      receivedAt: new Date().toISOString(), expectedCompletion: '',
      internalNotes: '', customerVisibleNotes: [], labourCost: 0,
    })
    await db.repairs.changeStatus(job.id, 'diagnosing', 'usr_tech_1')
    const cable = await stocked(5)

    await db.repairs.addPart({ repairId: job.id, productId: cable.id, quantity: 1, actorId: 'usr_tech_1' })

    const rows = await db.audit.list({ action: 'repair.part_added' })
    expect(rows).toHaveLength(1)
    expect(rows[0].actorId).toBe('usr_tech_1')
    expect(rows[0].detail).toContain(job.jobNumber)
    expect(rows[0].detail).toContain(cable.name)
  })

  it('records cover being withdrawn, with the reason', async () => {
    const policy = await db.warranty.addPolicy({
      name: '12-month product cover', durationMonths: 12, terms: '', exclusions: '', appliesTo: 'product',
    })
    const buyer = await customer()
    const issued = await db.warranty.issue({ policyId: policy.id, customerId: buyer.id })

    await db.warranty.void(issued.id, 'Device returned for a refund.', 'usr_manager')

    const rows = await db.audit.list({ action: 'warranty.voided' })
    expect(rows).toHaveLength(1)
    expect(rows[0].actorId).toBe('usr_manager')
    expect(rows[0].detail).toContain(issued.warrantyNumber)
  })

  it('records an estimate being sent', async () => {
    const buyer = await customer()
    const device = await db.devices.create({
      customerId: buyer.id, category: 'laptop', brand: 'HP', model: 'Pavilion',
      serialNumber: 'HP-PV-3', purchaseDate: '', notes: '',
    })
    const job = await db.repairs.create({
      branchId: 'br_colombo', customerId: buyer.id, deviceId: device.id,
      customerName: buyer.fullName, phone: buyer.phone, email: '',
      deviceSummary: 'HP Pavilion', serialNumber: 'HP-PV-3',
      reportedIssue: 'Hinge broken.', deviceCondition: 'Fair',
      accessoriesReceived: [], intakePhotoUrls: [], completionPhotoUrls: [],
      priority: 'normal', status: 'received', technicianId: '',
      receivedAt: new Date().toISOString(), expectedCompletion: '',
      internalNotes: '', customerVisibleNotes: [], labourCost: 0,
    })
    const estimate = await db.estimates.create({
      repairId: job.id,
      items: [{ productId: '', description: 'Hinge assembly', quantity: 1, unitPrice: 4500_00 }],
      labourCost: 1500_00, discount: 0, taxRate: 0, notes: '',
      actorId: 'usr_manager',
    })

    await db.estimates.send(estimate.id, 'usr_manager')

    const rows = await db.audit.list({ action: 'estimate.sent' })
    expect(rows).toHaveLength(1)
    expect(rows[0].actorId).toBe('usr_manager')
    expect(rows[0].detail).toContain(estimate.estimateNumber)
  })
})

describe('the trail has no way out', () => {
  it('exposes no method to edit or delete an entry', async () => {
    // §23 — a log you can rewrite is not evidence. The repository surface is
    // the whole story: there is no update and no remove.
    const keys = Object.keys(db.audit)
    expect(keys.sort()).toEqual(['list', 'record'])
  })

  it('keeps an entry when the record it describes is gone', async () => {
    const expense = await db.expenses.create({
      branchId: 'br_colombo', category: 'tools', amount: 5000_00,
      description: 'Screwdriver set', method: 'cash',
      spentAt: new Date().toISOString(), recordedBy: 'usr_manager',
    })
    await db.expenses.reverse(expense.id, 'usr_manager', 'Duplicate entry.')

    const rows = await db.audit.list({ action: 'expense.reversed' })
    expect(rows).toHaveLength(1)
    // The row still names the expense even though the expense is netted out.
    expect(rows[0].targetId).toBe(expense.id)
  })
})
