import { describe, expect, it } from 'vitest'
import type { RepairJob, RepairStatus, User } from '../../domain/types'
import { REPAIR_STATUSES } from '../../domain/types'
import {
  PRIORITY_LABEL,
  STATUS_LABEL,
  countRepairs,
  formatEta,
  scopeRepairsFor,
  statusBadgeTone,
  technicianNames,
  toRepairRow,
  toRepairRows,
} from './repairView'

/**
 * The adapter between persisted RepairJob records and the row shape the
 * existing repair screens render. If this drifts, the tables silently show
 * blanks, so the mapping is pinned here.
 */

const job = (over: Partial<RepairJob> = {}): RepairJob => ({
  id: 'rep_001',
  jobNumber: 'FX-2026-004821',
  branchId: 'br_colombo',
  customerId: 'cus_nimal',
  deviceId: 'dev_001',
  customerName: 'Nimal Perera',
  phone: '+94771234567',
  email: 'nimal@example.com',
  deviceSummary: 'Dell Latitude 5420',
  serialNumber: 'DL5420LK2291',
  reportedIssue: 'Screen flickers.',
  deviceCondition: 'Good',
  accessoriesReceived: [],
  intakePhotoUrls: [],
  completionPhotoUrls: [],
  priority: 'high',
  status: 'repairing',
  technicianId: 'usr_tech_1',
  receivedAt: '2026-03-16T04:00:00.000Z',
  expectedCompletion: '',
  internalNotes: '',
  customerVisibleNotes: [],
  labourCost: 1_850_000,
  createdAt: '2026-03-16T04:00:00.000Z',
  updatedAt: '2026-03-16T04:00:00.000Z',
  ...over,
})

const ctx = { technicians: { usr_tech_1: 'John Silva' }, now: new Date('2026-03-18T04:00:00.000Z') }

describe('toRepairRow', () => {
  it('maps every field the table renders', () => {
    const row = toRepairRow(job(), ctx)
    expect(row).toEqual({
      id: 'FX-2026-004821',
      customerId: 'cus_nimal',
      technicianId: 'usr_tech_1',
      branchId: 'br_colombo',
      customer: 'Nimal Perera',
      device: 'Dell Latitude 5420',
      tech: 'John Silva',
      priority: 'High',
      status: 'In Progress',
      amount: 'Rs. 18,500',
      eta: 'Not set',
    })
  })

  it('says Unassigned when no technician is set', () => {
    expect(toRepairRow(job({ technicianId: '' }), ctx).tech).toBe('Unassigned')
  })

  it('says Unassigned when the technician is not in the lookup', () => {
    expect(toRepairRow(job({ technicianId: 'usr_ghost' }), ctx).tech).toBe('Unassigned')
  })

  it('formats the labour cost from minor units', () => {
    expect(toRepairRow(job({ labourCost: 4_500_00 }), ctx).amount).toBe('Rs. 4,500')
    // formatLKR caps at 2 decimals rather than padding, so whole rupees have none.
    expect(toRepairRow(job({ labourCost: 0 }), ctx).amount).toBe('Rs. 0')
  })

  it('maps every priority', () => {
    (['low', 'normal', 'high', 'urgent'] as const).forEach((p) => {
      expect(toRepairRow(job({ priority: p }), ctx).priority).toBe(PRIORITY_LABEL[p])
    })
  })
})

describe('status labels and badge tones', () => {
  it('has a label for every status in the enum', () => {
    REPAIR_STATUSES.forEach((s) => {
      expect(STATUS_LABEL[s]).toBeTruthy()
    })
  })

  it('derives the badge class the Badge component will compute', () => {
    expect(statusBadgeTone('repairing')).toBe('in-progress')
    expect(statusBadgeTone('waiting_for_approval')).toBe('awaiting-approval')
    expect(statusBadgeTone('ready_for_collection')).toBe('ready-for-pickup')
    expect(statusBadgeTone('waiting_for_parts')).toBe('awaiting-parts')
  })

  it('keeps labels stable, since the CSS depends on them', () => {
    expect(STATUS_LABEL.repairing).toBe('In Progress')
    expect(STATUS_LABEL.ready_for_collection).toBe('Ready for Pickup')
    expect(STATUS_LABEL.diagnosing).toBe('Diagnosing')
    expect(STATUS_LABEL.testing).toBe('Testing')
  })
})

describe('formatEta', () => {
  const now = new Date('2026-03-18T08:00:00.000Z')

  it('says Ready now once the device is ready for collection', () => {
    expect(formatEta(job({ status: 'ready_for_collection' }), now)).toBe('Ready now')
  })

  it('says Collected once delivered', () => {
    expect(formatEta(job({ status: 'delivered' }), now)).toBe('Collected')
  })

  it('says Not set when no date was promised', () => {
    expect(formatEta(job({ expectedCompletion: '' }), now)).toBe('Not set')
  })

  it('handles an unparseable date without throwing', () => {
    expect(formatEta(job({ expectedCompletion: 'not-a-date' }), now)).toBe('Not set')
  })

  it('shows Today with a time for a same-day promise', () => {
    const eta = formatEta(job({ expectedCompletion: '2026-03-18T14:30:00.000Z' }), now)
    expect(eta.startsWith('Today, ')).toBe(true)
  })

  it('shows Tomorrow for the next day', () => {
    expect(formatEta(job({ expectedCompletion: '2026-03-19T14:30:00.000Z' }), now)).toBe('Tomorrow')
  })

  it('flags an overdue job', () => {
    expect(formatEta(job({ expectedCompletion: '2026-03-15T14:30:00.000Z' }), now)).toMatch(/overdue/)
  })
})

