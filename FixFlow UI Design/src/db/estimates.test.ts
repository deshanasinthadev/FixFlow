import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { createDb } from './dexie'
import type { Db } from './repository'

/**
 * Estimates and customer approvals (§9, §28.13).
 *
 * The rules that matter: an estimate cannot be approved before it is sent, the
 * approval itself is recorded rather than only the resulting status, a revision
 * preserves the estimate it replaces, and approving moves the repair on only
 * when that move is legal.
 */
let db: Db
let uid = 0

beforeEach(async () => {
  db = createDb(`fixflow-est-test-${++uid}`)
  await db.ready()
})

/** A repair parked where a decision is expected. */
async function repairAwaitingApproval() {
  const customer = await db.customers.create({
    fullName: 'Test Buyer', phone: '+94770001111', email: '', address: '', notes: '', status: 'active',
  })
  const device = await db.devices.create({
    customerId: customer.id, category: 'laptop', brand: 'HP', model: 'Pavilion',
    serialNumber: 'HP-PV-1', purchaseDate: '', notes: '',
  })
  const job = await db.repairs.create({
    branchId: 'br_colombo', customerId: customer.id, deviceId: device.id,
    customerName: customer.fullName, phone: customer.phone, email: '',
    deviceSummary: 'HP Pavilion', serialNumber: 'HP-PV-1',
    reportedIssue: 'Screen flickers under load.',
    deviceCondition: 'Good — minor wear', accessoriesReceived: [], intakePhotoUrls: [],
    completionPhotoUrls: [], priority: 'normal', status: 'received', technicianId: '',
    receivedAt: new Date().toISOString(), expectedCompletion: '', internalNotes: '',
    customerVisibleNotes: [], labourCost: 0,
  })
  await db.repairs.changeStatus(job.id, 'diagnosing', 'usr_tech_1')
  return db.repairs.changeStatus(job.id, 'waiting_for_approval', 'usr_tech_1')
}

const quote = (repairId: string, over: Record<string, unknown> = {}) =>
  db.estimates.create({
    repairId,
    items: [{ description: 'Replacement panel', quantity: 1, unitPrice: 12000_00 }],
    labourCost: 3500_00,
    taxEnabled: false,
    actorId: 'usr_tech_1',
    ...over,
  } as never)

describe('estimates.create', () => {
  it('starts as a draft with a branch estimate number', async () => {
    const repair = await repairAwaitingApproval()
    const estimate = await quote(repair.id)
    expect(estimate.status).toBe('draft')
    expect(estimate.estimateNumber).toMatch(/^EST-CMB-\d{4}-\d{4}$/)
  })

  it('numbers sequentially within a branch', async () => {
    const repair = await repairAwaitingApproval()
    const a = await quote(repair.id)
    const b = await quote(repair.id)
    expect(a.estimateNumber.slice(-4)).toBe('0001')
    expect(b.estimateNumber.slice(-4)).toBe('0002')
  })

  it('totals labour plus parts, less discount, using the shared money rule', async () => {
    const repair = await repairAwaitingApproval()
    const estimate = await quote(repair.id, { labourCost: 3500_00, discount: 500_00 })
    expect(estimate.total).toBe(12000_00 + 3500_00 - 500_00)
    expect(estimate.taxAmount).toBe(0)
  })

  it('applies tax to the discounted amount when enabled', async () => {
    const repair = await repairAwaitingApproval()
    const estimate = await quote(repair.id, {
      labourCost: 0, discount: 2000_00, taxEnabled: true, taxRate: 10,
    })
    expect(estimate.taxAmount).toBe(Math.round((12000_00 - 2000_00) * 0.1))
  })

  it('carries the customer and branch from the repair, not from the caller', async () => {
    const repair = await repairAwaitingApproval()
    const estimate = await quote(repair.id)
    expect(estimate.customerId).toBe(repair.customerId)
    expect(estimate.branchId).toBe(repair.branchId)
  })

  it('refuses an estimate with no lines and no labour', async () => {
    const repair = await repairAwaitingApproval()
    await expect(quote(repair.id, { items: [], labourCost: 0 })).rejects.toThrow(/at least one line/i)
  })

  it('refuses a zero or fractional quantity', async () => {
    const repair = await repairAwaitingApproval()
    await expect(
      quote(repair.id, { items: [{ description: 'Panel', quantity: 0, unitPrice: 100 }] }),
    ).rejects.toThrow(/positive whole-number quantity/i)
  })

  it('refuses a line with no description', async () => {
    const repair = await repairAwaitingApproval()
    await expect(
      quote(repair.id, { items: [{ description: '   ', quantity: 1, unitPrice: 100 }] }),
    ).rejects.toThrow(/needs a description/i)
  })

  it('refuses an unknown repair', async () => {
    await expect(quote('fxr_ghost')).rejects.toThrow(/no repair/i)
  })
})

