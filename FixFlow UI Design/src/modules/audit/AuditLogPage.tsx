import { useMemo, useState } from 'react'
import { useDb, useQuery } from '../../db/store'
import { formatDate } from '../../lib/format'
import { downloadText, stamp } from '../../lib/download'
import { toCsv } from '../../csv/pipeline'

/** Human-readable labels for the actions the trail records. */
const ACTION_LABEL: Record<string, string> = {
  'estimate.sent': 'Estimate sent',
  'invoice.issued': 'Invoice issued',
  'invoice.voided': 'Invoice voided',
  'sale.refunded': 'Sale refunded',
  'expense.reversed': 'Expense reversed',
  'repair.part_added': 'Part used on repair',
  'warranty.voided': 'Cover withdrawn',
}

const TARGET_LABEL: Record<string, string> = {
  estimate: 'Estimate',
  invoice: 'Invoice',
  sale: 'Sale',
  expense: 'Expense',
  repair: 'Repair',
  warranty: 'Warranty',
  product: 'Product',
}

/**
 * Audit trail (§10, §23).
 *
 * Read-only by design. There is no edit and no delete anywhere on this screen,
 * because the point of the log is that it cannot be made to agree with a later
 * story. The repository does not expose those operations either, so this screen
 * could not offer them even if it tried.
 *
 * A branch-scoped user sees only their own branch's trail; an admin sees
 * everything. That filter is applied on read, not by hiding rows afterwards.
 */
export function AuditLogPage({ branchId, canSeeAll }: {
  branchId: string
  canSeeAll: boolean
}) {
  const { db: _db } = useDb()
  void _db
  const [filterAction, setFilterAction] = useState('')
  const [filterTarget, setFilterTarget] = useState('')
  const [term, setTerm] = useState('')

  const scope = canSeeAll ? undefined : branchId

  const { data, loading } = useQuery(
    async (d) => d.audit.list({
      branchId: scope,
      action: filterAction || undefined,
      targetType: filterTarget || undefined,
    }),
    [scope, filterAction, filterTarget],
  )

  const rows = useMemo(() => {
    const all = data ?? []
    const needle = term.trim().toLowerCase()
    if (!needle) return all
    return all.filter((e) =>
      e.actorName.toLowerCase().includes(needle)
      || e.action.toLowerCase().includes(needle)
      || e.detail.toLowerCase().includes(needle)
      || e.targetId.toLowerCase().includes(needle))
  }, [data, term])

  const actions = useMemo(() => {
    const set = new Set<string>()
    for (const entry of data ?? []) set.add(entry.action)
    return [...set].sort()
  }, [data])

  const targets = useMemo(() => {
    const set = new Set<string>()
    for (const entry of data ?? []) set.add(entry.targetType)
    return [...set].sort()
  }, [data])

  const exportCsv = () => {
    if (!rows.length) return
    downloadText(stamp('fixflow-audit', 'csv'), toCsv(
      ['When', 'Who', 'Action', 'Target type', 'Target', 'Detail', 'Branch'],
      rows.map((e) => ({
        When: e.at,
        Who: e.actorName,
        Action: e.action,
        'Target type': e.targetType,
        Target: e.targetId,
        Detail: e.detail,
        Branch: e.branchId,
      })),
    ))
  }

  return (
    <div className="pos-layout">
      <div className="card table-card">
        <div className="card-head table-title">
          <div>
            <h2>Audit trail</h2>
            <p>
              {rows.length} {rows.length === 1 ? 'entry' : 'entries'}
              {canSeeAll ? ' · every branch' : ' · this branch'}
            </p>
          </div>
          <button className="btn secondary" onClick={exportCsv} disabled={!rows.length}>Export CSV</button>
        </div>

        <div className="form-actions">
          <label>Action
            <select className="filter-select" value={filterAction} onChange={(e) => setFilterAction(e.target.value)}>
              <option value="">All actions</option>
              {actions.map((a) => (
                <option key={a} value={a}>{ACTION_LABEL[a] ?? a}</option>
              ))}
            </select>
          </label>
          <label>Record type
            <select className="filter-select" value={filterTarget} onChange={(e) => setFilterTarget(e.target.value)}>
              <option value="">All records</option>
              {targets.map((t) => (
                <option key={t} value={t}>{TARGET_LABEL[t] ?? t}</option>
              ))}
            </select>
          </label>
          <label>Search
            <input
              placeholder="Who, what, or a record reference"
              value={term}
              onChange={(e) => setTerm(e.target.value)}
            />
          </label>
          {(filterAction || filterTarget || term) && (
            <button className="btn secondary" onClick={() => { setFilterAction(''); setFilterTarget(''); setTerm('') }}>Clear</button>
          )}
        </div>

        {loading && <p className="muted"><span className="spinner" aria-hidden="true" />Loading the trail…</p>}

        <div className="table-wrap">
          <table>
            <thead><tr><th>When</th><th>Who</th><th>Action</th><th>Record</th><th>What happened</th></tr></thead>
            <tbody>
              {rows.length === 0 && (
                <tr><td colSpan={5} className="muted">
                  {loading ? 'Loading…' : 'Nothing recorded against this filter yet.'}
                </td></tr>
              )}
              {rows.map((entry) => <tr key={entry.id}>
                <td>
                  {formatDate(entry.at)}
                  <br/><small className="muted">{new Date(entry.at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</small>
                </td>
                <td><strong>{entry.actorName}</strong></td>
                <td>{ACTION_LABEL[entry.action] ?? entry.action}</td>
                <td>{TARGET_LABEL[entry.targetType] ?? entry.targetType}<br/><small className="muted">{entry.targetId}</small></td>
                <td>{entry.detail || '—'}</td>
              </tr>)}
            </tbody>
          </table>
        </div>

        <p className="muted">
          The trail is append-only. Entries cannot be edited or deleted from here, and the data layer offers no way to
          do it either — a log that can be rewritten is not evidence.
        </p>
      </div>
    </div>
  )
}
