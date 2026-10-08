import Papa from 'papaparse'

/**
 * Pure CSV pipeline. No React, no DOM, no database — every function here is
 * unit tested in `pipeline.test.ts`.
 *
 * Import is five stages, not one: parse → map → validate → preview → commit.
 * Collapsing them is what makes imports fail on the first real customer file.
 */

export type Row = Record<string, string>
export type ParsedCsv = { headers: string[]; rows: Row[] }

/** Column mapping: source header -> target field key, or null to ignore. */
export type ColumnMap = Record<string, string | null>

export type RowIssue = {
  /** 1-based row number as the user sees it in their spreadsheet. */
  row: number
  field: string
  message: string
  value: string
}

export type ValidateResult<T> = { valid: T[]; issues: RowIssue[] }

/** Strip a UTF-8 BOM, which Excel writes and which otherwise corrupts the first header. */
const stripBom = (text: string) => (text.charCodeAt(0) === 0xfeff ? text.slice(1) : text)

export function parseCsv(text: string): ParsedCsv {
  const parsed = Papa.parse<Row>(stripBom(text), {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: (h) => h.trim(),
    transform: (v) => (v ?? '').trim(),
  })
  const rows = parsed.data.filter((r) => Object.values(r).some((v) => v !== ''))
  const headers = parsed.meta.fields ?? (rows[0] ? Object.keys(rows[0]) : [])
  return { headers, rows }
}

