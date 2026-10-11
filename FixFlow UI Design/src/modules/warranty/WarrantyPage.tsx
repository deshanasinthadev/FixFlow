import { useMemo, useState } from 'react'
import { useDb, useQuery } from '../../db/store'
import { formatLKR, formatDate } from '../../lib/format'
import { downloadText, stamp } from '../../lib/download'
import { toCsv } from '../../csv/pipeline'
import { daysUntil } from '../../domain/calculations'
import { WARRANTY_CLAIM_STATUS_LABEL, canTransitionClaim } from '../../domain/workflows'
import type { WarrantyClaim, WarrantyStatus } from '../../domain/types'

const COVER_LABEL: Record<string, string> = {
  product: 'Product',
  repair_service: 'Repair service',
  component: 'Component',
}

const STATUS_TONE: Record<WarrantyStatus, string> = {
  active: 'approved',
  expired: 'rejected',
  claimed: 'issued',
  void: 'cancelled',
}

/**
 * Warranty (§17).
 *
 * Two views of the same rows: the cover a customer has, and the claims made
 * against it. Product cover and repair-service cover are kept apart in the
 * policy list because they are different promises with different durations, but
 * a customer asking "am I covered?" does not care which shelf the item came
 * from, so search spans both.
 *
 * Nothing here recomputes an expiry from a policy. The dates shown are the ones
 * stored on the row when the cover was issued, so editing a policy above cannot
 * move cover that is already in force.
 */
