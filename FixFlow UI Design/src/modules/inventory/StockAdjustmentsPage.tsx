import { useMemo, useState } from 'react'
import { useDb, useQuery } from '../../db/store'
import type { StockMovementType } from '../../db/schema'

const TYPE_LABEL: Record<StockMovementType, string> = {
  opening: 'Opening balance',
  purchase_in: 'Goods received',
  sale_out: 'Sold',
  repair_use: 'Used in repair',
  adjustment: 'Manual adjustment',
  transfer_in: 'Transfer in',
  transfer_out: 'Transfer out',
}

/**
 * Stock adjustments and the movement ledger behind them (§11, §28.1, §28.17).
 *
 * Every change to stock on hand goes through `db.products.adjustStock`, which
 * writes a ledger row carrying before and after. That ledger is the point of
 * this screen: a number that moved with no record of why is how a stock count
 * becomes unarguable.
 *
 * Only manual adjustments are created here. Goods received, sales and repair
 * usage each write their own movement from the transaction that caused them, so
 * offering those types on this form would let someone fabricate a ledger entry
 * with no purchase or sale behind it.
 */
export function StockAdjustmentsPage({ branchId, actorId }: {
  branchId: string
  actorId: string
}) {
  const { db, bump } = useDb()
  const [productId, setProductId] = useState('')
  const [direction, setDirection] = useState<'out' | 'in'>('out')
  const [quantity, setQuantity] = useState('')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState('')

  const { data, loading } = useQuery(
    async (d) => ({
      products: (await d.products.list()).filter((p) => p.branchId === branchId && !p.isService),
      movements: await d.movements.recent(60),
    }),
    [branchId],
  )

  const products = data?.products ?? []
  const movements = (data?.movements ?? []).filter((m) => m.branchId === branchId)

  const productName = useMemo(() => {
    const map = new Map(products.map((p) => [p.id, p.name]))
    return (id: string) => map.get(id) ?? id
  }, [products])

  const selected = products.find((p) => p.id === productId) ?? null

  const submit = async () => {
    const qty = Math.round(Number(quantity))
    if (!productId) { setError('Choose a product.'); return }
    if (!Number.isInteger(qty) || qty <= 0) { setError('Enter a whole number of units greater than zero.'); return }
    if (!reason.trim()) { setError('A stock adjustment needs a reason.'); return }

    setBusy(true)
    setError('')
    setDone('')
    try {
      const movement = await db.products.adjustStock({
        productId,
        branchId,
        type: 'adjustment',
        qty: direction === 'out' ? -qty : qty,
        reason: reason.trim(),
        actorId,
      })
      setDone(
        `${productName(movement.productId)}: ${movement.before} → ${movement.after}. ${TYPE_LABEL[movement.type]} recorded.`,
      )
      setQuantity('')
      setReason('')
      bump()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That could not be recorded.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="pos-layout">
      <div className="card" style={{ marginBottom: 14 }}>
        <div className="card-head table-title">
          <div>
            <h2>Record an adjustment</h2>
            <p>Use this for damage, a count that disagrees with the system, or a write-off. Sales and purchases write their own movements.</p>
          </div>
        </div>

        {error && <p className="danger-text">{error}</p>}
        {done && <p className="success-text">{done}</p>}

        <div className="form-actions">
          <label>Product
            <select className="filter-select" value={productId} onChange={(e) => setProductId(e.target.value)}>
              <option value="">Select a product…</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>{p.sku} — {p.name} ({p.stockOnHand} on hand)</option>
              ))}
            </select>
          </label>
          <label>Direction
            <select className="filter-select" value={direction} onChange={(e) => setDirection(e.target.value as 'out' | 'in')}>
              <option value="out">Remove from stock</option>
              <option value="in">Add to stock</option>
            </select>
          </label>
          <label>Units
            <input type="number" min="1" step="1" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
          </label>
          <label>Reason
            <input
              placeholder="Damaged, counted, returned, written off…"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
          <button className="btn" onClick={submit} disabled={busy}>Record</button>
        </div>

        {selected && (
          <p className="muted">
            {selected.name}: {selected.stockOnHand} on hand, {selected.reserved} reserved,
            {' '}{selected.stockOnHand - selected.reserved} available to sell.
          </p>
        )}
      </div>

      <div className="card table-card">
        <div className="card-head table-title">
          <div>
            <h2>Movement ledger</h2>
            <p>{movements.length} recent movements in this branch, newest first</p>
          </div>
        </div>

        {loading && <p className="muted"><span className="spinner" aria-hidden="true" />Loading movements…</p>}

        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>When</th><th>Product</th><th>Type</th><th>Change</th><th>Before</th><th>After</th><th>Reason</th><th>By</th></tr>
            </thead>
            <tbody>
              {movements.length === 0 && (
                <tr><td colSpan={8} className="muted">No movements recorded yet.</td></tr>
              )}
              {movements.map((m) => (
                <tr key={m.id}>
                  <td>{new Date(m.at).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' })}</td>
                  <td>{productName(m.productId)}</td>
                  <td>{TYPE_LABEL[m.type]}</td>
                  <td>
                    <strong className={m.qty < 0 ? 'danger-text' : 'success-text'}>
                      {m.qty > 0 ? `+${m.qty}` : m.qty}
                    </strong>
                  </td>
                  <td>{m.before}</td>
                  <td>{m.after}</td>
                  <td>{m.reason || <span className="muted">—</span>}</td>
                  <td>{m.actorId}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="muted">
          Stock on hand is a cache of this ledger, never the source of truth. Every row carries the balance before and
          after, so a number that looks wrong can be traced to the movement that caused it.
        </p>
      </div>
    </div>
  )
}