describe('estimates.send', () => {
  it('moves a draft to sent', async () => {
    const repair = await repairAwaitingApproval()
    const draft = await quote(repair.id)
    const sent = await db.estimates.send(draft.id, 'usr_manager')
    expect(sent.status).toBe('sent')
  })

  it('refuses to send twice', async () => {
    const repair = await repairAwaitingApproval()
    const draft = await quote(repair.id)
    await db.estimates.send(draft.id, 'usr_manager')
    await expect(db.estimates.send(draft.id, 'usr_manager')).rejects.toThrow(/cannot be sent/i)
  })

  it('throws on an unknown estimate', async () => {
    await expect(db.estimates.send('est_ghost', 'usr_manager')).rejects.toThrow(/no estimate/i)
  })
})

describe('deciding on an estimate (§28.13)', () => {
  it('records the approval itself, not just the resulting status', async () => {
    const repair = await repairAwaitingApproval()
    const sent = await db.estimates.send((await quote(repair.id)).id, 'usr_manager')
    const { approval } = await db.estimates.decide(sent.id, {
      decision: 'approved', method: 'phone', recordedBy: 'usr_manager', note: 'Customer agreed by phone',
    })
    expect(approval.decision).toBe('approved')
    expect(approval.method).toBe('phone')
    expect(approval.recordedBy).toBe('usr_manager')
    expect(await db.approvals.forEstimate(sent.id)).toHaveLength(1)
  })

  it('moves a waiting repair to approved', async () => {
    const repair = await repairAwaitingApproval()
    const sent = await db.estimates.send((await quote(repair.id)).id, 'usr_manager')
    await db.estimates.decide(sent.id, { decision: 'approved', method: 'in_person', recordedBy: 'usr_manager' })
    expect((await db.repairs.get(repair.id))?.status).toBe('approved')
  })

  it('appends the approval to the repair audit trail', async () => {
    const repair = await repairAwaitingApproval()
    const sent = await db.estimates.send((await quote(repair.id)).id, 'usr_manager')
    await db.estimates.decide(sent.id, { decision: 'approved', method: 'portal', recordedBy: 'usr_manager' })
    const history = await db.repairs.history(repair.id)
    expect(history.at(-1)?.to).toBe('approved')
    expect(history.at(-1)?.note).toContain(sent.estimateNumber)
  })

  it('reports approval through the gate the workflow uses to allow work', async () => {
    const repair = await repairAwaitingApproval()
    expect(await db.approvals.hasApprovalFor(repair.id)).toBe(false)
    const sent = await db.estimates.send((await quote(repair.id)).id, 'usr_manager')
    await db.estimates.decide(sent.id, { decision: 'approved', method: 'portal', recordedBy: 'usr_manager' })
    expect(await db.approvals.hasApprovalFor(repair.id)).toBe(true)
  })

  it('does not report approval after a rejection', async () => {
    const repair = await repairAwaitingApproval()
    const sent = await db.estimates.send((await quote(repair.id)).id, 'usr_manager')
    await db.estimates.decide(sent.id, {
      decision: 'rejected', method: 'phone', recordedBy: 'usr_manager', note: 'Too expensive',
    })
    expect(await db.approvals.hasApprovalFor(repair.id)).toBe(false)
  })

  it('refuses to decide on an estimate that was never sent', async () => {
    const repair = await repairAwaitingApproval()
    const draft = await quote(repair.id)
    await expect(
      db.estimates.decide(draft.id, { decision: 'approved', method: 'portal', recordedBy: 'usr_manager' }),
    ).rejects.toThrow(/only a sent estimate/i)
  })

  it('refuses to decide twice on the same estimate', async () => {
    const repair = await repairAwaitingApproval()
    const sent = await db.estimates.send((await quote(repair.id)).id, 'usr_manager')
    await db.estimates.decide(sent.id, { decision: 'approved', method: 'portal', recordedBy: 'usr_manager' })
    await expect(
      db.estimates.decide(sent.id, { decision: 'rejected', method: 'portal', recordedBy: 'usr_manager', note: 'x' }),
    ).rejects.toThrow(/only a sent estimate/i)
  })

  it('requires a reason for a rejection', async () => {
    const repair = await repairAwaitingApproval()
    const sent = await db.estimates.send((await quote(repair.id)).id, 'usr_manager')
    await expect(
      db.estimates.decide(sent.id, { decision: 'rejected', method: 'phone', recordedBy: 'usr_manager', note: '  ' }),
    ).rejects.toThrow(/record why/i)
  })

  it('leaves the repair alone when it is not waiting, but still records the decision', async () => {
    // A repair that has already moved on must not be dragged backwards.
    const repair = await repairAwaitingApproval()
    const sent = await db.estimates.send((await quote(repair.id)).id, 'usr_manager')
    await db.repairs.update(repair.id, { status: 'received' })

    const { approval } = await db.estimates.decide(sent.id, {
      decision: 'approved', method: 'portal', recordedBy: 'usr_manager',
    })
    expect(approval.decision).toBe('approved')
    expect((await db.repairs.get(repair.id))?.status).toBe('received')
  })
})

