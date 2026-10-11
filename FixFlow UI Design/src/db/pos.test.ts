import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { createDb } from './dexie'
import type { Db } from './repository'

/**
 * POS checkout and refunds (§10, §16, §28).
 *
 * This is the path where money and stock move together, so the tests focus on
 * the invariants: nothing is oversold, nothing is double-sold, a failed
 * checkout leaves no trace, and a retry cannot create a second sale.
 */
let db: Db
let uid = 0

beforeEach(async () => {
  db = createDb(`fixflow-pos-test-${++uid}`)
  await db.ready()
})

const checkout = (over: Record<string, unknown> = {}) =>
  db.sales.checkout({
    branchId: 'br_colombo',
    lines: [{ productId: 'prd_chr_65w_001', quantity: 1 }],
    paymentMethod: 'cash',
    cashierId: 'usr_cashier',
    ...over,
  } as never)

const stockOf = async (id: string) => (await db.products.get(id))?.stockOnHand ?? -1

describe('checkout', () => {
  it('creates a sale with a branch receipt number', async () => {
    const sale = await checkout()
    expect(sale.receiptNumber).toMatch(/^POS-CMB-\d{4}-\d{4}$/)
    expect(sale.branchId).toBe('br_colombo')
    expect(sale.cashierId).toBe('usr_cashier')
  })

  it('numbers receipts sequentially per branch', async () => {
    const a = await checkout()
    const b = await checkout()
    expect(a.receiptNumber.slice(-4)).toBe('0001')
    expect(b.receiptNumber.slice(-4)).toBe('0002')
  })

  it('prices the sale from the product record, not from the caller', async () => {
    const product = await db.products.get('prd_chr_65w_001')
    const sale = await checkout()
    expect(sale.items[0].unitPrice).toBe(product!.priceCents)
    expect(sale.subtotal).toBe(product!.priceCents)
  })

  it('adds no tax when tax is disabled (§3 default)', async () => {
    const sale = await checkout({ taxEnabled: false, taxRate: 18 })
    expect(sale.taxAmount).toBe(0)
    expect(sale.taxRate).toBe(0)
  })

  it('applies tax to the discounted subtotal when enabled', async () => {
    const product = await db.products.get('prd_chr_65w_001')
    const sale = await checkout({ taxEnabled: true, taxRate: 10, discount: 1000 })
    const taxable = product!.priceCents - 1000
    expect(sale.taxAmount).toBe(Math.round(taxable * 0.1))
    expect(sale.total).toBe(taxable + sale.taxAmount)
  })

  it('records the customer when one is given, and a walk-in when not', async () => {
    const named = await checkout({ customerId: 'cus_nimal' })
    expect(named.customerId).toBe('cus_nimal')
    expect(named.customerName).toBe('Nimal Perera')

    const walkIn = await checkout()
    expect(walkIn.customerId).toBe('')
    expect(walkIn.customerName).toBe('')
  })

  it('rejects an empty cart', async () => {
    await expect(checkout({ lines: [] })).rejects.toThrow(/at least one product/i)
  })

  it('rejects a zero or fractional quantity', async () => {
    await expect(checkout({ lines: [{ productId: 'prd_chr_65w_001', quantity: 0 }] })).rejects.toThrow(/quantity/i)
    await expect(checkout({ lines: [{ productId: 'prd_chr_65w_001', quantity: 1.5 }] })).rejects.toThrow(/quantity/i)
  })

  it('rejects an unknown product', async () => {
    await expect(checkout({ lines: [{ productId: 'prd_ghost', quantity: 1 }] })).rejects.toThrow(/unknown product/i)
  })

  it('rejects an unknown branch', async () => {
    await expect(checkout({ branchId: 'br_nowhere' })).rejects.toThrow(/unknown branch/i)
  })

  it('rejects an unknown customer', async () => {
    await expect(checkout({ customerId: 'cus_ghost' })).rejects.toThrow(/unknown customer/i)
  })
})

