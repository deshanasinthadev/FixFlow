import { useMemo, useState } from 'react'
import { Icon } from '../../components/Icon'
import { useDb, useQuery } from '../../db/store'
import { formatLKR } from '../../lib/format'
import type { Sale } from '../../domain/types'

const METHOD_LABEL: Record<string, string> = {
  cash: 'Cash',
  card: 'Card',
  bank_transfer: 'Bank transfer',
  other: 'Other',
}

/**
 * Sales history, receipts and returns (§10, §16).
 *
 * A refund writes a new record against the original sale; it never edits or
 * deletes the sale itself (§28.18), so the day's takings stay reconstructable.
 */
export function SalesPage({ branchId, actorId }: { branchId: string; actorId: string }) {
  const { db, bump } = useDb()
  const { data, loading } = useQuery(
    async (d) => ({
      sales: await d.sales.list({ branchId }),
      refunds: await d.refunds.list(),
    }),
    [branchId],
  )

  const [selectedId, setSelectedId] = useState('')
  const [refunding, setRefunding] = useState(false)
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')
  const [restoreStock, setRestoreStock] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const sales = data?.sales ?? []
  const refundsBySale = useMemo(() => {
    const map = new Map<string, number>()
    for (const refund of data?.refunds ?? []) {
      map.set(refund.originalSaleId, (map.get(refund.originalSaleId) ?? 0) + refund.amount)
    }
    return map
  }, [data])

  const selected = sales.find((sale) => sale.id === selectedId) ?? null
  const refundedSoFar = selected ? refundsBySale.get(selected.id) ?? 0 : 0
  const refundable = selected ? Math.max(0, selected.amountPaid - refundedSoFar) : 0

  const select = (sale: Sale) => {
    setSelectedId(sale.id)
    setRefunding(false)
    setAmount('')
    setReason('')
    setRestoreStock(true)
    setError('')
  }

  const submitRefund = async () => {
    if (!selected) return
    setBusy(true)
    setError('')
    try {
      await db.sales.refund(selected.id, {
        amount: amount === '' ? undefined : Math.round((Number(amount) || 0) * 100),
        reason,
        approvedBy: actorId,
        restoreStock,
      })
      setRefunding(false)
      setAmount('')
      setReason('')
      bump()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not record the refund.')
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <div className="card"><p className="muted">Loading sales…</p></div>

  return <div className="detail-grid">
    <div className="card table-card">
      <div className="card-head table-title">
        <div><h2>Sales</h2><p>{sales.length} recorded at this branch</p></div>
      </div>
      {sales.length === 0
        ? <p className="muted">No sales recorded yet. Complete a sale at the POS and it will appear here.</p>
        : <div className="table-wrap"><table>
            <thead><tr><th>Receipt</th><th>Customer</th><th>Method</th><th>Total</th><th>Refunded</th><th>When</th></tr></thead>
            <tbody>
              {sales.map((sale) => {
                const back = refundsBySale.get(sale.id) ?? 0
                return <tr key={sale.id} className={sale.id === selectedId ? 'row-selected' : ''} onClick={() => select(sale)} style={{ cursor: 'pointer' }}>
                  <td><strong>{sale.receiptNumber}</strong></td>
                  <td>{sale.customerName || 'Walk-in'}</td>
                  <td>{METHOD_LABEL[sale.paymentMethod] ?? sale.paymentMethod}</td>
                  <td>{formatLKR(sale.total)}</td>
                  <td>{back ? formatLKR(back) : '—'}</td>
                  <td>{new Date(sale.createdAt).toLocaleString()}</td>
                </tr>
              })}
            </tbody>
          </table></div>}
    </div>

    <div className="card">
      {!selected ? <>
        <div className="card-head"><div><h2>Receipt</h2><p>Select a sale to view its receipt</p></div></div>
        <p className="muted">Nothing selected.</p>
      </> : <>
        <div className="card-head">
          <div><h2>{selected.receiptNumber}</h2><p>{new Date(selected.createdAt).toLocaleString()}</p></div>
          <button className="btn secondary" onClick={() => window.print()}><Icon name="receipt" size={16}/><span>Print</span></button>
        </div>

        <div className="receipt" id="receipt-print">
          <div className="info-list">
            <div><span>Customer</span><strong>{selected.customerName || 'Walk-in customer'}</strong></div>
            <div><span>Payment</span><strong>{METHOD_LABEL[selected.paymentMethod] ?? selected.paymentMethod}</strong></div>
            <div><span>Paid</span><strong>{formatLKR(selected.amountPaid)}</strong></div>
          </div>
          <div className="table-wrap"><table>
            <thead><tr><th>Item</th><th>Qty</th><th>Unit</th><th>Line</th></tr></thead>
            <tbody>
              {selected.items.map((item) => <tr key={item.id}>
                <td>{item.productName}</td>
                <td>{item.quantity}</td>
                <td>{formatLKR(item.unitPrice)}</td>
                <td>{formatLKR(item.lineTotal)}</td>
              </tr>)}
            </tbody>
          </table></div>
          <div className="cart-summary">
            <div><span>Subtotal</span><strong>{formatLKR(selected.subtotal)}</strong></div>
            {selected.discount > 0 && <div><span>Discount</span><strong>−{formatLKR(selected.discount)}</strong></div>}
            <div><span>Tax</span><strong>{formatLKR(selected.taxAmount)}</strong></div>
            <div className="total"><span>Total</span><strong>{formatLKR(selected.total)}</strong></div>
            {refundedSoFar > 0 && <div><span>Refunded</span><strong>−{formatLKR(refundedSoFar)}</strong></div>}
          </div>
        </div>

        <div className="form-actions">
          {refunding ? <>
            <label>Refund amount (Rs.)
              <div className="input"><input type="number" min="0" step="0.01" value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder={(refundable / 100).toFixed(2)}/></div>
            </label>
            <label>Reason<div className="input"><input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Faulty, wrong item, customer changed mind…"/></div></label>
            <label className="checkbox-row">
              <input type="checkbox" checked={restoreStock} onChange={(e) => setRestoreStock(e.target.checked)}/>
              <span>Return the goods to stock</span>
            </label>
            {error && <p className="danger-text" role="alert">{error}</p>}
            <div className="form-actions">
              <button className="btn primary" onClick={submitRefund} disabled={busy || !reason.trim()}>
                <Icon name="transfer" size={16}/><span>{busy ? 'Recording…' : 'Record refund'}</span>
              </button>
              <button className="btn secondary" onClick={() => { setRefunding(false); setError('') }}>Cancel</button>
            </div>
          </> : refundable > 0 ? (
            <button className="btn secondary" onClick={() => { setRefunding(true); setError('') }}>
              <Icon name="transfer" size={16}/><span>Refund up to {formatLKR(refundable)}</span>
            </button>
          ) : (
            <p className="muted">Fully refunded.</p>
          )}
        </div>
      </>}
    </div>
  </div>
}
