import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { createDb } from './dexie'
import type { Db } from './repository'

/**
 * Parts consumed by a repair (§11, §28.1, §28.3).
 *
 * The rules that matter: using a part takes it off the shelf and writes the
 * movement that explains why, a unit reserved for another repair cannot be
 * consumed here, and returning a part puts stock back without erasing the
 * record that it was fitted.
 */
let db: Db
let uid = 0

beforeEach(async () => {
  db = createDb(`fixflow-parts-test-${++uid}`)
  await db.ready()
})

async function repairInWork() {
  const customer = await db.customers.create({
    fullName: 'Parts Buyer', phone: `+947700${String(3300 + ++uid)}`, email: '', address: '', notes: '', status: 'active',
  })
  const device = await db.devices.create({
    customerId: customer.id, category: 'laptop', brand: 'Lenovo', model: 'ThinkPad',
    serialNumber: 'LN-TP-1', purchaseDate: '', notes: '',
  })
  const job = await db.repairs.create({
    branchId: 'br_colombo', customerId: customer.id, deviceId: device.id,
    customerName: customer.fullName, phone: customer.phone, email: '',
    deviceSummary: 'Lenovo ThinkPad', serialNumber: 'LN-TP-1',
    reportedIssue: 'Dead charging port.',
    deviceCondition: 'Good', accessoriesReceived: [], intakePhotoUrls: [],
    completionPhotoUrls: [], priority: 'normal', status: 'received', technicianId: '',
    receivedAt: new Date().toISOString(), expectedCompletion: '', internalNotes: '',
    customerVisibleNotes: [], labourCost: 0,
  })
  await db.repairs.changeStatus(job.id, 'diagnosing', 'usr_tech_1')
  return job
}