describe('stock integrity (§28.1, §28.2, §28.3)', () => {
  it('decrements stock by the quantity sold', async () => {
    const before = await stockOf('prd_chr_65w_001')
    await checkout({ lines: [{ productId: 'prd_chr_65w_001', quantity: 3 }] })
    expect(await stockOf('prd_chr_65w_001')).toBe(before - 3)
  })

  it('refuses to sell more than is available', async () => {
    const before = await stockOf('prd_chr_65w_001')
    await expect(
      checkout({ lines: [{ productId: 'prd_chr_65w_001', quantity: before + 1 }] }),
    ).rejects.toThrow(/insufficient stock/i)
    expect(await stockOf('prd_chr_65w_001')).toBe(before) // untouched
  })

  it('names the offending line in the error', async () => {
    const before = await stockOf('prd_chr_65w_001')
    await expect(
      checkout({ lines: [{ productId: 'prd_chr_65w_001', quantity: before + 5 }] }),
    ).rejects.toThrow(/requested, .* available/i)
  })

  it('sells from available stock, so reserved units cannot be sold twice (§28.3)', async () => {
    // Hold all but one unit against a repair.
    const product = await db.products.get('prd_chr_65w_001')
    await db.products.reserve(product!.id, product!.stockOnHand - 1, 'fxr_test_reservation')

    await checkout({ lines: [{ productId: 'prd_chr_65w_001', quantity: 1 }] }) // the one free unit
    await expect(
      checkout({ lines: [{ productId: 'prd_chr_65w_001', quantity: 1 }] }),
    ).rejects.toThrow(/insufficient stock/i)
  })

  it('writes one movement per line, naming the sale that caused it (§28.2)', async () => {
    const sale = await checkout({ lines: [{ productId: 'prd_chr_65w_001', quantity: 2 }] })
    const movements = await db.movements.forProduct('prd_chr_65w_001')
    const ours = movements.filter((m) => m.refId === sale.id)
    expect(ours).toHaveLength(1)
    expect(ours[0]).toMatchObject({ type: 'sale_out', qty: -2, reason: `Sale ${sale.receiptNumber}` })
  })

  it('chains the movement ledger before -> after', async () => {
    const before = await stockOf('prd_chr_65w_001')
    const sale = await checkout({ lines: [{ productId: 'prd_chr_65w_001', quantity: 2 }] })
    const movement = (await db.movements.forProduct('prd_chr_65w_001')).find((m) => m.refId === sale.id)!
    expect(movement.before).toBe(before)
    expect(movement.after).toBe(before - 2)
  })

  it('leaves no partial write when a multi-line sale fails on its second line (§28.15)', async () => {
    const before = await stockOf('prd_chr_65w_001')
    const salesBefore = await db.sales.list()

    await expect(
      checkout({
        lines: [
          { productId: 'prd_chr_65w_001', quantity: 1 }, // would succeed alone
          { productId: 'prd_chr_65w_001', quantity: 99999 }, // forces the failure
        ],
      }),
    ).rejects.toThrow(/insufficient stock/i)

    expect(await stockOf('prd_chr_65w_001')).toBe(before)
    expect(await db.sales.list()).toHaveLength(salesBefore.length)
    const movements = await db.movements.forProduct('prd_chr_65w_001')
    expect(movements.filter((m) => m.type === 'sale_out')).toHaveLength(0)
  })
})

describe('stock reservations (§11, §28.3)', () => {
  it('raises reserved without touching stock on hand', async () => {
    const before = await db.products.get('prd_chr_65w_001')
    await db.products.reserve('prd_chr_65w_001', 3, 'fxr_res_1')
    const after = await db.products.get('prd_chr_65w_001')
    expect(after!.stockOnHand).toBe(before!.stockOnHand)
    expect(after!.reserved).toBe(before!.reserved + 3)
  })

  it('refuses to reserve more than is available', async () => {
    const product = await db.products.get('prd_chr_65w_001')
    await expect(
      db.products.reserve('prd_chr_65w_001', product!.stockOnHand + 1, 'fxr_res_2'),
    ).rejects.toThrow(/only .* available/i)
  })

  it('refuses a zero or fractional quantity', async () => {
    await expect(db.products.reserve('prd_chr_65w_001', 0, 'fxr_res_3')).rejects.toThrow(/positive whole number/i)
  })

  it('releases every reservation held by a repair and returns the units', async () => {
    const before = await db.products.get('prd_chr_65w_001')
    await db.products.reserve('prd_chr_65w_001', 2, 'fxr_res_4')
    await db.products.reserve('prd_chr_65w_001', 3, 'fxr_res_4')
    expect((await db.products.get('prd_chr_65w_001'))!.reserved).toBe(before!.reserved + 5)

    await db.products.releaseReservation('fxr_res_4')
    const after = await db.products.get('prd_chr_65w_001')
    expect(after!.reserved).toBe(before!.reserved)
    expect(await db.products.reservations('prd_chr_65w_001')).toHaveLength(0)
  })

  it('lists reservations for one product', async () => {
    await db.products.reserve('prd_chr_65w_001', 1, 'fxr_res_5')
    await db.products.reserve('prd_chr_65w_001', 1, 'fxr_res_6')
    const held = await db.products.reservations('prd_chr_65w_001')
    expect(held).toHaveLength(2)
    expect(held.every((r) => r.productId === 'prd_chr_65w_001')).toBe(true)
  })

  it('is idempotent when a repair has no reservations to release', async () => {
    await expect(db.products.releaseReservation('fxr_never_reserved')).resolves.toBeUndefined()
  })
})

