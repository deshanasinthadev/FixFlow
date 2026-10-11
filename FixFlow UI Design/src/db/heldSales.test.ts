import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { createDb } from './dexie'
import type { Db } from './repository'

/**
 * Held (parked) carts (§10).
 *
 * The rule that matters most: holding a cart reserves nothing. The goods are
 * still on the shelf and still sellable, so a held sale must never reduce
 * stock or block another cashier from selling the same unit (§28.3).
 */
let db: Db
let uid = 0

beforeEach(async () => {
  db = createDb(`fixflow-hold-test-${++uid}`)
  await db.ready()
})

const hold = (over: Record<string, unknown> = {}) =>
  db.heldSales.hold({
    branchId: 'br_colombo',
    cashierId: 'usr_cashier',
    items: [{ productId: 'prd_chr_65w_001', quantity: 2 }],
    ...over,
  } as never)

const stockOf = async (id: string) => (await db.products.get(id))?.stockOnHand ?? -1

describe('heldSales.hold', () => {
  it('stores the cart with its lines', async () => {
    const held = await hold()
    expect(held.items).toEqual([{ productId: 'prd_chr_65w_001', quantity: 2 }])
    expect(held.branchId).toBe('br_colombo')
    expect(held.cashierId).toBe('usr_cashier')
  })

  it('does not change stock — a held cart reserves nothing (§28.3)', async () => {
    const before = await stockOf('prd_chr_65w_001')
    await hold()
    await hold()
    expect(await stockOf('prd_chr_65w_001')).toBe(before)
  })

  it('does not reduce what another cashier can sell', async () => {
    await hold({ items: [{ productId: 'prd_chr_65w_001', quantity: 3 }] })
    const product = await db.products.get('prd_chr_65w_001')
    // The full on-hand quantity is still available to a live sale.
    await expect(
      db.sales.checkout({
        branchId: 'br_colombo',
        lines: [{ productId: 'prd_chr_65w_001', quantity: product!.stockOnHand }],
        paymentMethod: 'cash',
        taxEnabled: false,
        cashierId: 'usr_cashier',
      }),
    ).resolves.toBeDefined()
  })

  it('keeps the customer and note when given', async () => {
    const held = await hold({ customerId: 'cus_nimal', customerName: 'Nimal Perera', note: 'Went to the car' })
    expect(held.customerId).toBe('cus_nimal')
    expect(held.customerName).toBe('Nimal Perera')
    expect(held.note).toBe('Went to the car')
  })

  it('defaults to a walk-in with no note', async () => {
    const held = await hold()
    expect(held.customerId).toBe('')
    expect(held.note).toBe('')
  })

  it('drops zero-quantity lines rather than storing them', async () => {
    const held = await hold({
      items: [
        { productId: 'prd_chr_65w_001', quantity: 2 },
        { productId: 'prd_chr_65w_001', quantity: 0 },
      ],
    })
    expect(held.items).toHaveLength(1)
  })

  it('refuses an empty cart', async () => {
    await expect(hold({ items: [] })).rejects.toThrow(/nothing in the cart/i)
  })

  it('refuses a cart of only zero quantities', async () => {
    await expect(hold({ items: [{ productId: 'prd_chr_65w_001', quantity: 0 }] })).rejects.toThrow(/nothing in the cart/i)
  })

  it('refuses an unknown product', async () => {
    await expect(hold({ items: [{ productId: 'prd_ghost', quantity: 1 }] })).rejects.toThrow(/unknown product/i)
  })

  it('refuses an unknown branch', async () => {
    await expect(hold({ branchId: 'br_nowhere' })).rejects.toThrow(/unknown branch/i)
  })

  it('writes nothing when a line is invalid', async () => {
    const before = await db.heldSales.list()
    await expect(
      hold({ items: [{ productId: 'prd_chr_65w_001', quantity: 1 }, { productId: 'prd_ghost', quantity: 1 }] }),
    ).rejects.toThrow()
    expect(await db.heldSales.list()).toHaveLength(before.length)
  })
})

describe('heldSales.list and discard', () => {
  it('filters by branch', async () => {
    await hold()
    await hold({ branchId: 'br_kandy', cashierId: 'usr_tech_3' })
    expect(await db.heldSales.list('br_colombo')).toHaveLength(1)
    expect(await db.heldSales.list('br_kandy')).toHaveLength(1)
    expect(await db.heldSales.list()).toHaveLength(2)
  })

  it('returns newest first', async () => {
    const first = await hold()
    const second = await hold()
    const all = await db.heldSales.list('br_colombo')
    expect(all[0].id).toBe(second.id)
    expect(all[1].id).toBe(first.id)
  })

  it('discards a held cart', async () => {
    const held = await hold()
    await db.heldSales.discard(held.id)
    expect(await db.heldSales.get(held.id)).toBeUndefined()
    expect(await db.heldSales.list('br_colombo')).toHaveLength(0)
  })

  it('discarding is safe for an id that is not there', async () => {
    await expect(db.heldSales.discard('hld_ghost')).resolves.toBeUndefined()
  })

  it('discarding does not restore stock, because holding never took any', async () => {
    const before = await stockOf('prd_chr_65w_001')
    const held = await hold()
    await db.heldSales.discard(held.id)
    expect(await stockOf('prd_chr_65w_001')).toBe(before)
  })
})