export function WarrantyPage({ branchId, actorId }: {
  branchId: string
  actorId: string
}) {
  void branchId
  const { db, bump } = useDb()
  const [tab, setTab] = useState<'cover' | 'claims' | 'policies'>('cover')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState('')

  // search
  const [term, setTerm] = useState('')

  // issue
  const [issuePolicy, setIssuePolicy] = useState('')
  const [issueCustomer, setIssueCustomer] = useState('')
  const [issueProduct, setIssueProduct] = useState('')

  // policy
  const [policyName, setPolicyName] = useState('')
  const [policyMonths, setPolicyMonths] = useState('12')
  const [policyAppliesTo, setPolicyAppliesTo] = useState<'product' | 'repair_service' | 'component'>('product')

  // claim
  const [claimWarranty, setClaimWarranty] = useState('')
  const [claimIssue, setClaimIssue] = useState('')

  const { data, loading } = useQuery(
    async (d) => ({
      warranties: term.trim() ? await d.warranty.search(term) : await d.warranty.list(),
      claims: await d.warranty.claims(),
      policies: await d.warranty.policies(),
      customers: await d.customers.list(),
      products: await d.products.list(),
      expiring: await d.warranty.expiringSoon(30),
    }),
    [term],
  )

  const warranties = data?.warranties ?? []
  const claims = data?.claims ?? []
  const policies = data?.policies ?? []
  const customers = data?.customers ?? []
  const products = data?.products ?? []
  const expiring = data?.expiring ?? []

  const customerName = useMemo(
    () => new Map(customers.map((c) => [c.id, c.fullName])),
    [customers],
  )
  const policyLabel = useMemo(
    () => new Map(policies.map((p) => [p.id, p.name])),
    [policies],
  )
  const productName = useMemo(
    () => new Map(products.map((p) => [p.id, `${p.sku} ${p.name}`])),
    [products],
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

  const issue = () => {
    if (!issuePolicy) { setError('Choose the cover terms to issue.'); return }
    if (!issueCustomer) { setError('Choose the customer this cover belongs to.'); return }
    return run('Cover issued.', () => db.warranty.issue({
      policyId: issuePolicy,
      customerId: issueCustomer,
      productId: issueProduct || undefined,
    }))
  }

  const addPolicy = () => {
    if (!policyName.trim()) { setError('Name the cover terms.'); return }
    const months = Number(policyMonths)
    if (!Number.isInteger(months) || months < 0) { setError('Cover must be a whole number of months.'); return }
    return run('Cover terms saved. Cover already issued is unaffected.', () => db.warranty.addPolicy({
      name: policyName.trim(),
      durationMonths: months,
      terms: '',
      exclusions: '',
      appliesTo: policyAppliesTo,
    })).then(() => { setPolicyName(''); setPolicyMonths('12') })
  }

  const submitClaim = () => {
    if (!claimWarranty) { setError('Choose the cover the claim is against.'); return }
    if (!claimIssue.trim()) { setError('Describe what has gone wrong.'); return }
    return run('Claim recorded.', () => db.warranty.submitClaim({
      warrantyId: claimWarranty,
      reportedIssue: claimIssue.trim(),
    })).then(() => { setClaimWarranty(''); setClaimIssue('') })
  }

  const inspect = (claim: WarrantyClaim) => {
    const findings = window.prompt('What did inspection find?')
    if (findings === null) return
    return run('Findings recorded.', () => db.warranty.inspect(claim.id, findings))
  }

  const decide = (claim: WarrantyClaim, outcome: 'approved' | 'rejected') => {
    const findings = window.prompt(`${outcome === 'approved' ? 'Approve' : 'Reject'} — record findings:`)
    if (findings === null) return
    return run(outcome === 'approved' ? 'Claim approved.' : 'Claim rejected.',
      () => db.warranty.decideClaim(claim.id, outcome, { findings }, actorId))
  }

  const exportCsv = () => {
    if (!warranties.length) return
    downloadText(stamp('fixflow-warranty', 'csv'), toCsv(
      ['Warranty', 'Customer', 'Cover', 'Product', 'Starts', 'Expires', 'Status', 'Days left'],
      warranties.map((w) => ({
        Warranty: w.warrantyNumber,
        Customer: customerName.get(w.customerId) ?? w.customerId,
        Cover: policyLabel.get(w.policyId) ?? w.policyId,
        Product: w.productId ? (productName.get(w.productId) ?? w.productId) : '',
        Starts: w.startsAt.slice(0, 10),
        Expires: w.expiresAt.slice(0, 10),
        Status: w.status,
        'Days left': String(daysUntil(w.expiresAt)),
      })),
    ))
  }

  const liveCover = warranties.filter((w) => w.status === 'active')

  return (
    <>
      <div className="tabs">
        <button className={tab === 'cover' ? 'active' : ''} onClick={() => setTab('cover')}>Cover</button>
        <button className={tab === 'claims' ? 'active' : ''} onClick={() => setTab('claims')}>Claims</button>
        <button className={tab === 'policies' ? 'active' : ''} onClick={() => setTab('policies')}>Cover terms</button>
      </div>

      {error && <div className="card"><p className="danger-text" role="alert">{error}</p></div>}
      {done && <div className="card"><p className="success-text" role="status">{done}</p></div>}

      {tab === 'cover' && <>
        <div className="card" style={{ marginBottom: 14 }}>
          <div className="card-head table-title">
            <div>
              <h2>Issue cover</h2>
              <p>{liveCover.length} active · {expiring.length} ending within 30 days</p>
            </div>
            <button className="btn secondary" onClick={exportCsv} disabled={!warranties.length}>Export CSV</button>
          </div>
          <div className="form-actions">
            <label>Cover terms
              <select className="filter-select" value={issuePolicy} onChange={(e) => setIssuePolicy(e.target.value)}>
                <option value="">Select…</option>
                {policies.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} — {p.durationMonths} months ({COVER_LABEL[p.appliesTo]})
                  </option>
                ))}
              </select>
            </label>
            <label>Customer
              <select className="filter-select" value={issueCustomer} onChange={(e) => setIssueCustomer(e.target.value)}>
                <option value="">Select…</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>{c.fullName} · {c.phone}</option>
                ))}
              </select>
            </label>
            <label>Product (optional)
              <select className="filter-select" value={issueProduct} onChange={(e) => setIssueProduct(e.target.value)}>
                <option value="">Not tied to a product</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>{p.sku} — {p.name}</option>
                ))}
              </select>
            </label>
            <button className="btn" onClick={issue} disabled={busy || !issuePolicy || !issueCustomer}>Issue</button>
          </div>
          <p className="muted">
            The expiry is worked out from the policy now and stored on the cover. Editing the terms later will not
            change what has already been issued.
          </p>
        </div>

        <div className="card table-card">
          <div className="card-head table-title">
            <div>
              <h2>Cover on file</h2>
              <p>Search by warranty number, customer, phone, product or repair job number</p>
            </div>
          </div>
          <div className="form-actions">
            <label>Search
              <input
                placeholder="WP-2026-0001, 077…, FX-2026-…"
                value={term}
                onChange={(e) => setTerm(e.target.value)}
              />
            </label>
            {term && <button className="btn secondary" onClick={() => setTerm('')}>Clear</button>}
          </div>

          {loading && <p className="muted"><span className="spinner" aria-hidden="true" />Loading cover…</p>}

          <div className="table-wrap">
            <table>
              <thead><tr><th>Warranty</th><th>Customer</th><th>Cover</th><th>Product</th><th>Expires</th><th>Status</th><th/></tr></thead>
              <tbody>
                {warranties.length === 0 && (
                  <tr><td colSpan={7} className="muted">
                    {loading ? 'Loading…' : term ? 'No cover matches that reference.' : 'No cover has been issued yet.'}
                  </td></tr>
                )}
                {warranties.map((w) => {
                  const left = daysUntil(w.expiresAt)
                  return <tr key={w.id}>
                    <td><strong>{w.warrantyNumber}</strong></td>
                    <td>{customerName.get(w.customerId) ?? w.customerId}</td>
                    <td>{policyLabel.get(w.policyId) ?? w.policyId}</td>
                    <td>{w.productId ? (productName.get(w.productId) ?? w.productId) : '—'}</td>
                    <td>{formatDate(w.expiresAt)}<br/><small className="muted">{left < 0 ? `${-left} days ago` : `${left} days left`}</small></td>
                    <td><span className={`badge ${STATUS_TONE[w.status]}`}>{w.status.replace(/_/g, ' ')}</span></td>
                    <td>
                      {w.status === 'active' && (
                        <button
                          className="btn secondary"
                          disabled={busy}
                          onClick={() => {
                            const reason = window.prompt('Withdraw this cover? Record why:')
                            if (reason !== null) void run('Cover withdrawn.', () => db.warranty.void(w.id, reason, actorId))
                          }}
                        >
                          Withdraw
                        </button>
                      )}
                    </td>
                  </tr>
                })}
              </tbody>
            </table>
          </div>
        </div>
      </>}

      {tab === 'claims' && <>
        <div className="card" style={{ marginBottom: 14 }}>
          <div className="card-head table-title">
            <div><h2>Record a claim</h2><p>A claim against cover that has lapsed or been withdrawn is refused here.</p></div>
          </div>
          <div className="form-actions">
            <label>Cover
              <select className="filter-select" value={claimWarranty} onChange={(e) => setClaimWarranty(e.target.value)}>
                <option value="">Select…</option>
                {liveCover.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.warrantyNumber} — {customerName.get(w.customerId) ?? w.customerId}
                  </option>
                ))}
              </select>
            </label>
            <label>What has gone wrong
              <input
                placeholder="Stopped charging after two weeks"
                value={claimIssue}
                onChange={(e) => setClaimIssue(e.target.value)}
              />
            </label>
            <button className="btn" onClick={submitClaim} disabled={busy || !claimWarranty}>Record claim</button>
          </div>
        </div>

        <div className="card table-card">
          <div className="card-head table-title">
            <div><h2>Claims</h2><p>{claims.length} recorded</p></div>
          </div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Claim</th><th>Cover</th><th>Reported</th><th>Findings</th><th>Status</th><th/></tr></thead>
              <tbody>
                {claims.length === 0 && <tr><td colSpan={6} className="muted">No claims recorded.</td></tr>}
                {claims.map((claim) => <tr key={claim.id}>
                  <td><strong>{claim.claimNumber}</strong><br/><small className="muted">{formatDate(claim.createdAt)}</small></td>
                  <td>{claim.warrantyId}</td>
                  <td>{claim.reportedIssue}</td>
                  <td>{claim.findings || '—'}</td>
                  <td>{WARRANTY_CLAIM_STATUS_LABEL[claim.status]}</td>
                  <td>
                    <div className="form-actions">
                      {canTransitionClaim(claim.status, 'under_inspection') && (
                        <button className="btn secondary" disabled={busy} onClick={() => void inspect(claim)}>Inspect</button>
                      )}
                      {claim.status === 'under_inspection' && <>
                        <button className="btn" disabled={busy} onClick={() => void decide(claim, 'approved')}>Approve</button>
                        <button className="btn secondary" disabled={busy} onClick={() => void decide(claim, 'rejected')}>Reject</button>
                      </>}
                      {canTransitionClaim(claim.status, 'in_progress') && (
                        <button className="btn secondary" disabled={busy} onClick={() => void run('Work started.', () => db.warranty.startClaimWork(claim.id))}>Start work</button>
                      )}
                      {canTransitionClaim(claim.status, 'resolved') && (
                        <button className="btn secondary" disabled={busy} onClick={() => {
                          const how = window.prompt('How was this put right?')
                          if (how !== null) void run('Claim resolved.', () => db.warranty.resolveClaim(claim.id, how))
                        }}>Resolve</button>
                      )}
                      {canTransitionClaim(claim.status, 'closed') && (
                        <button className="btn secondary" disabled={busy} onClick={() => void run('Claim closed.', () => db.warranty.closeClaim(claim.id))}>Close</button>
                      )}
                    </div>
                  </td>
                </tr>)}
              </tbody>
            </table>
          </div>
          <p className="muted">
            Findings have to be recorded before a claim can be approved or rejected. The decision is stored against
            whoever made it.
          </p>
        </div>
      </>}

      {tab === 'policies' && <>
        <div className="card" style={{ marginBottom: 14 }}>
          <div className="card-head table-title">
            <div><h2>Add cover terms</h2><p>Product cover and repair-service cover are separate promises.</p></div>
          </div>
          <div className="form-actions">
            <label>Name
              <input
                placeholder="12-month product cover"
                value={policyName}
                onChange={(e) => setPolicyName(e.target.value)}
              />
            </label>
            <label>Months
              <input type="number" min="0" step="1" value={policyMonths} onChange={(e) => setPolicyMonths(e.target.value)} />
            </label>
            <label>Applies to
              <select className="filter-select" value={policyAppliesTo} onChange={(e) => setPolicyAppliesTo(e.target.value as 'product' | 'repair_service' | 'component')}>
                <option value="product">Product</option>
                <option value="repair_service">Repair service</option>
                <option value="component">Component</option>
              </select>
            </label>
            <button className="btn" onClick={addPolicy} disabled={busy}>Save terms</button>
          </div>
          <p className="muted">
            Changing these terms applies to cover issued from now on. Cover already issued keeps the dates it was sold
            with, so a customer's cover cannot be shortened from under them.
          </p>
        </div>

        <div className="card table-card">
          <div className="card-head table-title">
            <div><h2>Cover terms</h2><p>{policies.length} defined</p></div>
          </div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Name</th><th>Duration</th><th>Applies to</th><th>Issued under it</th></tr></thead>
              <tbody>
                {policies.length === 0 && <tr><td colSpan={4} className="muted">No cover terms defined yet.</td></tr>}
                {policies.map((p) => <tr key={p.id}>
                  <td><strong>{p.name}</strong></td>
                  <td>{p.durationMonths} months</td>
                  <td>{COVER_LABEL[p.appliesTo]}</td>
                  <td>{warranties.filter((w) => w.policyId === p.id).length}</td>
                </tr>)}
              </tbody>
            </table>
          </div>
        </div>
      </>}
    </>
  )
}
