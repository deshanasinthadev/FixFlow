import { z } from 'zod'

/**
 * Money is stored as an integer number of cents.
 *
 * Never a float and never a display string like "Rs. 18,500" — those cannot be
 * summed, sorted or compared. Format only at the edge, with `formatLKR`.
 */
export const cents = z.number().int().min(0)

/** ISO-8601 timestamp, e.g. "2026-03-18T16:30:00.000Z". Never "Today, 4:30 PM". */
export const isoTimestamp = z.string().min(10)

export const Product = z.object({
  id: z.string().min(1),
  sku: z.string().min(1),
  name: z.string().min(1),
  category: z.string().default('Uncategorised'),
  costCents: cents,
  priceCents: cents,
  /** Percent, 0-100. Sri Lanka standard VAT is 18; some supplies are zero-rated. */
  taxRate: z.number().min(0).max(100).default(0),
  stockOnHand: z.number().int().min(0),
  reserved: z.number().int().min(0).default(0),
  minStock: z.number().int().min(0).default(0),
  barcode: z.string().default(''),
  isService: z.boolean().default(false),
  branchId: z.string().min(1),
  createdAt: isoTimestamp,
  updatedAt: isoTimestamp,
})
export type Product = z.infer<typeof Product>

export const StockMovementType = z.enum([
  'opening',
  'purchase_in',
  'sale_out',
  'repair_use',
  'adjustment',
  'transfer_in',
  'transfer_out',
])
export type StockMovementType = z.infer<typeof StockMovementType>

/**
 * Stock is a ledger. `products.stockOnHand` is a cache of this table, never the
 * source of truth — every change writes a movement row. That is what makes
 * Stock Adjustments, Stock Transfers and Audit Log real pages instead of stubs,
 * and it is the only way to answer "why is this number wrong?".
 */
export const StockMovement = z.object({
  id: z.string().min(1),
  productId: z.string().min(1),
  branchId: z.string().min(1),
  type: StockMovementType,
  /** Signed: positive adds stock, negative removes it. */
  qty: z.number().int(),
  before: z.number().int().min(0),
  after: z.number().int().min(0),
  reason: z.string().default(''),
  /** Foreign reference, e.g. an import batch id or an invoice id. */
  refId: z.string().default(''),
  actorId: z.string().default('system'),
  at: isoTimestamp,
})
export type StockMovement = z.infer<typeof StockMovement>

export const ImportBatch = z.object({
  id: z.string().min(1),
  entity: z.string().min(1),
  filename: z.string(),
  rowsTotal: z.number().int().min(0),
  rowsOk: z.number().int().min(0),
  rowsFailed: z.number().int().min(0),
  /** Ids written by this batch, so an undo can roll it back exactly. */
  createdIds: z.array(z.string()),
  /** productId -> previous row, so an undo can restore overwritten values. */
  overwritten: z.array(z.object({ id: z.string(), before: z.unknown() })),
  actorId: z.string().default('system'),
  at: isoTimestamp,
  undoneAt: isoTimestamp.nullable().default(null),
})
export type ImportBatch = z.infer<typeof ImportBatch>

export const newId = (prefix: string) =>
  `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`

export const nowIso = () => new Date().toISOString()
