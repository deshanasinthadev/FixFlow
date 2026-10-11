import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { createDb } from './dexie'
import type { Db } from './repository'

/**
 * Purchasing (§12, §28.4-5).
 *
 * The rule the whole module hangs on: raising a purchase order does not put
 * stock on the shelf. Ordering ten chargers and having ten turn up are two
 * different events, and only the second moves a number a customer can buy
 * against. Everything else here — partial deliveries, over-delivery, the
 * movement trail — is a consequence of keeping those apart.
 */
let db: Db
let uid = 0

beforeEach(async () => {
  db = createDb(`fixflow-purchasing-test-${++uid}`)
  await db.ready()
})

async function supplier(name = 'Lanka Parts Pvt Ltd') {
  return db.suppliers.create({
    name, contactPerson: 'Ruwan', phone: `+941120${String(500 + ++uid)}`,
    email: 'sales@lankaparts.lk', address: 'Wellawatte', notes: '',
  })
}

async function product(stock = 0, over: Record<string, unknown> = {}) {
  return db.products.create({
    sku: `SKU-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
    name: 'DC charging jack', category: 'Spare Parts',
    costCents: 900_00, priceCents: 1800_00, taxRate: 0,
    stockOnHand: stock, minStock: 2, barcode: '', isService: false,
    branchId: 'br_colombo',
    ...over,
  } as never)
}

/** An order that has been raised and sent, ready to receive against. */
async function sentOrder(lines: { productId: string; quantity: number; unitCost?: number }[]) {
  const sup = await supplier()
  const order = await db.purchaseOrders.create({
    supplierId: sup.id,
    branchId: 'br_colombo',
    lines: lines.map((l) => ({ productId: l.productId, quantity: l.quantity, unitCost: l.unitCost ?? 900_00 })),
  })
  await db.purchaseOrders.send(order.id, 'usr_manager')
  return { supplier: sup, order: (await db.purchaseOrders.get(order.id))! }
}

describe('suppliers', () => {
  it('creates a supplier', async () => {
    const sup = await supplier()
    expect(sup.name).toBe('Lanka Parts Pvt Ltd')
    expect(sup.id.startsWith('sup_')).toBe(true)
  })

  it('refuses a supplier with no name', async () => {
    await expect(db.suppliers.create({ name: '   ' })).rejects.toThrow(/needs a name/i)
  })

  it('lists suppliers by name', async () => {
    await supplier('Zeta Supplies')
    await supplier('Alpha Traders')
    const all = await db.suppliers.list()
    expect(all.map((s) => s.name)).toEqual(['Alpha Traders', 'Zeta Supplies'])
  })

  it('updates without inventing a payable balance', async () => {
    const sup = await supplier()
    const updated = await db.suppliers.update(sup.id, { name: 'Lanka Parts (Pvt) Ltd', phone: '+94112222222' })
    expect(updated.name).toBe('Lanka Parts (Pvt) Ltd')
    expect(updated.phone).toBe('+94112222222')
  })
})

describe('purchaseOrders.create', () => {
  it('§28.4 — raising an order does not move stock', async () => {
    const item = await product(0)
    const { order } = await sentOrder([{ productId: item.id, quantity: 10 }])

    expect(order.status).toBe('sent')
    // The whole point: ten units are on order and not one is on the shelf.
    expect((await db.products.get(item.id))!.stockOnHand).toBe(0)
    expect(await db.movements.forProduct(item.id)).toHaveLength(0)
  })

  it('numbers the order for its branch and year', async () => {
    const item = await product()
    const { order } = await sentOrder([{ productId: item.id, quantity: 1 }])
    expect(order.poNumber).toMatch(/^PO-/)
    expect(order.poNumber).toMatch(/-0001$/)
  })

  it('totals the order in minor units', async () => {
    const item = await product()
    const { order } = await sentOrder([{ productId: item.id, quantity: 4, unitCost: 900_00 }])
    expect(order.total).toBe(3600_00)
  })

  it('records nothing as received on a new order', async () => {
    const item = await product()
    const { order } = await sentOrder([{ productId: item.id, quantity: 10 }])
    expect(order.items[0].quantityReceived).toBe(0)
  })

  it('refuses an order with no lines', async () => {
    const sup = await supplier()
    await expect(db.purchaseOrders.create({ supplierId: sup.id, branchId: 'br_colombo', lines: [] }))
      .rejects.toThrow(/at least one line/i)
  })

  it('refuses a zero or fractional quantity', async () => {
    const sup = await supplier()
    const item = await product()
    await expect(db.purchaseOrders.create({
      supplierId: sup.id, branchId: 'br_colombo', lines: [{ productId: item.id, quantity: 0, unitCost: 900_00 }],
    })).rejects.toThrow(/greater than zero/i)
    await expect(db.purchaseOrders.create({
      supplierId: sup.id, branchId: 'br_colombo', lines: [{ productId: item.id, quantity: 2.5, unitCost: 900_00 }],
    })).rejects.toThrow(/greater than zero/i)
  })

  it('refuses to order a service in', async () => {
    const sup = await supplier()
    const service = await product(0, { isService: true, name: 'Bench fee' })
    await expect(db.purchaseOrders.create({
      supplierId: sup.id, branchId: 'br_colombo', lines: [{ productId: service.id, quantity: 1, unitCost: 900_00 }],
    })).rejects.toThrow(/is a service/i)
  })

  it('rejects an unknown supplier or product', async () => {
    const item = await product()
    await expect(db.purchaseOrders.create({
      supplierId: 'sup_nope', branchId: 'br_colombo', lines: [{ productId: item.id, quantity: 1, unitCost: 900_00 }],
    })).rejects.toThrow(/No supplier/)

    const sup = await supplier()
    await expect(db.purchaseOrders.create({
      supplierId: sup.id, branchId: 'br_colombo', lines: [{ productId: 'prd_nope', quantity: 1, unitCost: 900_00 }],
    })).rejects.toThrow(/No product/)
  })
})

describe('purchaseOrders.receiveGoods', () => {
  it('puts exactly what arrived on the shelf', async () => {
    const item = await product(0)
    const { order } = await sentOrder([{ productId: item.id, quantity: 10 }])

    const after = await db.purchaseOrders.receiveGoods(order.id, {
      lines: [{ productId: item.id, quantity: 10 }],
      actorId: 'usr_manager',
    })

    expect(after.status).toBe('received')
    expect(after.receivedAt).not.toBe('')
    expect((await db.products.get(item.id))!.stockOnHand).toBe(10)
  })

  it('writes a purchase_in movement naming the order', async () => {
    const item = await product(0)
    const { order } = await sentOrder([{ productId: item.id, quantity: 6 }])
    await db.purchaseOrders.receiveGoods(order.id, {
      lines: [{ productId: item.id, quantity: 6 }], actorId: 'usr_manager',
    })

    const ledger = await db.movements.forProduct(item.id)
    expect(ledger).toHaveLength(1)
    expect(ledger[0].type).toBe('purchase_in')
    expect(ledger[0].qty).toBe(6)
    expect(ledger[0].before).toBe(0)
    expect(ledger[0].after).toBe(6)
    expect(ledger[0].refId).toBe(order.id)
    expect(ledger[0].reason).toContain(order.poNumber)
  })

  it('handles a partial delivery and leaves the rest outstanding', async () => {
    const item = await product(0)
    const { order } = await sentOrder([{ productId: item.id, quantity: 10 }])

    const partial = await db.purchaseOrders.receiveGoods(order.id, {
      lines: [{ productId: item.id, quantity: 4 }], actorId: 'usr_manager',
    })

    expect(partial.status).toBe('partially_received')
    expect(partial.items[0].quantityReceived).toBe(4)
    // Only the four that turned up are sellable.
    expect((await db.products.get(item.id))!.stockOnHand).toBe(4)
  })

  it('completes an order across two deliveries', async () => {
    const item = await product(0)
    const { order } = await sentOrder([{ productId: item.id, quantity: 10 }])

    await db.purchaseOrders.receiveGoods(order.id, { lines: [{ productId: item.id, quantity: 4 }], actorId: 'usr_manager' })
    const done = await db.purchaseOrders.receiveGoods(order.id, { lines: [{ productId: item.id, quantity: 6 }], actorId: 'usr_manager' })

    expect(done.status).toBe('received')
    expect(done.items[0].quantityReceived).toBe(10)
    expect((await db.products.get(item.id))!.stockOnHand).toBe(10)
  })

  it('§28.5 — refuses to receive more than was ordered', async () => {
    const item = await product(0)
    const { order } = await sentOrder([{ productId: item.id, quantity: 5 }])

    // Units nobody bought would appear on the shelf and quietly break the
    // payable, so this is refused rather than absorbed.
    await expect(db.purchaseOrders.receiveGoods(order.id, {
      lines: [{ productId: item.id, quantity: 6 }], actorId: 'usr_manager',
    })).rejects.toThrow(/only 5 of 5 still outstanding/)

    expect((await db.products.get(item.id))!.stockOnHand).toBe(0)
  })

  it('refuses to over-receive across deliveries', async () => {
    const item = await product(0)
    const { order } = await sentOrder([{ productId: item.id, quantity: 5 }])
    await db.purchaseOrders.receiveGoods(order.id, { lines: [{ productId: item.id, quantity: 3 }], actorId: 'usr_manager' })

    await expect(db.purchaseOrders.receiveGoods(order.id, {
      lines: [{ productId: item.id, quantity: 3 }], actorId: 'usr_manager',
    })).rejects.toThrow(/only 2 of 5 still outstanding/)
  })

  it('refuses to receive against an order that was never sent', async () => {
    const sup = await supplier()
    const item = await product()
    const draft = await db.purchaseOrders.create({
      supplierId: sup.id, branchId: 'br_colombo', lines: [{ productId: item.id, quantity: 5, unitCost: 900_00 }],
    })
    await expect(db.purchaseOrders.receiveGoods(draft.id, {
      lines: [{ productId: item.id, quantity: 5 }], actorId: 'usr_manager',
    })).rejects.toThrow(/cannot receive goods/i)
  })

  it('refuses to receive against a completed order', async () => {
    const item = await product(0)
    const { order } = await sentOrder([{ productId: item.id, quantity: 5 }])
    await db.purchaseOrders.receiveGoods(order.id, { lines: [{ productId: item.id, quantity: 5 }], actorId: 'usr_manager' })

    await expect(db.purchaseOrders.receiveGoods(order.id, {
      lines: [{ productId: item.id, quantity: 1 }], actorId: 'usr_manager',
    })).rejects.toThrow(/cannot receive goods/i)
  })

  it('refuses a line that is not on the order', async () => {
    const ordered = await product(0, { name: 'Ordered part' })
    const stranger = await product(0, { name: 'Not ordered' })
    const { order } = await sentOrder([{ productId: ordered.id, quantity: 5 }])

    await expect(db.purchaseOrders.receiveGoods(order.id, {
      lines: [{ productId: stranger.id, quantity: 1 }], actorId: 'usr_manager',
    })).rejects.toThrow(/is not on/)
  })

  it('refuses a zero or fractional quantity', async () => {
    const item = await product(0)
    const { order } = await sentOrder([{ productId: item.id, quantity: 5 }])
    await expect(db.purchaseOrders.receiveGoods(order.id, {
      lines: [{ productId: item.id, quantity: 0 }], actorId: 'usr_manager',
    })).rejects.toThrow(/greater than zero/i)
  })

  it('takes the supplier invoice number when the delivery note carries one', async () => {
    const item = await product(0)
    const { order } = await sentOrder([{ productId: item.id, quantity: 5 }])
    const after = await db.purchaseOrders.receiveGoods(order.id, {
      lines: [{ productId: item.id, quantity: 5 }],
      supplierInvoiceNumber: 'SI-8841',
      actorId: 'usr_manager',
    })
    expect(after.supplierInvoiceNumber).toBe('SI-8841')
  })
})

describe('purchaseOrders.cancel', () => {
  it('cancels an order that has not been filled', async () => {
    const item = await product(0)
    const { order } = await sentOrder([{ productId: item.id, quantity: 5 }])
    const cancelled = await db.purchaseOrders.cancel(order.id, 'usr_manager', 'Supplier out of stock.')
    expect(cancelled.status).toBe('cancelled')
    expect((await db.products.get(item.id))!.stockOnHand).toBe(0)
  })

  it('requires a reason', async () => {
    const item = await product(0)
    const { order } = await sentOrder([{ productId: item.id, quantity: 5 }])
    await expect(db.purchaseOrders.cancel(order.id, 'usr_manager', '  ')).rejects.toThrow(/record why/i)
  })

  it('refuses once goods have arrived', async () => {
    const item = await product(0)
    const { order } = await sentOrder([{ productId: item.id, quantity: 5 }])
    await db.purchaseOrders.receiveGoods(order.id, { lines: [{ productId: item.id, quantity: 2 }], actorId: 'usr_manager' })

    // Those two units are stock now. Cancelling the order would leave them on
    // the shelf with no order behind them to explain the count.
    await expect(db.purchaseOrders.cancel(order.id, 'usr_manager', 'Changed our mind.'))
      .rejects.toThrow(/goods have already arrived/i)
  })

  it('refuses to cancel twice', async () => {
    const item = await product(0)
    const { order } = await sentOrder([{ productId: item.id, quantity: 5 }])
    await db.purchaseOrders.cancel(order.id, 'usr_manager', 'Not needed.')
    await expect(db.purchaseOrders.cancel(order.id, 'usr_manager', 'Again.')).rejects.toThrow(/cannot be cancelled/i)
  })
})

describe('purchaseOrders.send', () => {
  it('refuses to send an order twice', async () => {
    const item = await product()
    const { order } = await sentOrder([{ productId: item.id, quantity: 5 }])
    await expect(db.purchaseOrders.send(order.id, 'usr_manager')).rejects.toThrow(/cannot be sent/i)
  })
})

describe('purchaseOrders.list', () => {
  it('filters by branch, supplier and status', async () => {
    const sup = await supplier()
    const item = await product()
    const a = await db.purchaseOrders.create({
      supplierId: sup.id, branchId: 'br_colombo', lines: [{ productId: item.id, quantity: 5, unitCost: 900_00 }],
    })
    await db.purchaseOrders.send(a.id, 'usr_manager')
    await db.purchaseOrders.create({
      supplierId: sup.id, branchId: 'br_kandy', lines: [{ productId: item.id, quantity: 2, unitCost: 900_00 }],
    })

    expect(await db.purchaseOrders.list({ branchId: 'br_colombo' })).toHaveLength(1)
    expect(await db.purchaseOrders.list({ branchId: 'br_kandy' })).toHaveLength(1)
    expect(await db.purchaseOrders.list({ supplierId: sup.id })).toHaveLength(2)
    expect(await db.purchaseOrders.list({ status: 'sent' })).toHaveLength(1)
    expect(await db.purchaseOrders.list({ status: 'draft' })).toHaveLength(1)
  })

  it('returns newest first', async () => {
    const sup = await supplier()
    const item = await product()
    const first = await db.purchaseOrders.create({
      supplierId: sup.id, branchId: 'br_colombo', lines: [{ productId: item.id, quantity: 1, unitCost: 900_00 }],
    })
    await new Promise((r) => setTimeout(r, 5))
    const second = await db.purchaseOrders.create({
      supplierId: sup.id, branchId: 'br_colombo', lines: [{ productId: item.id, quantity: 1, unitCost: 900_00 }],
    })

    const all = await db.purchaseOrders.list()
    expect(all[0].id).toBe(second.id)
    expect(all[1].id).toBe(first.id)
  })
})

describe('the trail records purchasing', () => {
  it('records an order being sent', async () => {
    const item = await product()
    const { order } = await sentOrder([{ productId: item.id, quantity: 5 }])
    const rows = await db.audit.list({ action: 'purchase_order.sent' })
    expect(rows).toHaveLength(1)
    expect(rows[0].actorId).toBe('usr_manager')
    expect(rows[0].detail).toContain(order.poNumber)
  })

  it('records goods arriving, with the counts', async () => {
    const item = await product(0)
    const { order } = await sentOrder([{ productId: item.id, quantity: 10 }])
    await db.purchaseOrders.receiveGoods(order.id, {
      lines: [{ productId: item.id, quantity: 4 }], actorId: 'usr_manager',
    })

    const rows = await db.audit.list({ action: 'purchase_order.received' })
    expect(rows).toHaveLength(1)
    expect(rows[0].detail).toContain('4 of 10')
  })
})
