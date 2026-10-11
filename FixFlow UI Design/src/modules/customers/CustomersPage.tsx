import { useMemo, useState } from 'react'
import { useDb, useQuery } from '../../db/store'
import { formatLKR } from '../../lib/format'
import { STATUS_LABEL, statusBadgeTone } from '../repairs/repairView'
import type { Customer } from '../../domain/types'

/**
 * Customer records, their devices and what they have actually spent (§13).
 *
 * Lifetime value is summed from that customer's sales and invoices rather than
 * stored on the record, so it cannot drift from the transactions it comes from.
 *
 * The portal token is shown here and nowhere it does not belong. It is the
 * credential a customer uses to track their repair without an account, so it is
 * unguessable by construction (§20) — but that only holds if it is not printed
 * on a screen a customer can reach. This screen is staff-only.
 */
export function CustomersPage({ branchId, actorId }: {
  branchId: string
  actorId: string
}) {
  const { db, bump } = useDb()
  const [selectedId, setSelectedId] = useState('')
  const [term, setTerm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState('')

  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({ fullName: '', phone: '', email: '', address: '', notes: '', status: 'active' as 'active' | 'inactive' })

  const { data, loading } = useQuery(
    async (d) => ({
      customers: term.trim() ? await d.customers.search(term.trim()) : await d.customers.list(),
      repairs: await d.repairs.list({ branchId }),
      sales: await d.sales.list({ branchId }),
      invoices: await d.invoices.list({ branchId }),
    }),
    [branchId, term],
  )

  // Devices and refunds load for whichever customer is open.
  const { data: detail } = useQuery(
    async (d) => (selectedId ? {
      devices: await d.devices.forCustomer(selectedId),
      refunds: await d.refunds.list(),
    } : { devices: [], refunds: [] }),
    [selectedId],
  )

  const customers = data?.customers ?? []
  const repairs = data?.repairs ?? []
  const sales = data?.sales ?? []
  const invoices = data?.invoices ?? []

  const stats = useMemo(() => {
    const map = new Map<string, { repairs: number; spent: number; outstanding: number }>()
    const touch = (id: string) => {
      if (!map.has(id)) map.set(id, { repairs: 0, spent: 0, outstanding: 0 })
      return map.get(id)!
    }
    for (const r of repairs) touch(r.customerId).repairs += 1
    for (const s of sales) if (s.customerId) touch(s.customerId).spent += s.total
    for (const i of invoices) {
      const row = touch(i.customerId)
      row.spent += i.total
      row.outstanding += i.balanceDue
    }
    return map
  }, [repairs, sales, invoices])

  const selected = customers.find((c) => c.id === selectedId) ?? null
  const customerRepairs = repairs.filter((r) => r.customerId === selectedId)
  const customerInvoices = invoices.filter((i) => i.customerId === selectedId)
  const devices = detail?.devices ?? []

  const openEditor = (c: Customer | null) => {
    setForm(c
      ? { fullName: c.fullName, phone: c.phone, email: c.email, address: c.address, notes: c.notes, status: c.status }
      : { fullName: '', phone: '', email: '', address: '', notes: '', status: 'active' })
    setEditing(true)
    setError('')
    setDone('')
  }

  const save = async () => {
    if (!form.fullName.trim()) { setError('A customer needs a name.'); return }
    if (!form.phone.trim()) { setError('A customer needs a phone number.'); return }
    setBusy(true)
    setError('')
    setDone('')
    try {
      if (selected) {
        await db.customers.update(selected.id, { ...form, fullName: form.fullName.trim(), phone: form.phone.trim() })
        setDone(`${form.fullName.trim()} updated.`)
      } else {
        await db.customers.create({ ...form, fullName: form.fullName.trim(), phone: form.phone.trim() })
        setDone(`${form.fullName.trim()} added.`)
      }
      setEditing(false)
      bump()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That could not be saved.')
    } finally {
      setBusy(false)
    }
  }

  const copyToken = async (token: string) => {
    try {
      await navigator.clipboard.writeText(token)
      setDone('Portal link token copied. Treat it as a password — anyone holding it can see this customer\'s repairs.')
    } catch {
      setError('The clipboard is blocked in this browser. Copy the token by hand.')
    }
  }

  return (
    <div className="pos-layout">
      <div className="card" style={{ marginBottom: 14 }}>
        <div className="card-head table-title">
          <div>
            <h2>Customers</h2>
            <p>Search by name, phone or customer code</p>
          </div>
          <button className="btn" onClick={() => { setSelectedId(''); openEditor(null) }}>Add customer</button>
        </div>
        <input
          className="filter-select"
          style={{ width: '100%', height: 38 }}
          placeholder="Search…"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
        />
        {error && <p className="danger-text">{error}</p>}
        {done && <p className="success-text">{done}</p>}
      </div>

      <div className="card table-card">
        <div className="card-head table-title">
          <div>
            <h2>{term.trim() ? 'Matches' : 'All customers'}</h2>
            <p>{customers.length} records</p>
          </div>
        </div>
        {loading && <p className="muted"><span className="spinner" aria-hidden="true" />Loading customers…</p>}
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Code</th><th>Name</th><th>Phone</th><th>Repairs</th><th>Lifetime value</th><th>Outstanding</th><th>Status</th></tr>
            </thead>
            <tbody>
              {customers.length === 0 && (
                <tr><td colSpan={7} className="muted">{term.trim() ? 'No customer matches that search.' : 'No customers yet.'}</td></tr>
              )}
              {customers.map((c) => {
                const s = stats.get(c.id) ?? { repairs: 0, spent: 0, outstanding: 0 }
                return (
                  <tr
                    key={c.id}
                    className={selectedId === c.id ? 'row-selected' : ''}
                    onClick={() => { setSelectedId(c.id); setEditing(false); setError(''); setDone('') }}
                  >
                    <td>{c.code}</td>
                    <td><strong>{c.fullName}</strong></td>
                    <td>{c.phone}</td>
                    <td>{s.repairs}</td>
                    <td>{formatLKR(s.spent)}</td>
                    <td>{s.outstanding > 0 ? <strong className="danger-text">{formatLKR(s.outstanding)}</strong> : formatLKR(0)}</td>
                    <td><span className={`badge ${c.status === 'active' ? 'approved' : 'cancelled'}`}>{c.status === 'active' ? 'Active' : 'Inactive'}</span></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <p className="muted">
          Lifetime value is added up from this customer's sales and invoices each time it is read, never stored on the
          record, so it cannot disagree with the transactions it comes from.
        </p>
      </div>

      {editing && (
        <div className="card cart-panel">
          <div className="card-head table-title">
            <div><h2>{selected ? 'Edit customer' : 'New customer'}</h2></div>
            <button className="btn secondary" onClick={() => setEditing(false)}>Close</button>
          </div>
          <div className="form-actions">
            <label>Full name
              <input value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} />
            </label>
            <label>Phone
              <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </label>
            <label>Email
              <input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </label>
            <label>Address
              <input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
            </label>
            <label>Status
              <select className="filter-select" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as 'active' | 'inactive' })}>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </label>
            <label>Notes
              <input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </label>
            <button className="btn" onClick={save} disabled={busy}>{selected ? 'Save changes' : 'Add customer'}</button>
          </div>
          <p className="muted">
            Customers are matched on phone, so a duplicate number is refused rather than creating a second record for
            the same person.
          </p>
        </div>
      )}

      {selected && !editing && (
        <div className="card cart-panel">
          <div className="card-head table-title">
            <div>
              <h2>{selected.fullName}</h2>
              <p>{selected.code} · {selected.phone}{selected.email ? ` · ${selected.email}` : ''}</p>
            </div>
            <button className="btn secondary" onClick={() => openEditor(selected)}>Edit</button>
          </div>

          {selected.address && <p>{selected.address}</p>}
          {selected.notes && <p className="muted">{selected.notes}</p>}

          <h3>Devices</h3>
          {devices.length === 0
            ? <p className="muted">No devices recorded for this customer.</p>
            : (
              <ul className="info-list">
                {devices.map((d) => (
                  <li key={d.id}>
                    <div>
                      <strong>{d.brand} {d.model}</strong>
                      <div className="muted">{d.category}{d.serialNumber ? ` · S/N ${d.serialNumber}` : ''}</div>
                    </div>
                  </li>
                ))}
              </ul>
            )}

          <h3>Repairs</h3>
          {customerRepairs.length === 0
            ? <p className="muted">No repairs for this customer in this branch.</p>
            : (
              <ul className="info-list">
                {customerRepairs.map((r) => (
                  <li key={r.id}>
                    <div>
                      <strong>{r.jobNumber}</strong> — {r.deviceSummary}
                      <div className="muted">{r.reportedIssue}</div>
                    </div>
                    <span className={`badge ${statusBadgeTone(r.status)}`}>{STATUS_LABEL[r.status]}</span>
                  </li>
                ))}
              </ul>
            )}

          {customerInvoices.length > 0 && (
            <>
              <h3>Invoices</h3>
              <ul className="info-list">
                {customerInvoices.map((i) => (
                  <li key={i.id}>
                    <div>
                      <strong>{i.invoiceNumber}</strong> — {formatLKR(i.total)}
                      <div className="muted">{i.balanceDue > 0 ? `${formatLKR(i.balanceDue)} still due` : 'Settled'}</div>
                    </div>
                    <span className={`badge ${i.status === 'partially_paid' ? 'partially-paid' : i.status}`}>{i.status.replace('_', ' ')}</span>
                  </li>
                ))}
              </ul>
            </>
          )}

          <h3>Portal access</h3>
          <div className="checkbox-row">
            <code>{selected.portalToken}</code>
            <button className="btn secondary" onClick={() => copyToken(selected.portalToken)}>Copy token</button>
          </div>
          <p className="muted">
            This token is how the customer tracks a repair without an account, and it cannot be guessed from a customer
            code or id. Treat it as a password: it is shown on this staff screen only, and never on anything a customer
            can reach. Recorded by {actorId}.
          </p>
        </div>
      )}
    </div>
  )
}
