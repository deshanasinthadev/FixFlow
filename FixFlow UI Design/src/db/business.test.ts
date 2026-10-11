import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { createDb } from './dexie'
import type { Db } from './repository'

/**
 * Tests for the business-entity repository added in Phase 1: branches, users,
 * customers, devices and the repair workflow.
 *
 * Each test builds its own database so nothing leaks between them.
 */
let db: Db
let uid = 0

beforeEach(async () => {
  db = createDb(`fixflow-biz-test-${++uid}`)
  await db.ready()
})

// ---------------------------------------------------------------------------
// Seeding
// ---------------------------------------------------------------------------
describe('seeded business data', () => {
  it('creates exactly two branches (§3)', async () => {
    const branches = await db.branches.list()
    expect(branches).toHaveLength(2)
    expect(branches.map((b) => b.code).sort()).toEqual(['CMB', 'KDY'])
  })

  it('seeds both customers and devices for them', async () => {
    expect(await db.customers.list()).toHaveLength(6)
    expect(await db.devices.list()).toHaveLength(8)
  })

  it('seeds repairs across both branches', async () => {
    const all = await db.repairs.list()
    expect(all).toHaveLength(8)
    const colombo = await db.repairs.list({ branchId: 'br_colombo' })
    const kandy = await db.repairs.list({ branchId: 'br_kandy' })
    expect(colombo.length + kandy.length).toBe(8)
    expect(kandy.length).toBeGreaterThan(0)
  })

  it('gives every seeded job a well-formed number', async () => {
    for (const job of await db.repairs.list()) {
      expect(job.jobNumber).toMatch(/^FX-2026-\d{6}$/)
    }
  })

  it('resolves a customer by their portal token (§11, §20)', async () => {
    const customers = await db.customers.list()
    const target = customers[0]

    const resolved = await db.customers.byPortalToken(target.portalToken)
    expect(resolved?.id).toBe(target.id)
  })

  it('does not resolve a token that belongs to nobody', async () => {
    // A forged or mistyped token must come back empty rather than falling
    // through to the first row in the table.
    expect(await db.customers.byPortalToken('ptk_nobody_at_all')).toBeUndefined()
  })

  it('does not resolve an empty token', async () => {
    // Without this, an empty string would query the index for '' and any
    // customer stored with a blank token would match every visitor.
    expect(await db.customers.byPortalToken('')).toBeUndefined()
  })

  it('gives every customer an unguessable portal token (§20)', async () => {
    const customers = await db.customers.list()
    const tokens = new Set(customers.map((c) => c.portalToken))
    expect(tokens.size).toBe(customers.length) // all distinct
    customers.forEach((c) => {
      expect(c.portalToken).not.toBe(c.id)
      expect(c.portalToken.length).toBeGreaterThan(16)
    })
  })
})

describe('seeded repair history', () => {
  it('gives every job at least a received entry', async () => {
    for (const job of await db.repairs.list()) {
      const history = await db.repairs.history(job.id)
      expect(history.length).toBeGreaterThan(0)
      expect(history[0].to).toBe('received')
      expect(history[0].from).toBe('')
    }
  })

  it('is chronological and never predates the job it belongs to', async () => {
    for (const job of await db.repairs.list()) {
      const history = await db.repairs.history(job.id)
      expect(new Date(history[0].at).getTime()).toBeGreaterThanOrEqual(new Date(job.receivedAt).getTime())
      for (let i = 1; i < history.length; i++) {
        expect(new Date(history[i].at).getTime()).toBeGreaterThan(new Date(history[i - 1].at).getTime())
      }
    }
  })

  it('ends on the job\'s current status', async () => {
    for (const job of await db.repairs.list()) {
      const history = await db.repairs.history(job.id)
      expect(history[history.length - 1].to).toBe(job.status)
    }
  })
})

