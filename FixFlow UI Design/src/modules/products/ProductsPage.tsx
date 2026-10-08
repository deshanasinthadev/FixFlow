import { useMemo, useState } from 'react'
import { Icon } from '../../components/Icon'
import { useDb, useQuery } from '../../db/store'
import type { Product } from '../../db/schema'
import { toCsv } from '../../csv/pipeline'
import { available, formatLKR, formatLKRCompact } from '../../lib/format'
import { downloadText, stamp } from '../../lib/download'
import { productExportHeaders } from './productFields'
import { ProductForm } from './ProductForm'
import { ImportWizard } from './ImportWizard'

type SortKey = 'name' | 'category' | 'stockOnHand' | 'priceCents' | 'costCents'

const PAGE_SIZE = 10

/** Category -> icon, kept out of the schema so the database stays presentational-free. */
const categoryIcon = (c: string) =>
  /charge/i.test(c) ? 'laptop' : /cable/i.test(c) ? 'transfer' : /service/i.test(c) ? 'tool'
    : /accessor/i.test(c) ? 'package' : 'box'

/**
 * The Products page, driven entirely by the repository — no module-level arrays.
 * Every number on this screen is computed from real rows.
 */
export function ProductsPage({ branchId }: { branchId: string }) {
  const { db, bump } = useDb()
  const { data, loading, error } = useQuery<Product[]>((d) => d.products.list())

  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('All')
  const [lowOnly, setLowOnly] = useState(false)
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'name', dir: 1 })
  const [page, setPage] = useState(1)
  const [editing, setEditing] = useState<Product | 'new' | null>(null)
  const [importing, setImporting] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<Product | null>(null)

  const all = data ?? []

  const categories = useMemo(
    () => ['All', ...Array.from(new Set(all.map((p) => p.category))).sort()],
    [all],
  )

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return all.filter((p) => {
      if (category !== 'All' && p.category !== category) return false
      if (lowOnly && !(available(p) <= p.minStock)) return false
      if (!q) return true
      return `${p.name} ${p.sku} ${p.barcode}`.toLowerCase().includes(q)
    })
  }, [all, query, category, lowOnly])

  const sorted = useMemo(() => {
    const copy = [...filtered]
    copy.sort((a, b) => {
      const av = a[sort.key]
      const bv = b[sort.key]
      const cmp = typeof av === 'string' ? String(av).localeCompare(String(bv)) : Number(av) - Number(bv)
      return cmp * sort.dir
    })
    return copy
  }, [filtered, sort])

  const pageCount = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE))
  const current = Math.min(page, pageCount)
  const rows = sorted.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE)

  const kpis = useMemo(() => {
    const stockValue = all.reduce((s, p) => s + p.costCents * p.stockOnHand, 0)
    const retailValue = all.reduce((s, p) => s + p.priceCents * p.stockOnHand, 0)
    const low = all.filter((p) => !p.isService && available(p) <= p.minStock).length
    const out = all.filter((p) => !p.isService && p.stockOnHand === 0).length
    return [
      { label: 'Products', value: String(all.length), note: `${categories.length - 1} categories`, icon: 'box' as const, tone: 'blue' },
      { label: 'Stock at cost', value: formatLKRCompact(stockValue), note: `retail ${formatLKRCompact(retailValue)}`, icon: 'wallet' as const, tone: 'purple' },
      { label: 'Low stock', value: String(low), note: 'at or below minimum', icon: 'alert' as const, tone: 'amber' },
      { label: 'Out of stock', value: String(out), note: 'needs a purchase order', icon: 'close' as const, tone: 'pink' },
      { label: 'Units on hand', value: String(all.reduce((s, p) => s + p.stockOnHand, 0)), note: `${all.reduce((s, p) => s + p.reserved, 0)} reserved`, icon: 'package' as const, tone: 'cyan' },
    ]
  }, [all, categories.length])

  function exportCsv() {
    const body = sorted.map((p) => ({
      SKU: p.sku,
      Name: p.name,
      Category: p.category,
      'Selling Price': (p.priceCents / 100).toFixed(2),
      'Cost Price': (p.costCents / 100).toFixed(2),
      'Tax Rate %': String(p.taxRate),
      'Stock On Hand': String(p.stockOnHand),
      'Min Stock': String(p.minStock),
      Barcode: p.barcode,
      'Is Service': p.isService ? 'Yes' : 'No',
    }))
    downloadText(stamp('fixflow-products', 'csv'), toCsv(productExportHeaders, body))
  }

  function toggleSort(key: SortKey) {
    setSort((s) => (s.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: 1 }))
    setPage(1)
  }

  async function remove(p: Product) {
    setConfirmDelete(null)
    try {
      await db.products.remove(p.id)
      bump()
    } catch {
      /* surfaced by the query error state */
    }
  }

  const Th = ({ k, children, right }: { k?: SortKey; children: React.ReactNode; right?: boolean }) => (
    <th className={right ? 'right' : ''}>
      {k ? (
        <button className="th-sort" onClick={() => toggleSort(k)}>
          {children}
          {sort.key === k && <span>{sort.dir === 1 ? '▲' : '▼'}</span>}
        </button>
      ) : children}
    </th>
  )

  return (
    <>
      <div className="kpi-grid products-kpis">
        {kpis.map((k) => (
          <section className="card kpi" key={k.label}>
            <div className={`kpi-icon ${k.tone}`}><Icon name={k.icon} /></div>
            <div className="kpi-label">{k.label}</div>
            <div className="kpi-value">{k.value}</div>
            <div className="kpi-change positive">{k.note}</div>
          </section>
        ))}
      </div>

      <section className="card filter-card">
        <div className="filter-search">
          <Icon name="search" />
          <input value={query} onChange={(e) => { setQuery(e.target.value); setPage(1) }}
            placeholder="Search name, SKU or barcode…" aria-label="Search products" />
        </div>
        <select className="filter-select" value={category} onChange={(e) => { setCategory(e.target.value); setPage(1) }}
          aria-label="Filter by category">
          {categories.map((c) => <option key={c}>{c}</option>)}
        </select>
        <label className="check-label filter-check">
          <input type="checkbox" checked={lowOnly} onChange={(e) => { setLowOnly(e.target.checked); setPage(1) }} />
          <span>Low stock only</span>
        </label>
        <div className="filter-actions">
          <button className="btn secondary" onClick={() => setImporting(true)}>
            <Icon name="download" size={16} /><span>Import CSV</span>
          </button>
          <button className="btn secondary" onClick={exportCsv} disabled={sorted.length === 0}>
            <Icon name="download" size={16} /><span>Export {sorted.length}</span>
          </button>
          <button className="btn primary" onClick={() => setEditing('new')}>
            <Icon name="plus" size={16} /><span>Add product</span>
          </button>
        </div>
      </section>

      <section className="card table-card">
        <div className="card-head table-title">
          <div>
            <h2>Product inventory</h2>
            <p>Available = on hand − reserved. Stock changes are recorded in the ledger.</p>
          </div>
        </div>

        {loading && <div className="empty-module"><Icon name="clock" size={30} /><h2>Loading products…</h2></div>}
        {error && <div className="empty-module"><Icon name="alert" size={30} /><h2>Could not load products</h2><p>{error}</p></div>}

        {!loading && !error && sorted.length === 0 && (
          <div className="empty-module">
            <Icon name="box" size={30} />
            <h2>{all.length === 0 ? 'No products yet' : 'Nothing matches these filters'}</h2>
            <p>{all.length === 0
              ? 'Add your first product, or import a CSV from your existing system.'
              : `${all.length} products are in this branch, but none match the current search.`}</p>
            {all.length > 0 && (
              <button className="btn secondary" onClick={() => { setQuery(''); setCategory('All'); setLowOnly(false) }}>
                <span>Clear filters</span>
              </button>
            )}
          </div>
        )}

        {rows.length > 0 && (
          <>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <Th k="name">Product</Th>
                    <Th k="category">Category</Th>
                    <Th k="stockOnHand" right>On hand</Th>
                    <th className="right">Available</th>
                    <Th k="costCents" right>Cost</Th>
                    <Th k="priceCents" right>Price</Th>
                    <th className="right">VAT</th>
                    <th>Status</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((p) => {
                    const avail = available(p)
                    const low = !p.isService && avail <= p.minStock
                    return (
                      <tr key={p.id}>
                        <td>
                          <div className="product-name">
                            <div className="product-mini"><Icon name={categoryIcon(p.category)} /></div>
                            <div><strong>{p.name}</strong><span>{p.sku}{p.barcode ? ` · ${p.barcode}` : ''}</span></div>
                          </div>
                        </td>
                        <td>{p.category}</td>
                        <td className="right">{p.isService ? '—' : p.stockOnHand}</td>
                        <td className="right"><strong className={low ? 'danger-text' : ''}>{p.isService ? '—' : avail}</strong></td>
                        <td className="right">{formatLKR(p.costCents)}</td>
                        <td className="right"><strong>{formatLKR(p.priceCents)}</strong></td>
                        <td className="right">{p.taxRate}%</td>
                        <td>
                          {p.isService
                            ? <span className="badge ai"><span className="badge-dot" />Service</span>
                            : p.stockOnHand === 0
                              ? <span className="badge low-stock"><span className="badge-dot" />Out of stock</span>
                              : low
                                ? <span className="badge low-stock"><span className="badge-dot" />Low stock</span>
                                : <span className="badge in-stock"><span className="badge-dot" />In stock</span>}
                        </td>
                        <td>
                          <div className="row-actions">
                            <button className="more-btn" aria-label={`Edit ${p.name}`} onClick={() => setEditing(p)}>
                              <Icon name="settings" size={15} />
                            </button>
                            <button className="more-btn" aria-label={`Delete ${p.name}`} onClick={() => setConfirmDelete(p)}>
                              <Icon name="close" size={15} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <div className="pagination">
              <span>
                Showing {(current - 1) * PAGE_SIZE + 1}–{Math.min(current * PAGE_SIZE, sorted.length)} of {sorted.length}
                {sorted.length !== all.length && ` (filtered from ${all.length})`}
              </span>
              <div>
                <button disabled={current === 1} onClick={() => setPage(current - 1)}>Previous</button>
                {Array.from({ length: pageCount }, (_, i) => i + 1)
                  .filter((n) => n === 1 || n === pageCount || Math.abs(n - current) <= 1)
                  .map((n, i, arr) => (
                    <span key={n} className="page-nums">
                      {i > 0 && arr[i - 1] !== n - 1 && <em>…</em>}
                      <button className={n === current ? 'active' : ''} onClick={() => setPage(n)}>{n}</button>
                    </span>
                  ))}
                <button disabled={current === pageCount} onClick={() => setPage(current + 1)}>Next</button>
              </div>
            </div>
          </>
        )}
      </section>

      {editing && (
        <ProductForm branchId={branchId} product={editing === 'new' ? null : editing} close={() => setEditing(null)} />
      )}
      {importing && <ImportWizard branchId={branchId} close={() => setImporting(false)} />}
      {confirmDelete && (
        <div className="modal-wrap" onMouseDown={() => setConfirmDelete(null)}>
          <div className="modal modal-sm" onMouseDown={(e) => e.stopPropagation()} role="alertdialog" aria-modal="true">
            <div className="modal-head">
              <div><h2>Delete {confirmDelete.name}?</h2><p>{confirmDelete.sku}</p></div>
            </div>
            <p className="form-note">
              <Icon name="alert" size={13} />
              This also removes its {confirmDelete.stockOnHand} units of stock history. Sales and
              repairs that already reference it are not affected.
            </p>
            <div className="modal-actions">
              <button className="btn secondary" onClick={() => setConfirmDelete(null)}><span>Cancel</span></button>
              <button className="btn danger" onClick={() => void remove(confirmDelete)}><span>Delete product</span></button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