describe('estimates.revise (§9)', () => {
  it('creates a new estimate and links the old one to it', async () => {
    const repair = await repairAwaitingApproval()
    const first = await quote(repair.id)
    const second = await db.estimates.revise(first.id, {
      repairId: repair.id,
      items: [{ description: 'Replacement panel', quantity: 1, unitPrice: 9500_00 }],
      labourCost: 3500_00,
      taxEnabled: false,
      actorId: 'usr_manager',
    })

    expect(second.id).not.toBe(first.id)
    expect(second.total).toBeLessThan(first.total)

    const closed = await db.estimates.get(first.id)
    expect(closed?.status).toBe('revised')
    expect(closed?.supersededBy).toBe(second.id)
  })

  it('keeps the superseded estimate readable, so the negotiation stays auditable', async () => {
    const repair = await repairAwaitingApproval()
    const first = await quote(repair.id)
    await db.estimates.revise(first.id, {
      repairId: repair.id,
      items: [{ description: 'Cheaper panel', quantity: 1, unitPrice: 8000_00 }],
      labourCost: 3500_00,
      taxEnabled: false,
      actorId: 'usr_manager',
    })
    const all = await db.estimates.list({ repairId: repair.id })
    expect(all).toHaveLength(2)
    // The original figure is unchanged, not overwritten.
    expect(all.find((e) => e.id === first.id)?.total).toBe(12000_00 + 3500_00)
  })

  it('refuses to revise an estimate that was already approved', async () => {
    const repair = await repairAwaitingApproval()
    const sent = await db.estimates.send((await quote(repair.id)).id, 'usr_manager')
    await db.estimates.decide(sent.id, { decision: 'approved', method: 'portal', recordedBy: 'usr_manager' })
    await expect(
      db.estimates.revise(sent.id, {
        repairId: repair.id,
        items: [{ description: 'Another panel', quantity: 1, unitPrice: 100 }],
        actorId: 'usr_manager',
      }),
    ).rejects.toThrow()
  })

  it('allows a rejected estimate to be revised', async () => {
    const repair = await repairAwaitingApproval()
    const sent = await db.estimates.send((await quote(repair.id)).id, 'usr_manager')
    await db.estimates.decide(sent.id, {
      decision: 'rejected', method: 'phone', recordedBy: 'usr_manager', note: 'Too expensive',
    })
    const revised = await db.estimates.revise(sent.id, {
      repairId: repair.id,
      items: [{ description: 'Refurbished panel', quantity: 1, unitPrice: 7000_00 }],
      labourCost: 3000_00,
      taxEnabled: false,
      actorId: 'usr_manager',
    })
    expect(revised.status).toBe('draft')
  })
})

