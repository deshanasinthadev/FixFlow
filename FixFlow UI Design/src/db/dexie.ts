import Dexie, { type Table } from 'dexie'
import type {
  Branch,
  CashSession,
  Customer,
  CustomerApproval,
  HeldSale,
  Device,
  Estimate,
  AuditLogEntry,
  EstimateItem,
  EstimateStatus,
  Expense,
  ExpenseCategory,
  Invoice,
  InvoiceStatus,
  Payment,
  PaymentMethodId,
  PaymentStatus,
  Refund,
  RepairJob,
  RepairPartUsage,
  RepairStatus,
  RepairStatusHistoryEntry,
  Sale,
  SaleItem,
  StockReservation,
  User,
  Warranty,
  WarrantyClaim,
  WarrantyClaimStatus,
  WarrantyPolicy,
} from '../domain/types'
import {
  balanceDue,
  checkStockAvailability,
  computeDocument,
  invoiceStatusFor,
  isWarrantyActive,
  isWarrantyExpiringSoon,
  sumLines,
  warrantyExpiry,
} from '../domain/calculations'
import { EXPENSE_CATEGORIES, WARRANTY_CLAIM_STATUSES } from '../domain/types'
import {
  assertEstimateRevision,
  canDecideClaim,
  canRecordApproval,
  canStartWork,
  canTransitionClaim,
  canTransitionEstimate,
  ESTIMATE_STATUS_LABEL,
  STATUSES_REQUIRING_APPROVAL,
  WARRANTY_CLAIM_TRANSITIONS,
} from '../domain/workflows'
import type {
  ApprovalInput,
  CheckoutInput,
  CloseCashSessionInput,
  CustomerInput,
  EstimateInput,
  HoldSaleInput,
  ExpenseInput,
  InvoiceInput,
  InvoiceWithBalance,
  OpenCashSessionInput,
  PaymentInput,
  Db,
  DeviceInput,
  DuplicateStrategy,
  ImportResult,
  ProductInput,
  RefundInput,
  RepairFilter,
  RepairInput,
  RepairPartInput,
  WarrantyClaimDecisionInput,
  WarrantyClaimInput,
  WarrantyInput,
  AuditEntryInput,
  AuditFilter,
  WarrantyPolicyInput,
  SaleFilter,
  StockAdjust,
} from './repository'
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
import {
  seedBranches,
  seedCustomers,
  seedDevices,
  seedRepairHistory,
  seedRepairs,
  seedUsers,
} from './seedBusiness'
import { assertRepairTransition, REPAIR_STATUS_LABEL } from '../domain/workflows'

/**
 * §2 — the approved demo persistence key. Dexie gives us versioned migrations
 * for free, which is the substance of the requirement: local, versioned,
 * migratable, no backend, and never silently discarding user data.
 */
const DB_NAME = 'fixflow.demo.v1'

/**
 * Creates a repository over its own IndexedDB database.
 *
 * A factory rather than a bare singleton so tests can build isolated
 * instances against `fake-indexeddb` — see `dexie.test.ts`. The app imports
 * the `db` singleton at the bottom.
 */
