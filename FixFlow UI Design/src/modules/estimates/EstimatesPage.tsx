import { useMemo, useState } from 'react'
import { Icon } from '../../components/Icon'
import { useDb, useQuery } from '../../db/store'
import { formatLKR } from '../../lib/format'
import type { CustomerApproval, Estimate, EstimateStatus } from '../../domain/types'

const STATUS_LABEL: Record<EstimateStatus, string> = {
  draft: 'Draft',
  sent: 'Sent',
  approved: 'Approved',
  rejected: 'Rejected',
  expired: 'Expired',
  revised: 'Revised',
}

const METHODS: Array<[CustomerApproval['method'], string]> = [
  ['in_person', 'In person'],
  ['phone', 'Phone'],
  ['email', 'Email'],
  ['portal', 'Customer portal'],
]

/**
 * Estimates and customer approvals (§9, §28.13).
 *
 * This screen is the UI over a persistence layer that already existed and was
 * already tested: the rules about what may be sent, approved or revised live in
 * `db.estimates`, not here. What this adds is a way to reach them.
 *
 * Two things are deliberate:
 *
 * Approving records *how* the customer approved (method, who recorded it, when)
 * and not merely that the status changed. A later dispute is about the approval,
 * not the status.
 *
 * Revising never edits the estimate the customer already saw. The old one is
 * marked `revised` and linked forward, so the negotiation stays auditable.
 */
