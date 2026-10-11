import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { createDb } from './dexie'
import type { Db } from './repository'

/**
 * Operating expenses (§18).
 *
 * The rules that matter: an expense is validated before it is written, a
 * correction reverses rather than edits, and reversals net to zero in every
 * total rather than being hidden.
 */
let db: Db
let uid = 0

beforeEach(async () => {
  db = createDb(`fixflow-exp-test-${++uid}`)
  await db.ready()
})

const spend = (over: Record<string, unknown> = {}) =>
  db.expenses.create({
    branchId: 'br_colombo',
    category: 'rent',
    amount: 25000_00,
    description: 'Shop rent, March',
    method: 'bank_transfer',
    spentAt: '2026-03-01T00:00:00.000Z',
    recordedBy: 'usr_manager',
    ...over,
  } as never)

describe('expenses.create', () => {
  it('records an expense against a branch', async () => {
    const expense = await spend()
    expect(expense.id).toBeTruthy()
    expect(expense.branchId).toBe('br_colombo')
    expect(expense.amount).toBe(25000_00)
  })

  it('rejects a zero or negative amount', async () => {
    await expect(spend({ amount: 0 })).rejects.toThrow(/greater than zero/)
    await expect(spend({ amount: -500 })).rejects.toThrow(/greater than zero/)
  })

  it('rejects a blank description', async () => {
    await expect(spend({ description: '   ' })).rejects.toThrow(/needs a description/)
  })

  it('rejects an unknown category', async () => {
    await expect(spend({ category: 'bribes' })).rejects.toThrow(/not an expense category/)
  })

  it('rejects a missing or malformed date', async () => {
    await expect(spend({ spentAt: '' })).rejects.toThrow(/valid date/)
    await expect(spend({ spentAt: 'last tuesday' })).rejects.toThrow(/valid date/)
  })

  it('writes nothing when validation fails', async () => {
    await expect(spend({ amount: 0 })).rejects.toThrow()
    expect(await db.expenses.list({ branchId: 'br_colombo' })).toHaveLength(0)
  })
})

describe('expenses.reverse', () => {
  it('§28.18 — reverses by appending, leaving the original intact', async () => {
    const original = await spend()
    const reversal = await db.expenses.reverse(original.id, 'usr_admin', 'Entered twice.')

    expect(reversal.id).not.toBe(original.id)
    expect(reversal.amount).toBe(-25000_00)

    const rows = await db.expenses.list({ branchId: 'br_colombo' })
    expect(rows).toHaveLength(2)
    // The original was not edited.
    expect(rows.find((e) => e.id === original.id)?.amount).toBe(25000_00)
  })

  it('nets to zero in the total', async () => {
    const original = await spend()
    expect(await db.expenses.total({ branchId: 'br_colombo' })).toBe(25000_00)

    await db.expenses.reverse(original.id, 'usr_admin', 'Entered twice.')
    expect(await db.expenses.total({ branchId: 'br_colombo' })).toBe(0)
  })

  it('requires a reason', async () => {
    const original = await spend()
    await expect(db.expenses.reverse(original.id, 'usr_admin', '   ')).rejects.toThrow(/Record why/)
  })

  it('refuses to reverse a reversal', async () => {
    const original = await spend()
    const reversal = await db.expenses.reverse(original.id, 'usr_admin', 'Entered twice.')
    await expect(db.expenses.reverse(reversal.id, 'usr_admin', 'Again.')).rejects.toThrow(
      /already a reversal/,
    )
  })

  it('rejects an unknown expense', async () => {
    await expect(db.expenses.reverse('exp_nope', 'usr_admin', 'Gone.')).rejects.toThrow(/No expense/)
  })
})

describe('expenses.list and total', () => {
  it('filters by branch', async () => {
    await spend()
    await spend({ branchId: 'br_kandy' })
    expect(await db.expenses.list({ branchId: 'br_colombo' })).toHaveLength(1)
    expect(await db.expenses.list({ branchId: 'br_kandy' })).toHaveLength(1)
  })

  it('filters by category', async () => {
    await spend()
    await spend({ category: 'electricity', description: 'Power bill' })
    expect(await db.expenses.list({ category: 'rent' })).toHaveLength(1)
    expect(await db.expenses.list({ category: 'electricity' })).toHaveLength(1)
  })

  it('filters by date range', async () => {
    await spend({ spentAt: '2026-01-15T00:00:00.000Z' })
    await spend({ spentAt: '2026-03-15T00:00:00.000Z' })
    await spend({ spentAt: '2026-06-15T00:00:00.000Z' })

    const march = await db.expenses.list({
      from: '2026-03-01T00:00:00.000Z',
      to: '2026-03-31T23:59:59.999Z',
    })
    expect(march).toHaveLength(1)

    const q1 = await db.expenses.total({
      from: '2026-01-01T00:00:00.000Z',
      to: '2026-03-31T23:59:59.999Z',
    })
    expect(q1).toBe(50000_00)
  })

  it('returns newest first', async () => {
    const jan = await spend({ spentAt: '2026-01-15T00:00:00.000Z' })
    const jun = await spend({ spentAt: '2026-06-15T00:00:00.000Z' })
    const all = await db.expenses.list({ branchId: 'br_colombo' })
    expect(all[0].id).toBe(jun.id)
    expect(all[1].id).toBe(jan.id)
  })
})