export function createDb(name: string = DB_NAME): Db {
  class FixFlowDexie extends Dexie {
    products!: Table<ProductT, string>
    movements!: Table<StockMovementT, string>
    batches!: Table<ImportBatchT, string>
    branches!: Table<Branch, string>
    users!: Table<User, string>
    customers!: Table<Customer, string>
    devices!: Table<Device, string>
    repairs!: Table<RepairJob, string>
    repairHistory!: Table<RepairStatusHistoryEntry, string>
    repairParts!: Table<RepairPartUsage, string>
    /** §17 — the cover terms new warranties are sold under */
    warrantyPolicies!: Table<WarrantyPolicy, string>
    /** §17 — issued cover; the row is the contract, not the policy */
    warranties!: Table<Warranty, string>
    warrantyClaims!: Table<WarrantyClaim, string>
    /** §23 — who did what, when. Append-only. */
    auditLog!: Table<AuditLogEntry, string>
    sales!: Table<Sale, string>
    refunds!: Table<Refund, string>
    reservations!: Table<StockReservation, string>
    estimates!: Table<Estimate, string>
    approvals!: Table<CustomerApproval, string>
    cashSessions!: Table<CashSession, string>
    heldSales!: Table<HeldSale, string>
    invoices!: Table<Invoice, string>
    payments!: Table<Payment, string>
    expenses!: Table<Expense, string>

    constructor() {
      super(name)
      this.version(1).stores({
        products: 'id, sku, branchId, name, category',
        movements: 'id, productId, at',
        batches: 'id, at',
      })
      // Version 2 adds the business entities. Dexie carries the version-1
      // tables forward, so an existing user's products survive the upgrade.
      this.version(2).stores({
        branches: 'id, code, active',
        users: 'id, role, branchId, active',
        customers: 'id, code, fullName, phone, portalToken, status',
        devices: 'id, customerId, category',
        repairs: 'id, jobNumber, branchId, customerId, technicianId, status, priority, receivedAt',
        repairHistory: 'id, repairId, seq',
        sales: 'id, receiptNumber, branchId, cashierId, customerId, idempotencyKey, createdAt',
        refunds: 'id, originalSaleId, createdAt',
        reservations: 'id, productId, repairId',
      })
      // Version 3 adds estimates and the approvals recorded against them.
      this.version(3).stores({
        estimates: 'id, estimateNumber, repairId, customerId, branchId, status, createdAt',
        approvals: 'id, estimateId, repairId, at',
      })
      // Version 4 adds cash register sessions (§10).
      this.version(4).stores({
        cashSessions: 'id, branchId, cashierId, openedAt, closedAt',
      })
      // Version 5 adds held (parked) carts (§10).
      this.version(5).stores({
        heldSales: 'id, branchId, cashierId, createdAt',
      })
      // Version 6 adds invoices and the payments recorded against them (§10).
      this.version(6).stores({
        invoices: 'id, invoiceNumber, branchId, customerId, repairId, saleId, status, createdAt',
        payments: 'id, invoiceId, customerId, branchId, status, paidAt',
      })
      // Version 7 adds operating expenses (§18).
      this.version(7).stores({
        expenses: 'id, branchId, category, spentAt, recordedBy',
      })
      // Version 8 adds parts consumed by a repair (§11, §28.3).
      this.version(8).stores({
        repairParts: 'id, repairId, productId, createdAt',
      })
      // §17 — warranty policies, issued cover and claims.
      this.version(9).stores({
        warrantyPolicies: 'id, name, appliesTo',
        warranties: 'id, warrantyNumber, policyId, customerId, productId, repairId, expiresAt, status, createdAt',
        warrantyClaims: 'id, claimNumber, warrantyId, customerId, repairId, status, createdAt',
      })
      // §23 — the audit trail. Append-only: nothing edits or deletes a row.
      this.version(10).stores({
        auditLog: 'id, actorId, action, targetType, targetId, branchId, at',
      })
    }
  }

  const raw = new FixFlowDexie()

  /**
   * Cached so the seed can never run twice. React StrictMode double-invokes
   * effects in development, and two concurrent `count() === 0` checks would
   * both decide to seed — doubling every opening balance.
   */
  let seeding: Promise<void> | null = null

  async function writeMovement(a: StockAdjust): Promise<StockMovementT> {
    const product = await raw.products.get(a.productId)
    if (!product) throw new Error(`adjustStock: no product ${a.productId}`)

    if (a.qty === 0) throw new Error('A stock movement needs a quantity other than zero.')

    /**
     * §28.17 — a manual adjustment is the one movement type with no other
     * transaction behind it. Sales, purchases and repairs each carry their own
     * reference, so the reason *is* the only record of why the number moved.
     * Without it the ledger says "stock changed" and nothing more.
     */
    if (a.type === 'adjustment' && !a.reason?.trim()) {
      throw new Error('A stock adjustment needs a reason — damaged, counted, returned, written off.')
    }

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

  /**
   * Next sequence number for a repair's history. Read inside the caller's
   * transaction so two concurrent moves cannot claim the same number.
   */
  async function nextHistorySeq(repairId: string): Promise<number> {
    const existing = await raw.repairHistory.where('repairId').equals(repairId).toArray()
    return existing.reduce((max, e) => Math.max(max, e.seq), -1) + 1
  }

  /** Next receipt number for a branch, e.g. POS-CMB-2026-0001. */
  async function nextReceiptNumber(branchId: string, year = new Date().getFullYear()): Promise<string> {
    const branch = await raw.branches.get(branchId)
    const code = (branch?.code ?? 'BR').toUpperCase()
    const prefix = `POS-${code}-${year}-`
    const all = await raw.sales.toArray()
    const highest = all
      .filter((sale) => sale.receiptNumber.startsWith(prefix))
      .reduce((max, sale) => Math.max(max, Number(sale.receiptNumber.slice(prefix.length)) || 0), 0)
    return `${prefix}${String(highest + 1).padStart(4, '0')}`
  }

  /** Next estimate number for a branch, e.g. EST-CMB-2026-0001. */
  async function nextEstimateNumber(branchId: string, year = new Date().getFullYear()): Promise<string> {
    const branch = await raw.branches.get(branchId)
    const code = (branch?.code ?? 'BR').toUpperCase()
    const prefix = `EST-${code}-${year}-`
    const all = await raw.estimates.toArray()
    const highest = all
      .filter((e) => e.estimateNumber.startsWith(prefix))
      .reduce((max, e) => Math.max(max, Number(e.estimateNumber.slice(prefix.length)) || 0), 0)
    return `${prefix}${String(highest + 1).padStart(4, '0')}`
  }

  async function nextInvoiceNumber(branchId: string, year = new Date().getFullYear()): Promise<string> {
    const branch = await raw.branches.get(branchId)
    const code = (branch?.code ?? 'BR').toUpperCase()
    const prefix = `INV-${code}-${year}-`
    const all = await raw.invoices.toArray()
    const highest = all
      .filter((i) => i.invoiceNumber.startsWith(prefix))
      .reduce((max, i) => Math.max(max, Number(i.invoiceNumber.slice(prefix.length)) || 0), 0)
    return `${prefix}${String(highest + 1).padStart(4, '0')}`
  }

  /**
   * §28.8 — `Balance Due = Invoice Total - Successful Payments - Credits`.
   * Derived here on every read rather than stored, so it can never drift out of
   * agreement with the payments it comes from.
   */
  async function withBalance(invoice: Invoice): Promise<InvoiceWithBalance> {
    const rows = await raw.payments.where('invoiceId').equals(invoice.id).toArray()
    const due = balanceDue(invoice.total, rows)
    return {
      ...invoice,
      balanceDue: due,
      paidTotal: rows
        .filter((pay) => pay.status === 'paid')
        .reduce((sum, pay) => sum + pay.amount, 0),
    }
  }

  /** Recomputes and stores an invoice's status from its payments. */
  async function resettle(invoiceId: string): Promise<void> {
    const invoice = await raw.invoices.get(invoiceId)
    if (!invoice) return
    const rows = await raw.payments.where('invoiceId').equals(invoiceId).toArray()
    const status = invoiceStatusFor(invoice.total, balanceDue(invoice.total, rows))
    if (status !== invoice.status) await raw.invoices.update(invoiceId, { status })
  }

  const repository: Db = {
    ready() {
      seeding ??= (async () => {
        const count = await raw.products.count()
        if (count > 0) return
        // Array form: the positional overload caps at seven tables, and the
        // seed now writes eight.
        await raw.transaction(
          'rw',
          [raw.products, raw.movements, raw.branches, raw.users, raw.customers, raw.devices, raw.repairs, raw.repairHistory],
          async () => {
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
            // Business entities seed in the same transaction, so a failure
            // cannot leave a half-populated database behind (§28.15).
            await raw.branches.bulkAdd(seedBranches)
            await raw.users.bulkAdd(seedUsers)
            await raw.customers.bulkAdd(seedCustomers)
            await raw.devices.bulkAdd(seedDevices)
            await raw.repairs.bulkAdd(seedRepairs)
            await raw.repairHistory.bulkAdd(seedRepairHistory)
          },
        )
      })()
      return seeding
    },

    products: {
      list: () => raw.products.toArray(),
      get: (id) => raw.products.get(id),
      findBySku: (sku, branchId) =>
        raw.products.where('sku').equals(sku).and((p) => p.branchId === branchId).first(),

      async create(input: ProductInput) {
        const dupe = await repository.products.findBySku(input.sku, input.branchId)
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

      async reserve(productId: string, quantity: number, repairId: string): Promise<StockReservation> {
        const qty = Math.round(quantity)
        if (!Number.isInteger(qty) || qty <= 0) {
          throw new Error('Reserve a positive whole number of units.')
        }
        return raw.transaction('rw', [raw.products, raw.reservations], async () => {
          const product = await raw.products.get(productId)
          if (!product) throw new Error(`No product ${productId}`)
          const available = product.stockOnHand - product.reserved
          if (qty > available) {
            throw new Error(`Cannot reserve ${qty} of "${product.name}" — only ${available} available.`)
          }
          const reservation: StockReservation = {
            id: newId('rsv'),
            productId,
            repairId,
            quantity: qty,
            createdAt: nowIso(),
          }
          await raw.reservations.add(reservation)
          await raw.products.update(productId, { reserved: product.reserved + qty, updatedAt: nowIso() })
          return reservation
        })
      },

      async releaseReservation(repairId: string): Promise<void> {
        await raw.transaction('rw', [raw.products, raw.reservations], async () => {
          const held = await raw.reservations.where('repairId').equals(repairId).toArray()
          for (const r of held) {
            const product = await raw.products.get(r.productId)
            if (product) {
              await raw.products.update(r.productId, {
                reserved: Math.max(0, product.reserved - r.quantity),
                updatedAt: nowIso(),
              })
            }
            await raw.reservations.delete(r.id)
          }
        })
      },

      reservations: (productId?: string) =>
        productId
          ? raw.reservations.where('productId').equals(productId).toArray()
          : raw.reservations.toArray(),

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

    // --- business entities -------------------------------------------------

    branches: {
      list: () => raw.branches.toArray(),
      get: (id) => raw.branches.get(id),
    },

    users: {
      list: () => raw.users.toArray(),
      get: (id) => raw.users.get(id),
      byRole: (role) => raw.users.where('role').equals(role).toArray(),
      async technicians(branchId) {
        const all = await raw.users.where('role').equals('technician').toArray()
        return all.filter(
          (u) => u.active && (!branchId || u.branchId === branchId || u.branchId === 'all'),
        )
      },
    },

    customers: {
      list: () => raw.customers.toArray(),
      get: (id) => raw.customers.get(id),

      async create(input: CustomerInput): Promise<Customer> {
        const phone = input.phone.trim()
        if (!phone) throw new Error('A customer needs a phone number.')
        const dupe = await raw.customers.where('phone').equals(phone).first()
        if (dupe) throw new Error(`A customer with phone ${phone} already exists (${dupe.fullName}).`)

        const id = newId('cus')
        const customer: Customer = {
          ...input,
          id,
          // Sequential code is cosmetic; the portal token is the real handle.
          code: `C-${String(Date.now()).slice(-5)}`,
          portalToken: `ptk_${id}_${Math.random().toString(36).slice(2, 10)}${Math.random().toString(36).slice(2, 10)}`,
          createdAt: nowIso(),
        }
        await raw.customers.add(customer)
        return customer
      },

      async update(id: string, patch: Partial<CustomerInput>): Promise<Customer> {
        const existing = await raw.customers.get(id)
        if (!existing) throw new Error(`No customer ${id}`)
        // Apply the patch, then re-assert the identity fields from the stored
        // record. CustomerInput cannot name them at the type level, but a
        // runtime caller could still smuggle one in; the portal token is the
        // customer's only credential, so it must never be reassignable here.
        const updated: Customer = {
          ...existing,
          ...patch,
          id: existing.id,
          code: existing.code,
          portalToken: existing.portalToken,
          createdAt: existing.createdAt,
        }
        await raw.customers.put(updated)
        return updated
      },

      async search(term: string): Promise<Customer[]> {
        const needle = term.trim().toLowerCase()
        if (!needle) return []
        const all = await raw.customers.toArray()
        return all.filter((c) =>
          `${c.fullName} ${c.phone} ${c.email} ${c.code}`.toLowerCase().includes(needle),
        )
      },

      byPortalToken: (token) =>
        token ? raw.customers.where('portalToken').equals(token).first() : Promise.resolve(undefined),
    },

    devices: {
      list: () => raw.devices.toArray(),
      forCustomer: (customerId) => raw.devices.where('customerId').equals(customerId).toArray(),
      get: (id) => raw.devices.get(id),
      async create(input: DeviceInput): Promise<Device> {
        if (!input.brand.trim() || !input.model.trim()) {
          throw new Error('A device needs a brand and a model.')
        }
        const device: Device = { ...input, id: newId('dev'), createdAt: nowIso() }
        await raw.devices.add(device)
        return device
      },
    },

    repairs: {
      async list(filter: RepairFilter = {}): Promise<RepairJob[]> {
        let rows = await raw.repairs.toArray()
        if (filter.branchId) rows = rows.filter((r) => r.branchId === filter.branchId)
        if (filter.status) rows = rows.filter((r) => r.status === filter.status)
        if (filter.customerId) rows = rows.filter((r) => r.customerId === filter.customerId)
        if (filter.technicianId) rows = rows.filter((r) => r.technicianId === filter.technicianId)
        if (filter.search) {
          const needle = filter.search.trim().toLowerCase()
          rows = rows.filter((r) =>
            `${r.jobNumber} ${r.customerName} ${r.deviceSummary} ${r.serialNumber} ${r.reportedIssue}`
              .toLowerCase()
              .includes(needle),
          )
        }
        rows.sort((a, b) => (a.receivedAt < b.receivedAt ? 1 : -1))
        return filter.limit ? rows.slice(0, filter.limit) : rows
      },

      get: (id) => raw.repairs.get(id),

      async create(input: RepairInput): Promise<RepairJob> {
        const branch = await raw.branches.get(input.branchId)
        if (!branch) throw new Error(`Unknown branch ${input.branchId}`)
        const customer = await raw.customers.get(input.customerId)
        if (!customer) throw new Error(`Unknown customer ${input.customerId}`)
        if (!input.reportedIssue.trim()) throw new Error('Describe the reported issue.')

        const now = nowIso()
        const id = newId('rep')
        const jobNumber = await repository.repairs.nextJobNumber(input.branchId)
        const job: RepairJob = { ...input, id, jobNumber, createdAt: now, updatedAt: now }

        // The job and its first history entry commit together, so a repair can
        // never exist without an audit trail (§28.17).
        await raw.transaction('rw', raw.repairs, raw.repairHistory, async () => {
          await raw.repairs.add(job)
          await raw.repairHistory.add({
            id: newId('rsh'),
            repairId: id,
            from: '',
            to: job.status,
            byUserId: 'system',
            note: 'Repair job created.',
            at: now,
            seq: await nextHistorySeq(id),
          })
        })
        return job
      },

      async changeStatus(id: string, to: RepairStatus, actorId: string, note?: string): Promise<RepairJob> {
        return raw.transaction('rw', [raw.repairs, raw.repairHistory, raw.approvals], async () => {
          const job = await raw.repairs.get(id)
          if (!job) throw new Error(`No repair ${id}`)
          // Validated before writing — §28.10.
          assertRepairTransition(job.status, to)

          // §28.13 / §9 — repairing, testing and completed require a recorded
          // customer approval. Without this gate the statuses exist but mean
          // nothing, and work could start on a quote nobody agreed to.
          if (STATUSES_REQUIRING_APPROVAL.includes(to)) {
            const approvals = await raw.approvals.where('repairId').equals(id).toArray()
            const gate = canStartWork(
              to,
              approvals.some((a) => a.decision === 'approved'),
              false,
            )
            if (!gate.allowed) throw new Error(gate.reason)
          }

          const now = nowIso()
          const updated: RepairJob = { ...job, status: to, updatedAt: now }
          await raw.repairs.put(updated)
          await raw.repairHistory.add({
            id: newId('rsh'),
            repairId: id,
            from: job.status,
            to,
            byUserId: actorId,
            note: note?.trim() || `Moved to ${REPAIR_STATUS_LABEL[to]}.`,
            at: now,
            seq: await nextHistorySeq(id),
          })
          return updated
        })
      },

      async assignTechnician(id: string, technicianId: string, actorId: string): Promise<RepairJob> {
        const tech = await raw.users.get(technicianId)
        if (!tech) throw new Error(`No technician ${technicianId}`)
        if (tech.role !== 'technician') throw new Error(`${tech.fullName} is not a technician.`)

        return raw.transaction('rw', raw.repairs, raw.repairHistory, async () => {
          const job = await raw.repairs.get(id)
          if (!job) throw new Error(`No repair ${id}`)
          const now = nowIso()
          const updated: RepairJob = { ...job, technicianId, updatedAt: now }
          await raw.repairs.put(updated)
          await raw.repairHistory.add({
            id: newId('rsh'),
            repairId: id,
            from: job.status,
            to: job.status,
            byUserId: actorId,
            note: `Assigned to ${tech.fullName}.`,
            at: now,
            seq: await nextHistorySeq(id),
          })
          return updated
        })
      },

      async update(id: string, patch: Partial<RepairInput>): Promise<RepairJob> {
        const existing = await raw.repairs.get(id)
        if (!existing) throw new Error(`No repair ${id}`)
        const updated: RepairJob = { ...existing, ...patch, id, jobNumber: existing.jobNumber, updatedAt: nowIso() }
        await raw.repairs.put(updated)
        return updated
      },

      history: (id) => raw.repairHistory.where('repairId').equals(id).sortBy('seq'),

      async nextJobNumber(branchId: string, year = new Date().getFullYear()): Promise<string> {
        const branch = await raw.branches.get(branchId)
        const prefix = `FX-${year}-`
        const all = await raw.repairs.toArray()
        const highest = all
          .filter((r) => r.jobNumber.startsWith(prefix))
          .reduce((max, r) => Math.max(max, Number(r.jobNumber.slice(prefix.length)) || 0), 0)
        void branch
        return `${prefix}${String(highest + 1).padStart(6, '0')}`
      },

      /**
       * §28.3 — consume a part on a repair.
       *
       * Stock comes off and a `repair_use` movement is written in the same
       * transaction, so the shelf count and the ledger can never disagree about
       * whether the part left. If a reservation exists for this repair and
       * product, the consumed quantity is released from it at the same time:
       * the unit is gone from the building, and leaving it counted as held
       * would understate what is actually sellable.
       */
      async addPart(input: RepairPartInput): Promise<RepairPartUsage> {
        // Validated before any rounding: rounding first would silently turn 1.5
        // into 2 and consume a part nobody asked for.
        if (!Number.isInteger(input.quantity) || input.quantity <= 0) {
          throw new Error('Enter a whole number of units greater than zero.')
        }
        const quantity = input.quantity

        return raw.transaction(
          'rw',
          [raw.repairParts, raw.repairs, raw.products, raw.movements, raw.reservations, raw.auditLog, raw.users],
          async () => {
            const repair = await raw.repairs.get(input.repairId)
            if (!repair) throw new Error(`No repair ${input.repairId}`)

            const product = await raw.products.get(input.productId)
            if (!product) throw new Error(`No product ${input.productId}`)
            if (product.isService) throw new Error(`"${product.name}" is a service, not a part.`)

            // Available, not on hand: units held for another repair are spoken
            // for, and consuming one here would double-sell it (§28.3).
            const available = product.stockOnHand - product.reserved
            if (quantity > available) {
              throw new Error(
                `Only ${available} of "${product.name}" available — ${product.reserved} of ` +
                  `${product.stockOnHand} on hand is reserved for other repairs.`,
              )
            }

            const now = nowIso()
            const usage: RepairPartUsage = {
              id: newId('rpu'),
              repairId: repair.id,
              productId: product.id,
              productName: product.name,
              quantity,
              unitCost: product.costCents,
              addedBy: input.actorId,
              createdAt: now,
            }

            // Release this repair's reservation first, so the unit leaving is
            // the unit that was held for it rather than somebody else's.
            const held = await raw.reservations
              .where('repairId').equals(repair.id)
              .filter((r) => r.productId === product.id)
              .toArray()
            let toRelease = quantity
            let reservedAfter = product.reserved
            for (const reservation of held) {
              if (toRelease <= 0) break
              const take = Math.min(reservation.quantity, toRelease)
              if (take === reservation.quantity) {
                await raw.reservations.delete(reservation.id)
              } else {
                await raw.reservations.update(reservation.id, { quantity: reservation.quantity - take })
              }
              reservedAfter -= take
              toRelease -= take
            }

            const before = product.stockOnHand
            const after = before - quantity
            await raw.products.update(product.id, {
              stockOnHand: after,
              reserved: Math.max(0, reservedAfter),
              updatedAt: now,
            })
            await raw.movements.add(
              StockMovement.parse({
                id: newId('mv'),
                productId: product.id,
                branchId: repair.branchId,
                type: 'repair_use',
                qty: -quantity,
                before,
                after,
                reason: `Used on ${repair.jobNumber}`,
                refId: repair.id,
                actorId: input.actorId,
                at: now,
              }),
            )
            await raw.repairParts.add(usage)
            // §23 — stock left the shelf for a repair.
            await raw.auditLog.add({
              id: newId('aud'),
              actorId: input.actorId,
              actorName: (await raw.users.get(input.actorId))?.fullName ?? input.actorId,
              action: 'repair.part_added',
              targetType: 'repair',
              targetId: input.repairId,
              detail: `${quantity} × ${product.name} on ${repair.jobNumber}`,
              branchId: repair.branchId,
              at: nowIso(),
            })
            return usage
          },
        )
      },

      async parts(repairId: string): Promise<RepairPartUsage[]> {
        const rows = await raw.repairParts.where('repairId').equals(repairId).toArray()
        return rows.sort((a, b) => (a.createdAt > b.createdAt ? 1 : -1))
      },

      /**
       * Returns a part to stock. The usage row is kept rather than deleted, so
       * the repair still shows that the part was fitted and then taken back off
       * — deleting it would leave a movement with no explanation.
       */
      async removePart(partUsageId: string, actorId: string): Promise<void> {
        return raw.transaction(
          'rw',
          [raw.repairParts, raw.repairs, raw.products, raw.movements],
          async () => {
            const usage = await raw.repairParts.get(partUsageId)
            if (!usage) throw new Error(`No part usage ${partUsageId}`)
            if (usage.quantity === 0) throw new Error('That part has already been returned to stock.')

            const repair = await raw.repairs.get(usage.repairId)
            const product = await raw.products.get(usage.productId)
            if (!product) throw new Error(`No product ${usage.productId}`)

            const now = nowIso()
            const before = product.stockOnHand
            const after = before + usage.quantity
            await raw.products.update(product.id, { stockOnHand: after, updatedAt: now })
            await raw.movements.add(
              StockMovement.parse({
                id: newId('mv'),
                productId: product.id,
                branchId: repair?.branchId ?? product.branchId,
                type: 'adjustment',
                qty: usage.quantity,
                before,
                after,
                reason: `Returned from ${repair?.jobNumber ?? usage.repairId}`,
                refId: usage.repairId,
                actorId,
                at: now,
              }),
            )
            await raw.repairParts.update(partUsageId, { quantity: 0 })
          },
        )
      },

    // --- point of sale (§10) ------------------------------------------------

    },
    sales: {
      async list(filter: SaleFilter = {}): Promise<Sale[]> {
        let rows = await raw.sales.toArray()
        if (filter.branchId) rows = rows.filter((sale) => sale.branchId === filter.branchId)
        if (filter.cashierId) rows = rows.filter((sale) => sale.cashierId === filter.cashierId)
        if (filter.customerId) rows = rows.filter((sale) => sale.customerId === filter.customerId)
        rows.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
        return filter.limit ? rows.slice(0, filter.limit) : rows
      },

      get: (id) => raw.sales.get(id),

      async checkout(input: CheckoutInput): Promise<Sale> {
        if (!input.lines.length) throw new Error('Add at least one product to the cart.')
        for (const line of input.lines) {
          if (!Number.isInteger(line.quantity) || line.quantity <= 0) {
            throw new Error('Every line needs a positive whole-number quantity.')
          }
        }

        // §28.16 — a retried checkout must not create a second sale. Checked
        // outside the transaction for the fast path and again inside it, so
        // two concurrent retries cannot both get through.
        if (input.idempotencyKey) {
          const prior = await raw.sales.where('idempotencyKey').equals(input.idempotencyKey).first()
          if (prior) return prior
        }

        return raw.transaction('rw', [raw.products, raw.movements, raw.sales, raw.branches, raw.customers], async () => {
          if (input.idempotencyKey) {
            const prior = await raw.sales.where('idempotencyKey').equals(input.idempotencyKey).first()
            if (prior) return prior
          }

          const branch = await raw.branches.get(input.branchId)
          if (!branch) throw new Error(`Unknown branch ${input.branchId}`)
          const customer = input.customerId ? await raw.customers.get(input.customerId) : undefined
          if (input.customerId && !customer) throw new Error(`Unknown customer ${input.customerId}`)

          const ids = input.lines.map((line) => line.productId)
          const products = await raw.products.where('id').anyOf(ids).toArray()
          const byId = new Map(products.map((pr) => [pr.id, pr]))
          for (const id of ids) {
            if (!byId.has(id)) throw new Error(`Unknown product ${id}`)
          }

          // §28.1 / §28.3 — sell from what is AVAILABLE, not merely what is on
          // the shelf, or stock reserved for a repair could be sold twice.
          const availability: Record<string, number> = {}
          for (const [id, pr] of byId) availability[id] = pr.stockOnHand - pr.reserved
          const failures = checkStockAvailability(
            input.lines.map((line) => ({
              productId: line.productId,
              productName: byId.get(line.productId)!.name,
              quantity: line.quantity,
            })),
            availability,
          )
          if (failures.length) {
            const detail = failures
              .map((f) => `${f.productName} (${f.requested} requested, ${f.available} available)`)
              .join('; ')
            throw new Error(`Insufficient stock: ${detail}`)
          }

          const items: SaleItem[] = input.lines.map((line) => {
            const pr = byId.get(line.productId)!
            return {
              id: newId('sli'),
              productId: pr.id,
              productName: pr.name,
              quantity: line.quantity,
              unitPrice: pr.priceCents,
              unitCost: pr.costCents,
              lineTotal: pr.priceCents * line.quantity,
            }
          })

          const totals = computeDocument(
            { labourCost: 0, partsCost: sumLines(items), discount: input.discount ?? 0, taxRate: input.taxRate ?? 0 },
            input.taxEnabled ?? true,
          )

          const saleId = newId('sal')
          const now = nowIso()
          const sale: Sale = {
            id: saleId,
            receiptNumber: await nextReceiptNumber(input.branchId),
            branchId: input.branchId,
            customerId: input.customerId ?? '',
            customerName: customer?.fullName ?? '',
            items,
            subtotal: totals.gross,
            discount: totals.discount,
            taxRate: totals.taxRate,
            taxAmount: totals.taxAmount,
            total: totals.total,
            amountPaid: input.amountPaid ?? totals.total,
            paymentMethod: input.paymentMethod,
            cashierId: input.cashierId,
            refundedFromSaleId: '',
            idempotencyKey: input.idempotencyKey ?? '',
            createdAt: now,
          }

          // §28.2 — every stock change names the transaction that caused it.
          for (const line of input.lines) {
            const pr = byId.get(line.productId)!
            const before = pr.stockOnHand
            const after = before - line.quantity
            await raw.products.update(pr.id, { stockOnHand: after, updatedAt: now })
            await raw.movements.add(
              StockMovement.parse({
                id: newId('mv'),
                productId: pr.id,
                branchId: input.branchId,
                type: 'sale_out',
                qty: -line.quantity,
                before,
                after,
                reason: `Sale ${sale.receiptNumber}`,
                refId: saleId,
                actorId: input.cashierId,
                at: now,
              }),
            )
          }

          await raw.sales.add(sale)
          return sale
        })
      },

      async refund(saleId: string, input: RefundInput): Promise<Refund> {
        if (!input.reason.trim()) throw new Error('A refund needs a reason.')

        return raw.transaction('rw', [raw.sales, raw.refunds, raw.products, raw.movements, raw.auditLog, raw.users], async () => {
          const sale = await raw.sales.get(saleId)
          if (!sale) throw new Error(`No sale ${saleId}`)

          // §28.6 — a refund is bounded by what was actually paid on the
          // original sale, less anything already refunded.
          const prior = await raw.refunds.where('originalSaleId').equals(saleId).toArray()
          const alreadyRefunded = prior.reduce((sum, r) => sum + r.amount, 0)
          const refundable = Math.max(0, sale.amountPaid - alreadyRefunded)
          const amount = input.amount ?? refundable
          if (amount <= 0) throw new Error('Enter a refund amount greater than zero.')
          if (amount > refundable) {
            throw new Error(
              `Cannot refund Rs. ${(amount / 100).toFixed(2)} — only Rs. ${(refundable / 100).toFixed(2)} remains on this sale.`,
            )
          }

          const now = nowIso()
          const refund: Refund = {
            id: newId('rfd'),
            originalSaleId: saleId,
            invoiceId: '',
            amount,
            reason: input.reason.trim(),
            approvedBy: input.approvedBy,
            createdAt: now,
          }

          if (input.restoreStock !== false) {
            for (const item of sale.items) {
              const pr = await raw.products.get(item.productId)
              if (!pr) continue
              const before = pr.stockOnHand
              const after = before + item.quantity
              await raw.products.update(pr.id, { stockOnHand: after, updatedAt: now })
              await raw.movements.add(
                StockMovement.parse({
                  id: newId('mv'),
                  productId: pr.id,
                  branchId: sale.branchId,
                  type: 'adjustment',
                  qty: item.quantity,
                  before,
                  after,
                  reason: `Return against ${sale.receiptNumber}`,
                  refId: refund.id,
                  actorId: input.approvedBy,
                  at: now,
                }),
              )
            }
          }

          // §28.18 — the original sale is never edited or deleted.
          await raw.refunds.add(refund)
          // §23 — money leaving the till is exactly what the trail exists for.
          await raw.auditLog.add({
            id: newId('aud'),
            actorId: input.approvedBy,
            actorName: (await raw.users.get(input.approvedBy))?.fullName ?? input.approvedBy,
            action: 'sale.refunded',
            targetType: 'sale',
            targetId: saleId,
            detail: `Refunded Rs. ${(amount / 100).toFixed(2)}${input.restoreStock ? ', stock restored' : ', stock kept'}. Reason: ${input.reason}`,
            branchId: sale.branchId,
            at: nowIso(),
          })
          return refund
        })
      },

      nextReceiptNumber,
    },

    refunds: {
      list: () => raw.refunds.orderBy('createdAt').reverse().toArray(),
      forSale: (saleId) => raw.refunds.where('originalSaleId').equals(saleId).toArray(),
    },

    // --- estimates and approvals (§9) --------------------------------------

    estimates: {
      async list(filter: { repairId?: string; customerId?: string; branchId?: string; status?: EstimateStatus } = {}) {
        let rows = await raw.estimates.toArray()
        if (filter.repairId) rows = rows.filter((e) => e.repairId === filter.repairId)
        if (filter.customerId) rows = rows.filter((e) => e.customerId === filter.customerId)
        if (filter.branchId) rows = rows.filter((e) => e.branchId === filter.branchId)
        if (filter.status) rows = rows.filter((e) => e.status === filter.status)
        return rows.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
      },

      get: (id) => raw.estimates.get(id),

      async create(input: EstimateInput): Promise<Estimate> {
        return raw.transaction('rw', [raw.estimates, raw.repairs, raw.branches, raw.customers], async () => {
          const repair = await raw.repairs.get(input.repairId)
          if (!repair) throw new Error(`No repair ${input.repairId}`)

          const items: EstimateItem[] = input.items.map((line) => {
            // Validated before any rounding: rounding first would silently turn
            // 1.5 into 2 and bill for a part the caller never asked for.
            if (!Number.isInteger(line.quantity) || line.quantity <= 0) {
              throw new Error(`"${line.description}" needs a positive whole-number quantity.`)
            }
            const qty = line.quantity
            if (!line.description.trim()) throw new Error('Every estimate line needs a description.')
            return {
              id: newId('esi'),
              productId: line.productId ?? '',
              description: line.description.trim(),
              quantity: qty,
              unitPrice: line.unitPrice,
              lineTotal: line.unitPrice * qty,
            }
          })
          if (!items.length && !(input.labourCost ?? 0)) {
            throw new Error('An estimate needs at least one line or a labour charge.')
          }

          const totals = computeDocument(
            {
              labourCost: input.labourCost ?? 0,
              partsCost: sumLines(items),
              discount: input.discount ?? 0,
              taxRate: input.taxRate ?? 0,
            },
            input.taxEnabled ?? true,
          )

          const estimate: Estimate = {
            id: newId('est'),
            estimateNumber: await nextEstimateNumber(repair.branchId),
            repairId: repair.id,
            customerId: repair.customerId,
            branchId: repair.branchId,
            items,
            labourCost: input.labourCost ?? 0,
            discount: totals.discount,
            taxRate: totals.taxRate,
            taxAmount: totals.taxAmount,
            total: totals.total,
            status: 'draft',
            notes: input.notes ?? '',
            supersededBy: '',
            expiresAt: input.expiresAt ?? '',
            createdAt: nowIso(),
          }
          await raw.estimates.add(estimate)
          return estimate
        })
      },

      async send(id: string, actorId: string): Promise<Estimate> {
        return raw.transaction('rw', [raw.estimates, raw.auditLog, raw.users], async () => {
          const estimate = await raw.estimates.get(id)
          if (!estimate) throw new Error(`No estimate ${id}`)
          if (!canTransitionEstimate(estimate.status, 'sent')) {
            throw new Error(
              `An estimate that is ${ESTIMATE_STATUS_LABEL[estimate.status]} cannot be sent.`,
            )
          }
          const next: Estimate = { ...estimate, status: 'sent' }
          await raw.estimates.put(next)
          // §23 — an estimate going to a customer is a promise being made.
          await raw.auditLog.add({
            id: newId('aud'),
            actorId,
            actorName: (await raw.users.get(actorId))?.fullName ?? actorId,
            action: 'estimate.sent',
            targetType: 'estimate',
            targetId: id,
            detail: `${estimate.estimateNumber} sent for Rs. ${(estimate.total / 100).toFixed(2)}`,
            branchId: estimate.branchId,
            at: nowIso(),
          })
          return next
        })
      },

      async decide(id: string, input: ApprovalInput) {
        if (input.decision !== 'approved' && input.decision !== 'rejected') {
          throw new Error('A decision must be approved or rejected.')
        }
        if (input.decision === 'rejected' && !input.note?.trim()) {
          throw new Error('Record why the customer rejected the estimate.')
        }

        return raw.transaction(
          'rw',
          [raw.estimates, raw.approvals, raw.repairs, raw.repairHistory],
          async () => {
            const estimate = await raw.estimates.get(id)
            if (!estimate) throw new Error(`No estimate ${id}`)

            // §28.13 — only a sent estimate can be decided on.
            if (!canRecordApproval(estimate.status)) {
              throw new Error(
                `Only a sent estimate can be approved or rejected; this one is ${ESTIMATE_STATUS_LABEL[estimate.status]}.`,
              )
            }

            const now = nowIso()
            const approval: CustomerApproval = {
              id: newId('apv'),
              estimateId: estimate.id,
              repairId: estimate.repairId,
              customerId: estimate.customerId,
              decision: input.decision,
              method: input.method,
              recordedBy: input.recordedBy,
              note: input.note?.trim() ?? '',
              at: now,
            }
            await raw.approvals.add(approval)

            const nextStatus: EstimateStatus = input.decision === 'approved' ? 'approved' : 'rejected'
            const next: Estimate = { ...estimate, status: nextStatus }
            await raw.estimates.put(next)

            // Move the repair on, but only when that move is legal for where it
            // currently sits. Recording the approval must not fail because the
            // repair is somewhere the workflow does not allow a jump from.
            const repair = await raw.repairs.get(estimate.repairId)
            if (repair && input.decision === 'approved' && repair.status === 'waiting_for_approval') {
              await raw.repairs.update(repair.id, { status: 'approved' })
              await raw.repairHistory.add({
                id: newId('fxh'),
                repairId: repair.id,
                from: repair.status,
                to: 'approved',
                byUserId: input.recordedBy,
                note: `Estimate ${estimate.estimateNumber} approved`,
                at: now,
                seq: await nextHistorySeq(repair.id),
              })
            }

            return { estimate: next, approval }
          },
        )
      },

      async revise(id: string, input: EstimateInput): Promise<Estimate> {
        // The nested create reads the repair, branch and customer, so all of
        // them must be in this transaction or Dexie refuses the subtransaction.
        return raw.transaction(
          'rw',
          [raw.estimates, raw.repairs, raw.branches, raw.customers],
          async () => {
          const prior = await raw.estimates.get(id)
          if (!prior) throw new Error(`No estimate ${id}`)
          // §9 — only a draft, rejected or expired estimate can be revised.
          assertEstimateRevision(prior.status)

          const revision = await repository.estimates.create({ ...input, repairId: prior.repairId })
          const closed: Estimate = { ...prior, status: 'revised', supersededBy: revision.id }
          await raw.estimates.put(closed)
          return revision
          },
        )
      },

      nextEstimateNumber,
    },

    invoices: {
      async list(filter: { branchId?: string; customerId?: string; status?: InvoiceStatus } = {}) {
        let rows = await raw.invoices.toArray()
        if (filter.branchId) rows = rows.filter((i) => i.branchId === filter.branchId)
        if (filter.customerId) rows = rows.filter((i) => i.customerId === filter.customerId)
        if (filter.status) rows = rows.filter((i) => i.status === filter.status)
        rows.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
        return Promise.all(rows.map(withBalance))
      },

      async get(id: string): Promise<InvoiceWithBalance | undefined> {
        const invoice = await raw.invoices.get(id)
        return invoice ? withBalance(invoice) : undefined
      },

      async create(input: InvoiceInput): Promise<InvoiceWithBalance> {
        return raw.transaction('rw', [raw.invoices, raw.payments, raw.repairs, raw.sales, raw.branches], async () => {
          const repair = await raw.repairs.get(input.repairId)
          if (!repair) throw new Error(`No repair ${input.repairId}`)

          if (input.saleId) {
            const sale = await raw.sales.get(input.saleId)
            if (!sale) throw new Error(`No sale ${input.saleId}`)
            if (sale.branchId !== repair.branchId) {
              throw new Error('That sale belongs to a different branch than the repair.')
            }
          }

          const items: EstimateItem[] = input.items.map((line) => {
            // Validated before any rounding: rounding first would silently turn
            // 1.5 into 2 and bill for a part the caller never asked for.
            if (!Number.isInteger(line.quantity) || line.quantity <= 0) {
              throw new Error(`"${line.description}" needs a positive whole-number quantity.`)
            }
            const qty = line.quantity
            if (!line.description.trim()) throw new Error('Every invoice line needs a description.')
            return {
              id: newId('ini'),
              productId: line.productId ?? '',
              description: line.description.trim(),
              quantity: qty,
              unitPrice: line.unitPrice,
              lineTotal: line.unitPrice * qty,
            }
          })
          if (!items.length && !(input.labourCost ?? 0)) {
            throw new Error('An invoice needs at least one line or a labour charge.')
          }

          const totals = computeDocument(
            {
              labourCost: input.labourCost ?? 0,
              partsCost: sumLines(items),
              discount: input.discount ?? 0,
              taxRate: input.taxRate ?? 0,
            },
            input.taxEnabled ?? true,
          )

          const invoice: Invoice = {
            id: newId('inv'),
            invoiceNumber: await nextInvoiceNumber(repair.branchId),
            branchId: repair.branchId,
            customerId: repair.customerId,
            repairId: repair.id,
            saleId: input.saleId ?? '',
            items,
            labourCost: input.labourCost ?? 0,
            subtotal: totals.gross,
            discount: totals.discount,
            taxRate: totals.taxRate,
            taxAmount: totals.taxAmount,
            total: totals.total,
            status: 'draft',
            createdAt: nowIso(),
          }
          await raw.invoices.add(invoice)
          return withBalance(invoice)
        })
      },

      async issue(id: string, actorId: string): Promise<InvoiceWithBalance> {
        return raw.transaction('rw', [raw.invoices, raw.payments, raw.auditLog, raw.users], async () => {
          const invoice = await raw.invoices.get(id)
          if (!invoice) throw new Error(`No invoice ${id}`)
          if (invoice.status !== 'draft') {
            throw new Error(`An invoice that is ${invoice.status.replace('_', ' ')} cannot be issued.`)
          }
          const next: Invoice = { ...invoice, status: 'issued' }
          await raw.invoices.put(next)
          // §23 — issuing an invoice creates a receivable.
          await raw.auditLog.add({
            id: newId('aud'),
            actorId,
            actorName: (await raw.users.get(actorId))?.fullName ?? actorId,
            action: 'invoice.issued',
            targetType: 'invoice',
            targetId: id,
            detail: `${invoice.invoiceNumber} issued for Rs. ${(invoice.total / 100).toFixed(2)}`,
            branchId: invoice.branchId,
            at: nowIso(),
          })
          return withBalance(next)
        })
      },

      async cancel(id: string, actorId: string, reason: string): Promise<InvoiceWithBalance> {
        if (!reason.trim()) throw new Error('Record why the invoice is being voided.')
        return raw.transaction('rw', [raw.invoices, raw.payments, raw.auditLog, raw.users], async () => {
          const invoice = await raw.invoices.get(id)
          if (!invoice) throw new Error(`No invoice ${id}`)
          if (invoice.status === 'cancelled') throw new Error('That invoice is already voided.')

          const paid = await raw.payments.where('invoiceId').equals(id).toArray()
          const settled = paid
            .filter((pay) => pay.status === 'paid')
            .reduce((sum, pay) => sum + pay.amount, 0)
          if (settled > 0) {
            throw new Error(
              `Cannot void an invoice with Rs. ${(settled / 100).toFixed(2)} of payments recorded against it. ` +
                'Reverse the payments first, so the history stays intact.',
            )
          }

          // §28.18 — the row and its payments are preserved, never deleted.
          const next: Invoice = { ...invoice, status: 'cancelled' }
          await raw.invoices.put(next)
          // §23 — voiding an invoice removes a receivable; that needs a name
          // against it.
          await raw.auditLog.add({
            id: newId('aud'),
            actorId,
            actorName: (await raw.users.get(actorId))?.fullName ?? actorId,
            action: 'invoice.voided',
            targetType: 'invoice',
            targetId: id,
            detail: `${invoice.invoiceNumber} voided. Reason: ${reason}`,
            branchId: invoice.branchId,
            at: nowIso(),
          })
          return withBalance(next)
        })
      },

      nextInvoiceNumber,
    },

    payments: {
      async forInvoice(invoiceId: string): Promise<Payment[]> {
        const rows = await raw.payments.where('invoiceId').equals(invoiceId).toArray()
        return rows.sort((a, b) => (a.paidAt > b.paidAt ? 1 : -1))
      },

      async list(filter: { branchId?: string; customerId?: string; status?: PaymentStatus } = {}) {
        let rows = await raw.payments.toArray()
        if (filter.branchId) rows = rows.filter((pay) => pay.branchId === filter.branchId)
        if (filter.customerId) rows = rows.filter((pay) => pay.customerId === filter.customerId)
        if (filter.status) rows = rows.filter((pay) => pay.status === filter.status)
        return rows.sort((a, b) => (a.paidAt < b.paidAt ? 1 : -1))
      },

      async record(input: PaymentInput): Promise<Payment> {
        const amount = Math.round(input.amount)
        if (!Number.isInteger(amount) || amount <= 0) {
          throw new Error('Enter a payment amount greater than zero.')
        }

        return raw.transaction('rw', [raw.invoices, raw.payments, raw.auditLog, raw.users], async () => {
          // §28.11 — a payment must reference an invoice.
          const invoice = await raw.invoices.get(input.invoiceId)
          if (!invoice) throw new Error(`No invoice ${input.invoiceId}`)
          if (invoice.status === 'draft') {
            throw new Error('Issue the invoice before recording a payment against it.')
          }
          if (invoice.status === 'cancelled') {
            throw new Error('That invoice has been voided and cannot take a payment.')
          }

          const prior = await raw.payments.where('invoiceId').equals(invoice.id).toArray()
          const due = balanceDue(invoice.total, prior)
          if (amount > due) {
            throw new Error(
              `Cannot record Rs. ${(amount / 100).toFixed(2)} — only ` +
                `Rs. ${(due / 100).toFixed(2)} is still due on this invoice.`,
            )
          }

          const payment: Payment = {
            id: newId('pay'),
            invoiceId: invoice.id,
            customerId: invoice.customerId,
            branchId: invoice.branchId,
            amount,
            method: input.method,
            status: 'paid',
            reference: input.reference?.trim() ?? '',
            receivedBy: input.receivedBy,
            paidAt: nowIso(),
            reversesPaymentId: '',
          }
          // §28.15 — appended. Prior payments are never edited or merged.
          await raw.payments.add(payment)
          await resettle(invoice.id)
          return payment
        })
      },

      async refund(invoiceId: string, paymentId: string, actorId: string): Promise<Payment> {
        return raw.transaction('rw', [raw.invoices, raw.payments, raw.auditLog, raw.users], async () => {
          const original = await raw.payments.get(paymentId)
          if (!original) throw new Error(`No payment ${paymentId}`)
          if (original.invoiceId !== invoiceId) {
            throw new Error('That payment is not on this invoice.')
          }
          if (original.status !== 'paid') {
            throw new Error(`A payment that is ${original.status} cannot be reversed.`)
          }

          const all = await raw.payments.where('invoiceId').equals(invoiceId).toArray()
          const alreadyReversed = all.some((pay) => pay.reversesPaymentId === paymentId)
          if (alreadyReversed) throw new Error('That payment has already been reversed.')

          const reversal: Payment = {
            ...original,
            id: newId('pay'),
            status: 'refunded',
            reference: original.reference,
            receivedBy: actorId,
            paidAt: nowIso(),
            // §28.18 — appended, so the original payment stays on the record.
            reversesPaymentId: original.id,
          }
          await raw.payments.add(reversal)
          await resettle(invoiceId)
          return reversal
        })
      },
    },

    expenses: {
      async list(filter: { branchId?: string; category?: ExpenseCategory; from?: string; to?: string } = {}) {
        let rows = await raw.expenses.toArray()
        if (filter.branchId) rows = rows.filter((e) => e.branchId === filter.branchId)
        if (filter.category) rows = rows.filter((e) => e.category === filter.category)
        if (filter.from) rows = rows.filter((e) => e.spentAt >= filter.from!)
        if (filter.to) rows = rows.filter((e) => e.spentAt <= filter.to!)
        // Excluding reversals would hide the correction; including them nets to
        // zero, which is the point of reversing rather than deleting.
        return rows.sort((a, b) => (a.spentAt < b.spentAt ? 1 : -1))
      },

      async create(input: ExpenseInput): Promise<Expense> {
        const amount = Math.round(input.amount)
        if (!Number.isInteger(amount) || amount <= 0) {
          throw new Error('Enter an expense amount greater than zero.')
        }
        if (!input.description.trim()) throw new Error('An expense needs a description.')
        if (!EXPENSE_CATEGORIES.includes(input.category)) {
          throw new Error(`"${input.category}" is not an expense category.`)
        }
        if (!input.spentAt || Number.isNaN(Date.parse(input.spentAt))) {
          throw new Error('An expense needs a valid date.')
        }
        return raw.transaction('rw', [raw.expenses, raw.auditLog, raw.users], async () => {
          const expense: Expense = {
            id: newId('exp'),
            branchId: input.branchId,
            category: input.category,
            amount,
            description: input.description.trim(),
            method: input.method,
            attachmentUrl: '',
            spentAt: new Date(input.spentAt).toISOString(),
            recordedBy: input.recordedBy,
            createdAt: nowIso(),
          }
          await raw.expenses.add(expense)
          return expense
        })
      },

      async reverse(id: string, actorId: string, reason: string): Promise<Expense> {
        if (!reason.trim()) throw new Error('Record why the expense is being reversed.')
        return raw.transaction('rw', [raw.expenses, raw.auditLog, raw.users], async () => {
          const original = await raw.expenses.get(id)
          if (!original) throw new Error(`No expense ${id}`)
          if (original.amount < 0) throw new Error('That entry is already a reversal.')

          // §28.18 — a correcting entry, never an edit to the original. The
          // negative amount is what makes the pair net to zero in every total.
          const reversal: Expense = {
            ...original,
            id: newId('exp'),
            amount: -original.amount,
            description: `Reversal: ${original.description}`,
            spentAt: nowIso(),
            recordedBy: actorId,
            createdAt: nowIso(),
          }
          await raw.expenses.add(reversal)
          // §23 — a correction to the books leaves the original standing, so
          // the trail has to explain why the pair exists.
          await raw.auditLog.add({
            id: newId('aud'),
            actorId,
            actorName: (await raw.users.get(actorId))?.fullName ?? actorId,
            action: 'expense.reversed',
            targetType: 'expense',
            targetId: id,
            detail: `Reversed Rs. ${(original.amount / 100).toFixed(2)} (${original.description}). Reason: ${reason}`,
            branchId: original.branchId,
            at: nowIso(),
          })
          return reversal
        })
      },

      async total(filter: { branchId?: string; from?: string; to?: string } = {}) {
        const rows = await repository.expenses.list(filter)
        return rows.reduce((sum, e) => sum + e.amount, 0)
      },
    },

    // --- held carts (§10) --------------------------------------------------

    heldSales: {
      async list(branchId?: string) {
        const rows = branchId
          ? await raw.heldSales.where('branchId').equals(branchId).toArray()
          : await raw.heldSales.toArray()
        return rows.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
      },

      get: (id) => raw.heldSales.get(id),

      async hold(input: HoldSaleInput): Promise<HeldSale> {
        const items = input.items
          .map((line) => ({ productId: line.productId, quantity: Math.round(line.quantity) }))
          .filter((line) => line.quantity > 0)
        if (!items.length) throw new Error('There is nothing in the cart to hold.')

        return raw.transaction('rw', [raw.heldSales, raw.branches, raw.products], async () => {
          const branch = await raw.branches.get(input.branchId)
          if (!branch) throw new Error(`Unknown branch ${input.branchId}`)
          for (const line of items) {
            const product = await raw.products.get(line.productId)
            if (!product) throw new Error(`Unknown product ${line.productId}`)
          }

          const held: HeldSale = {
            id: newId('hld'),
            branchId: input.branchId,
            cashierId: input.cashierId,
            customerId: input.customerId ?? '',
            customerName: input.customerName ?? '',
            items,
            discount: input.discount ?? 0,
            note: input.note?.trim() ?? '',
            createdAt: nowIso(),
          }
          await raw.heldSales.add(held)
          return held
        })
      },

      discard: (id) => raw.heldSales.delete(id),
    },

    // --- cash sessions (§10) -----------------------------------------------

    cashSessions: {
      async list(filter: { branchId?: string; status?: 'open' | 'closed' } = {}) {
        let rows = await raw.cashSessions.toArray()
        if (filter.branchId) rows = rows.filter((s) => s.branchId === filter.branchId)
        if (filter.status === 'open') rows = rows.filter((s) => s.closedAt === '')
        if (filter.status === 'closed') rows = rows.filter((s) => s.closedAt !== '')
        return rows.sort((a, b) => (a.openedAt < b.openedAt ? 1 : -1))
      },

      get: (id) => raw.cashSessions.get(id),

      current: (branchId) =>
        raw.cashSessions
          .where('branchId')
          .equals(branchId)
          .filter((s) => s.closedAt === '')
          .first(),

      async open(input: OpenCashSessionInput): Promise<CashSession> {
        const opening = Math.round(input.openingBalance)
        if (!Number.isFinite(opening) || opening < 0) {
          throw new Error('The opening float cannot be negative.')
        }
        return raw.transaction('rw', [raw.cashSessions, raw.branches, raw.users], async () => {
          const branch = await raw.branches.get(input.branchId)
          if (!branch) throw new Error(`Unknown branch ${input.branchId}`)
          const cashier = await raw.users.get(input.cashierId)
          if (!cashier) throw new Error(`Unknown cashier ${input.cashierId}`)

          // One open drawer per branch. Two open sessions would make "expected
          // cash" ambiguous, which is exactly the inconsistency §28.15 forbids.
          const alreadyOpen = await raw.cashSessions
            .where('branchId')
            .equals(input.branchId)
            .filter((s) => s.closedAt === '')
            .first()
          if (alreadyOpen) {
            throw new Error('A cash session is already open at this branch. Close it first.')
          }

          const session: CashSession = {
            id: newId('csh'),
            branchId: input.branchId,
            cashierId: input.cashierId,
            openingBalance: opening,
            closingBalance: null,
            expectedClosingBalance: null,
            note: input.note?.trim() ?? '',
            openedAt: nowIso(),
            closedAt: '',
          }
          await raw.cashSessions.add(session)
          return session
        })
      },

      async expectedCash(id: string): Promise<number> {
        const session = await raw.cashSessions.get(id)
        if (!session) throw new Error(`No cash session ${id}`)

        const openedAt = new Date(session.openedAt).getTime()
        const closedAt = session.closedAt ? new Date(session.closedAt).getTime() : Number.POSITIVE_INFINITY

        const inWindow = (iso: string) => {
          const at = new Date(iso).getTime()
          return !Number.isNaN(at) && at >= openedAt && at <= closedAt
        }

        const sales = await raw.sales.where('branchId').equals(session.branchId).toArray()
        const cashIn = sales
          .filter((sale) => sale.paymentMethod === 'cash' && inWindow(sale.createdAt))
          .reduce((sum, sale) => sum + sale.amountPaid, 0)

        const refunds = await raw.refunds.toArray()
        const saleById = new Map(sales.map((sale) => [sale.id, sale]))
        const cashOut = refunds
          .filter((refund) => {
            const sale = saleById.get(refund.originalSaleId)
            return sale?.paymentMethod === 'cash' && inWindow(refund.createdAt)
          })
          .reduce((sum, refund) => sum + refund.amount, 0)

        return session.openingBalance + cashIn - cashOut
      },

      async close(id: string, input: CloseCashSessionInput): Promise<CashSession> {
        const counted = Math.round(input.countedCash)
        if (!Number.isFinite(counted) || counted < 0) {
          throw new Error('The counted cash cannot be negative.')
        }
        return raw.transaction(
          // expectedCash reads sales and refunds, so both must be in scope or
          // IndexedDB rejects the object store lookup.
          'rw',
          [raw.cashSessions, raw.sales, raw.refunds],
          async () => {
          const session = await raw.cashSessions.get(id)
          if (!session) throw new Error(`No cash session ${id}`)
          if (session.closedAt !== '') {
            throw new Error('That cash session is already closed.')
          }
          const expected = await repository.cashSessions.expectedCash(id)
          const closed: CashSession = {
            ...session,
            closingBalance: counted,
            expectedClosingBalance: expected,
            note: input.note?.trim() || session.note,
            closedAt: nowIso(),
          }
          await raw.cashSessions.put(closed)
          return closed
          },
        )
      },
    },

    approvals: {
      forEstimate: (estimateId) => raw.approvals.where('estimateId').equals(estimateId).toArray(),
      forRepair: (repairId) => raw.approvals.where('repairId').equals(repairId).toArray(),
      async hasApprovalFor(repairId: string) {
        const rows = await raw.approvals.where('repairId').equals(repairId).toArray()
        return rows.some((a) => a.decision === 'approved')
      },
    },

    // §17 — warranty. The dates live on the issued row, never on the policy:
    // editing a product's cover must not reach back and change what somebody
    // has already been given.
    warranty: {
      policies: () => raw.warrantyPolicies.toArray(),

      async addPolicy(input: WarrantyPolicyInput): Promise<WarrantyPolicy> {
        if (!Number.isInteger(input.durationMonths) || input.durationMonths < 0) {
          throw new Error('Cover must be a whole number of months, or zero for none.')
        }
        if (!input.name.trim()) throw new Error('Give the cover terms a name.')
        const policy: WarrantyPolicy = {
          id: newId('wtp'),
          name: input.name.trim(),
          durationMonths: input.durationMonths,
          terms: input.terms,
          exclusions: input.exclusions,
          appliesTo: input.appliesTo,
        }
        await raw.warrantyPolicies.add(policy)
        return policy
      },

      async updatePolicy(id: string, input: WarrantyPolicyInput): Promise<WarrantyPolicy> {
        const existing = await raw.warrantyPolicies.get(id)
        if (!existing) throw new Error(`No cover terms ${id}`)
        if (!Number.isInteger(input.durationMonths) || input.durationMonths < 0) {
          throw new Error('Cover must be a whole number of months, or zero for none.')
        }
        // Only the policy row changes. Issued warranties are untouched, so cover
        // already in force keeps the dates it was sold with.
        const updated: WarrantyPolicy = {
          ...existing,
          name: input.name.trim() || existing.name,
          durationMonths: input.durationMonths,
          terms: input.terms,
          exclusions: input.exclusions,
          appliesTo: input.appliesTo,
        }
        await raw.warrantyPolicies.put(updated)
        return updated
      },

      async issue(input: WarrantyInput): Promise<Warranty> {
        const policy = await raw.warrantyPolicies.get(input.policyId)
        if (!policy) throw new Error(`No cover terms ${input.policyId}`)
        if (policy.durationMonths === 0) {
          // Better refused than issued: a warranty that expires the instant it
          // starts is not cover, and printing one would mislead the customer.
          throw new Error(`${policy.name} provides no cover, so there is nothing to issue.`)
        }
        const customer = await raw.customers.get(input.customerId)
        if (!customer) throw new Error(`No customer ${input.customerId}`)
        if (input.productId) {
          const product = await raw.products.get(input.productId)
          if (!product) throw new Error(`No product ${input.productId}`)
        }
        if (input.repairId) {
          const repair = await raw.repairs.get(input.repairId)
          if (!repair) throw new Error(`No repair ${input.repairId}`)
        }

        const startsAt = input.startsAt ?? nowIso()
        const warranty: Warranty = {
          id: newId('wty'),
          warrantyNumber: await this.nextWarrantyNumber(policy.appliesTo === 'repair_service' ? 'WR' : 'WP'),
          policyId: policy.id,
          customerId: input.customerId,
          productId: input.productId ?? '',
          repairId: input.repairId ?? '',
          startsAt,
          // Stored, not derived at read time. This is what stops a later policy
          // edit from silently changing cover already in force.
          expiresAt: warrantyExpiry(startsAt, policy.durationMonths),
          status: 'active',
          createdAt: nowIso(),
        }
        await raw.warranties.add(warranty)
        return warranty
      },

      list: async () => {
        const rows = await raw.warranties.orderBy('createdAt').reverse().toArray()
        // Status is refreshed on read rather than trusted from the row: cover
        // lapses with the passage of time and nothing writes to the database
        // when that happens.
        return rows.map((w) => ({
          ...w,
          status: w.status === 'void' || w.status === 'claimed'
            ? w.status
            : (isWarrantyActive(w) ? 'active' : 'expired'),
        }))
      },

      get: (id) => raw.warranties.get(id),

      async search(term: string): Promise<Warranty[]> {
        const needle = term.trim().toLowerCase()
        if (!needle) return []
        const [warranties, customers, repairs, products] = await Promise.all([
          raw.warranties.toArray(),
          raw.customers.toArray(),
          raw.repairs.toArray(),
          raw.products.toArray(),
        ])
        const customerIds = new Set(customers.filter((c) => c.phone.toLowerCase().includes(needle) || c.fullName.toLowerCase().includes(needle)).map((c) => c.id))
        const repairIds = new Set(repairs.filter((r) => r.jobNumber.toLowerCase().includes(needle) || r.serialNumber.toLowerCase().includes(needle)).map((r) => r.id))
        const productIds = new Set(products.filter((pr) => pr.sku.toLowerCase().includes(needle) || pr.name.toLowerCase().includes(needle)).map((pr) => pr.id))

        return warranties
          .filter((w) =>
            w.warrantyNumber.toLowerCase().includes(needle)
            || customerIds.has(w.customerId)
            || (w.repairId !== '' && repairIds.has(w.repairId))
            || (w.productId !== '' && productIds.has(w.productId)))
          .map((w) => ({
            ...w,
            status: w.status === 'void' || w.status === 'claimed' ? w.status : (isWarrantyActive(w) ? 'active' : 'expired'),
          }))
      },

      async expiringSoon(withinDays = 30): Promise<Warranty[]> {
        const rows = await raw.warranties.toArray()
        return rows.filter((w) => isWarrantyActive(w) && isWarrantyExpiringSoon(w, new Date(), withinDays))
      },

      async void(warrantyId: string, reason: string, actorId: string): Promise<void> {
        if (!reason.trim()) throw new Error('Record why the cover was withdrawn.')
        const existing = await raw.warranties.get(warrantyId)
        if (!existing) throw new Error(`No warranty ${warrantyId}`)
        if (existing.status === 'void') throw new Error('That cover is already withdrawn.')
        await raw.warranties.update(warrantyId, { status: 'void' })
        // §23 — withdrawing cover from a customer is not a quiet act.
        await raw.auditLog.add({
          id: newId('aud'),
          actorId,
          actorName: (await raw.users.get(actorId))?.fullName ?? actorId,
          action: 'warranty.voided',
          targetType: 'warranty',
          targetId: warrantyId,
          detail: `${existing.warrantyNumber} withdrawn. Reason: ${reason}`,
          branchId: '',
          at: nowIso(),
        })
      },

      claims: async () => raw.warrantyClaims.orderBy('createdAt').reverse().toArray(),
      claim: (id) => raw.warrantyClaims.get(id),
      claimsFor: (warrantyId) => raw.warrantyClaims.where('warrantyId').equals(warrantyId).toArray(),

      async submitClaim(input: WarrantyClaimInput): Promise<WarrantyClaim> {
        if (!input.reportedIssue.trim()) throw new Error('Describe what has gone wrong.')
        const warranty = await raw.warranties.get(input.warrantyId)
        if (!warranty) throw new Error(`No warranty ${input.warrantyId}`)
        if (warranty.status === 'void') throw new Error('That cover was withdrawn, so it cannot be claimed against.')
        // §17 — a claim against lapsed cover is refused here rather than left to
        // be discovered at the counter.
        if (!isWarrantyActive(warranty)) {
          throw new Error(`That cover expired on ${warranty.expiresAt.slice(0, 10)}.`)
        }

        const claim: WarrantyClaim = {
          id: newId('wcl'),
          claimNumber: `WCL-${nowIso().slice(0, 4)}-${String(await raw.warrantyClaims.count() + 1).padStart(4, '0')}`,
          warrantyId: warranty.id,
          customerId: warranty.customerId,
          repairId: input.repairId ?? '',
          reportedIssue: input.reportedIssue.trim(),
          findings: '',
          resolution: '',
          status: 'submitted',
          decidedBy: '',
          createdAt: nowIso(),
          decidedAt: '',
        }
        await raw.warrantyClaims.add(claim)
        return claim
      },

      async inspect(claimId: string, findings: string): Promise<WarrantyClaim> {
        if (!findings.trim()) throw new Error('Record what inspection found.')
        const claim = await raw.warrantyClaims.get(claimId)
        if (!claim) throw new Error(`No claim ${claimId}`)
        if (!canTransitionClaim(claim.status, 'under_inspection')) {
          throw new Error(`A ${claim.status} claim cannot be inspected.`)
        }
        const updated = { ...claim, findings: findings.trim(), status: 'under_inspection' as const }
        await raw.warrantyClaims.put(updated)
        return updated
      },

      async decideClaim(claimId: string, outcome: 'approved' | 'rejected', input: WarrantyClaimDecisionInput, actorId: string): Promise<WarrantyClaim> {
        const claim = await raw.warrantyClaims.get(claimId)
        if (!claim) throw new Error(`No claim ${claimId}`)
        // §17 — no decision without findings on file.
        if (!canDecideClaim(claim.status, input.findings)) {
          throw new Error('Record what inspection found before deciding.')
        }
        if (!canTransitionClaim(claim.status, outcome)) {
          throw new Error(`That claim cannot be ${outcome} from ${claim.status}.`)
        }
        const updated = {
          ...claim,
          findings: input.findings.trim(),
          resolution: input.resolution?.trim() ?? '',
          status: outcome,
          // §17 — who decided is part of the record, not decoration.
          decidedBy: actorId,
          decidedAt: nowIso(),
        }
        await raw.warrantyClaims.put(updated)
        if (outcome === 'approved') {
          await raw.warranties.update(claim.warrantyId, { status: 'claimed' })
        }
        return updated
      },

      async startClaimWork(claimId: string): Promise<WarrantyClaim> {
        const claim = await raw.warrantyClaims.get(claimId)
        if (!claim) throw new Error(`No claim ${claimId}`)
        if (!canTransitionClaim(claim.status, 'in_progress')) {
          throw new Error(`Only an approved claim can start work; this one is ${claim.status}.`)
        }
        const updated = { ...claim, status: 'in_progress' as const }
        await raw.warrantyClaims.put(updated)
        return updated
      },

      async resolveClaim(claimId: string, resolution: string): Promise<WarrantyClaim> {
        if (!resolution.trim()) throw new Error('Record how the claim was put right.')
        const claim = await raw.warrantyClaims.get(claimId)
        if (!claim) throw new Error(`No claim ${claimId}`)
        if (!canTransitionClaim(claim.status, 'resolved')) {
          throw new Error(`A ${claim.status} claim cannot be resolved yet.`)
        }
        const updated = { ...claim, resolution: resolution.trim(), status: 'resolved' as const }
        await raw.warrantyClaims.put(updated)
        return updated
      },

      async closeClaim(claimId: string): Promise<WarrantyClaim> {
        const claim = await raw.warrantyClaims.get(claimId)
        if (!claim) throw new Error(`No claim ${claimId}`)
        if (!canTransitionClaim(claim.status, 'closed')) {
          throw new Error(`A ${claim.status} claim cannot be closed.`)
        }
        const updated = { ...claim, status: 'closed' as const }
        await raw.warrantyClaims.put(updated)
        return updated
      },

      async nextWarrantyNumber(prefix: string): Promise<string> {
        const year = nowIso().slice(0, 4)
        const all = await raw.warranties.toArray()
        const highest = all
          .filter((w) => w.warrantyNumber.startsWith(`${prefix}-${year}-`))
          .reduce((max, w) => Math.max(max, Number(w.warrantyNumber.split('-').pop()) || 0), 0)
        return `${prefix}-${year}-${String(highest + 1).padStart(4, '0')}`
      },
    },

    // §23 — the audit trail. Append-only: there is deliberately no method here
    // to edit or delete an entry. A log you can rewrite is not evidence.
    audit: {
      async record(input: AuditEntryInput): Promise<AuditLogEntry> {
        if (!input.actorId) throw new Error('An audit entry needs to name who did it.')
        if (!input.action.trim()) throw new Error('An audit entry needs an action.')
        // The actor's name is denormalised onto the row on purpose: if a user is
        // later renamed or removed, the trail must still say who acted at the
        // time rather than showing a stale or blank label.
        const actor = await raw.users.get(input.actorId)
        const entry: AuditLogEntry = {
          id: newId('aud'),
          actorId: input.actorId,
          actorName: actor ? `${actor.fullName} (${actor.role})` : input.actorId,
          action: input.action.trim(),
          targetType: input.targetType,
          targetId: input.targetId,
          detail: input.detail ?? '',
          branchId: input.branchId ?? actor?.branchId ?? '',
          at: nowIso(),
        }
        await raw.auditLog.add(entry)
        return entry
      },

      async list(filter: AuditFilter = {}): Promise<AuditLogEntry[]> {
        const rows = await raw.auditLog.orderBy('at').reverse().toArray()
        return rows.filter((e) =>
          (!filter.branchId || e.branchId === filter.branchId)
          && (!filter.actorId || e.actorId === filter.actorId)
          && (!filter.action || e.action === filter.action)
          && (!filter.targetType || e.targetType === filter.targetType))
      },
    },
  }

  return repository
}

export const db: Db = createDb()

export type { DuplicateStrategy }