export function EstimatesPage({ branchId, actorId, canDecide, canSend, customerScope }: {
  branchId: string
  actorId: string
  /** Only managers and admins may record a customer's decision. */
  canDecide: boolean
  /** Only staff may push an estimate to a customer. */
  canSend: boolean
  /**
   * Set for a signed-in customer. Estimates then load by customer, never by
   * branch — a customer must not be able to see another customer's quote,
   * which a branch-wide list would hand them (§22, §28.12).
   */
  customerScope?: string
}) {
  const { db, bump } = useDb()
  const [selectedId, setSelectedId] = useState('')
  const [method, setMethod] = useState<CustomerApproval['method']>('in_person')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState('')

  const { data, loading } = useQuery(
    async (d) => ({
      estimates: await d.estimates.list(
        customerScope ? { customerId: customerScope } : { branchId },
      ),
      repairs: await d.repairs.list(customerScope ? { customerId: customerScope } : { branchId }),
    }),
    [branchId, customerScope],
  )

  // The approvals API is keyed by estimate, not listable by branch, so the
  // history is loaded for whichever estimate is open.
  const { data: historyRows } = useQuery(
    async (d) => (selectedId ? d.approvals.forEstimate(selectedId) : []),
    [selectedId],
  )

  const estimates = data?.estimates ?? []
  const repairs = data?.repairs ?? []

  const jobNumber = useMemo(() => {
    const map = new Map(repairs.map((r) => [r.id, r.jobNumber]))
    return (id: string) => map.get(id) ?? id
  }, [repairs])

  const customerName = useMemo(() => {
    const map = new Map(repairs.map((r) => [r.id, r.customerName]))
    return (id: string) => map.get(id) ?? '—'
  }, [repairs])

  const selected = estimates.find((e) => e.id === selectedId) ?? null
  const history = historyRows ?? []

  const run = async (label: string, action: () => Promise<unknown>) => {
    setBusy(true)
    setError('')
    setDone('')
    try {
      await action()
      setDone(label)
      bump()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That could not be completed.')
    } finally {
      setBusy(false)
    }
  }

  const send = (e: Estimate) =>
    run(`Estimate ${e.estimateNumber} was sent to the customer.`, () =>
      db.estimates.send(e.id, actorId),
    )

  const decide = (e: Estimate, decision: 'approved' | 'rejected') => {
    if (decision === 'rejected' && !note.trim()) {
      setError('A rejection needs a reason — the customer is entitled to know why.')
      return
    }
    return run(
      decision === 'approved'
        ? `Approval recorded. ${e.estimateNumber} is approved.`
        : `Rejection recorded against ${e.estimateNumber}.`,
      () =>
        db.estimates.decide(e.id, {
          decision,
          method,
          recordedBy: actorId,
          note: note.trim(),
        }),
    )
  }

  if (loading) return <p className="muted">Loading estimates…</p>

  if (estimates.length === 0) {
    return (
      <div className="card empty-module">
        <Icon name="file" size={32} />
        <h2>No estimates yet</h2>
        <p>
          Estimates are raised against a repair. Open a repair that has been
          diagnosed and create one from there — an estimate always carries the
          repair's customer and branch, so it cannot be filed against the wrong
          job.
        </p>
      </div>
    )
  }

  return (
    <div className="pos-layout">
      <div className="card table-card">
        <div className="card-head table-title">
          <div>
            <h2>Estimates</h2>
            <p>Quotes raised against repairs in this branch</p>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Estimate</th>
                <th>Repair</th>
                <th>Customer</th>
                <th>Total</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {estimates.map((e) => (
                <tr
                  key={e.id}
                  className={e.id === selectedId ? 'row-selected' : ''}
                  onClick={() => {
                    setSelectedId(e.id)
                    setError('')
                    setDone('')
                    setNote('')
                  }}
                >
                  <td>{e.estimateNumber}</td>
                  <td>{jobNumber(e.repairId)}</td>
                  <td>{customerName(e.repairId)}</td>
                  <td>{formatLKR(e.total)}</td>
                  <td>
                    <span className={`badge ${e.status}`}>{STATUS_LABEL[e.status]}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="cart-panel">
        {!selected ? (
          <p className="muted">Select an estimate to see its lines and record a decision.</p>
        ) : (
          <div className="card">
            <div className="card-head table-title">
              <div>
                <h2>{selected.estimateNumber}</h2>
                <p>
                  {jobNumber(selected.repairId)} · {customerName(selected.repairId)}
                </p>
              </div>
              <span className={`badge ${selected.status}`}>{STATUS_LABEL[selected.status]}</span>
            </div>

            <div className="table-wrap">
              <table>
                <tbody>
                  {selected.items.map((item) => (
                    <tr key={item.id}>
                      <td>
                        {item.description}
                        <br />
                        <span className="muted">
                          {item.quantity} × {formatLKR(item.unitPrice)}
                        </span>
                      </td>
                      <td>{formatLKR(item.quantity * item.unitPrice)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="cart-summary">
              <div className="info-list">
                <div>
                  <span>Labour</span>
                  <strong>{formatLKR(selected.labourCost)}</strong>
                </div>
                {selected.discount > 0 && (
                  <div>
                    <span>Discount</span>
                    <strong>−{formatLKR(selected.discount)}</strong>
                  </div>
                )}
                <div>
                  <span>Tax</span>
                  <strong>{selected.taxAmount === 0 ? 'Not charged' : formatLKR(selected.taxAmount)}</strong>
                </div>
                <div>
                  <span>Total</span>
                  <strong>{formatLKR(selected.total)}</strong>
                </div>
              </div>
            </div>

            {selected.notes && <p className="muted">{selected.notes}</p>}
            {selected.supersededBy && (
              <p className="muted">
                Superseded by a later revision. This copy is kept as it was sent.
              </p>
            )}

            {error && (
              <p className="danger-text" role="alert">
                {error}
              </p>
            )}
            {done && (
              <p className="success-text" role="status">
                {done}
              </p>
            )}

            <div className="form-actions">
              {selected.status === 'draft' && canSend && (
                <Button onClick={() => send(selected)} disabled={busy}>
                  Send to customer
                </Button>
              )}

              {selected.status === 'sent' && !canDecide && (
                <p className="muted">
                  Only a manager or admin can record the customer's decision.
                </p>
              )}

              {selected.status === 'sent' && canDecide && (
                <>
                  <label className="checkbox-row">
                    How did the customer respond?
                    <select value={method} onChange={(e) => setMethod(e.target.value as CustomerApproval['method'])}>
                      {METHODS.map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Note
                    <textarea
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      placeholder="What was agreed, or why it was declined."
                    />
                  </label>
                  <Button onClick={() => decide(selected, 'approved')} disabled={busy}>
                    Record approval
                  </Button>
                  <Button kind="secondary" onClick={() => decide(selected, 'rejected')} disabled={busy}>
                    Record rejection
                  </Button>
                </>
              )}
            </div>

            {history.length > 0 && (
              <div className="detail-grid">
                <h3>Approval history</h3>
                {history.map((a) => (
                  <div key={a.id}>
                    <strong>{a.decision === 'approved' ? 'Approved' : 'Rejected'}</strong>
                    <span>
                      {METHODS.find(([v]) => v === a.method)?.[1] ?? a.method} ·{' '}
                      {new Date(a.at).toLocaleString()}
                    </span>
                    {a.note && <p className="muted">{a.note}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

/** Small local button so this module does not depend on App.tsx's private one. */
function Button({
  children,
  onClick,
  kind = 'primary',
  disabled,
}: {
  children: React.ReactNode
  onClick: () => void
  kind?: 'primary' | 'secondary'
  disabled?: boolean
}) {
  return (
    <button className={`btn ${kind === 'secondary' ? 'secondary' : ''}`} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  )
}