describe('idempotency (§28.16)', () => {
  it('returns the original sale when the same key is resubmitted', async () => {
    const first = await checkout({ idempotencyKey: 'key-abc' })
    const second = await checkout({ idempotencyKey: 'key-abc' })
    expect(second.id).toBe(first.id)
    expect(second.receiptNumber).toBe(first.receiptNumber)
  })

  it('does not decrement stock twice on a retry', async () => {
    const before = await stockOf('prd_chr_65w_001')
    await checkout({ idempotencyKey: 'key-retry', lines: [{ productId: 'prd_chr_65w_001', quantity: 2 }] })
    await checkout({ idempotencyKey: 'key-retry', lines: [{ productId: 'prd_chr_65w_001', quantity: 2 }] })
    expect(await stockOf('prd_chr_65w_001')).toBe(before - 2)
  })

  it('creates a separate sale for a different key', async () => {
    const a = await checkout({ idempotencyKey: 'key-1' })
    const b = await checkout({ idempotencyKey: 'key-2' })
    expect(b.id).not.toBe(a.id)
  })
})

describe('refunds (§16, §28.6, §28.18)', () => {
  it('returns the goods to stock', async () => {
    const sale = await checkout({ lines: [{ productId: 'prd_chr_65w_001', quantity: 2 }] })
    const afterSale = await stockOf('prd_chr_65w_001')
    await db.sales.refund(sale.id, { reason: 'Customer changed their mind', approvedBy: 'usr_manager' })
    expect(await stockOf('prd_chr_65w_001')).toBe(afterSale + 2)
  })

  it('writes a return movement naming the refund', async () => {
    const sale = await checkout()
    const refund = await db.sales.refund(sale.id, { reason: 'Faulty', approvedBy: 'usr_manager' })
    const movements = await db.movements.forProduct('prd_chr_65w_001')
    expect(movements.some((m) => m.refId === refund.id && m.qty > 0)).toBe(true)
  })

  it('can refund money without restoring stock', async () => {
    const sale = await checkout({ lines: [{ productId: 'prd_chr_65w_001', quantity: 2 }] })
    const afterSale = await stockOf('prd_chr_65w_001')
    await db.sales.refund(sale.id, { reason: 'Goodwill', approvedBy: 'usr_manager', restoreStock: false })
    expect(await stockOf('prd_chr_65w_001')).toBe(afterSale)
  })

  it('refuses to refund more than was paid', async () => {
    const sale = await checkout()
    await expect(
      db.sales.refund(sale.id, { amount: sale.amountPaid + 100, reason: 'x', approvedBy: 'usr_manager' }),
    ).rejects.toThrow(/only Rs\./i)
  })

  it('refuses a second full refund of the same sale', async () => {
    const sale = await checkout()
    await db.sales.refund(sale.id, { reason: 'first', approvedBy: 'usr_manager' })
    await expect(
      db.sales.refund(sale.id, { reason: 'second', approvedBy: 'usr_manager' }),
    ).rejects.toThrow(/greater than zero|only Rs\./i)
  })

  it('allows two partial refunds that together equal the amount paid', async () => {
    const sale = await checkout({ lines: [{ productId: 'prd_chr_65w_001', quantity: 2 }] })
    const half = Math.floor(sale.amountPaid / 2)
    await db.sales.refund(sale.id, { amount: half, reason: 'partial', approvedBy: 'usr_manager' })
    await db.sales.refund(sale.id, { amount: sale.amountPaid - half, reason: 'rest', approvedBy: 'usr_manager' })
    const refunds = await db.refunds.forSale(sale.id)
    expect(refunds).toHaveLength(2)
    expect(refunds.reduce((s, r) => s + r.amount, 0)).toBe(sale.amountPaid)
  })

  it('requires a reason', async () => {
    const sale = await checkout()
    await expect(db.sales.refund(sale.id, { reason: '   ', approvedBy: 'usr_manager' })).rejects.toThrow(/reason/i)
  })

  it('throws on an unknown sale', async () => {
    await expect(db.sales.refund('sal_ghost', { reason: 'x', approvedBy: 'usr_manager' })).rejects.toThrow(/no sale/i)
  })

  it('never edits or deletes the original sale (§28.18)', async () => {
    const sale = await checkout({ lines: [{ productId: 'prd_chr_65w_001', quantity: 2 }] })
    const before = await db.sales.get(sale.id)
    await db.sales.refund(sale.id, { reason: 'returned', approvedBy: 'usr_manager' })
    const after = await db.sales.get(sale.id)
    expect(after).toEqual(before)
  })
})

describe('sales.list', () => {
  it('filters by branch and cashier', async () => {
    await checkout()
    await checkout({ branchId: 'br_kandy', cashierId: 'usr_tech_3' })
    expect(await db.sales.list({ branchId: 'br_colombo' })).toHaveLength(1)
    expect(await db.sales.list({ cashierId: 'usr_tech_3' })).toHaveLength(1)
  })

  it('filters by customer', async () => {
    await checkout({ customerId: 'cus_nimal' })
    await checkout()
    expect(await db.sales.list({ customerId: 'cus_nimal' })).toHaveLength(1)
  })

  it('returns newest first and honours limit', async () => {
    await checkout()
    await checkout()
    const all = await db.sales.list()
    expect(all).toHaveLength(2)
    expect(new Date(all[0].createdAt).getTime()).toBeGreaterThanOrEqual(new Date(all[1].createdAt).getTime())
    expect(await db.sales.list({ limit: 1 })).toHaveLength(1)
  })
})
