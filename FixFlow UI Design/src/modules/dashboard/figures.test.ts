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
