import { describe, expect, it } from 'vitest'
import {
  DIAGNOSIS_RULES,
  inspectionPlan,
  suggestDiagnosis,
  tokenize,
} from './engine'

describe('tokenize', () => {
  it('lowercases and splits on non-alphanumerics', () => {
    expect(tokenize('Laptop Gets VERY hot!')).toEqual(['laptop', 'gets', 'very', 'hot'])
  })

  it('keeps hyphenated terms intact', () => {
    expect(tokenize('wi-fi drops out')).toEqual(['wi-fi', 'drops', 'out'])
  })

  it('returns nothing for empty or punctuation-only input', () => {
    expect(tokenize('')).toEqual([])
    expect(tokenize('   ---  ')).toEqual([])
  })
})

describe('suggestDiagnosis', () => {
  it('never claims to be AI (§8)', () => {
    const result = suggestDiagnosis({ complaint: 'it is very hot' })
    expect(result.engine).toBe('rule-based')
  })

  it('depends on the input — the old screen did not', () => {
    // The previous implementation returned the same three causes and "86%
    // confidence" whatever the technician typed.
    const thermal = suggestDiagnosis({ complaint: 'overheats and the fan is loud' })
    const liquid = suggestDiagnosis({ complaint: 'spilled coffee on it yesterday' })
    expect(thermal.matches[0].ruleId).toBe('thermal')
    expect(liquid.matches[0].ruleId).toBe('liquid')
    expect(thermal.matches[0].title).not.toBe(liquid.matches[0].title)
  })

  it('matches on the complaint and on technician observations together', () => {
    const result = suggestDiagnosis({
      complaint: 'will not turn on',
      observations: 'customer mentioned a spill last week',
    })
    expect(result.matches.some((m) => m.ruleId === 'liquid')).toBe(true)
  })

  it('ranks a rule matched on several terms above one matched on one', () => {
    const result = suggestDiagnosis({
      complaint: 'overheats, very hot, thermal shutdown and the fan is loud',
    })
    const thermal = result.matches.find((m) => m.ruleId === 'thermal')!
    expect(result.matches[0].ruleId).toBe('thermal')
    expect(thermal.matchedKeywords.length).toBeGreaterThan(1)
  })

  it('orders results by score', () => {
    const result = suggestDiagnosis({
      complaint: 'hot and the battery drains and the screen flickers',
    })
    const scores = result.matches.map((m) => m.score)
    expect(scores).toEqual([...scores].sort((a, b) => b - a))
  })

  it('keeps every score within 0-1', () => {
    const result = suggestDiagnosis({
      complaint: 'hot heat overheat overheats burning thermal fan noise loud fan spilled water liquid',
    })
    expect(result.matches.length).toBeGreaterThan(0)
    for (const match of result.matches) {
      expect(match.score).toBeGreaterThan(0)
      expect(match.score).toBeLessThanOrEqual(1)
    }
  })

  it('reports no match rather than guessing when nothing fits', () => {
    const result = suggestDiagnosis({ complaint: 'the device is beige' })
    expect(result.noMatch).toBe(true)
    expect(result.matches).toEqual([])
  })

  it('sets noMatch false when something did match', () => {
    expect(suggestDiagnosis({ complaint: 'screen flickers' }).noMatch).toBe(false)
  })

  it('surfaces terms it did not recognise', () => {
    const result = suggestDiagnosis({ complaint: 'overheats after installing zorphicator' })
    expect(result.unmatchedTerms).toContain('zorphicator')
  })

  it('does not list recognised terms as unmatched', () => {
    const result = suggestDiagnosis({ complaint: 'the battery drains quickly' })
    expect(result.unmatchedTerms).not.toContain('battery')
  })

  it('ignores short terms when reporting what it missed', () => {
    const result = suggestDiagnosis({ complaint: 'hot but no boot' })
    expect(result.unmatchedTerms.every((t) => t.length > 3)).toBe(true)
  })

  it('records which keywords produced each match', () => {
    const result = suggestDiagnosis({ complaint: 'spilled coffee on the keyboard' })
    const liquid = result.matches.find((m) => m.ruleId === 'liquid')!
    expect(liquid.matchedKeywords).toContain('spilled')
  })

  it('carries inspection steps with each match', () => {
    const result = suggestDiagnosis({ complaint: 'overheats' })
    expect(result.matches[0].inspectionSteps.length).toBeGreaterThan(0)
  })

  it('handles an empty complaint without throwing', () => {
    const result = suggestDiagnosis({ complaint: '' })
    expect(result.noMatch).toBe(true)
    expect(result.matches).toEqual([])
  })

  it('is deterministic for the same input', () => {
    const a = suggestDiagnosis({ complaint: 'screen flickers and battery drains' })
    const b = suggestDiagnosis({ complaint: 'screen flickers and battery drains' })
    expect(a).toEqual(b)
  })
})

describe('the rule base itself', () => {
  it('gives every rule a unique id', () => {
    const ids = DIAGNOSIS_RULES.map((r) => r.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('gives every rule keywords, steps and a weight', () => {
    for (const rule of DIAGNOSIS_RULES) {
      expect(rule.keywords.length).toBeGreaterThan(0)
      expect(rule.inspectionSteps.length).toBeGreaterThan(0)
      expect(rule.weight).toBeGreaterThanOrEqual(1)
      expect(rule.weight).toBeLessThanOrEqual(10)
      expect(rule.title.trim().length).toBeGreaterThan(0)
    }
  })

  it('stores keywords lowercased, so matching cannot silently miss', () => {
    for (const rule of DIAGNOSIS_RULES) {
      for (const keyword of rule.keywords) {
        expect(keyword).toBe(keyword.toLowerCase())
      }
    }
  })
})

describe('inspectionPlan', () => {
  it('merges steps from every match', () => {
    const result = suggestDiagnosis({ complaint: 'overheats and the screen flickers' })
    const plan = inspectionPlan(result)
    expect(plan.length).toBeGreaterThan(result.matches[0].inspectionSteps.length)
  })

  it('deduplicates repeated steps', () => {
    const result = suggestDiagnosis({ complaint: 'hot heat overheat overheats' })
    const plan = inspectionPlan(result)
    expect(new Set(plan).size).toBe(plan.length)
  })

  it('follows the ranking, so the top cause is inspected first', () => {
    const result = suggestDiagnosis({ complaint: 'overheats and the screen flickers' })
    expect(inspectionPlan(result)[0]).toBe(result.matches[0].inspectionSteps[0])
  })

  it('returns nothing when there was no match', () => {
    expect(inspectionPlan(suggestDiagnosis({ complaint: 'the device is beige' }))).toEqual([])
  })
})
