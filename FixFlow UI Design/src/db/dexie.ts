import Dexie, { type Table } from 'dexie'
import type { Db, DuplicateStrategy, ImportResult, ProductInput, StockAdjust } from './repository'
import {
  ImportBatch,
  Product,
  StockMovement,
  newId,
  nowIso,
  type ImportBatch as ImportBatchT,
  type Product as ProductT,
  type StockMovement as StockMovementT,
} from './schema'
import { seedProducts } from './seed'

class FixFlowDexie extends Dexie {
  products!: Table<ProductT, string>
  movements!: Table<StockMovementT, string>
  batches!: Table<ImportBatchT, string>

  constructor() {
    super('fixflow')
    this.version(1).stores({
      products: 'id, sku, branchId, name, category',
      movements: 'id, productId, at',
      batches: 'id, at',
    })
  }
}

const raw = new FixFlowDexie()

/**
 * Cached so the seed can never run twice. React StrictMode double-invokes
 * effects in development, and two concurrent `count() === 0` checks would both
 * decide to seed — doubling every opening balance.
 */
let seeding: Promise<void> | null = null

async function writeMovement(a: StockAdjust): Promise<StockMovementT> {
  const product = await raw.products.get(a.productId)
  if (!product) throw new Error(`adjustStock: no product ${a.productId}`)

  const before = product.stockOnHand
  const after = before + a.qty
  if (after < 0) {
    throw new Error(
      `Cannot remove ${-a.qty} of "${product.name}" — only ${before} on hand.`,
    )
  }

  const movement = StockMovement.parse({
    id: newId('mv'),
    productId: product.id,
    branchId: a.branchId,
    type: a.type,
    qty: a.qty,
    before,
    after,
    reason: a.reason ?? '',
    refId: a.refId ?? '',
    actorId: a.actorId ?? 'system',
    at: nowIso(),
  })

  await raw.transaction('rw', raw.products, raw.movements, async () => {
    await raw.products.update(product.id, { stockOnHand: after, updatedAt: nowIso() })
    await raw.movements.add(movement)
  })
  return movement
}

function toProduct(v: Record<string, unknown>, branchId: string, existing?: ProductT): ProductT {
  return Product.parse({
    id: existing?.id ?? newId('prd'),
    sku: v.sku,
    name: v.name,
    category: v.category ?? 'Uncategorised',
    costCents: v.costCents ?? 0,
    priceCents: v.priceCents ?? 0,
    taxRate: v.taxRate ?? 0,
    stockOnHand: existing?.stockOnHand ?? (v.stockOnHand ?? 0),
    reserved: existing?.reserved ?? 0,
    minStock: v.minStock ?? 0,
    barcode: v.barcode ?? '',
    isService: v.isService ?? false,
    branchId,
    createdAt: existing?.createdAt ?? nowIso(),
    updatedAt: nowIso(),
  })
}

