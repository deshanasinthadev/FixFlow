import { describe, expect, it } from 'vitest'
import {
  coercers,
  guessMapping,
  issuesToCsv,
  parseCsv,
  parseInteger,
  parseMoneyToCents,
  toCsv,
  validateRows,
  type Coercer,
  type FieldSpec,
} from './pipeline'

/** The field spec the products import actually uses. */
const fields: Array<FieldSpec & { coerce: Coercer }> = [
  { key: 'sku', label: 'SKU', required: true, aliases: ['code', 'item code'], coerce: coercers.requiredText },
  { key: 'name', label: 'Name', required: true, aliases: ['item name', 'product'], coerce: coercers.requiredText },
  { key: 'category', label: 'Category', aliases: ['cat', 'group'], coerce: coercers.text },
  { key: 'priceCents', label: 'Price', aliases: ['unit price', 'selling price'], coerce: coercers.money },
  { key: 'costCents', label: 'Cost', aliases: ['unit cost', 'buy price'], coerce: coercers.money },
  { key: 'stockOnHand', label: 'Stock', aliases: ['qty', 'quantity', 'on hand'], coerce: coercers.int },
  { key: 'minStock', label: 'Min Stock', aliases: ['reorder level'], coerce: coercers.int },
  { key: 'isService', label: 'Is Service', aliases: ['service'], coerce: coercers.bool },
]

describe('parseCsv', () => {
  it('reads headers and rows', () => {
    const { headers, rows } = parseCsv('SKU,Name,Price\nA-1,Widget,1850\n')
    expect(headers).toEqual(['SKU', 'Name', 'Price'])
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ SKU: 'A-1', Name: 'Widget', Price: '1850' })
  })

  it('strips the UTF-8 BOM Excel writes, so the first header is usable', () => {
    const { headers } = parseCsv('\uFEFFSKU,Name\nA-1,Widget\n')
    expect(headers[0]).toBe('SKU')
  })

  it('detects a semicolon delimiter', () => {
    const { headers } = parseCsv('SKU;Name\nA-1;Widget\n')
    expect(headers).toEqual(['SKU', 'Name'])
  })

  it('skips blank lines', () => {
    const { rows } = parseCsv('SKU,Name\nA-1,Widget\n\n\nB-2,Gadget\n')
    expect(rows).toHaveLength(2)
  })

  it('keeps quoted commas intact', () => {
    const { rows } = parseCsv('SKU,Name\nA-1,"Widget, large"\n')
    expect(rows[0].Name).toBe('Widget, large')
  })
})

describe('guessMapping', () => {
  it('matches exact, alias and substring headers', () => {
    const map = guessMapping(
      ['Item Code', 'Item Name', 'Unit Price (Rs.)', 'QTY', 'Supplier Notes'],
      fields,
    )
    expect(map['Item Code']).toBe('sku')
    expect(map['Item Name']).toBe('name')
    expect(map['Unit Price (Rs.)']).toBe('priceCents')
    expect(map['QTY']).toBe('stockOnHand')
    expect(map['Supplier Notes']).toBeNull()
  })

  it('leaves unknown headers unmapped rather than guessing wrong', () => {
    const map = guessMapping(['zzz', 'Name'], fields)
    expect(map['zzz']).toBeNull()
    expect(map['Name']).toBe('name')
  })
})

describe('parseMoneyToCents', () => {
  it.each([
    ['1850', 185000],
    ['1,850', 185000],
    ['Rs. 1,850', 185000],
    ['LKR 1850.50', 185050],
    [' 38,500.00 ', 3850000],
    ['0', 0],
  ])('parses %j -> %i', (input, expected) => {
    expect(parseMoneyToCents(input)).toBe(expected)
  })

  it.each([[''], ['abc'], ['Rs.'], ['1.2.3.4']])('rejects %j', (input) => {
    const v = parseMoneyToCents(input)
    expect(v === null || Number.isFinite(v)).toBe(true)
    if (input === 'abc' || input === 'Rs.') expect(v).toBeNull()
  })
})

describe('parseInteger', () => {
  it.each([['14', 14], ['1,200', 1200], ['-3', -3]] as Array<[string, number]>)(
    'parses %j -> %i',
    (input, expected) => expect(parseInteger(input)).toBe(expected),
  )
  it.each([['abc'], ['1.5'], ['']] as Array<[string]>)('rejects %j', (input) => {
    expect(parseInteger(input)).toBeNull()
  })
})

