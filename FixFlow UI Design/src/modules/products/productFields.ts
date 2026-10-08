import { coercers, toCsv, type Coercer, type FieldSpec } from '../../csv/pipeline'
import { LK_STANDARD_VAT } from '../../db/seed'

export type ImportField = FieldSpec & { coerce: Coercer }

/**
 * The single definition of what a product CSV can contain. Used for the column
 * mapping UI, for validation, and for the downloadable template — so the
 * template can never drift out of sync with what the importer accepts.
 */
export const productImportFields: ImportField[] = [
  { key: 'sku', label: 'SKU', required: true, aliases: ['code', 'item code', 'product code'], coerce: coercers.requiredText },
  { key: 'name', label: 'Name', required: true, aliases: ['item name', 'product', 'description'], coerce: coercers.requiredText },
  { key: 'category', label: 'Category', aliases: ['cat', 'group', 'type'], coerce: coercers.text },
  { key: 'priceCents', label: 'Selling Price', required: true, aliases: ['price', 'unit price', 'sell'], coerce: coercers.money },
  { key: 'costCents', label: 'Cost Price', aliases: ['cost', 'unit cost', 'buy price'], coerce: coercers.money },
  { key: 'taxRate', label: 'Tax Rate %', aliases: ['vat', 'tax'], coerce: coercers.int },
  { key: 'stockOnHand', label: 'Stock On Hand', aliases: ['stock', 'qty', 'quantity', 'on hand'], coerce: coercers.int },
  { key: 'minStock', label: 'Min Stock', aliases: ['reorder level', 'minimum'], coerce: coercers.int },
  { key: 'barcode', label: 'Barcode', aliases: ['ean', 'upc'], coerce: coercers.text },
  { key: 'isService', label: 'Is Service', aliases: ['service'], coerce: coercers.bool },
]

const fieldByKey = new Map(productImportFields.map((f) => [f.key, f]))
export const productField = (key: string) => fieldByKey.get(key)

const example = [
  {
    SKU: 'CHR-65W-001',
    Name: '65W Laptop Charger',
    Category: 'Chargers',
    'Selling Price': '6,500',
    'Cost Price': '4,160',
    'Tax Rate %': String(LK_STANDARD_VAT),
    'Stock On Hand': '14',
    'Min Stock': '5',
    Barcode: '89650001',
    'Is Service': 'No',
  },
  {
    SKU: 'SRV-THM-005',
    Name: 'Thermal Compound Replacement',
    Category: 'Services',
    'Selling Price': '2200',
    'Cost Price': '0',
    'Tax Rate %': String(LK_STANDARD_VAT),
    'Stock On Hand': '0',
    'Min Stock': '0',
    Barcode: '',
    'Is Service': 'Yes',
  },
]

/**
 * The template download. Highest-value feature in the whole importer: users
 * who start from this file almost never produce an error row.
 */
export function productTemplateCsv(): string {
  return toCsv(productImportFields.map((f) => f.label), example)
}

/** Headers of the file we export, so re-importing our own export just works. */
export const productExportHeaders = productImportFields.map((f) => f.label)