export const db: Db = {
  ready() {
    seeding ??= (async () => {
      const count = await raw.products.count()
      if (count > 0) return
      await raw.transaction('rw', raw.products, raw.movements, async () => {
        // Re-check inside the transaction: the earlier count may be stale.
        if ((await raw.products.count()) > 0) return
        await raw.products.bulkAdd(seedProducts)
        await raw.movements.bulkAdd(
          seedProducts.map((p) =>
            StockMovement.parse({
              id: newId('mv'),
              productId: p.id,
              branchId: p.branchId,
              type: 'opening',
              qty: p.stockOnHand,
              before: 0,
              after: p.stockOnHand,
              reason: 'Opening balance',
              actorId: 'system',
              at: p.createdAt,
            }),
          ),
        )
      })
    })()
    return seeding
  },

  products: {
    list: () => raw.products.toArray(),
    get: (id) => raw.products.get(id),
    findBySku: (sku, branchId) =>
      raw.products.where('sku').equals(sku).and((p) => p.branchId === branchId).first(),

    async create(input: ProductInput) {
      const dupe = await db.products.findBySku(input.sku, input.branchId)
      if (dupe) throw new Error(`SKU "${input.sku}" already exists in this branch.`)
      const product = Product.parse({
        ...input,
        id: newId('prd'),
        reserved: 0,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      })
      await raw.transaction('rw', raw.products, raw.movements, async () => {
        await raw.products.add(product)
        if (product.stockOnHand > 0) {
          await raw.movements.add(
            StockMovement.parse({
              id: newId('mv'),
              productId: product.id,
              branchId: product.branchId,
              type: 'opening',
              qty: product.stockOnHand,
              before: 0,
              after: product.stockOnHand,
              reason: 'Created with opening stock',
              actorId: 'system',
              at: product.createdAt,
            }),
          )
        }
      })
      return product
    },

    async update(id, patch) {
      const existing = await raw.products.get(id)
      if (!existing) throw new Error(`update: no product ${id}`)
      const next = Product.parse({ ...existing, ...patch, id, updatedAt: nowIso() })
      await raw.products.put(next)
      return next
    },

    async remove(id) {
      await raw.transaction('rw', raw.products, raw.movements, async () => {
        await raw.products.delete(id)
        await raw.movements.where('productId').equals(id).delete()
      })
    },

    adjustStock: writeMovement,
  },

  movements: {
    forProduct: (productId) =>
      raw.movements.where('productId').equals(productId).reverse().sortBy('at'),
    recent: (limit = 25) => raw.movements.orderBy('at').reverse().limit(limit).toArray(),
  },

  imports: {
    async products(values, opts): Promise<ImportResult> {
      const batchId = newId('imp')
      const createdIds: string[] = []
      const overwritten: Array<{ id: string; before: unknown }> = []
      const openings: StockMovementT[] = []
      let created = 0
      let updated = 0
      let skipped = 0

      await raw.transaction('rw', raw.products, raw.movements, raw.batches, async () => {
        for (const v of values) {
          const sku = String(v.sku ?? '')
          const existing = await raw.products
            .where('sku')
            .equals(sku)
            .and((p) => p.branchId === opts.branchId)
            .first()

          if (existing) {
            if (opts.strategy === 'skip') {
              skipped++
              continue
            }
            overwritten.push({ id: existing.id, before: { ...existing } })
            const merged = toProduct(v, opts.branchId, existing)
            await raw.products.put(merged)
            updated++
            continue
          }

          const product = toProduct(v, opts.branchId)
          await raw.products.add(product)
          createdIds.push(product.id)
          created++
          if (product.stockOnHand > 0) {
            openings.push(
              StockMovement.parse({
                id: newId('mv'),
                productId: product.id,
                branchId: product.branchId,
                type: 'opening',
                qty: product.stockOnHand,
                before: 0,
                after: product.stockOnHand,
                reason: `Imported from ${opts.filename}`,
                refId: batchId,
                actorId: opts.actorId ?? 'system',
                at: product.createdAt,
              }),
            )
          }
        }

        if (openings.length) await raw.movements.bulkAdd(openings)

        await raw.batches.add(
          ImportBatch.parse({
            id: batchId,
            entity: 'product',
            filename: opts.filename,
            rowsTotal: values.length,
            rowsOk: created + updated,
            rowsFailed: skipped,
            createdIds,
            overwritten,
            actorId: opts.actorId ?? 'system',
            at: nowIso(),
            undoneAt: null,
          }),
        )
      })

      return { batchId, created, updated, skipped }
    },

    list: () => raw.batches.orderBy('at').reverse().toArray(),

    async undo(batchId: string) {
      await raw.transaction('rw', raw.products, raw.movements, raw.batches, async () => {
        const batch = await raw.batches.get(batchId)
        if (!batch) throw new Error(`undo: no batch ${batchId}`)
        if (batch.undoneAt) throw new Error('That import was already undone.')

        // Restore rows we overwrote, then delete rows we created.
        for (const o of batch.overwritten) {
          await raw.products.put(o.before as ProductT)
        }
        if (batch.createdIds.length) {
          await raw.products.bulkDelete(batch.createdIds)
          await raw.movements.where('productId').anyOf(batch.createdIds).delete()
        }
        await raw.batches.update(batchId, { undoneAt: nowIso() })
      })
    },
  },
}

export type { DuplicateStrategy }
