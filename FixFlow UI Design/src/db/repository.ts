import type {
  Branch,
  Customer,
  Device,
  RepairJob,
  RepairStatus,
  RepairStatusHistoryEntry,
  User,
} from '../domain/types'
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

  // --- business entities (§7, §13, §14, §22) -------------------------------

  branches: {
    list(): Promise<Branch[]>
    get(id: string): Promise<Branch | undefined>
  }

  users: {
    list(): Promise<User[]>
    get(id: string): Promise<User | undefined>
    byRole(role: User['role']): Promise<User[]>
    /** Technicians who may be assigned work. */
    technicians(branchId?: string): Promise<User[]>
  }

  customers: {
    list(): Promise<Customer[]>
    get(id: string): Promise<Customer | undefined>
    create(input: CustomerInput): Promise<Customer>
    update(id: string, patch: Partial<CustomerInput>): Promise<Customer>
    /** §13 — search by name, phone or customer code. */
    search(term: string): Promise<Customer[]>
    /** §20 — resolve an unguessable portal token to its customer. */
    byPortalToken(token: string): Promise<Customer | undefined>
  }

  devices: {
    list(): Promise<Device[]>
    forCustomer(customerId: string): Promise<Device[]>
    get(id: string): Promise<Device | undefined>
    create(input: DeviceInput): Promise<Device>
  }

  repairs: {
    list(filter?: RepairFilter): Promise<RepairJob[]>
    get(id: string): Promise<RepairJob | undefined>
    create(input: RepairInput): Promise<RepairJob>
    /**
     * Validates the transition against domain/workflows before writing, and
     * appends the history entry in the same transaction (§28.10).
     */
    changeStatus(id: string, to: RepairStatus, actorId: string, note?: string): Promise<RepairJob>
    assignTechnician(id: string, technicianId: string, actorId: string): Promise<RepairJob>
    update(id: string, patch: Partial<RepairInput>): Promise<RepairJob>
    history(id: string): Promise<RepairStatusHistoryEntry[]>
    /** The next job number for a branch, e.g. FX-2026-004822. */
    nextJobNumber(branchId: string, year?: number): Promise<string>
  }
}

export type CustomerInput = Omit<Customer, 'id' | 'code' | 'portalToken' | 'createdAt'>
export type DeviceInput = Omit<Device, 'id' | 'createdAt'>
export type RepairInput = Omit<RepairJob, 'id' | 'jobNumber' | 'createdAt' | 'updatedAt'>

export interface RepairFilter {
  branchId?: string
  status?: RepairStatus
  customerId?: string
  technicianId?: string
  search?: string
  limit?: number
}