describe('estimates.list', () => {
  it('filters by repair, branch and status', async () => {
    const repair = await repairAwaitingApproval()
    const draft = await quote(repair.id)
    await db.estimates.send((await quote(repair.id)).id, 'usr_manager')

    expect(await db.estimates.list({ repairId: repair.id })).toHaveLength(2)
    expect(await db.estimates.list({ branchId: 'br_colombo' })).toHaveLength(2)
    expect(await db.estimates.list({ status: 'draft' })).toHaveLength(1)
    expect((await db.estimates.list({ status: 'draft' }))[0].id).toBe(draft.id)
    expect(await db.estimates.list({ customerId: repair.customerId })).toHaveLength(2)
  })
})

describe('the approval gate on repair status (§28.13)', () => {
  it('refuses to start work with no approval recorded', async () => {
    const repair = await repairAwaitingApproval()
    await expect(
      db.repairs.changeStatus(repair.id, 'approved', 'usr_manager'),
    ).resolves.toBeDefined() // approved is not itself gated
    await expect(
      db.repairs.changeStatus(repair.id, 'repairing', 'usr_tech_1'),
    ).rejects.toThrow(/has not approved the estimate/i)
  })

  it('allows work once an estimate has been approved', async () => {
    const repair = await repairAwaitingApproval()
    const sent = await db.estimates.send((await quote(repair.id)).id, 'usr_manager')
    await db.estimates.decide(sent.id, { decision: 'approved', method: 'portal', recordedBy: 'usr_manager' })

    const moved = await db.repairs.changeStatus(repair.id, 'repairing', 'usr_tech_1')
    expect(moved.status).toBe('repairing')
  })

  it('still refuses after the estimate was rejected', async () => {
    const repair = await repairAwaitingApproval()
    const sent = await db.estimates.send((await quote(repair.id)).id, 'usr_manager')
    await db.estimates.decide(sent.id, {
      decision: 'rejected', method: 'phone', recordedBy: 'usr_manager', note: 'Too expensive',
    })
    await db.repairs.changeStatus(repair.id, 'approved', 'usr_manager')
    await expect(
      db.repairs.changeStatus(repair.id, 'repairing', 'usr_tech_1'),
    ).rejects.toThrow(/has not approved the estimate/i)
  })

  it('does not gate the pre-approval steps', async () => {
    // Diagnosis and quoting must be possible before anyone has agreed to pay.
    const customer = await db.customers.create({
      fullName: 'Gate Test', phone: '+94770002222', email: '', address: '', notes: '', status: 'active',
    })
    const device = await db.devices.create({
      customerId: customer.id, category: 'mobile', brand: 'Oppo', model: 'A57',
      serialNumber: 'OP-A57', purchaseDate: '', notes: '',
    })
    const job = await db.repairs.create({
      branchId: 'br_kandy', customerId: customer.id, deviceId: device.id,
      customerName: customer.fullName, phone: customer.phone, email: '',
      deviceSummary: 'Oppo A57', serialNumber: 'OP-A57', reportedIssue: 'Battery drains fast',
      deviceCondition: 'Good — minor wear', accessoriesReceived: [], intakePhotoUrls: [],
      completionPhotoUrls: [], priority: 'normal', status: 'received', technicianId: '',
      receivedAt: new Date().toISOString(), expectedCompletion: '', internalNotes: '',
      customerVisibleNotes: [], labourCost: 0,
    })
    expect((await db.repairs.changeStatus(job.id, 'diagnosing', 'usr_tech_1')).status).toBe('diagnosing')
    expect((await db.repairs.changeStatus(job.id, 'waiting_for_approval', 'usr_tech_1')).status)
      .toBe('waiting_for_approval')
  })

  it('writes nothing when the gate refuses', async () => {
    const repair = await repairAwaitingApproval()
    await db.repairs.changeStatus(repair.id, 'approved', 'usr_manager')
    const historyBefore = await db.repairs.history(repair.id)
    await expect(
      db.repairs.changeStatus(repair.id, 'repairing', 'usr_tech_1'),
    ).rejects.toThrow()
    expect(await db.repairs.history(repair.id)).toHaveLength(historyBefore.length)
    expect((await db.repairs.get(repair.id))?.status).toBe('approved')
  })
})
