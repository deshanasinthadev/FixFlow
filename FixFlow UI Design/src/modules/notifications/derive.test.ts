import { describe, expect, it } from 'vitest'
import { deriveNotifications } from './derive'
import type { RepairJob } from '../../domain/types'
import type { Product } from '../../db/schema'

let n = 0

const job = (over: Partial<RepairJob> = {}): RepairJob => ({
  id: `fxr_${++n}`,
  jobNumber: `FX-2026-00000${n}`,
  branchId: 'br_colombo',
  customerId: 'cus_nimal',
  deviceId: 'dev_1',
  customerName: 'Nimal Perera',
  phone: '',
  email: '',
  deviceSummary: 'Dell Latitude',
  serialNumber: '',
  reportedIssue: 'Will not boot',
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

const product = (over: Partial<Product> = {}): Product => ({
  id: `prd_${++n}`,
  sku: `SKU-${n}`,
  name: `Part ${n}`,
  category: 'Uncategorised',
  costCents: 1000,
  priceCents: 2000,
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

const empty = { repairs: [], products: [] }

describe('deriveNotifications', () => {
  it('produces nothing when there is nothing to report', () => {
    // The old screen always showed three messages, whether or not they were true.
    expect(deriveNotifications({ role: 'Admin', ...empty })).toEqual([])
  })

  it('every notification names a real record it came from', () => {
    const jobs = [job({ status: 'waiting_for_approval' }), job({ status: 'ready_for_collection' })]
    const result = deriveNotifications({ role: 'Admin', repairs: jobs, products: [] })
    for (const note of result) {
      const mentioned = jobs.some((j) => note.body.includes(j.jobNumber))
      const isStockNote = note.kind === 'low_stock'
      expect(mentioned || isStockNote).toBe(true)
    }
  })

  it('reports low stock from available units, not stock on hand', () => {
    const result = deriveNotifications({
      role: 'Manager',
      repairs: [],
      products: [product({ stockOnHand: 5, reserved: 4, minStock: 2 })],
    })
    const note = result.find((r) => r.kind === 'low_stock')
    expect(note).toBeDefined()
    expect(note!.severity).toBe('info')
  })

  it('escalates to a warning when something has run out', () => {
    const result = deriveNotifications({
      role: 'Manager',
      repairs: [],
      products: [product({ stockOnHand: 0, minStock: 2 })],
    })
    expect(result.find((r) => r.kind === 'low_stock')!.severity).toBe('warning')
  })

  it('raises approval requests for managers', () => {
    const result = deriveNotifications({
      role: 'Manager',
      repairs: [job({ status: 'waiting_for_approval' })],
      products: [],
    })
    expect(result.some((r) => r.kind === 'estimate_approval_request')).toBe(true)
  })

  it('does not raise approval requests for a cashier', () => {
    const result = deriveNotifications({
      role: 'Cashier',
      repairs: [job({ status: 'waiting_for_approval' })],
      products: [],
    })
    expect(result.some((r) => r.kind === 'estimate_approval_request')).toBe(false)
  })

  it('flags active work that has no technician', () => {
    const result = deriveNotifications({
      role: 'Admin',
      repairs: [job({ status: 'repairing', technicianId: '' })],
      products: [],
    })
    expect(result.some((r) => r.kind === 'new_repair')).toBe(true)
  })

  it('does not flag a received repair as unassigned work', () => {
    // Nobody has started it yet, so it is not work being neglected.
    const result = deriveNotifications({
      role: 'Admin',
      repairs: [job({ status: 'received', technicianId: '' })],
      products: [],
    })
    expect(result.some((r) => r.kind === 'new_repair')).toBe(false)
  })

  it('gives a technician only their own queue', () => {
    const result = deriveNotifications({
      role: 'Technician',
      technicianId: 'usr_tech_1',
      repairs: [
        job({ status: 'repairing', technicianId: 'usr_tech_1' }),
        job({ status: 'repairing', technicianId: 'usr_tech_2' }),
      ],
      products: [],
    })
    const queue = result.find((r) => r.id === 'my-queue')
    expect(queue).toBeDefined()
    expect(queue!.body).toContain('1 repair')
  })

  it('omits delivered and cancelled work from a technician queue', () => {
    const result = deriveNotifications({
      role: 'Technician',
      technicianId: 'usr_tech_1',
      repairs: [job({ status: 'delivered', technicianId: 'usr_tech_1' })],
      products: [],
    })
    expect(result.find((r) => r.id === 'my-queue')).toBeUndefined()
  })

  it('scopes parts notifications to the technician when the viewer is one', () => {
    const result = deriveNotifications({
      role: 'Technician',
      technicianId: 'usr_tech_1',
      repairs: [job({ status: 'waiting_for_parts', technicianId: 'usr_tech_2' })],
      products: [],
    })
    expect(result.find((r) => r.id === 'waiting-parts')).toBeUndefined()
  })

  it('reports ready-for-collection work to staff', () => {
    const result = deriveNotifications({
      role: 'Cashier',
      repairs: [job({ status: 'ready_for_collection' })],
      products: [],
    })
    expect(result.find((r) => r.kind === 'repair_status' && r.id === 'ready-pickup')).toBeDefined()
  })

  it('does not show stock alerts to a customer', () => {
    const result = deriveNotifications({
      role: 'Customer',
      repairs: [job({ status: 'ready_for_collection' })],
      products: [product({ stockOnHand: 0, minStock: 5 })],
    })
    expect(result.some((r) => r.kind === 'low_stock')).toBe(false)
  })

  it('summarises long lists instead of dumping every job number', () => {
    const jobs = Array.from({ length: 6 }, () => job({ status: 'waiting_for_approval' }))
    const result = deriveNotifications({ role: 'Manager', repairs: jobs, products: [] })
    const note = result.find((r) => r.kind === 'estimate_approval_request')!
    expect(note.body).toContain('and 3 more')
  })

  it('uses correct singular and plural wording', () => {
    const one = deriveNotifications({ role: 'Manager', repairs: [job({ status: 'waiting_for_approval' })], products: [] })
    expect(one.find((r) => r.kind === 'estimate_approval_request')!.body).toContain('1 repair waiting')

    const two = deriveNotifications({
      role: 'Manager',
      repairs: [job({ status: 'waiting_for_approval' }), job({ status: 'waiting_for_approval' })],
      products: [],
    })
    expect(two.find((r) => r.kind === 'estimate_approval_request')!.body).toContain('2 repairs waiting')
  })

  it('gives every notification a stable id and a destination', () => {
    const result = deriveNotifications({
      role: 'Admin',
      repairs: [job({ status: 'waiting_for_approval' }), job({ status: 'ready_for_collection' })],
      products: [product({ stockOnHand: 0, minStock: 2 })],
    })
    expect(result.length).toBeGreaterThan(1)
    expect(new Set(result.map((r) => r.id)).size).toBe(result.length)
    for (const note of result) {
      expect(note.link.length).toBeGreaterThan(0)
    }
  })
})
