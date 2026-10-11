import { describe, expect, it } from 'vitest'
import { newId, newSecret, nowIso } from './schema'

/**
 * Identifiers and secrets (§11, §20).
 *
 * These are different jobs. `newId` labels a row and only has to be distinct;
 * `newSecret` is a credential — for a customer portal token, holding it is what
 * proves you are that customer — so it has to be unpredictable, not merely
 * unique. A generator that is unique but predictable would let one leaked token
 * be used to work out another.
 */

describe('newId', () => {
  it('prefixes and separates ids', () => {
    const id = newId('prd')
    expect(id.startsWith('prd_')).toBe(true)
  })

  it('does not repeat itself', () => {
    const ids = new Set(Array.from({ length: 500 }, () => newId('prd')))
    expect(ids.size).toBe(500)
  })
})

describe('newSecret', () => {
  it('carries the prefix', () => {
    expect(newSecret('ptk').startsWith('ptk_')).toBe(true)
  })

  it('is 32 hex characters of entropy after the prefix', () => {
    const body = newSecret('ptk').slice('ptk_'.length)
    expect(body).toHaveLength(32)
    expect(body).toMatch(/^[0-9a-f]{32}$/)
  })

  it('does not repeat across a thousand draws', () => {
    const secrets = new Set(Array.from({ length: 1000 }, () => newSecret('ptk')))
    expect(secrets.size).toBe(1000)
  })

  it('does not leak a counter or a timestamp', () => {
    // Two secrets drawn back to back must share nothing but the prefix. A
    // sequential or time-based component would show up as a common prefix in
    // the body.
    const a = newSecret('ptk').slice('ptk_'.length)
    const b = newSecret('ptk').slice('ptk_'.length)
    let shared = 0
    while (shared < a.length && a[shared] === b[shared]) shared += 1
    expect(shared).toBeLessThan(4)
  })

  it('is not merely a re-labelled row id', () => {
    // The whole point of the split: an id is ~14 chars of base36 and carries
    // `Date.now()`, so it is guessable to within a millisecond.
    const id = newId('ptk')
    expect(id.length).toBeLessThan(newSecret('ptk').length)
  })
})

describe('nowIso', () => {
  it('is a parseable instant', () => {
    expect(Number.isNaN(new Date(nowIso()).getTime())).toBe(false)
  })
})
