import type { ImportBatch, Product, StockMovement, StockMovementType } from './schema'

export type ProductInput = Omit<Product, 'id' | 'createdAt' | 'updatedAt' | 'reserved'>

export type StockAdjust = {
  productId: string
  branchId: string
  type: StockMovementType
  /** Signed delta. */
  qty: number
  reason?: string
  refId?: string
  actorId?: string
}

export type ImportResult = {
  batchId: string
  created: number
  updated: number
  skipped: number
}

export type DuplicateStrategy = 'skip' | 'update'

/**
 * The only surface the UI is allowed to touch.
 *
 * Every method is async and every value crosses this boundary, so swapping the
 * Dexie implementation for Supabase (or a REST client) later is a matter of
 * writing one more file — no component changes. That is the whole point of
 * Phase A in DATA-PLAN.md.
 */
export interface Db {
  ready(): Promise<void>

  products: {
    list(): Promise<Product[]>
    get(id: string): Promise<Product | undefined>
    findBySku(sku: string, branchId: string): Promise<Product | undefined>
    create(input: ProductInput): Promise<Product>
    update(id: string, patch: Partial<ProductInput>): Promise<Product>
    remove(id: string): Promise<void>
    adjustStock(a: StockAdjust): Promise<StockMovement>
  }

  movements: {
    forProduct(productId: string): Promise<StockMovement[]>
    recent(limit?: number): Promise<StockMovement[]>
  }

  imports: {
    /** All-or-nothing: a throw leaves the database untouched. */
    products(values: Array<Record<string, unknown>>, opts: {
      branchId: string
      strategy: DuplicateStrategy
      filename: string
      actorId?: string
    }): Promise<ImportResult>
    list(): Promise<ImportBatch[]>
    undo(batchId: string): Promise<void>
  }
}
