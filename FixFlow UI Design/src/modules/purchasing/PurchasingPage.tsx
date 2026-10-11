import { useMemo, useState } from 'react'
import { useDb, useQuery } from '../../db/store'
import { formatLKR, formatDate } from '../../lib/format'
import { downloadText, stamp } from '../../lib/download'
import { toCsv } from '../../csv/pipeline'
import { purchaseQuantityReceived } from '../../domain/calculations'
import type { PurchaseOrder, PurchaseOrderStatus } from '../../domain/types'

const STATUS_LABEL: Record<PurchaseOrderStatus, string> = {
  draft: 'Draft',
  sent: 'Sent to supplier',
  partially_received: 'Partially received',
  received: 'Received',
  cancelled: 'Cancelled',
}

const STATUS_TONE: Record<PurchaseOrderStatus, string> = {
  draft: 'pending',
  sent: 'issued',
  partially_received: 'issued',
  received: 'approved',
  cancelled: 'cancelled',
}

/**
 * Suppliers and purchase orders (§12).
 *
 * Two views of one flow: who stock is bought from, and what has been ordered
 * from them. They share a screen because an order without its supplier is half
 * a record, and a supplier without their orders is a phone book.
 *
 * The page is built around the distinction the data layer enforces: an order on
 * the list is not stock. Nothing here shows an ordered quantity as available,
 * and the only control that changes a shelf count is Record delivery.
 */