export type FieldSpec = {
  key: string
  label: string
  required?: boolean
  /** Aliases used when guessing the mapping from a user's headers. */
  aliases?: string[]
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')

/**
 * Guess a mapping by exact-normalised match first, then substring either way.
 * Returns null for headers it cannot place so the user maps those by hand.
 */
export function guessMapping(headers: string[], fields: FieldSpec[]): ColumnMap {
  const map: ColumnMap = {}
  for (const header of headers) {
    const h = norm(header)
    let hit: string | null = null

    for (const f of fields) {
      if (norm(f.label) === h || norm(f.key) === h) {
        hit = f.key
        break
      }
    }
    if (!hit) {
      for (const f of fields) {
        const cands = [f.label, f.key, ...(f.aliases ?? [])].map(norm)
        if (cands.some((c) => c && (h.includes(c) || c.includes(h)))) {
          hit = f.key
          break
        }
      }
    }
    map[header] = hit
  }
  return map
}

/**
 * "1,850" | "Rs. 1,850" | "1850.50" | "LKR 1850" -> integer cents.
 *
 * Locale assumption: en-LK, where "," groups thousands and "." is the decimal
 * separator. Everything else is stripped.
 *
 * This must not silently produce a wrong number. An earlier version kept stray
 * dots, so "Rs. 1,850" became ".1850" -> 0.185 -> 19 cents: a Rs. 1,850 product
 * imported as 19 cents, with no error. Ambiguous input returns null instead.
 */
export function parseMoneyToCents(input: string): number | null {
  const s = input.trim()
  if (s === '') return null

  // Drop a leading currency prefix such as "Rs.", "LKR", "USD ". Without this,
  // the dot in "Rs." survives the numeric filter and "Rs. 1,850" reads as
  // ".1850" -> 19 cents.
  const withoutPrefix = s.replace(/^[^\d-]*[a-zA-Z][^\d-]*/, '')

  // Commas are thousands groups and fall out of the character class below.
  const cleaned = withoutPrefix.replace(/[^0-9.-]/g, '')
  if (cleaned === '' || cleaned === '-' || cleaned === '.') return null
  if ((cleaned.match(/\./g) ?? []).length > 1) return null // "1.2.3.4"

  const n = Number(cleaned)
  if (!Number.isFinite(n)) return null
  return Math.round(n * 100)
}

/**
 * Whole numbers only. "1,200" -> 1200 (thousands group), but "1.5" -> null:
 * quantities are integers, and silently reading 1.5 as 15 is a 10x stock error.
 */
export function parseInteger(input: string): number | null {
  const s = input.trim()
  if (s === '' || s.includes('.')) return null
  const cleaned = s.replace(/[^0-9\-]/g, '').replace(/,/g, '')
  if (cleaned === '' || cleaned === '-') return null
  if (!/^-?\d+$/.test(cleaned)) return null
  const n = Number(cleaned)
  return Number.isInteger(n) ? n : null
}

export function parseBoolean(input: string): boolean {
  return ['true', 'yes', 'y', '1', 'service'].includes(input.trim().toLowerCase())
}

export type Coercer = (raw: string) => { ok: true; value: unknown } | { ok: false; message: string }

const req = (raw: string) =>
  raw.trim() === '' ? { ok: false as const, message: 'is required' } : { ok: true as const, value: raw.trim() }

export const coercers = {
  text: (raw: string) => ({ ok: true as const, value: raw.trim() }),
  requiredText: req,
  money: (raw: string) => {
    if (raw.trim() === '') return { ok: true as const, value: 0 }
    const v = parseMoneyToCents(raw)
    return v === null
      ? { ok: false as const, message: `is not a valid amount ("${raw}")` }
      : { ok: true as const, value: v }
  },
  int: (raw: string) => {
    if (raw.trim() === '') return { ok: true as const, value: 0 }
    const v = parseInteger(raw)
    return v === null ? { ok: false as const, message: `is not a whole number ("${raw}")` } : { ok: true as const, value: v }
  },
  bool: (raw: string) => ({ ok: true as const, value: parseBoolean(raw) }),
}

export type ValidateOptions = {
  fields: Array<FieldSpec & { coerce: Coercer }>
  mapping: ColumnMap
  /** Extra cross-field / uniqueness checks run after per-field coercion. */
  check?: (value: Record<string, unknown>, rowIndex: number) => string | null
}

/**
 * Validates every row and collects every issue — never stops at the first one.
 * Row numbers are 1-based spreadsheet rows (header is row 1).
 */
export function validateRows<T>(rows: Row[], opts: ValidateOptions): ValidateResult<T> {
  const valid: T[] = []
  const issues: RowIssue[] = []

  // Invert the mapping: field key -> source header.
  const sourceFor: Record<string, string> = {}
  for (const [header, field] of Object.entries(opts.mapping)) {
    if (field) sourceFor[field] = header
  }

  rows.forEach((row, i) => {
    const rowNo = i + 2 // +1 for the header row, +1 for 1-based
    const value: Record<string, unknown> = {}
    let bad = false

    for (const f of opts.fields) {
      const header = sourceFor[f.key]
      const raw = header === undefined ? '' : (row[header] ?? '')

      if (raw.trim() === '' && f.required) {
        issues.push({ row: rowNo, field: f.label, message: 'is required', value: raw })
        bad = true
        continue
      }
      const result = f.coerce(raw)
      if (!result.ok) {
        issues.push({ row: rowNo, field: f.label, message: result.message, value: raw })
        bad = true
      } else {
        value[f.key] = result.value
      }
    }

    if (bad) return
    if (opts.check) {
      const err = opts.check(value, i)
      if (err) {
        issues.push({ row: rowNo, field: '—', message: err, value: '' })
        return
      }
    }
    valid.push(value as T)
  })

  return { valid, issues }
}

/** Serialise rows to CSV, escaping only what RFC 4180 requires. */
export function toCsv(headers: string[], rows: Array<Record<string, unknown>>): string {
  return Papa.unparse(
    { fields: headers, data: rows.map((r) => headers.map((h) => r[h] ?? '')) },
    { quotes: false, newline: '\r\n' },
  )
}

/** An error report the user can open in Excel and fix. */
export function issuesToCsv(issues: RowIssue[]): string {
  return toCsv(
    ['Row', 'Field', 'Value', 'Problem'],
    issues.map((i) => ({ Row: i.row, Field: i.field, Value: i.value, Problem: i.message })),
  )
}
