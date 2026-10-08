import { useState } from 'react'
import { Icon } from '../../components/Icon'
import { useDb } from '../../db/store'
import { LK_STANDARD_VAT } from '../../db/seed'
import type { Product } from '../../db/schema'
import { formatLKR } from '../../lib/format'

type Draft = {
  sku: string
  name: string
  category: string
  price: string
  cost: string
  taxRate: string
  stockOnHand: string
  minStock: string
  barcode: string
  isService: boolean
}

const empty: Draft = {
  sku: '', name: '', category: 'Spare Parts', price: '', cost: '',
  taxRate: String(LK_STANDARD_VAT), stockOnHand: '0', minStock: '0', barcode: '', isService: false,
}

const fromProduct = (p: Product): Draft => ({
  sku: p.sku, name: p.name, category: p.category,
  price: String(p.priceCents / 100), cost: String(p.costCents / 100),
  taxRate: String(p.taxRate), stockOnHand: String(p.stockOnHand),
  minStock: String(p.minStock), barcode: p.barcode, isService: p.isService,
})

const rupeesToCents = (s: string) => Math.round((Number(s.replace(/[^0-9.]/g, '')) || 0) * 100)

/** Create or edit one product. Stock is only settable on create — after that it
 *  moves through the ledger, so editing it here would silently break the audit trail. */
export function ProductForm({ product, branchId, close }: {
  product: Product | null
  branchId: string
  close: () => void
}) {
  const { db, bump } = useDb()
  const [draft, setDraft] = useState<Draft>(product ? fromProduct(product) : empty)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }))

  async function save() {
    setError('')
    if (!draft.sku.trim() || !draft.name.trim()) {
      setError('SKU and name are both required.')
      return
    }
    setSaving(true)
    try {
      const values = {
        sku: draft.sku.trim(),
        name: draft.name.trim(),
        category: draft.category.trim() || 'Uncategorised',
        priceCents: rupeesToCents(draft.price),
        costCents: rupeesToCents(draft.cost),
        taxRate: Number(draft.taxRate) || 0,
        minStock: Math.max(0, Math.trunc(Number(draft.minStock) || 0)),
        barcode: draft.barcode.trim(),
        isService: draft.isService,
        branchId,
      }
      if (product) {
        await db.products.update(product.id, values)
      } else {
        await db.products.create({ ...values, stockOnHand: Math.max(0, Math.trunc(Number(draft.stockOnHand) || 0)) })
      }
      bump()
      close()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save.')
      setSaving(false)
    }
  }

  const priceCents = rupeesToCents(draft.price)
  const taxCents = Math.round((priceCents * (Number(draft.taxRate) || 0)) / 100)
  const marginCents = priceCents - rupeesToCents(draft.cost)

  return (
    <div className="modal-wrap" onMouseDown={close}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-modal="true"
        aria-label={product ? 'Edit product' : 'Add product'}>
        <div className="modal-head">
          <div>
            <h2>{product ? 'Edit product' : 'Add product'}</h2>
            <p>{product ? product.sku : 'New product in Colombo 03'}</p>
          </div>
          <button className="icon-btn" onClick={close} aria-label="Close"><Icon name="close" /></button>
        </div>

        {error && <div className="login-error"><Icon name="alert" /><span><strong>Could not save</strong>{error}</span></div>}

        <div className="form-grid">
          <label>SKU *<div className="input"><input value={draft.sku} onChange={(e) => set('sku', e.target.value)} placeholder="CHR-65W-001" /></div></label>
          <label>Product name *<div className="input"><input value={draft.name} onChange={(e) => set('name', e.target.value)} placeholder="65W Laptop Charger" /></div></label>
          <label>Category<div className="input"><input value={draft.category} onChange={(e) => set('category', e.target.value)} placeholder="Spare Parts" /></div></label>
          <label>Barcode<div className="input"><input value={draft.barcode} onChange={(e) => set('barcode', e.target.value)} placeholder="89650001" /></div></label>
          <label>Selling price (Rs.)<div className="input"><input inputMode="decimal" value={draft.price} onChange={(e) => set('price', e.target.value)} placeholder="6500" /></div></label>
          <label>Cost price (Rs.)<div className="input"><input inputMode="decimal" value={draft.cost} onChange={(e) => set('cost', e.target.value)} placeholder="4160" /></div></label>
          <label>Tax rate (%)<div className="input"><input inputMode="numeric" value={draft.taxRate} onChange={(e) => set('taxRate', e.target.value)} placeholder="18" /></div></label>
          <label>Min stock<div className="input"><input inputMode="numeric" value={draft.minStock} onChange={(e) => set('minStock', e.target.value)} placeholder="5" /></div></label>
          {!product && (
            <label>Opening stock<div className="input"><input inputMode="numeric" value={draft.stockOnHand} onChange={(e) => set('stockOnHand', e.target.value)} placeholder="0" /></div></label>
          )}
        </div>

        <label className="check-label form-check">
          <input type="checkbox" checked={draft.isService} onChange={(e) => set('isService', e.target.checked)} />
          <span>This is a service, not a stocked item</span>
        </label>

        <div className="form-totals">
          <div><span>Price incl. tax</span><strong>{formatLKR(priceCents + taxCents)}</strong></div>
          <div><span>Tax at {draft.taxRate || 0}%</span><strong>{formatLKR(taxCents)}</strong></div>
          <div><span>Margin</span><strong className={marginCents < 0 ? 'danger-text' : 'ok-text'}>{formatLKR(marginCents)}</strong></div>
        </div>

        {product && (
          <p className="form-note">
            <Icon name="alert" size={13} />
            Stock is {product.stockOnHand} on hand. Change it from Stock Adjustments so the
            movement is recorded in the ledger — editing it here would leave no trail.
          </p>
        )}

        <div className="modal-actions">
          <button type="button" className="btn secondary" onClick={close}><span>Cancel</span></button>
          <button type="button" className="btn primary" onClick={() => void save()} disabled={saving}>
            <span>{saving ? 'Saving…' : product ? 'Save changes' : 'Add product'}</span>
          </button>
        </div>
      </div>
    </div>
  )
}
