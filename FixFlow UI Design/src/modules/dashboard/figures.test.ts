import { describe, expect, it } from 'vitest'
import { availableUnits, computeDashboardFigures } from './figures'
import type { RepairJob, Sale } from '../../domain/types'
import type { Product } from '../../db/schema'

const NOW = new Date('2026-03-18T09:00:00.000')

const job = (over: Partial<RepairJob> = {}): RepairJob => ({
  id: `fxr_${Math.random().toString(36).slice(2, 8)}`,
  jobNumber: 'FX-2026-000001',
  branchId: 'br_colombo',
  customerId: 'cus_nimal',
  deviceId: 'dev_1',
  customerName: 'Nimal Perera',
  phone: '+94771234567',
  email: '',
  deviceSummary: 'Dell Latitude',
  serialNumber: '',
  reportedIssue: 'Will not power on',
  deviceCondition: '',
  accessoriesReceived: [],
  intakePhotoUrls: [],
  completionPhotoUrls: [],
  priority: 'normal',
  status: 'received',
  technicianId: '',
  receivedAt: '2026-03-17T09:00:00.000Z',
  expectedCompletion: '',
  internalNotes: '',
  customerVisibleNotes: [],
  labourCost: 0,
  createdAt: '2026-03-17T09:00:00.000Z',
  updatedAt: '2026-03-17T09:00:00.000Z',
  ...over,
})

const sale = (over: Partial<Sale> = {}): Sale => ({
  id: `sal_${Math.random().toString(36).slice(2, 8)}`,
  receiptNumber: 'POS-CMB-2026-0001',
  branchId: 'br_colombo',
  customerId: '',
  customerName: '',
  items: [],
  subtotal: 0,
  discount: 0,
  taxRate: 0,
  taxAmount: 0,
  total: 0,
  amountPaid: 0,
  paymentMethod: 'cash',
  cashierId: 'usr_cashier',
  refundedFromSaleId: '',
  idempotencyKey: '',
  createdAt: '2026-03-18T10:00:00.000',
  ...over,
})

const product = (over: Partial<Product> = {}): Product => ({
  id: 'prd_1',
  sku: 'SKU-1',
  name: 'Test part',
  category: 'Uncategorised',
  costCents: 10000,
  priceCents: 20000,
  taxRate: 0,
  stockOnHand: 10,
  reserved: 0,
  minStock: 2,
  barcode: '',
  isService: false,
  branchId: 'br_colombo',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...over,
})

const empty = { repairs: [], sales: [], products: [] }

describe('computeDashboardFigures', () => {
  it('returns zeros rather than plausible numbers when there is no data', () => {
    // The point of §6: an empty database must read as empty.
    expect(computeDashboardFigures(empty, NOW)).toEqual({
      todaySales: 0,
      todaySaleCount: 0,
      activeRepairs: 0,
      readyForPickup: 0,
      awaitingApproval: 0,
      unassignedRepairs: 0,
      lowStockItems: 0,
      criticalStockItems: 0,
    })
  })

  it('sums only the sales dated today', () => {
    const figures = computeDashboardFigures({
      ...empty,
      sales: [
        sale({ total: 500000, createdAt: '2026-03-18T08:00:00.000' }),
        sale({ total: 250050, createdAt: '2026-03-18T23:59:00.000' }),
        sale({ total: 999900, createdAt: '2026-03-17T23:59:00.000' }), // yesterday
        sale({ total: 111100, createdAt: '2026-03-19T00:00:00.000' }), // tomorrow
      ],
    }, NOW)
    expect(figures.todaySales).toBe(750050)
    expect(figures.todaySaleCount).toBe(2)
  })

  it('treats the day boundary as the local calendar day, not 24 hours back', () => {
    // 08:00 today is only 23h ago, but a rolling window would also sweep in
    // late yesterday. Calendar comparison must not.
    const figures = computeDashboardFigures({
      ...empty,
      sales: [
        sale({ total: 100, createdAt: '2026-03-18T00:30:00.000' }),
        sale({ total: 200, createdAt: '2026-03-17T23:30:00.000' }),
      ],
    }, NOW)
    expect(figures.todaySales).toBe(100)
  })

  it('ignores a sale with an unparseable timestamp instead of crashing', () => {
    const figures = computeDashboardFigures({
      ...empty,
      sales: [sale({ total: 300, createdAt: 'not a date' }), sale({ total: 400 })],
    }, NOW)
    expect(figures.todaySales).toBe(400)
    expect(figures.todaySaleCount).toBe(1)
  })

  it('counts repairs by status', () => {
    const figures = computeDashboardFigures({
      ...empty,
      repairs: [
        job({ status: 'received' }),
        job({ status: 'diagnosing' }),
        job({ status: 'repairing' }),
        job({ status: 'testing' }),
        job({ status: 'waiting_for_parts' }),
        job({ status: 'waiting_for_approval' }),
        job({ status: 'ready_for_collection' }),
        job({ status: 'delivered' }),
        job({ status: 'cancelled' }),
      ],
    }, NOW)
    expect(figures.activeRepairs).toBe(4)
    expect(figures.awaitingApproval).toBe(1)
    expect(figures.readyForPickup).toBe(1)
  })

  it('counts unassigned only among repairs being worked on', () => {
    const figures = computeDashboardFigures({
      ...empty,
      repairs: [
        job({ status: 'repairing', technicianId: '' }),
        job({ status: 'testing', technicianId: 'usr_tech_1' }),
        // Received and unassigned, but nobody has started it: not "unassigned work".
        job({ status: 'received', technicianId: '' }),
      ],
    }, NOW)
    expect(figures.activeRepairs).toBe(2)
    expect(figures.unassignedRepairs).toBe(1)
  })

  it('flags low stock on available units, not stock on hand', () => {
    const figures = computeDashboardFigures({
      ...empty,
      products: [
        product({ id: 'a', stockOnHand: 5, reserved: 0, minStock: 2 }), // fine
        product({ id: 'b', stockOnHand: 5, reserved: 4, minStock: 2 }), // 1 available -> low
        product({ id: 'c', stockOnHand: 0, reserved: 0, minStock: 2 }), // critical
      ],
    }, NOW)
    expect(figures.lowStockItems).toBe(2)
    expect(figures.criticalStockItems).toBe(1)
  })

  it('treats stock exactly at the reorder level as low', () => {
    const figures = computeDashboardFigures({
      ...empty,
      products: [product({ stockOnHand: 2, minStock: 2 })],
    }, NOW)
    expect(figures.lowStockItems).toBe(1)
  })
})

