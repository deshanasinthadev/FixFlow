import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { createDb } from './dexie'
import type { Db } from './repository'

/**
 * Cash register sessions (§10).
 *
 * The point of a session is that "expected in the drawer" is derived from the
 * float plus what was actually taken in cash, so a variance means something.
 * The tests therefore focus on what counts toward that figure and what does not.
 */
let db: Db
let uid = 0

const FLOAT = 15000_00 // Rs. 15,000 opening float

beforeEach(async () => {
  db = createDb(`fixflow-cash-test-${++uid}`)
  await db.ready()
})

const open = (over: Record<string, unknown> = {}) =>
  db.cashSessions.open({
    branchId: 'br_colombo',
    cashierId: 'usr_cashier',
    openingBalance: FLOAT,
    ...over,
  } as never)

/**
 * Yields long enough that the next `nowIso()` lands in a later millisecond.
 * Session windows compare timestamps, so a boundary test must not depend on
 * how fast the machine happens to be. A real timer, not fake timers — faking
 * the clock breaks the promise scheduling Dexie and IndexedDB rely on.
 */
const tick = () => new Promise((resolve) => setTimeout(resolve, 5))

const sell = (quantity: number, method: 'cash' | 'card' | 'bank_transfer' = 'cash') =>
  db.sales.checkout({
    branchId: 'br_colombo',
    lines: [{ productId: 'prd_chr_65w_001', quantity }],
    paymentMethod: method,
    taxEnabled: false,
    cashierId: 'usr_cashier',
  })

describe('opening a session', () => {
  it('records the float and leaves the session open', async () => {
    const session = await open()
    expect(session.openingBalance).toBe(FLOAT)
    expect(session.closedAt).toBe('')
    expect(session.closingBalance).toBeNull()
  })

  it('is retrievable as the branch current session', async () => {
    const session = await open()
    expect((await db.cashSessions.current('br_colombo'))?.id).toBe(session.id)
  })

  it('refuses a negative float', async () => {
    await expect(open({ openingBalance: -100 })).rejects.toThrow(/cannot be negative/i)
  })

  it('allows a zero float', async () => {
    expect((await open({ openingBalance: 0 })).openingBalance).toBe(0)
  })

  it('refuses a second open session at the same branch (§28.15)', async () => {
    await open()
    await expect(open()).rejects.toThrow(/already open/i)
  })

  it('allows a new session once the previous one is closed', async () => {
    const first = await open()
    await db.cashSessions.close(first.id, { countedCash: FLOAT, cashierId: 'usr_cashier' })
    await expect(open()).resolves.toBeDefined()
  })

  it('allows both branches to have a session open at once', async () => {
    await open()
    await expect(open({ branchId: 'br_kandy', cashierId: 'usr_tech_3' })).resolves.toBeDefined()
  })

  it('refuses an unknown branch or cashier', async () => {
    await expect(open({ branchId: 'br_nowhere' })).rejects.toThrow(/unknown branch/i)
    await expect(open({ cashierId: 'usr_ghost' })).rejects.toThrow(/unknown cashier/i)
  })
})

describe('expected cash', () => {
  it('equals the float before any trade', async () => {
    const session = await open()
    expect(await db.cashSessions.expectedCash(session.id)).toBe(FLOAT)
  })

  it('adds cash takings', async () => {
    const session = await open()
    const sale = await sell(2)
    expect(await db.cashSessions.expectedCash(session.id)).toBe(FLOAT + sale.amountPaid)
  })

  it('ignores card and bank sales, which never reach the drawer', async () => {
    const session = await open()
    await sell(2, 'card')
    await sell(1, 'bank_transfer')
    expect(await db.cashSessions.expectedCash(session.id)).toBe(FLOAT)
  })

  it('mixes cash and non-cash correctly', async () => {
    const session = await open()
    const cashSale = await sell(2, 'cash')
    await sell(3, 'card')
    expect(await db.cashSessions.expectedCash(session.id)).toBe(FLOAT + cashSale.amountPaid)
  })

  it('subtracts cash refunds', async () => {
    const session = await open()
    const sale = await sell(3)
    const before = await db.cashSessions.expectedCash(session.id)
    await db.sales.refund(sale.id, { amount: 2000_00, reason: 'Partial return', approvedBy: 'usr_manager' })
    expect(await db.cashSessions.expectedCash(session.id)).toBe(before - 2000_00)
  })

  it('does not subtract a refund of a card sale from the drawer', async () => {
    const session = await open()
    const sale = await sell(2, 'card')
    await db.sales.refund(sale.id, { reason: 'Faulty', approvedBy: 'usr_manager' })
    expect(await db.cashSessions.expectedCash(session.id)).toBe(FLOAT)
  })

  it('excludes trade that happened before the session opened', async () => {
    // Sell first, then open: the drawer did not take that money.
    const early = await sell(2)
    await tick()
    const session = await open()
    expect(new Date(early.createdAt).getTime()).toBeLessThan(new Date(session.openedAt).getTime())
    expect(await db.cashSessions.expectedCash(session.id)).toBe(FLOAT)
  })

  it('freezes once closed, so a later session is unaffected', async () => {
    const first = await open()
    const sale = await sell(2)
    await db.cashSessions.close(first.id, { countedCash: FLOAT + sale.amountPaid, cashierId: 'usr_cashier' })
    const frozenAt = (await db.cashSessions.get(first.id))!.expectedClosingBalance

    await tick()
    await open()
    await sell(4)
    expect((await db.cashSessions.get(first.id))!.expectedClosingBalance).toBe(frozenAt)
  })

  it('throws on an unknown session', async () => {
    await expect(db.cashSessions.expectedCash('csh_ghost')).rejects.toThrow(/no cash session/i)
  })
})

