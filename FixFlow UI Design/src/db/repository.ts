import type {
  Branch,
  CashSession,
  Customer,
  HeldSale,
  CustomerApproval,
  Device,
  Estimate,
  EstimateStatus,
  PaymentMethodId,
  RepairJob,
  RepairStatus,
  RepairStatusHistoryEntry,
  Refund,
  StockReservation,
  Sale,
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
    /**
     * §11 / §28.3 — hold stock for a repair so it cannot be sold twice.
     * `reserved` is not writable through `update`; this is the only way in.
     */
    reserve(productId: string, quantity: number, repairId: string): Promise<StockReservation>
    releaseReservation(repairId: string): Promise<void>
    reservations(productId?: string): Promise<StockReservation[]>
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

  /** §10 — point of sale. */
  sales: {
    list(filter?: SaleFilter): Promise<Sale[]>
    get(id: string): Promise<Sale | undefined>
    /**
     * Validates stock, decrements it, writes the sale and writes one stock
     * movement per line — all in a single transaction. A failure at any point
     * leaves the database exactly as it was (§28.15).
     */
    checkout(input: CheckoutInput): Promise<Sale>
    /**
     * §28.6 — a refund references the original sale and restores stock.
     * Never edits or deletes the original transaction (§28.18).
     */
    refund(saleId: string, input: RefundInput): Promise<Refund>
    nextReceiptNumber(branchId: string, year?: number): Promise<string>
  }

  refunds: {
    list(): Promise<Refund[]>
    forSale(saleId: string): Promise<Refund[]>
  }

  /** §9 — estimates and customer approvals. */
  estimates: {
    list(filter?: { repairId?: string; customerId?: string; branchId?: string; status?: EstimateStatus }): Promise<Estimate[]>
    get(id: string): Promise<Estimate | undefined>
    create(input: EstimateInput): Promise<Estimate>
    /** Moves draft -> sent. Nothing can be approved before it is sent. */
    send(id: string, actorId: string): Promise<Estimate>
    /**
     * §28.13 — records the approval itself, not just the resulting status, and
     * moves the repair to `approved` in the same transaction.
     */
    decide(id: string, input: ApprovalInput): Promise<{ estimate: Estimate; approval: CustomerApproval }>
    /**
     * §9 — a revision supersedes the previous estimate and links to it. The
     * old one is never edited or deleted, so the negotiation stays auditable.
     */
    revise(id: string, input: EstimateInput): Promise<Estimate>
    nextEstimateNumber(branchId: string, year?: number): Promise<string>
  }

  /** §10 — carts set aside mid-sale. Holding reserves no stock. */
  heldSales: {
    list(branchId?: string): Promise<HeldSale[]>
    get(id: string): Promise<HeldSale | undefined>
    hold(input: HoldSaleInput): Promise<HeldSale>
    /** Removes a held cart, e.g. after it is resumed or abandoned. */
    discard(id: string): Promise<void>
  }

  /** §10 — cash register sessions: open with a float, close against a count. */
  cashSessions: {
    list(filter?: { branchId?: string; status?: 'open' | 'closed' }): Promise<CashSession[]>
    get(id: string): Promise<CashSession | undefined>
    /** The open session for a branch, if there is one. */
    current(branchId: string): Promise<CashSession | undefined>
    open(input: OpenCashSessionInput): Promise<CashSession>
    /**
     * Records the counted drawer, stores the expected figure alongside it, and
     * closes. The variance is not stored — it is derived, so it can never
     * disagree with the two numbers it comes from.
     */
    close(id: string, input: CloseCashSessionInput): Promise<CashSession>
    /** Opening float + cash sales − cash refunds since the session opened. */
    expectedCash(id: string): Promise<number>
  }

  approvals: {
    forEstimate(estimateId: string): Promise<CustomerApproval[]>
    forRepair(repairId: string): Promise<CustomerApproval[]>
    /** True when the repair has an approval that has not been rejected. */
    hasApprovalFor(repairId: string): Promise<boolean>
  }
}

export interface EstimateInput {
  repairId: string
  items: { productId?: string; description: string; quantity: number; unitPrice: number }[]
  /** Minor units. */
  labourCost?: number
  discount?: number
  taxRate?: number
  taxEnabled?: boolean
  notes?: string
  expiresAt?: string
  actorId: string
}

export interface HoldSaleInput {
  branchId: string
  cashierId: string
  customerId?: string
  customerName?: string
  items: { productId: string; quantity: number }[]
  discount?: number
  note?: string
}

export interface OpenCashSessionInput {
  branchId: string
  cashierId: string
  /** Minor units placed in the drawer at open. */
  openingBalance: number
  note?: string
}

export interface CloseCashSessionInput {
  /** Minor units physically counted in the drawer. */
  countedCash: number
  cashierId: string
  note?: string
}

export interface ApprovalInput {
  decision: 'approved' | 'rejected'
  method: CustomerApproval['method']
  recordedBy: string
  note?: string
}

export interface SaleFilter {
  branchId?: string
  cashierId?: string
  customerId?: string
  limit?: number
}

export interface CheckoutLine {
  productId: string
  quantity: number
}

export interface CheckoutInput {
  branchId: string
  /** '' is a walk-in sale. */
  customerId?: string
  lines: CheckoutLine[]
  /** Minor units. */
  discount?: number
  /** Overrides the product tax rate; defaults to the business setting. */
  taxRate?: number
  taxEnabled?: boolean
  paymentMethod: PaymentMethodId
  /** Minor units actually received. */
  amountPaid?: number
  cashierId: string
  /** §28.16 — resubmitting with the same key returns the original sale. */
  idempotencyKey?: string
}

export interface RefundInput {
  /** Minor units. Omit to refund the whole sale. */
  amount?: number
  reason: string
  approvedBy: string
  /** True returns the goods to stock. False for a money-only refund. */
  restoreStock?: boolean
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