describe('availableUnits', () => {
  it('subtracts reservations', () => {
    expect(availableUnits(product({ stockOnHand: 10, reserved: 3 }))).toBe(7)
  })

  it('never returns a negative number', () => {
    // Reserved can exceed on-hand if a sale shipped against a reservation.
    expect(availableUnits(product({ stockOnHand: 2, reserved: 5 }))).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// Money, series and overdue (§1 dashboard, §18 profit)
// ---------------------------------------------------------------------------

import { computeMoneyFigures, computeSeries, countOverdueRepairs } from './figures'

const invoice = (over: Record<string, unknown> = {}) => ({
  repairId: 'fxr_1',
  paidTotal: 5000_00,
  createdAt: '2026-03-18T10:00:00.000',
  ...over,
})

const expense = (over: Record<string, unknown> = {}) => ({
  amount: 1000_00,
  spentAt: '2026-03-18T00:00:00.000',
  ...over,
})

describe('computeMoneyFigures', () => {
  it('returns zeros rather than plausible numbers when there is no data', () => {
    expect(computeMoneyFigures({ sales: [], invoices: [], expenses: [] }, NOW)).toEqual({
      todaySales: 0, todayRepairIncome: 0, todayExpenses: 0, todayProfit: 0,
    })
  })

  it('sums only sales dated today', () => {
    const figures = computeMoneyFigures({
      sales: [
        sale({ createdAt: '2026-03-18T09:00:00.000', subtotal: 10000_00, discount: 0, total: 10000_00 }),
        sale({ createdAt: '2026-03-17T09:00:00.000', subtotal: 99000_00, discount: 0, total: 99000_00 }),
      ],
      invoices: [], expenses: [],
    }, NOW)
    expect(figures.todaySales).toBe(10000_00)
  })

  it('counts repair income as what was paid, not what was billed', () => {
    const figures = computeMoneyFigures({
      sales: [],
      invoices: [
        invoice({ paidTotal: 3000_00 }),
        // An invoice with nothing collected yet is a receivable, not income.
        invoice({ paidTotal: 0 }),
      ],
      expenses: [],
    }, NOW)
    expect(figures.todayRepairIncome).toBe(3000_00)
  })

  it('ignores an invoice with no repair — that is a counter sale, not repair income', () => {
    const figures = computeMoneyFigures({
      sales: [], invoices: [invoice({ repairId: '' })], expenses: [],
    }, NOW)
    expect(figures.todayRepairIncome).toBe(0)
  })

  it('subtracts cost of goods and expenses from profit', () => {
    const figures = computeMoneyFigures({
      sales: [sale({
        createdAt: '2026-03-18T09:00:00.000',
        subtotal: 10000_00, discount: 0, total: 10000_00,
        items: [{ id: 'i', productId: 'p', productName: 'x', quantity: 2, unitPrice: 5000_00, unitCost: 3000_00, lineTotal: 10000_00 }],
      })],
      invoices: [invoice({ paidTotal: 4000_00 })],
      expenses: [expense({ amount: 1500_00 })],
    }, NOW)
    // 10,000 sales + 4,000 repair − 6,000 COGS − 1,500 expenses
    expect(figures.todayProfit).toBe(6500_00)
  })

  it('does not treat sales revenue as profit', () => {
    const figures = computeMoneyFigures({
      sales: [sale({
        createdAt: '2026-03-18T09:00:00.000',
        subtotal: 10000_00, discount: 0, total: 10000_00,
        items: [{ id: 'i', productId: 'p', productName: 'x', quantity: 1, unitPrice: 10000_00, unitCost: 10000_00, lineTotal: 10000_00 }],
      })],
      invoices: [], expenses: [],
    }, NOW)
    // Sold at cost: revenue of 10,000 must produce profit of zero.
    expect(figures.todaySales).toBe(10000_00)
    expect(figures.todayProfit).toBe(0)
  })
})

describe('computeSeries', () => {
  it('returns every bucket in the window, including empty ones', () => {
    const series = computeSeries({ sales: [], invoices: [], expenses: [] }, 'day', 7, NOW)
    expect(series).toHaveLength(7)
    expect(series.every((p) => p.revenue === 0 && p.expenses === 0)).toBe(true)
  })

  it('is ordered oldest first so the chart reads left to right in time', () => {
    const series = computeSeries({ sales: [], invoices: [], expenses: [] }, 'day', 7, NOW)
    expect(series[6].key).toBe('2026-03-18')
    expect(series[0].key).toBe('2026-03-12')
  })

  it('buckets a sale into its own day', () => {
    const series = computeSeries({
      sales: [sale({ createdAt: '2026-03-16T09:00:00.000', subtotal: 7000_00, discount: 0, total: 7000_00 })],
      invoices: [], expenses: [],
    }, 'day', 7, NOW)
    expect(series.find((p) => p.key === '2026-03-16')?.revenue).toBe(7000_00)
    expect(series.find((p) => p.key === '2026-03-18')?.revenue).toBe(0)
  })

  it('buckets by month when asked', () => {
    const series = computeSeries({
      sales: [
        sale({ createdAt: '2026-03-18T09:00:00.000', subtotal: 5000_00, discount: 0, total: 5000_00 }),
        sale({ createdAt: '2026-02-10T09:00:00.000', subtotal: 2000_00, discount: 0, total: 2000_00 }),
      ],
      invoices: [], expenses: [],
    }, 'month', 3, NOW)
    expect(series).toHaveLength(3)
    expect(series.find((p) => p.key === '2026-03')?.revenue).toBe(5000_00)
    expect(series.find((p) => p.key === '2026-02')?.revenue).toBe(2000_00)
    expect(series.find((p) => p.key === '2026-01')?.revenue).toBe(0)
  })

  it('adds expenses to the same bucket as revenue', () => {
    const series = computeSeries({
      sales: [sale({ createdAt: '2026-03-18T09:00:00.000', subtotal: 5000_00, discount: 0, total: 5000_00 })],
      invoices: [],
      expenses: [expense({ amount: 800_00 })],
    }, 'day', 7, NOW)
    const today = series.find((p) => p.key === '2026-03-18')!
    expect(today.revenue).toBe(5000_00)
    expect(today.expenses).toBe(800_00)
  })
})

describe('countOverdueRepairs', () => {
  it('counts a job past its promised date that is still open', () => {
    expect(countOverdueRepairs([
      job({ expectedCompletion: '2026-03-10T00:00:00.000Z', status: 'repairing' }),
    ], NOW)).toBe(1)
  })

  it('does not count a job still inside its promised date', () => {
    expect(countOverdueRepairs([
      job({ expectedCompletion: '2026-03-20T00:00:00.000Z', status: 'repairing' }),
    ], NOW)).toBe(0)
  })

  it('does not count a job with no promised date', () => {
    expect(countOverdueRepairs([job({ expectedCompletion: '', status: 'repairing' })], NOW)).toBe(0)
  })

  it('excludes delivered and cancelled jobs', () => {
    expect(countOverdueRepairs([
      job({ expectedCompletion: '2026-03-01T00:00:00.000Z', status: 'delivered' }),
      job({ expectedCompletion: '2026-03-01T00:00:00.000Z', status: 'cancelled' }),
    ], NOW)).toBe(0)
  })

  it('treats the promised date itself as not yet overdue', () => {
    expect(countOverdueRepairs([
      job({ expectedCompletion: '2026-03-18T00:00:00.000Z', status: 'repairing' }),
    ], NOW)).toBe(0)
  })
})