describe('closing a session', () => {
  it('stores the count and the expected figure side by side', async () => {
    const session = await open()
    const sale = await sell(2)
    const closed = await db.cashSessions.close(session.id, {
      countedCash: FLOAT + sale.amountPaid,
      cashierId: 'usr_cashier',
    })
    expect(closed.closingBalance).toBe(FLOAT + sale.amountPaid)
    expect(closed.expectedClosingBalance).toBe(FLOAT + sale.amountPaid)
    expect(closed.closedAt).not.toBe('')
  })

  it('records a shortfall as a variance the caller can derive', async () => {
    const session = await open()
    const sale = await sell(2)
    const closed = await db.cashSessions.close(session.id, {
      countedCash: FLOAT + sale.amountPaid - 500_00,
      cashierId: 'usr_cashier',
    })
    // Derived, never stored, so it cannot drift from its inputs.
    expect(closed.closingBalance! - closed.expectedClosingBalance!).toBe(-500_00)
  })

  it('records an overage the same way', async () => {
    const session = await open()
    const closed = await db.cashSessions.close(session.id, {
      countedCash: FLOAT + 250_00,
      cashierId: 'usr_cashier',
    })
    expect(closed.closingBalance! - closed.expectedClosingBalance!).toBe(250_00)
  })

  it('refuses to close twice', async () => {
    const session = await open()
    await db.cashSessions.close(session.id, { countedCash: FLOAT, cashierId: 'usr_cashier' })
    await expect(
      db.cashSessions.close(session.id, { countedCash: FLOAT, cashierId: 'usr_cashier' }),
    ).rejects.toThrow(/already closed/i)
  })

  it('refuses a negative count', async () => {
    const session = await open()
    await expect(
      db.cashSessions.close(session.id, { countedCash: -1, cashierId: 'usr_cashier' }),
    ).rejects.toThrow(/cannot be negative/i)
  })

  it('clears the branch current session', async () => {
    const session = await open()
    await db.cashSessions.close(session.id, { countedCash: FLOAT, cashierId: 'usr_cashier' })
    expect(await db.cashSessions.current('br_colombo')).toBeUndefined()
  })

  it('throws on an unknown session', async () => {
    await expect(
      db.cashSessions.close('csh_ghost', { countedCash: 0, cashierId: 'usr_cashier' }),
    ).rejects.toThrow(/no cash session/i)
  })
})

describe('cashSessions.list', () => {
  it('filters by branch and by open/closed', async () => {
    const colombo = await open()
    await open({ branchId: 'br_kandy', cashierId: 'usr_tech_3' })
    await db.cashSessions.close(colombo.id, { countedCash: FLOAT, cashierId: 'usr_cashier' })

    expect(await db.cashSessions.list()).toHaveLength(2)
    expect(await db.cashSessions.list({ branchId: 'br_colombo' })).toHaveLength(1)
    expect(await db.cashSessions.list({ status: 'open' })).toHaveLength(1)
    expect(await db.cashSessions.list({ status: 'closed' })).toHaveLength(1)
    expect((await db.cashSessions.list({ status: 'closed' }))[0].id).toBe(colombo.id)
  })

  it('returns newest first', async () => {
    const first = await open()
    await db.cashSessions.close(first.id, { countedCash: FLOAT, cashierId: 'usr_cashier' })
    const second = await open()
    const all = await db.cashSessions.list()
    expect(all[0].id).toBe(second.id)
  })
})