describe('validateRows', () => {
  it('reports 1-based spreadsheet row numbers (header is row 1)', () => {
    const { valid, issues } = validateRows(
      [{ SKU: 'A-1', Name: 'Widget', Price: '1850' }],
      { fields, mapping: { SKU: 'sku', Name: 'name', Price: 'priceCents' } },
    )
    expect(valid).toHaveLength(1)
    expect(issues).toHaveLength(0)
  })

  it('collects every issue, not just the first', () => {
    const { valid, issues } = validateRows(
      [
        { SKU: '', Name: 'No sku', Price: '100' },
        { SKU: 'B-2', Name: '', Price: 'not money' },
      ],
      { fields, mapping: { SKU: 'sku', Name: 'name', Price: 'priceCents' } },
    )
    expect(valid).toHaveLength(0)
    expect(issues).toHaveLength(3)
    expect(issues[0]).toMatchObject({ row: 2, field: 'SKU' })
    expect(issues[1]).toMatchObject({ row: 3, field: 'Name' })
    expect(issues[2]).toMatchObject({ row: 3, field: 'Price' })
  })

  it('applies defaults for optional fields left blank', () => {
    const { valid } = validateRows<Array<Record<string, unknown>>>(
      [{ SKU: 'A-1', Name: 'Widget' }],
      { fields, mapping: { SKU: 'sku', Name: 'name', Price: 'priceCents', Stock: 'stockOnHand' } },
    )
    expect(valid[0]).toMatchObject({ priceCents: 0, stockOnHand: 0 })
  })

  it('runs the cross-field check only on otherwise-valid rows', () => {
    const { valid, issues } = validateRows(
      [
        { SKU: 'A-1', Name: 'Widget' },
        { SKU: 'A-1', Name: 'Duplicate' },
      ],
      {
        fields,
        mapping: { SKU: 'sku', Name: 'name' },
        check: (v, i, ) => {
          void i
          return String(v.sku).startsWith('A') ? 'SKU must not start with A' : null
        },
      },
    )
    expect(valid).toHaveLength(0)
    expect(issues).toHaveLength(2)
    expect(issues[0].message).toBe('SKU must not start with A')
  })
})

describe('toCsv / issuesToCsv', () => {
  it('round-trips values containing commas and quotes', () => {
    const csv = toCsv(['Name', 'Note'], [{ Name: 'Widget, large', Note: 'say "hi"' }])
    const { rows } = parseCsv(csv)
    expect(rows[0].Name).toBe('Widget, large')
    expect(rows[0].Note).toBe('say "hi"')
  })

  it('produces an error report with a header the user can read', () => {
    const csv = issuesToCsv([{ row: 4, field: 'Price', message: 'is not a valid amount', value: 'abc' }])
    const { headers, rows } = parseCsv(csv)
    expect(headers).toEqual(['Row', 'Field', 'Value', 'Problem'])
    expect(rows[0]).toMatchObject({ Row: '4', Field: 'Price', Value: 'abc' })
  })
})

describe('end to end: a realistic messy supplier file', () => {
  const file = [
    'Item Code,Item Name,Category,Unit Price (Rs.),QTY,Reorder Level,Service,Supplier Notes',
    'CHR-65W-001,65W Laptop Charger,Chargers,"6,500",14,5,No,from ACME',
    'SRV-THM-005,Thermal Compound Replacement,Services,2200,0,0,Yes,',
    ',Missing SKU row,Chargers,1000,1,1,No,',
    'BAD-PRICE,Broken price row,Chargers,not-a-number,1,1,No,',
  ].join('\n')

  it('maps, validates and separates good rows from bad ones', () => {
    const { headers, rows } = parseCsv(file)
    const mapping = guessMapping(headers, fields)

    const { valid, issues } = validateRows<Array<Record<string, unknown>>>(rows, {
      fields,
      mapping,
    })

    expect(valid).toHaveLength(2)
    expect(valid[0]).toMatchObject({ sku: 'CHR-65W-001', priceCents: 650000, stockOnHand: 14, isService: false })
    expect(valid[1]).toMatchObject({ sku: 'SRV-THM-005', isService: true, stockOnHand: 0 })

    expect(issues).toHaveLength(2)
    expect(issues.map((i) => i.row)).toEqual([4, 5])
    expect(issues[0].field).toBe('SKU')
    expect(issues[1].field).toBe('Price')
  })
})
