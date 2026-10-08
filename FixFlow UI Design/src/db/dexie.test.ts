import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { createDb } from './dexie'
import { seedProducts } from './seed'
import type { Db } from './repository'

let uid = 0
let db: Db

beforeEach(async () => {
  db = createDb(`fixflow-test-${++uid}`)
  await db.ready()
})

const row = (over: Record<string, unknown> = {}) => ({
  sku: 'TST-001',
  name: 'Test widget',
  category: 'Chargers',
  priceCents: 650000,
  costCents: 416000,
  taxRate: 18,
  stockOnHand: 10,
  minStock: 2,
  barcode: '',
  isService: false,
  ...over,
})

describe('ready()', () => {
  it('seeds the demo catalogue once', async () => {
    const products = await db.products.list()
    expect(products).toHaveLength(seedProducts.length)
  })

  it('is idempotent — StrictMode double-mount must not double the opening stock', async () => {
    await db.ready()
    await db.ready()
    const movements = await db.movements.forProduct(seedProducts[0].id)
    expect(movements).toHaveLength(1)
    expect(movements[0]).toMatchObject({ type: 'opening', after: seedProducts[0].stockOnHand })
  })

  it('writes one opening movement per product', async () => {
    const all = await db.movements.recent(100)
    expect(all).toHaveLength(seedProducts.length)
    expect(all.every((m) => m.type === 'opening')).toBe(true)
  })
})

describe('products.create()', () => {
  it('refuses a duplicate SKU in the same branch', async () => {
    await expect(
      db.products.create({ ...row(), sku: seedProducts[0].sku, branchId: 'colombo' } as never),
    ).rejects.toThrow(/already exists/)
  })

  it('records opening stock in the ledger', async () => {
    const created = await db.products.create({ ...row(), sku: 'NEW-1', branchId: 'colombo' } as never)
    const movements = await db.movements.forProduct(created.id)
    expect(movements).toHaveLength(1)
    expect(movements[0]).toMatchObject({ before: 0, after: 10, qty: 10 })
  })
})

describe('imports.products()', () => {
  it('creates new rows and reports the counts', async () => {
    const res = await db.imports.products(
      [row({ sku: 'IMP-1' }), row({ sku: 'IMP-2' })],
      { branchId: 'colombo', strategy: 'update', filename: 'supplier.csv' },
    )
    expect(res).toMatchObject({ created: 2, updated: 0, skipped: 0 })
    expect(await db.products.findBySku('IMP-1', 'colombo')).toBeDefined()
  })

  it("with strategy 'update' overwrites an existing SKU but keeps its stock", async () => {
    const existing = await db.products.findBySku(seedProducts[0].sku, 'colombo')
    expect(existing).toBeDefined()
    const stockBefore = existing!.stockOnHand

    const res = await db.imports.products(
      [row({ sku: seedProducts[0].sku, name: 'Renamed by import', priceCents: 999900, stockOnHand: 77 })],
      { branchId: 'colombo', strategy: 'update', filename: 'supplier.csv' },
    )
    expect(res).toMatchObject({ created: 0, updated: 1 })

    const after = await db.products.findBySku(seedProducts[0].sku, 'colombo')
    expect(after!.name).toBe('Renamed by import')
    expect(after!.priceCents).toBe(999900)
    // Importing must not silently rewrite stock — that belongs to the ledger.
    expect(after!.stockOnHand).toBe(stockBefore)
  })

  it("with strategy 'skip' leaves the existing row untouched", async () => {
    const before = await db.products.findBySku(seedProducts[0].sku, 'colombo')
    const res = await db.imports.products(
      [row({ sku: seedProducts[0].sku, name: 'Should not apply' })],
      { branchId: 'colombo', strategy: 'skip', filename: 'supplier.csv' },
    )
    expect(res).toMatchObject({ created: 0, updated: 0, skipped: 1 })
    const after = await db.products.findBySku(seedProducts[0].sku, 'colombo')
    expect(after!.name).toBe(before!.name)
  })

  it('does not let one branch overwrite another branch with the same SKU', async () => {
    const res = await db.imports.products(
      [row({ sku: seedProducts[0].sku, name: 'Kandy copy' })],
      { branchId: 'kandy', strategy: 'update', filename: 'supplier.csv' },
    )
    expect(res).toMatchObject({ created: 1, updated: 0 })

    const colombo = await db.products.findBySku(seedProducts[0].sku, 'colombo')
    const kandy = await db.products.findBySku(seedProducts[0].sku, 'kandy')
    expect(colombo!.name).not.toBe('Kandy copy')
    expect(kandy!.name).toBe('Kandy copy')
  })

  it('writes an opening movement for imported stock', async () => {
    const res = await db.imports.products(
      [row({ sku: 'IMP-STK', stockOnHand: 25 })],
      { branchId: 'colombo', strategy: 'update', filename: 'supplier.csv' },
    )
    const product = await db.products.findBySku('IMP-STK', 'colombo')
    const movements = await db.movements.forProduct(product!.id)
    expect(movements).toHaveLength(1)
    expect(movements[0]).toMatchObject({ type: 'opening', after: 25, refId: res.batchId })
  })

  it('records a batch so the import can be undone', async () => {
    await db.imports.products([row({ sku: 'IMP-B' })], {
      branchId: 'colombo', strategy: 'update', filename: 'supplier.csv',
    })
    const batches = await db.imports.list()
    expect(batches).toHaveLength(1)
    expect(batches[0]).toMatchObject({ filename: 'supplier.csv', rowsTotal: 1, rowsOk: 1 })
  })
})