// ---------------------------------------------------------------------------
// Listing and filtering
// ---------------------------------------------------------------------------
describe('repair intake flow (§7)', () => {
  it('creates customer, device and job in the order the wizard does', async () => {
    // Mirrors NewRepair.submit(): each record needs the id of the one before.
    const customer = await db.customers.create({
      fullName: 'Ishara Gunawardena',
      phone: '+94772223344',
      email: 'ishara@example.com',
      address: '5 Kandy Road',
      notes: '',
      status: 'active',
    })
    const device = await db.devices.create({
      customerId: customer.id,
      category: 'laptop',
      brand: 'Acer',
      model: 'Aspire 5',
      serialNumber: 'ACR5X9',
      purchaseDate: '',
      notes: '',
    })
    const job = await db.repairs.create({
      branchId: 'br_colombo',
      customerId: customer.id,
      deviceId: device.id,
      customerName: customer.fullName,
      phone: customer.phone,
      email: customer.email,
      deviceSummary: `${device.brand} ${device.model}`,
      serialNumber: device.serialNumber,
      reportedIssue: 'Hinge is loose and the lid will not stay open.',
      deviceCondition: 'Fair — visible damage',
      accessoriesReceived: ['Charger'],
      intakePhotoUrls: [],
      completionPhotoUrls: [],
      priority: 'normal',
      status: 'received',
      technicianId: '',
      receivedAt: new Date().toISOString(),
      expectedCompletion: '',
      internalNotes: '',
      customerVisibleNotes: [],
      labourCost: 3500_00,
    })

    expect(job.jobNumber).toMatch(/^FX-\d{4}-\d{6}$/)
    expect(job.status).toBe('received')
    expect(job.labourCost).toBe(350000)

    // The new job is reachable through the same scoping the UI uses.
    const mine = await db.repairs.list({ customerId: customer.id })
    expect(mine).toHaveLength(1)
    expect(mine[0].id).toBe(job.id)

    // The device is linked to the customer.
    expect(await db.devices.forCustomer(customer.id)).toHaveLength(1)

    // And the job opened with an audit entry.
    expect(await db.repairs.history(job.id)).toHaveLength(1)
  })

  it('files an intake against the branch the actor belongs to', async () => {
    const before = await db.repairs.list({ branchId: 'br_kandy' })
    const customer = await db.customers.create({
      fullName: 'Kandy Walk In', phone: '+94778889900', email: '', address: '', notes: '', status: 'active',
    })
    const device = await db.devices.create({
      customerId: customer.id, category: 'mobile', brand: 'Xiaomi', model: 'Redmi Note 12',
      serialNumber: 'XM12K', purchaseDate: '', notes: '',
    })
    await db.repairs.create({
      branchId: 'br_kandy', customerId: customer.id, deviceId: device.id,
      customerName: customer.fullName, phone: customer.phone, email: '',
      deviceSummary: 'Xiaomi Redmi Note 12', serialNumber: 'XM12K',
      reportedIssue: 'Screen does not respond to touch in the lower half.',
      deviceCondition: 'Good — minor wear', accessoriesReceived: [], intakePhotoUrls: [],
      completionPhotoUrls: [], priority: 'high', status: 'received', technicianId: '',
      receivedAt: new Date().toISOString(), expectedCompletion: '', internalNotes: '',
      customerVisibleNotes: [], labourCost: 0,
    })
    const after = await db.repairs.list({ branchId: 'br_kandy' })
    expect(after).toHaveLength(before.length + 1)
  })

  it('does not create a repair when the device create fails', async () => {
    const before = await db.repairs.list()
    await expect(
      db.devices.create({
        customerId: 'cus_nimal', category: 'laptop', brand: '', model: '',
        serialNumber: '', purchaseDate: '', notes: '',
      }),
    ).rejects.toThrow()
    expect(await db.repairs.list()).toHaveLength(before.length)
  })
})

