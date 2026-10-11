import { describe, expect, it } from 'vitest'
import {
  LOGIN_HASH,
  buildHash,
  deslugify,
  formatRoute,
  parseHash,
  slugify,
} from './routes'

/**
 * §2 — hash routing. These are the pure halves of the router; the two
 * functions that touch `window` are exercised by the app itself.
 */

describe('slugify / deslugify', () => {
  it('converts a page label to a slug', () => {
    expect(slugify('Repair Details')).toBe('repair-details')
    expect(slugify('POS')).toBe('pos')
    expect(slugify('Stock Adjustments')).toBe('stock-adjustments')
  })

  it('trims stray whitespace before slugging', () => {
    expect(slugify('  Repair   Details  ')).toBe('repair---details')
  })

  it('converts a slug back to a page label', () => {
    expect(deslugify('repair-details')).toBe('Repair Details')
    expect(deslugify('pos')).toBe('Pos')
    expect(deslugify('stock-adjustments')).toBe('Stock Adjustments')
  })

  it('round-trips a multi-word label', () => {
    expect(deslugify(slugify('Warranty Claims'))).toBe('Warranty Claims')
  })
})

describe('buildHash', () => {
  it('builds a role-scoped hash', () => {
    expect(buildHash('Admin', 'Dashboard')).toBe('#/admin/dashboard')
    expect(buildHash('Technician', 'My Repairs')).toBe('#/technician/my-repairs')
  })

  it('lowercases the role', () => {
    expect(buildHash('MANAGER', 'POS')).toBe('#/manager/pos')
  })
})

describe('parseHash', () => {
  it('parses a role and page', () => {
    expect(parseHash('#/admin/repair-details')).toEqual({ role: 'admin', page: 'Repair Details' })
  })

  it('tolerates a missing leading slash', () => {
    expect(parseHash('#admin/dashboard')).toEqual({ role: 'admin', page: 'Dashboard' })
  })

  it('tolerates a leading slash without a hash', () => {
    expect(parseHash('/admin/dashboard')).toEqual({ role: 'admin', page: 'Dashboard' })
  })

  it('recognises the login route', () => {
    expect(parseHash(LOGIN_HASH)).toEqual({ role: 'login', page: 'Login' })
  })

  it('rejects an empty or bare hash rather than guessing', () => {
    expect(parseHash('')).toBeNull()
    expect(parseHash('#')).toBeNull()
    expect(parseHash('#/')).toBeNull()
  })

  it('rejects a role with no page', () => {
    expect(parseHash('#/admin')).toBeNull()
  })

  it('keeps a multi-segment page together', () => {
    expect(parseHash('#/admin/my-repair-details')).toEqual({ role: 'admin', page: 'My Repair Details' })
  })
})

describe('formatRoute', () => {
  it('formats a normal route', () => {
    expect(formatRoute({ role: 'admin', page: 'Dashboard' })).toBe('#/admin/dashboard')
  })

  it('formats login as the login hash', () => {
    expect(formatRoute({ role: 'login', page: 'Login' })).toBe(LOGIN_HASH)
  })

  it('round-trips through parseHash', () => {
    const target = { role: 'cashier', page: 'Point Of Sale' }
    expect(parseHash(formatRoute(target))).toEqual({ role: 'cashier', page: 'Point Of Sale' })
  })
})