export function PurchasingPage({ branchId, actorId }: {
  branchId: string
  actorId: string
}) {
  const { db, bump } = useDb()
  const [tab, setTab] = useState<'orders' | 'suppliers'>('orders')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState('')

  // supplier
  const [supName, setSupName] = useState('')
  const [supContact, setSupContact] = useState('')
  const [supPhone, setSupPhone] = useState('')
  const [supEmail, setSupEmail] = useState('')

  // order
  const [orderSupplier, setOrderSupplier] = useState('')
  const [lines, setLines] = useState<Array<{ productId: string; quantity: string; unitCost: string }>>([
    { productId: '', quantity: '1', unitCost: '' },
  ])

  const { data, loading } = useQuery(
    async (d) => ({
      orders: await d.purchaseOrders.list({ branchId }),
      suppliers: await d.suppliers.list(),
      products: await d.products.list(),
    }),
    [branchId],
  )

  const orders = data?.orders ?? []
  const suppliers = data?.suppliers ?? []
  const products = (data?.products ?? []).filter((p) => p.branchId === branchId && !p.isService)

  const supplierLabel = useMemo(
    () => new Map(suppliers.map((s) => [s.id, s.name])),
    [suppliers],
  )
  const productLabel = useMemo(
    () => new Map(products.map((p) => [p.id, `${p.sku} — ${p.name}`])),
    [products],
  )

  const outstandingValue = useMemo(
    () => orders
      .filter((o) => o.status === 'sent' || o.status === 'partially_received')
      .reduce((sum, o) => sum + o.items.reduce(
        (line, item) => line + (item.quantityOrdered - item.quantityReceived) * item.unitCost, 0), 0),
    [orders],
  )

  const run = async (label: string, action: () => Promise<unknown>) => {
    setBusy(true)
    setError('')
    setDone('')
    try {
      await action()
      setDone(label)
      bump()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That could not be done.')
    } finally {
      setBusy(false)
    }
  }

  const cents = (rupees: string) => {
    const n = Number(rupees.replace(/[^0-9.]/g, ''))
    return Number.isFinite(n) ? Math.round(n * 100) : 0
  }

  const addSupplier = () => {
    if (!supName.trim()) { setError('A supplier needs a name.'); return }
    return run('Supplier saved.', () => db.suppliers.create({
      name: supName.trim(),
      contactPerson: supContact.trim(),
      phone: supPhone.trim(),
      email: supEmail.trim(),
    })).then(() => { setSupName(''); setSupContact(''); setSupPhone(''); setSupEmail('') })
  }

  const raiseOrder = () => {
    if (!orderSupplier) { setError('Choose the supplier to order from.'); return }
    const filled = lines.filter((line) => line.productId && Number(line.quantity) > 0)
    if (!filled.length) { setError('Add at least one line with a part and a quantity.'); return }

    return run('Order raised. Stock has not moved — it moves when the goods arrive.', () =>
      db.purchaseOrders.create({
        supplierId: orderSupplier,
        branchId,
        lines: filled.map((line) => ({
          productId: line.productId,
          quantity: Number(line.quantity),
          unitCost: line.unitCost ? cents(line.unitCost) : (products.find((p) => p.id === line.productId)?.costCents ?? 0),
        })),
      }).then(async (order) => {
        // Raised and sent in one step: a draft nobody sends is an order the
        // supplier never hears about, and the shelf never moves either way.
        await db.purchaseOrders.send(order.id, actorId)
      }),
    ).then(() => setLines([{ productId: '', quantity: '1', unitCost: '' }]))
  }

  const receive = (order: PurchaseOrder) => {
    const outstanding = order.items.filter((item) => item.quantityReceived < item.quantityOrdered)
    if (!outstanding.length) { setError('Everything on that order has already arrived.'); return }

    const asked = window.prompt(
      `What arrived against ${order.poNumber}?\n\n` +
      outstanding.map((item) => `${item.productName}: ${item.quantityOrdered - item.quantityReceived} outstanding`).join('\n') +
      '\n\nEnter quantities as "name=qty", one per line. Leave a line out to receive nothing for it.',
    )
    if (asked === null) return

    const received = asked
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [rawName, rawQty] = line.split('=')
        const name = (rawName ?? '').trim().toLowerCase()
        const match = outstanding.find((item) => item.productName.toLowerCase() === name)
        return match ? { productId: match.productId, quantity: Number((rawQty ?? '').trim()) } : null
      })
      .filter((line): line is { productId: string; quantity: number } => line !== null && Number.isFinite(line.quantity))

    if (!received.length) { setError('No lines matched. Use the exact part name, e.g. "DC charging jack=4".'); return }

    return run('Goods received and stock updated.', () =>
      db.purchaseOrders.receiveGoods(order.id, { lines: received, actorId }))
  }

  const exportCsv = () => {
    if (!orders.length) return
    downloadText(stamp('fixflow-purchase-orders', 'csv'), toCsv(
      ['Order', 'Supplier', 'Raised', 'Status', 'Ordered', 'Received', 'Value'],
      orders.map((o) => ({
        Order: o.poNumber,
        Supplier: supplierLabel.get(o.supplierId) ?? o.supplierId,
        Raised: o.createdAt.slice(0, 10),
        Status: STATUS_LABEL[o.status],
        Ordered: String(o.items.reduce((s, i) => s + i.quantityOrdered, 0)),
        Received: String(purchaseQuantityReceived(o.items)),
        Value: (o.total / 100).toFixed(2),
      })),
    ))
  }

  return (
    <>
      <div className="tabs">
        <button className={tab === 'orders' ? 'active' : ''} onClick={() => setTab('orders')}>Purchase orders</button>
        <button className={tab === 'suppliers' ? 'active' : ''} onClick={() => setTab('suppliers')}>Suppliers</button>
      </div>

      {error && <div className="card"><p className="danger-text" role="alert">{error}</p></div>}
      {done && <div className="card"><p className="success-text" role="status">{done}</p></div>}

      {tab === 'orders' && <>
        <div className="card" style={{ marginBottom: 14 }}>
          <div className="card-head table-title">
            <div>
              <h2>Raise an order</h2>
              <p>{outstandingValue > 0 ? `${formatLKR(outstandingValue)} ordered and not yet arrived` : 'Nothing outstanding'}</p>
            </div>
            <button className="btn secondary" onClick={exportCsv} disabled={!orders.length}>Export CSV</button>
          </div>

          <div className="form-actions">
            <label>Supplier
              <select className="filter-select" value={orderSupplier} onChange={(e) => setOrderSupplier(e.target.value)}>
                <option value="">Select…</option>
                {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </label>
          </div>

          {lines.map((line, index) => (
            <div className="form-actions" key={index}>
              <label>Part
                <select
                  className="filter-select"
                  value={line.productId}
                  onChange={(e) => {
                    const chosen = products.find((p) => p.id === e.target.value)
                    setLines(lines.map((l, i) => i === index
                      ? { ...l, productId: e.target.value, unitCost: l.unitCost || (chosen ? (chosen.costCents / 100).toFixed(2) : '') }
                      : l))
                  }}
                >
                  <option value="">Select a part…</option>
                  {products.map((p) => <option key={p.id} value={p.id}>{productLabel.get(p.id)}</option>)}
                </select>
              </label>
              <label>Quantity
                <input
                  type="number" min="1" step="1" value={line.quantity}
                  onChange={(e) => setLines(lines.map((l, i) => i === index ? { ...l, quantity: e.target.value } : l))}
                />
              </label>
              <label>Unit cost
                <input
                  placeholder="0.00" value={line.unitCost}
                  onChange={(e) => setLines(lines.map((l, i) => i === index ? { ...l, unitCost: e.target.value } : l))}
                />
              </label>
              {lines.length > 1 && (
                <button className="btn secondary" onClick={() => setLines(lines.filter((_, i) => i !== index))}>Remove</button>
              )}
            </div>
          ))}

          <div className="form-actions">
            <button
              className="btn secondary"
              onClick={() => setLines([...lines, { productId: '', quantity: '1', unitCost: '' }])}
            >
              Add line
            </button>
            <button className="btn" onClick={raiseOrder} disabled={busy || !orderSupplier}>Raise and send order</button>
          </div>
          <p className="muted">
            Raising an order does not put anything on the shelf. Stock moves when you record a delivery, by exactly the
            quantity that arrived. Unit cost defaults to the part's recorded cost.
          </p>
        </div>

        <div className="card table-card">
          <div className="card-head table-title">
            <div><h2>Orders</h2><p>{orders.length} on file for this branch</p></div>
          </div>

          {loading && <p className="muted"><span className="spinner" aria-hidden="true" />Loading orders…</p>}

          <div className="table-wrap">
            <table>
              <thead><tr><th>Order</th><th>Supplier</th><th>Raised</th><th>Lines</th><th>Value</th><th>Status</th><th/></tr></thead>
              <tbody>
                {orders.length === 0 && (
                  <tr><td colSpan={7} className="muted">
                    {loading ? 'Loading…' : 'No orders raised for this branch yet.'}
                  </td></tr>
                )}
                {orders.map((order) => {
                  const ordered = order.items.reduce((sum, item) => sum + item.quantityOrdered, 0)
                  const received = purchaseQuantityReceived(order.items)
                  const receivable = order.status === 'sent' || order.status === 'partially_received'
                  return <tr key={order.id}>
                    <td><strong>{order.poNumber}</strong>{order.supplierInvoiceNumber && <><br/><small className="muted">inv. {order.supplierInvoiceNumber}</small></>}</td>
                    <td>{supplierLabel.get(order.supplierId) ?? order.supplierId}</td>
                    <td>{formatDate(order.createdAt)}</td>
                    <td>{received} of {ordered} received</td>
                    <td>{formatLKR(order.total)}</td>
                    <td><span className={`badge ${STATUS_TONE[order.status]}`}>{STATUS_LABEL[order.status]}</span></td>
                    <td>
                      <div className="form-actions">
                        {receivable && (
                          <button className="btn" disabled={busy} onClick={() => void receive(order)}>Record delivery</button>
                        )}
                        {(order.status === 'draft' || order.status === 'sent') && (
                          <button className="btn secondary" disabled={busy} onClick={() => {
                            const reason = window.prompt('Cancel this order? Record why:')
                            if (reason !== null) void run('Order cancelled.', () => db.purchaseOrders.cancel(order.id, actorId, reason))
                          }}>Cancel</button>
                        )}
                      </div>
                    </td>
                  </tr>
                })}
              </tbody>
            </table>
          </div>
          <p className="muted">
            An order can only be cancelled while nothing has arrived. Once units are on the shelf they are stock, and
            cancelling the order would leave a count nothing explains.
          </p>
        </div>
      </>}

      {tab === 'suppliers' && <>
        <div className="card" style={{ marginBottom: 14 }}>
          <div className="card-head table-title">
            <div><h2>Add a supplier</h2><p>Who this branch buys stock from</p></div>
          </div>
          <div className="form-actions">
            <label>Name
              <input placeholder="Lanka Parts Pvt Ltd" value={supName} onChange={(e) => setSupName(e.target.value)} />
            </label>
            <label>Contact
              <input placeholder="Ruwan" value={supContact} onChange={(e) => setSupContact(e.target.value)} />
            </label>
            <label>Phone
              <input placeholder="+94112345678" value={supPhone} onChange={(e) => setSupPhone(e.target.value)} />
            </label>
            <label>Email
              <input placeholder="sales@supplier.lk" value={supEmail} onChange={(e) => setSupEmail(e.target.value)} />
            </label>
            <button className="btn" onClick={addSupplier} disabled={busy}>Save supplier</button>
          </div>
        </div>

        <div className="card table-card">
          <div className="card-head table-title">
            <div><h2>Suppliers</h2><p>{suppliers.length} on file</p></div>
          </div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Name</th><th>Contact</th><th>Phone</th><th>Email</th><th>Orders</th></tr></thead>
              <tbody>
                {suppliers.length === 0 && <tr><td colSpan={5} className="muted">No suppliers added yet.</td></tr>}
                {suppliers.map((supplier) => (
                  <tr key={supplier.id}>
                    <td><strong>{supplier.name}</strong></td>
                    <td>{supplier.contactPerson || '—'}</td>
                    <td>{supplier.phone || '—'}</td>
                    <td>{supplier.email || '—'}</td>
                    <td>{orders.filter((o) => o.supplierId === supplier.id).length}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </>}
    </>
  )
}