/** A stocked part in the branch under test. */
async function part(stock = 10, over: Record<string, unknown> = {}) {
  return db.products.create({
    sku: `SKU-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
    name: 'DC charging jack',
    category: 'Spare Parts',
    costCents: 900_00,
    priceCents: 1800_00,
    taxRate: 0,
    stockOnHand: stock,
    minStock: 2,
    barcode: '',
    isService: false,
    branchId: 'br_colombo',
    ...over,
  } as never)
}

describe('repairs.addPart', () => {
  it('takes the part off the shelf', async () => {
    const job = await repairInWork()
    const product = await part(10)

    const usage = await db.repairs.addPart({
      repairId: job.id, productId: product.id, quantity: 2, actorId: 'usr_tech_1',
    })

    expect(usage.quantity).toBe(2)
    expect(usage.productName).toBe('DC charging jack')

    const after = await db.products.get(product.id)
    expect(after!.stockOnHand).toBe(8)
  })

  it('writes a repair_use movement naming the job', async () => {
    const job = await repairInWork()
    const product = await part(10)
    await db.repairs.addPart({ repairId: job.id, productId: product.id, quantity: 3, actorId: 'usr_tech_1' })

    const ledger = await db.movements.forProduct(product.id)
    const use = ledger.find((m) => m.type === 'repair_use')
    expect(use).toBeDefined()
    expect(use!.qty).toBe(-3)
    expect(use!.before).toBe(10)
    expect(use!.after).toBe(7)
    expect(use!.refId).toBe(job.id)
    expect(use!.reason).toContain(job.jobNumber)
  })

  it('records the unit cost at the time it was used', async () => {
    const job = await repairInWork()
    const product = await part(10)
    const usage = await db.repairs.addPart({ repairId: job.id, productId: product.id, quantity: 1, actorId: 'usr_tech_1' })
    expect(usage.unitCost).toBe(900_00)
  })

  it('refuses to consume more than is available', async () => {
    const job = await repairInWork()
    const product = await part(4)
    await expect(
      db.repairs.addPart({ repairId: job.id, productId: product.id, quantity: 5, actorId: 'usr_tech_1' }),
    ).rejects.toThrow(/Only 4 of "DC charging jack" available/)
  })

  it('§28.3 — counts reserved stock as unavailable', async () => {
    const job = await repairInWork()
    const product = await part(10)
    // 7 of the 10 are held for this same repair.
    await db.products.reserve(product.id, 7, job.id)

    await expect(
      db.repairs.addPart({ repairId: job.id, productId: product.id, quantity: 5, actorId: 'usr_tech_1' }),
    ).rejects.toThrow(/Only 3 .* available — 7 of 10 on hand is reserved/)

    // Nothing was written by the failed attempt.
    expect((await db.products.get(product.id))!.stockOnHand).toBe(10)
    expect(await db.repairs.parts(job.id)).toHaveLength(0)
  })

  it('releases the matching reservation as it consumes it', async () => {
    const job = await repairInWork()
    const product = await part(10)
    await db.products.reserve(product.id, 4, job.id)

    await db.repairs.addPart({ repairId: job.id, productId: product.id, quantity: 4, actorId: 'usr_tech_1' })

    const after = await db.products.get(product.id)
    // The 4 consumed were the 4 that were held, so the hold is gone and the
    // remaining 6 are all free.
    expect(after!.stockOnHand).toBe(6)
    expect(after!.reserved).toBe(0)
    expect(await db.products.reservations(product.id)).toHaveLength(0)
  })

  it('partially consumes a larger reservation', async () => {
    const job = await repairInWork()
    const product = await part(10)
    await db.products.reserve(product.id, 6, job.id)

    await db.repairs.addPart({ repairId: job.id, productId: product.id, quantity: 2, actorId: 'usr_tech_1' })

    const after = await db.products.get(product.id)
    expect(after!.stockOnHand).toBe(8)
    expect(after!.reserved).toBe(4)
  })

  it('refuses a zero or fractional quantity', async () => {
    const job = await repairInWork()
    const product = await part(10)
    await expect(
      db.repairs.addPart({ repairId: job.id, productId: product.id, quantity: 0, actorId: 'usr_tech_1' }),
    ).rejects.toThrow(/greater than zero/)
    await expect(
      db.repairs.addPart({ repairId: job.id, productId: product.id, quantity: 1.5, actorId: 'usr_tech_1' }),
    ).rejects.toThrow(/greater than zero/)
  })

  it('refuses a service line as a part', async () => {
    const job = await repairInWork()
    const service = await part(10, { isService: true, name: 'Bench fee' })
    await expect(
      db.repairs.addPart({ repairId: job.id, productId: service.id, quantity: 1, actorId: 'usr_tech_1' }),
    ).rejects.toThrow(/is a service, not a part/)
  })

  it('rejects an unknown repair or product', async () => {
    const job = await repairInWork()
    const product = await part(10)
    await expect(
      db.repairs.addPart({ repairId: 'fxr_nope', productId: product.id, quantity: 1, actorId: 'usr_tech_1' }),
    ).rejects.toThrow(/No repair fxr_nope/)
    await expect(
      db.repairs.addPart({ repairId: job.id, productId: 'prd_nope', quantity: 1, actorId: 'usr_tech_1' }),
    ).rejects.toThrow(/No product prd_nope/)
  })
})

describe('repairs.parts', () => {
  it('lists what a repair consumed, oldest first', async () => {
    const job = await repairInWork()
    const a = await part(10, { name: 'Part A' })
    const b = await part(10, { name: 'Part B' })
    await db.repairs.addPart({ repairId: job.id, productId: a.id, quantity: 1, actorId: 'usr_tech_1' })
    await db.repairs.addPart({ repairId: job.id, productId: b.id, quantity: 2, actorId: 'usr_tech_1' })

    const parts = await db.repairs.parts(job.id)
    expect(parts).toHaveLength(2)
    expect(parts[0].productName).toBe('Part A')
    expect(parts[1].productName).toBe('Part B')
  })

  it('does not mix in parts from another repair', async () => {
    const job = await repairInWork()
    const other = await repairInWork()
    const product = await part(10)
    await db.repairs.addPart({ repairId: job.id, productId: product.id, quantity: 1, actorId: 'usr_tech_1' })
    expect(await db.repairs.parts(other.id)).toHaveLength(0)
  })
})

describe('repairs.removePart', () => {
  it('puts the stock back', async () => {
    const job = await repairInWork()
    const product = await part(10)
    const usage = await db.repairs.addPart({ repairId: job.id, productId: product.id, quantity: 3, actorId: 'usr_tech_1' })

    await db.repairs.removePart(usage.id, 'usr_manager')

    expect((await db.products.get(product.id))!.stockOnHand).toBe(10)
  })

  it('writes a movement explaining the return', async () => {
    const job = await repairInWork()
    const product = await part(10)
    const usage = await db.repairs.addPart({ repairId: job.id, productId: product.id, quantity: 2, actorId: 'usr_tech_1' })
    await db.repairs.removePart(usage.id, 'usr_manager')

    const ledger = await db.movements.forProduct(product.id)
    const returned = ledger.find((m) => m.qty > 0 && m.type === 'adjustment')
    expect(returned).toBeDefined()
    expect(returned!.reason).toContain(job.jobNumber)
  })

  it('keeps the usage row so the repair still shows the part was fitted', async () => {
    const job = await repairInWork()
    const product = await part(10)
    const usage = await db.repairs.addPart({ repairId: job.id, productId: product.id, quantity: 1, actorId: 'usr_tech_1' })
    await db.repairs.removePart(usage.id, 'usr_manager')

    const parts = await db.repairs.parts(job.id)
    expect(parts).toHaveLength(1)
    expect(parts[0].quantity).toBe(0)
  })

  it('refuses to return the same part twice', async () => {
    const job = await repairInWork()
    const product = await part(10)
    const usage = await db.repairs.addPart({ repairId: job.id, productId: product.id, quantity: 1, actorId: 'usr_tech_1' })
    await db.repairs.removePart(usage.id, 'usr_manager')
    await expect(db.repairs.removePart(usage.id, 'usr_manager')).rejects.toThrow(/already been returned/)

    // Stock was not incremented a second time.
    expect((await db.products.get(product.id))!.stockOnHand).toBe(10)
  })

  it('rejects an unknown usage row', async () => {
    await expect(db.repairs.removePart('rpu_nope', 'usr_manager')).rejects.toThrow(/No part usage/)
  })
})
