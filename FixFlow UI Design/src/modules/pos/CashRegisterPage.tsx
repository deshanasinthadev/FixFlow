import { useMemo, useState } from 'react'
import { Icon } from '../../components/Icon'
import { useDb, useQuery } from '../../db/store'
import { formatLKR } from '../../lib/format'

/**
 * Cash register (§10).
 *
 * Opens a drawer with a float, shows what should be in it while trading, and
 * closes it against a physical count. The variance is never stored — it is the
 * difference between the count and the expected figure, so it cannot disagree
 * with either.
 */
export function CashRegisterPage({ branchId, cashierId }: { branchId: string; cashierId: string }) {
  const { db, bump } = useDb()
  const { data, loading } = useQuery(
    async (d) => ({
      sessions: await d.cashSessions.list({ branchId }),
      expected: null as number | null,
    }),
    [branchId],
  )

  const [openingFloat, setOpeningFloat] = useState('')
  const [counted, setCounted] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const sessions = data?.sessions ?? []
  const open_ = sessions.find((s) => s.closedAt === '')
  const closed = useMemo(() => sessions.filter((s) => s.closedAt !== ''), [sessions])

  // The expected figure is recomputed whenever the session list changes, so it
  // moves as sales are taken while the drawer is open.
  const { data: expected } = useQuery(
    async (d) => (open_ ? await d.cashSessions.expectedCash(open_.id) : null),
    [open_?.id ?? '', sessions.length],
  )

  const rupees = (value: string) => Math.round((Number(value) || 0) * 100)
  const countedCents = rupees(counted)
  const variance = expected === null ? null : countedCents - expected

  const openDrawer = async () => {
    setBusy(true)
    setError('')
    try {
      await db.cashSessions.open({ branchId, cashierId, openingBalance: rupees(openingFloat), note })
      setOpeningFloat('')
      setNote('')
      bump()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not open the register.')
    } finally {
      setBusy(false)
    }
  }

  const closeDrawer = async () => {
    if (!open_) return
    setBusy(true)
    setError('')
    try {
      await db.cashSessions.close(open_.id, { countedCash: countedCents, cashierId, note })
      setCounted('')
      setNote('')
      bump()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not close the register.')
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <div className="card"><p className="muted">Loading register…</p></div>

  return <div className="detail-grid">
    <div className="card register-card">
      <div className="card-head">
        <div><h2>{open_ ? 'Register open' : 'Register closed'}</h2><p>{open_ ? 'Trading against this drawer' : 'Open the drawer to start taking cash'}</p></div>
        <span className={`badge ${open_ ? 'in-stock' : 'out-of-stock'}`}>{open_ ? 'Open' : 'Closed'}</span>
      </div>

      {open_ ? <>
        <div className="register-total">
          <span>Opening float</span>
          <strong>{formatLKR(open_.openingBalance)}</strong>
          <small>Opened {new Date(open_.openedAt).toLocaleString()}</small>
        </div>
        <div className="register-total">
          <span>Expected in the drawer</span>
          <strong>{expected === null ? '—' : formatLKR(expected)}</strong>
          <small>Float plus cash sales, less cash refunds</small>
        </div>
        <label>Count the drawer (Rs.)
          <div className="input"><input type="number" min="0" step="0.01" value={counted} onChange={(e) => setCounted(e.target.value)} placeholder="0.00"/></div>
        </label>
        {counted !== '' && variance !== null && (
          <p className={variance === 0 ? 'success-text' : 'danger-text'} role="status">
            {variance === 0
              ? 'The count matches the expected figure exactly.'
              : `${variance < 0 ? 'Short' : 'Over'} by ${formatLKR(Math.abs(variance))}.`}
          </p>
        )}
        <label>Note (optional)<div className="input"><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Shift handover, discrepancy reason…"/></div></label>
        {error && <p className="danger-text" role="alert">{error}</p>}
        <div className="form-actions">
          <button className="btn primary" onClick={closeDrawer} disabled={busy || counted === ''}>
            <Icon name="check" size={16}/><span>{busy ? 'Closing…' : 'Close register'}</span>
          </button>
        </div>
      </> : <>
        <label>Opening float (Rs.)
          <div className="input"><input type="number" min="0" step="0.01" value={openingFloat} onChange={(e) => setOpeningFloat(e.target.value)} placeholder="15000.00"/></div>
        </label>
        <label>Note (optional)<div className="input"><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Morning shift"/></div></label>
        {error && <p className="danger-text" role="alert">{error}</p>}
        <div className="form-actions">
          <button className="btn primary" onClick={openDrawer} disabled={busy || openingFloat === ''}>
            <Icon name="cash" size={16}/><span>{busy ? 'Opening…' : 'Open register'}</span>
          </button>
        </div>
      </>}
    </div>

    <div className="card table-card">
      <div className="card-head table-title">
        <div><h2>Closed sessions</h2><p>Every drawer counted at this branch</p></div>
      </div>
      {closed.length === 0
        ? <p className="muted">No sessions closed yet.</p>
        : <div className="table-wrap"><table><thead><tr><th>Opened</th><th>Closed</th><th>Float</th><th>Expected</th><th>Counted</th><th>Variance</th></tr></thead><tbody>
            {closed.map((s) => {
              const diff = (s.closingBalance ?? 0) - (s.expectedClosingBalance ?? 0)
              return <tr key={s.id}>
                <td>{new Date(s.openedAt).toLocaleString()}</td>
                <td>{s.closedAt ? new Date(s.closedAt).toLocaleString() : '—'}</td>
                <td>{formatLKR(s.openingBalance)}</td>
                <td>{s.expectedClosingBalance === null ? '—' : formatLKR(s.expectedClosingBalance)}</td>
                <td>{s.closingBalance === null ? '—' : formatLKR(s.closingBalance)}</td>
                <td className={diff === 0 ? '' : diff < 0 ? 'danger-text' : 'success-text'}>
                  {diff === 0 ? 'Balanced' : `${diff < 0 ? '−' : '+'}${formatLKR(Math.abs(diff))}`}
                </td>
              </tr>
            })}
          </tbody></table></div>}
    </div>
  </div>
}