describe('imports.undo()', () => {
  it('deletes rows the import created, along with their movements', async () => {
    const res = await db.imports.products(
      [row({ sku: 'UNDO-1' }), row({ sku: 'UNDO-2' })],
      { branchId: 'colombo', strategy: 'update', filename: 'supplier.csv' },
    )
    const created = await db.products.findBySku('UNDO-1', 'colombo')
    expect((await db.movements.forProduct(created!.id)).length).toBe(1)

    await db.imports.undo(res.batchId)

    expect(await db.products.findBySku('UNDO-1', 'colombo')).toBeUndefined()
    expect(await db.movements.forProduct(created!.id)).toHaveLength(0)
  })

  it('restores the rows it overwrote', async () => {
    const before = await db.products.findBySku(seedProducts[1].sku, 'colombo')
    const res = await db.imports.products(
      [row({ sku: seedProducts[1].sku, name: 'Clobbered', priceCents: 1 })],
      { branchId: 'colombo', strategy: 'update', filename: 'supplier.csv' },
    )
    expect((await db.products.findBySku(seedProducts[1].sku, 'colombo'))!.name).toBe('Clobbered')

    await db.imports.undo(res.batchId)

    const after = await db.products.findBySku(seedProducts[1].sku, 'colombo')
    expect(after!.name).toBe(before!.name)
    expect(after!.priceCents).toBe(before!.priceCents)
  })

  it('refuses to undo twice', async () => {
    const res = await db.imports.products([row({ sku: 'UNDO-3' })], {
      branchId: 'colombo', strategy: 'update', filename: 'supplier.csv',
    })
    await db.imports.undo(res.batchId)
    await expect(db.imports.undo(res.batchId)).rejects.toThrow(/already undone/)
  })

  it('leaves the database exactly as it was', async () => {
    const before = await db.products.list()
    const res = await db.imports.products(
      [row({ sku: 'UNDO-4' }), row({ sku: seedProducts[2].sku, name: 'Temp rename' })],
      { branchId: 'colombo', strategy: 'update', filename: 'supplier.csv' },
    )
    await db.imports.undo(res.batchId)
    const after = await db.products.list()
    expect(after).toHaveLength(before.length)
    expect(after.map((p) => [p.id, p.name, p.priceCents, p.stockOnHand]).sort())
      .toEqual(before.map((p) => [p.id, p.name, p.priceCents, p.stockOnHand]).sort())
  })
})

describe('stock ledger', () => {
  it('refuses to drive stock negative', async () => {
    const p = seedProducts.find((x) => x.stockOnHand > 0)!
    await expect(
      db.products.adjustStock({
        productId: p.id, branchId: p.branchId, type: 'sale_out', qty: -(p.stockOnHand + 1),
      }),
    ).rejects.toThrow(/only \d+ on hand/)
  })

  it('records before/after on every movement', async () => {
    const p = seedProducts.find((x) => x.stockOnHand > 2)!
    const start = p.stockOnHand

    await db.products.adjustStock({ productId: p.id, branchId: p.branchId, type: 'purchase_in', qty: 5, reason: 'GRN' })
    await db.products.adjustStock({ productId: p.id, branchId: p.branchId, type: 'sale_out', qty: -2 })

    const after = await db.products.get(p.id)
    expect(after!.stockOnHand).toBe(start + 3)

    const ledger = await db.movements.forProduct(p.id)
    expect(ledger).toHaveLength(3) // opening + 2
    // Every row must chain: its `before` is the previous row's `after`.
    const chronological = [...ledger].reverse()
    for (let i = 1; i < chronological.length; i++) {
      expect(chronological[i].before).toBe(chronological[i - 1].after)
    }
    expect(chronological.at(-1)!.after).toBe(after!.stockOnHand)
  })

  it('never lets stockOnHand disagree with the ledger', async () => {
    const p = seedProducts[0]
    await db.products.adjustStock({ productId: p.id, branchId: p.branchId, type: 'adjustment', qty: -1, reason: 'Damaged' })
    await db.products.adjustStock({ productId: p.id, branchId: p.branchId, type: 'purchase_in', qty: 4 })

    const product = await db.products.get(p.id)
    const ledger = await db.movements.forProduct(p.id)
    const sum = ledger.reduce((s, m) => s + m.qty, 0)
    expect(sum).toBe(product!.stockOnHand)
  })
})
