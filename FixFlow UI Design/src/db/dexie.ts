import Dexie, { type Table } from 'dexie'
import type {
  Branch,
  Customer,
  CustomerApproval,
  Device,
  Estimate,
  EstimateItem,
  EstimateStatus,
  Refund,
  RepairJob,
  RepairStatus,
  RepairStatusHistoryEntry,
  Sale,
  SaleItem,
  StockReservation,
  User,
} from '../domain/types'
import { checkStockAvailability, computeDocument, sumLines } from '../domain/calculations'
import {
  assertEstimateRevision,
  canRecordApproval,
  canTransitionEstimate,
  ESTIMATE_STATUS_LABEL,
} from '../domain/workflows'
import type {
  ApprovalInput,
  CheckoutInput,
  CustomerInput,
  EstimateInput,
  Db,
  DeviceInput,
  DuplicateStrategy,
  ImportResult,
  ProductInput,
  RefundInput,
  RepairFilter,
  RepairInput,
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
    sales!: Table<Sale, string>
    refunds!: Table<Refund, string>
    reservations!: Table<StockReservation, string>
    estimates!: Table<Estimate, string>
    approvals!: Table<CustomerApproval, string>

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
        return raw.transaction('rw', raw.repairs, raw.repairHistory, async () => {
          const job = await raw.repairs.get(id)
          if (!job) throw new Error(`No repair ${id}`)
          // Validated before writing — §28.10.
          assertRepairTransition(job.status, to)

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
    },

    // --- point of sale (§10) ------------------------------------------------

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

        return raw.transaction('rw', [raw.sales, raw.refunds, raw.products, raw.movements], async () => {
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
            const qty = Math.round(line.quantity)
            if (!Number.isInteger(qty) || qty <= 0) {
              throw new Error(`"${line.description}" needs a positive whole-number quantity.`)
            }
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
        return raw.transaction('rw', [raw.estimates], async () => {
          const estimate = await raw.estimates.get(id)
          if (!estimate) throw new Error(`No estimate ${id}`)
          if (!canTransitionEstimate(estimate.status, 'sent')) {
            throw new Error(
              `An estimate that is ${ESTIMATE_STATUS_LABEL[estimate.status]} cannot be sent.`,
            )
          }
          void actorId
          const next: Estimate = { ...estimate, status: 'sent' }
          await raw.estimates.put(next)
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

    approvals: {
      forEstimate: (estimateId) => raw.approvals.where('estimateId').equals(estimateId).toArray(),
      forRepair: (repairId) => raw.approvals.where('repairId').equals(repairId).toArray(),
      async hasApprovalFor(repairId: string) {
        const rows = await raw.approvals.where('repairId').equals(repairId).toArray()
        return rows.some((a) => a.decision === 'approved')
      },
    },
  }

  return repository
}

export const db: Db = createDb()

export type { DuplicateStrategy }