describe('repairs.list filters', () => {
  it('filters by status', async () => {
    const repairing = await db.repairs.list({ status: 'repairing' })
    expect(repairing.length).toBeGreaterThan(0)
    repairing.forEach((r) => expect(r.status).toBe('repairing'))
  })

  it('filters by customer', async () => {
    const mine = await db.repairs.list({ customerId: 'cus_nimal' })
    expect(mine.length).toBe(2)
    mine.forEach((r) => expect(r.customerId).toBe('cus_nimal'))
  })

  it('filters by technician', async () => {
    const assigned = await db.repairs.list({ technicianId: 'usr_tech_1' })
    expect(assigned.length).toBeGreaterThan(0)
    assigned.forEach((r) => expect(r.technicianId).toBe('usr_tech_1'))
  })

  it('searches by job number, customer and device', async () => {
    expect((await db.repairs.list({ search: 'FX-2026-004821' })).length).toBe(1)
    expect((await db.repairs.list({ search: 'nimal' })).length).toBeGreaterThan(0)
    expect((await db.repairs.list({ search: 'victus' })).length).toBe(1)
  })

  it('returns newest first and honours limit', async () => {
    const all = await db.repairs.list()
    expect(new Date(all[0].receivedAt).getTime()).toBeGreaterThanOrEqual(new Date(all[all.length - 1].receivedAt).getTime())
    expect(await db.repairs.list({ limit: 3 })).toHaveLength(3)
  })

  it('returns nothing for a search that matches nothing', async () => {
    expect(await db.repairs.list({ search: 'zzzzz-no-match' })).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// Job numbering
// ---------------------------------------------------------------------------
describe('nextJobNumber', () => {
  it('continues from the highest seeded number', async () => {
    expect(await db.repairs.nextJobNumber('br_colombo', 2026)).toBe('FX-2026-004822')
  })

  it('starts at 1 for a year with no jobs', async () => {
    expect(await db.repairs.nextJobNumber('br_colombo', 2027)).toBe('FX-2027-000001')
  })
})

// ---------------------------------------------------------------------------
// Creating a repair
// ---------------------------------------------------------------------------
describe('repairs.create', () => {
  const valid = {
    branchId: 'br_colombo',
    customerId: 'cus_nimal',
    deviceId: 'dev_001',
    customerName: 'Nimal Perera',
    phone: '+94771234567',
    email: 'nimal@example.com',
    deviceSummary: 'Dell Latitude 5420',
    serialNumber: 'DL5420LK2291',
    reportedIssue: 'Fan is very loud under load.',
    deviceCondition: 'Good',
    accessoriesReceived: ['Charger'],
    intakePhotoUrls: [],
    completionPhotoUrls: [],
    priority: 'normal' as const,
    status: 'received' as const,
    technicianId: '',
    receivedAt: new Date().toISOString(),
    expectedCompletion: '',
    internalNotes: '',
    customerVisibleNotes: [],
    labourCost: 0,
  }

  it('creates the job and its first history entry together', async () => {
    const job = await db.repairs.create(valid)
    expect(job.id).toBeTruthy()
    expect(job.jobNumber).toBe('FX-2026-004822')
    const history = await db.repairs.history(job.id)
    expect(history).toHaveLength(1)
    expect(history[0].to).toBe('received')
  })

  it('rejects an unknown branch', async () => {
    await expect(db.repairs.create({ ...valid, branchId: 'br_nowhere' })).rejects.toThrow(/branch/i)
  })

  it('rejects an unknown customer', async () => {
    await expect(db.repairs.create({ ...valid, customerId: 'cus_ghost' })).rejects.toThrow(/customer/i)
  })

  it('rejects a job with no reported issue', async () => {
    await expect(db.repairs.create({ ...valid, reportedIssue: '   ' })).rejects.toThrow(/issue/i)
  })

  it('increments the job number for each new job', async () => {
    const a = await db.repairs.create(valid)
    const b = await db.repairs.create(valid)
    expect(a.jobNumber).toBe('FX-2026-004822')
    expect(b.jobNumber).toBe('FX-2026-004823')
  })
})

// ---------------------------------------------------------------------------
// The workflow (§7, §28.10)
// ---------------------------------------------------------------------------
describe('repairs.changeStatus', () => {
  let jobId: string

  beforeEach(async () => {
    const jobs = await db.repairs.list({ status: 'received' })
    jobId = jobs[0].id
  })

  it('advances along a legal transition', async () => {
    const job = await db.repairs.changeStatus(jobId, 'diagnosing', 'usr_tech_1')
    expect(job.status).toBe('diagnosing')
  })

  it('records who moved it and when', async () => {
    await db.repairs.changeStatus(jobId, 'diagnosing', 'usr_tech_1', 'Bench test started.')
    const history = await db.repairs.history(jobId)
    const last = history[history.length - 1]
    expect(last.to).toBe('diagnosing')
    expect(last.from).toBe('received')
    expect(last.byUserId).toBe('usr_tech_1')
    expect(last.note).toBe('Bench test started.')
  })

  it('refuses to skip steps and leaves the job untouched', async () => {
    const before = await db.repairs.get(jobId)
    await expect(db.repairs.changeStatus(jobId, 'delivered', 'usr_admin')).rejects.toThrow(/cannot move/i)
    const after = await db.repairs.get(jobId)
    expect(after?.status).toBe(before?.status)
    // And no history entry was written for the rejected move.
    const history = await db.repairs.history(jobId)
    expect(history[history.length - 1].to).toBe(before?.status)
  })

  it('chains before/after across several moves', async () => {
    await db.repairs.changeStatus(jobId, 'diagnosing', 'usr_tech_1')
    await db.repairs.changeStatus(jobId, 'waiting_for_approval', 'usr_tech_1')
    const history = await db.repairs.history(jobId)
    const tail = history.slice(-2)
    expect(tail[0].to).toBe('diagnosing')
    expect(tail[1].from).toBe('diagnosing')
    expect(tail[1].to).toBe('waiting_for_approval')
  })

  it('allows cancelling from a non-terminal state', async () => {
    const job = await db.repairs.changeStatus(jobId, 'cancelled', 'usr_manager', 'Customer withdrew.')
    expect(job.status).toBe('cancelled')
  })

  it('refuses to move a cancelled job anywhere', async () => {
    await db.repairs.changeStatus(jobId, 'cancelled', 'usr_manager')
    await expect(db.repairs.changeStatus(jobId, 'diagnosing', 'usr_manager')).rejects.toThrow()
  })

  it('throws on an unknown repair id', async () => {
    await expect(db.repairs.changeStatus('rep_ghost', 'diagnosing', 'usr_tech_1')).rejects.toThrow(/no repair/i)
  })

  it('gives every history entry a strictly increasing sequence', async () => {
    // `history()` orders by `seq`, not by `at`. Two moves landing in the same
    // millisecond would share a timestamp, and a sort tie-break has no defined
    // result — so an audit trail ordered by timestamp alone would be
    // unreliable. That is why the sequence exists.
    //
    // A same-millisecond tie cannot be forced through the public API here:
    // freezing the clock with fake timers breaks the promise scheduling Dexie
    // and IndexedDB run on, and every later test cascades. So this asserts the
    // invariant that guarantees correct order regardless of timestamps.
    for (const job of await db.repairs.list()) {
      const history = await db.repairs.history(job.id)
      history.forEach((entry, i) => expect(entry.seq).toBe(i))
    }
  })

  it('keeps history in move order after several rapid transitions', async () => {
    await db.repairs.changeStatus(jobId, 'diagnosing', 'usr_tech_1')
    await db.repairs.changeStatus(jobId, 'waiting_for_approval', 'usr_tech_1')
    await db.repairs.changeStatus(jobId, 'approved', 'usr_manager')
    const history = await db.repairs.history(jobId)
    expect(history.map((h) => h.to)).toEqual(['received', 'diagnosing', 'waiting_for_approval', 'approved'])
    expect(history.map((h) => h.seq)).toEqual([0, 1, 2, 3])
  })
})

describe('repairs.assignTechnician', () => {
  it('assigns and records it in the history', async () => {
    const [job] = await db.repairs.list({ status: 'received' })
    const updated = await db.repairs.assignTechnician(job.id, 'usr_tech_1', 'usr_manager')
    expect(updated.technicianId).toBe('usr_tech_1')
    const history = await db.repairs.history(job.id)
    expect(history[history.length - 1].note).toMatch(/John Silva/)
  })

  it('refuses to assign a user who is not a technician', async () => {
    const [job] = await db.repairs.list()
    await expect(db.repairs.assignTechnician(job.id, 'usr_cashier', 'usr_manager')).rejects.toThrow(/not a technician/i)
  })

  it('refuses an unknown user', async () => {
    const [job] = await db.repairs.list()
    await expect(db.repairs.assignTechnician(job.id, 'usr_ghost', 'usr_manager')).rejects.toThrow(/no technician/i)
  })
})

// ---------------------------------------------------------------------------
// Customers (§13, §20)
// ---------------------------------------------------------------------------
describe('customers', () => {
  const input = {
    fullName: 'Sunil Rathnayake',
    phone: '+94779998877',
    email: 'sunil@example.com',
    address: '10 Main Street, Galle',
    notes: '',
    status: 'active' as const,
  }

  it('creates a customer with a generated code and token', async () => {
    const c = await db.customers.create(input)
    expect(c.id).toBeTruthy()
    expect(c.code).toMatch(/^C-\d{5}$/)
    expect(c.portalToken.startsWith('ptk_')).toBe(true)
  })

  it('rejects a duplicate phone number', async () => {
    await db.customers.create(input)
    await expect(db.customers.create(input)).rejects.toThrow(/already exists/i)
  })

  it('rejects a customer with no phone number', async () => {
    await expect(db.customers.create({ ...input, phone: '  ' })).rejects.toThrow(/phone/i)
  })

  it('cannot reassign the portal token or code on update (§20)', async () => {
    const c = await db.customers.create(input)
    const updated = await db.customers.update(c.id, {
      fullName: 'Sunil R.',
      portalToken: 'hijacked',
      code: 'HACKED',
    } as never)
    expect(updated.fullName).toBe('Sunil R.')
    expect(updated.portalToken).toBe(c.portalToken)
    expect(updated.code).toBe(c.code)
  })

  it('searches by name, phone and code', async () => {
    expect((await db.customers.search('nimal')).length).toBeGreaterThan(0)
    expect((await db.customers.search('+94762345678')).length).toBe(1)
    expect((await db.customers.search('   '))).toHaveLength(0)
  })

  it('resolves a portal token to exactly one customer', async () => {
    const [nimal] = (await db.customers.list()).filter((c) => c.id === 'cus_nimal')
    const found = await db.customers.byPortalToken(nimal.portalToken)
    expect(found?.id).toBe('cus_nimal')
  })

  it('returns nothing for a wrong or empty token', async () => {
    expect(await db.customers.byPortalToken('ptk_wrong')).toBeUndefined()
    expect(await db.customers.byPortalToken('')).toBeUndefined()
  })

  it('throws when updating a customer that does not exist', async () => {
    await expect(db.customers.update('cus_ghost', { fullName: 'x' })).rejects.toThrow(/no customer/i)
  })
})

// ---------------------------------------------------------------------------
// Devices and users
// ---------------------------------------------------------------------------
describe('devices', () => {
  it('lists the devices belonging to one customer', async () => {
    const devices = await db.devices.forCustomer('cus_nimal')
    expect(devices).toHaveLength(2)
    devices.forEach((d) => expect(d.customerId).toBe('cus_nimal'))
  })

  it('creates a device', async () => {
    const d = await db.devices.create({
      customerId: 'cus_nimal',
      category: 'laptop',
      brand: 'Lenovo',
      model: 'ThinkPad T480',
      serialNumber: 'LNV480X',
      purchaseDate: '',
      notes: '',
    })
    expect(d.id).toBeTruthy()
    expect(await db.devices.forCustomer('cus_nimal')).toHaveLength(3)
  })

  it('rejects a device with no brand or model', async () => {
    await expect(
      db.devices.create({ customerId: 'cus_nimal', category: 'laptop', brand: '  ', model: 'x', serialNumber: '', purchaseDate: '', notes: '' }),
    ).rejects.toThrow(/brand and a model/i)
  })
})

describe('users', () => {
  it('lists technicians, filtered by branch', async () => {
    const all = await db.users.technicians()
    expect(all.length).toBe(3)
    const colombo = await db.users.technicians('br_colombo')
    expect(colombo).toHaveLength(2)
    const kandy = await db.users.technicians('br_kandy')
    expect(kandy).toHaveLength(1)
    expect(kandy[0].fullName).toBe('Amal Perera')
  })

  it('never returns a non-technician as a technician', async () => {
    const all = await db.users.technicians()
    all.forEach((u) => expect(u.role).toBe('technician'))
  })

  it('lists users by role', async () => {
    expect(await db.users.byRole('cashier')).toHaveLength(1)
    expect(await db.users.byRole('admin')).toHaveLength(1)
  })
})