describe('technicianNames', () => {
  it('builds an id -> name lookup', () => {
    const users = [
      { id: 'usr_tech_1', fullName: 'John Silva' },
      { id: 'usr_tech_2', fullName: 'Kamal Silva' },
    ] as unknown as User[]
    expect(technicianNames(users)).toEqual({ usr_tech_1: 'John Silva', usr_tech_2: 'Kamal Silva' })
  })
})

describe('scopeRepairsFor (§5 read scoping)', () => {
  const jobs = [
    job({ id: 'a', customerId: 'cus_nimal', technicianId: 'usr_tech_1', branchId: 'br_colombo' }),
    job({ id: 'b', customerId: 'cus_amaya', technicianId: 'usr_tech_2', branchId: 'br_colombo' }),
    job({ id: 'c', customerId: 'cus_dilani', technicianId: 'usr_tech_3', branchId: 'br_kandy' }),
  ]

  it('gives an admin every job', () => {
    expect(scopeRepairsFor(jobs, { role: 'Admin' })).toHaveLength(3)
  })

  it('gives a customer only their own jobs', () => {
    const mine = scopeRepairsFor(jobs, { role: 'Customer', customerId: 'cus_nimal' })
    expect(mine).toHaveLength(1)
    expect(mine[0].id).toBe('a')
  })

  it('never leaks another customer\'s job', () => {
    const mine = scopeRepairsFor(jobs, { role: 'Customer', customerId: 'cus_nimal' })
    expect(mine.some((j) => j.customerId !== 'cus_nimal')).toBe(false)
  })

  it('gives a technician only their assigned work', () => {
    const mine = scopeRepairsFor(jobs, { role: 'Technician', technicianId: 'usr_tech_1' })
    expect(mine).toHaveLength(1)
    expect(mine[0].technicianId).toBe('usr_tech_1')
  })

  it('confines a manager to their branch', () => {
    expect(scopeRepairsFor(jobs, { role: 'Manager', branchId: 'br_colombo' })).toHaveLength(2)
    expect(scopeRepairsFor(jobs, { role: 'Manager', branchId: 'br_kandy' })).toHaveLength(1)
  })

  it('returns nothing for a customer id that has no jobs', () => {
    expect(scopeRepairsFor(jobs, { role: 'Customer', customerId: 'cus_ghost' })).toHaveLength(0)
  })
})

describe('countRepairs (§6 — figures derived from records)', () => {
  const jobs = [
    job({ id: '1', status: 'diagnosing' }),
    job({ id: '2', status: 'repairing' }),
    job({ id: '3', status: 'waiting_for_approval' }),
    job({ id: '4', status: 'waiting_for_parts' }),
    job({ id: '5', status: 'ready_for_collection' }),
    job({ id: '6', status: 'completed' }),
    job({ id: '7', status: 'delivered' }),
    job({ id: '8', status: 'cancelled' }),
    job({ id: '9', status: 'received' }),
  ]

  it('counts every tile the dashboard shows', () => {
    const c = countRepairs(jobs)
    expect(c.total).toBe(9)
    expect(c.awaitingApproval).toBe(1)
    expect(c.waitingForParts).toBe(1)
    expect(c.readyForPickup).toBe(1)
    expect(c.completed).toBe(1)
    expect(c.delivered).toBe(1)
    expect(c.cancelled).toBe(1)
  })

  it('counts active work, including jobs blocked on parts', () => {
    // diagnosing, repairing, waiting_for_parts are active; awaiting approval,
    // ready, completed, delivered, cancelled and received are not.
    expect(countRepairs(jobs).active).toBe(3)
  })

  it('reports zeros rather than NaN on an empty set', () => {
    const c = countRepairs([])
    expect(c).toEqual({
      total: 0, active: 0, awaitingApproval: 0, waitingForParts: 0,
      readyForPickup: 0, completed: 0, delivered: 0, cancelled: 0,
    })
  })

  it('counts a status it has not seen as zero', () => {
    const c = countRepairs([job({ status: 'testing' as RepairStatus })])
    expect(c.total).toBe(1)
    expect(c.awaitingApproval).toBe(0)
  })
})

describe('toRepairRows', () => {
  it('maps a list and keeps the order', () => {
    const rows = toRepairRows([job({ id: 'a' }), job({ id: 'b' })], ctx)
    expect(rows).toHaveLength(2)
    expect(rows[0].customer).toBe('Nimal Perera')
  })

  it('returns an empty list for no jobs', () => {
    expect(toRepairRows([], ctx)).toEqual([])
  })
})
