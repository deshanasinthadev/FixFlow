import { useMemo, useState } from 'react'
import { Icon } from '../../components/Icon'
import { useDb, useQuery } from '../../db/store'
import { formatLKR } from '../../lib/format'
import type { InvoiceStatus, PaymentMethodId, PaymentStatus } from '../../domain/types'
import type { InvoiceWithBalance } from '../../db/repository'

const INVOICE_LABEL: Record<InvoiceStatus, string> = {
  draft: 'Draft',
  issued: 'Issued',
  partially_paid: 'Partially paid',
  paid: 'Paid',
  cancelled: 'Void',
}

const PAYMENT_LABEL: Record<PaymentStatus, string> = {
  pending: 'Pending',
  paid: 'Paid',
  failed: 'Failed',
  refunded: 'Reversed',
}

const METHODS: Array<[PaymentMethodId, string]> = [
  ['cash', 'Cash'],
  ['card', 'Card'],
  ['bank_transfer', 'Bank transfer'],
  ['other', 'Other'],
]

const METHOD_LABEL: Record<PaymentMethodId, string> = {
  cash: 'Cash',
  card: 'Card',
  bank_transfer: 'Bank transfer',
  other: 'Other',
}

/**
 * Invoices, the payments recorded against them, and what is still owed
 * (§10, §28.8, §28.11).
 *
 * This is a UI over `db.invoices` and `db.payments`. The rules — a payment must
 * reference an invoice, the balance is derived not stored, prior payments are
 * never overwritten — are enforced there and covered by `src/db/billing.test.ts`.
 * Nothing here recomputes a balance; it reads the one the repository derives.
 *
 * Three nav items share this screen because they are three views of one ledger:
 * Invoices is everything, Receivables is what is still owed, Payments is the
 * cash-in history. Splitting them into separate stores would have meant three
 * copies of the same money.
 */
export function BillingPage({ branchId, actorId, canEdit, customerScope, mode = 'invoices' }: {
  branchId: string
  actorId: string
  /** Only staff may raise an invoice, take a payment or void one. */
  canEdit: boolean
  /**
   * Set for a signed-in customer. Everything then loads by customer, never by
   * branch — a branch-wide list would hand one customer another's invoices
   * (§22, §28.12).
   */
  customerScope?: string
  /** Which slice of the same ledger this screen shows. */
  mode?: 'invoices' | 'receivables' | 'payments'
}) {
  const { db, bump } = useDb()
  const [selectedId, setSelectedId] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState('')

  // payment form
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState<PaymentMethodId>('cash')
  const [reference, setReference] = useState('')

  // invoice composer
  const [composing, setComposing] = useState(false)
  const [draftRepair, setDraftRepair] = useState('')
  const [lines, setLines] = useState<{ description: string; quantity: string; unitPrice: string }[]>([
    { description: '', quantity: '1', unitPrice: '' },
  ])
  const [labour, setLabour] = useState('')

  const scope = customerScope ? { customerId: customerScope } : { branchId }

  const { data, loading } = useQuery(
    async (d) => ({
      invoices: await d.invoices.list(scope),
      payments: await d.payments.list(scope),
      repairs: await d.repairs.list(scope),
      users: await d.users.list(),
    }),
    [branchId, customerScope],
  )

  // Payments are listed per invoice, so the history is loaded for the open one.
  const { data: paymentRows } = useQuery(
    async (d) => (selectedId ? d.payments.forInvoice(selectedId) : []),
    [selectedId],
  )

  const allInvoices = data?.invoices ?? []
  const allPayments = data?.payments ?? []
  const repairs = data?.repairs ?? []
  const users = data?.users ?? []

  const invoices = mode === 'receivables'
    ? allInvoices.filter((i) => i.balanceDue > 0 && i.status !== 'cancelled')
    : allInvoices

  const jobNumber = useMemo(() => {
    const map = new Map(repairs.map((r) => [r.id, r.jobNumber]))
    return (id: string) => map.get(id) ?? id
  }, [repairs])

  const customerName = useMemo(() => {
    const map = new Map(repairs.map((r) => [r.id, r.customerName]))
    return (id: string) => map.get(id) ?? '—'
  }, [repairs])

  const staffName = useMemo(() => {
    const map = new Map(users.map((u) => [u.id, u.fullName]))
    return (id: string) => map.get(id) ?? id
  }, [users])

  const invoiceByNumber = useMemo(() => {
    const map = new Map(allInvoices.map((i) => [i.id, i.invoiceNumber]))
    return (id: string) => map.get(id) ?? id
  }, [allInvoices])

  const ELIGIBLE = ['received', 'diagnosing', 'waiting_for_approval', 'waiting_for_parts', 'approved', 'repairing', 'testing']
  const billable = repairs.filter((r) => ELIGIBLE.includes(r.status))

  const selected = allInvoices.find((i) => i.id === selectedId) ?? null
  const payments = paymentRows ?? []

  const totals = useMemo(() => {
    const outstanding = allInvoices
      .filter((i) => i.status !== 'cancelled')
      .reduce((sum, i) => sum + i.balanceDue, 0)
    const settled = allPayments
      .filter((p) => p.status === 'paid')
      .reduce((sum, p) => sum + p.amount, 0)
    return { outstanding, settled }
  }, [allInvoices, allPayments])

  const cents = (rupees: string) => {
    const n = Number(rupees.replace(/[^0-9.]/g, ''))
    return Number.isFinite(n) ? Math.round(n * 100) : 0
  }

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

  const createInvoice = () => {
    const items = lines
      .map((l) => ({ description: l.description.trim(), quantity: Number(l.quantity), unitPrice: cents(l.unitPrice) }))
      .filter((l) => l.description !== '')
    if (!draftRepair) { setError('Choose the repair this invoice is for.'); return }
    if (!items.length) { setError('An invoice needs at least one line with a description.'); return }
    return run('Invoice created as a draft.', async () => {
      await db.invoices.create({
        repairId: draftRepair,
        items,
        labourCost: cents(labour),
        taxEnabled: false,
        actorId,
      })
      setComposing(false)
      setDraftRepair('')
      setLines([{ description: '', quantity: '1', unitPrice: '' }])
      setLabour('')
    })
  }

  const issue = (invoice: InvoiceWithBalance) =>
    run(`${invoice.invoiceNumber} is issued and can now take payments.`, () =>
      db.invoices.issue(invoice.id, actorId),
    )

  const recordPayment = (invoice: InvoiceWithBalance) => {
    const value = cents(amount)
    if (value <= 0) { setError('Enter a payment amount greater than zero.'); return }
    if (value > invoice.balanceDue) {
      setError(`That is more than the ${formatLKR(invoice.balanceDue)} still due on this invoice.`)
      return
    }
    return run(`${formatLKR(value)} recorded against ${invoice.invoiceNumber}.`, async () => {
      await db.payments.record({
        invoiceId: invoice.id,
        amount: value,
        method,
        reference: reference.trim(),
        receivedBy: actorId,
      })
      setAmount('')
      setReference('')
    })
  }

  const reverse = (invoice: InvoiceWithBalance, paymentId: string) =>
    run('Payment reversed. The original stays on the record.', () =>
      db.payments.refund(invoice.id, paymentId, actorId),
    )

  const voidInvoice = (invoice: InvoiceWithBalance) => {
    const reason = window.prompt(`Void ${invoice.invoiceNumber}? Record why:`)
    if (reason === null) return
    return run(`${invoice.invoiceNumber} was voided.`, () =>
      db.invoices.cancel(invoice.id, actorId, reason),
    )
  }

  const badge = (status: InvoiceStatus) =>
    `badge ${status === 'partially_paid' ? 'partially-paid' : status}`

  const composer = canEdit && mode !== 'payments' ? (
    <div className="card" style={{ marginBottom: 14 }}>
      <div className="card-head table-title">
        <div>
          <h2>New invoice</h2>
          <p>Raised against a repair. It starts as a draft and takes payments only once issued.</p>
        </div>
        <Button kind="secondary" onClick={() => { setComposing((v) => !v); setError('') }}>
          {composing ? 'Close' : 'Create'}
        </Button>
      </div>
      {composing && <>
        <label>Repair
          <select className="filter-select" value={draftRepair} onChange={(e) => setDraftRepair(e.target.value)}>
            <option value="">Select a repair…</option>
            {billable.map((r) => (
              <option key={r.id} value={r.id}>{r.jobNumber} — {r.customerName}</option>
            ))}
          </select>
        </label>
        {billable.length === 0 && (
          <p className="muted">No repair in this branch is currently billable.</p>
        )}
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Description</th><th>Qty</th><th>Unit price</th><th/></tr>
            </thead>
            <tbody>
              {lines.map((line, i) => (
                <tr key={i}>
                  <td>
                    <input
                      value={line.description}
                      placeholder="Part or service"
                      onChange={(e) => setLines((prev) => prev.map((l, j) => (j === i ? { ...l, description: e.target.value } : l)))}
                    />
                  </td>
                  <td>
                    <input
                      type="number" min="1" step="1" value={line.quantity}
                      onChange={(e) => setLines((prev) => prev.map((l, j) => (j === i ? { ...l, quantity: e.target.value } : l)))}
                    />
                  </td>
                  <td>
                    <input
                      placeholder="0.00" value={line.unitPrice}
                      onChange={(e) => setLines((prev) => prev.map((l, j) => (j === i ? { ...l, unitPrice: e.target.value } : l)))}
                    />
                  </td>
                  <td>
                    <button
                      className="btn secondary"
                      onClick={() => setLines((prev) => (prev.length > 1 ? prev.filter((_, j) => j !== i) : prev))}
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="form-actions">
          <Button kind="secondary" onClick={() => setLines((prev) => [...prev, { description: '', quantity: '1', unitPrice: '' }])}>
            Add line
          </Button>
          <label>Labour
            <input placeholder="0.00" value={labour} onChange={(e) => setLabour(e.target.value)} />
          </label>
          <Button onClick={createInvoice} disabled={busy}>Create draft</Button>
        </div>
        <p className="muted">Tax is disabled in this deployment, so the total is lines plus labour less any discount.</p>
      </>}
    </div>
  ) : null

  const notice = (
    <>
      {error && <p className="danger-text">{error}</p>}
      {done && <p className="success-text">{done}</p>}
    </>
  )

  if (loading) {
    return (
      <>
        {composer}
        <div className="card empty-module"><span className="spinner" aria-hidden="true" />Loading invoices…</div>
      </>
    )
  }

  if (mode === 'payments') {
    return (
      <div className="pos-layout">
        {notice}
        <div className="card table-card">
          <div className="card-head table-title">
            <div>
              <h2>Payments</h2>
              <p>{formatLKR(totals.settled)} received across {allPayments.filter((p) => p.status === 'paid').length} payments</p>
            </div>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Invoice</th><th>Amount</th><th>Method</th><th>Received by</th><th>Status</th><th>Reference</th><th>When</th></tr>
              </thead>
              <tbody>
                {allPayments.length === 0 && (
                  <tr><td colSpan={7} className="muted">No payments recorded yet.</td></tr>
                )}
                {allPayments.map((p) => (
                  <tr key={p.id}>
                    <td>{invoiceByNumber(p.invoiceId)}</td>
                    <td><strong>{formatLKR(p.amount)}</strong></td>
                    <td>{METHOD_LABEL[p.method]}</td>
                    <td>{staffName(p.receivedBy)}</td>
                    <td><span className={`badge ${p.status === 'refunded' ? 'rejected' : p.status === 'paid' ? 'approved' : 'draft'}`}>{PAYMENT_LABEL[p.status]}</span></td>
                    <td>{p.reference || <span className="muted">—</span>}</td>
                    <td>{new Date(p.paidAt).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="muted">
            A reversed payment is a new row against the original, never an edit to it, so the ledger still shows what
            was taken and what was given back.
          </p>
        </div>
      </div>
    )
  }

  if (invoices.length === 0) {
    return (
      <>
        {composer}
        <div className="card empty-module">
          <Icon name="file" size={32} />
          <h2>{mode === 'receivables' ? 'Nothing outstanding' : 'No invoices yet'}</h2>
          <p>
            {mode === 'receivables'
              ? 'Every invoice in this branch is settled or voided. Outstanding invoices appear here as soon as one carries a balance.'
              : 'Invoices are raised against a repair. Use Create above to start one — an invoice takes its customer and branch from the repair, so it cannot be filed against the wrong job.'}
          </p>
        </div>
      </>
    )
  }

  return (
    <div className="pos-layout">
      {composer}
      {notice}

      <div className="card table-card">
        <div className="card-head table-title">
          <div>
            <h2>{mode === 'receivables' ? 'Receivables' : 'Invoices'}</h2>
            <p>
              {mode === 'receivables'
                ? `${formatLKR(totals.outstanding)} outstanding across ${invoices.length} invoices`
                : `${formatLKR(totals.settled)} received, ${formatLKR(totals.outstanding)} still due`}
            </p>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Invoice</th><th>Customer</th><th>Repair</th><th>Total</th><th>Paid</th><th>Balance</th><th>Status</th></tr>
            </thead>
            <tbody>
              {invoices.map((invoice) => (
                <tr
                  key={invoice.id}
                  className={selectedId === invoice.id ? 'row-selected' : ''}
                  onClick={() => { setSelectedId(invoice.id); setError(''); setDone('') }}
                >
                  <td><strong>{invoice.invoiceNumber}</strong></td>
                  <td>{customerName(invoice.repairId)}</td>
                  <td>{jobNumber(invoice.repairId)}</td>
                  <td>{formatLKR(invoice.total)}</td>
                  <td>{formatLKR(invoice.paidTotal)}</td>
                  <td><strong>{formatLKR(invoice.balanceDue)}</strong></td>
                  <td><span className={badge(invoice.status)}>{INVOICE_LABEL[invoice.status]}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="muted">
          The balance is worked out from the payments each time it is read, never stored, so it cannot disagree with
          the payments it comes from.
        </p>
      </div>

      {selected && (
        <div className="card cart-panel">
          <div className="card-head table-title">
            <div>
              <h2>{selected.invoiceNumber}</h2>
              <p>{customerName(selected.repairId)} · {jobNumber(selected.repairId)}</p>
            </div>
            <span className={badge(selected.status)}>{INVOICE_LABEL[selected.status]}</span>
          </div>

          <div className="detail-grid">
            {selected.items.map((item) => (
              <div key={item.id}>
                <span>{item.description} × {item.quantity}</span>
                <strong>{formatLKR(item.lineTotal)}</strong>
              </div>
            ))}
            {selected.labourCost > 0 && (
              <div><span>Labour</span><strong>{formatLKR(selected.labourCost)}</strong></div>
            )}
            {selected.discount > 0 && (
              <div><span>Discount</span><strong>−{formatLKR(selected.discount)}</strong></div>
            )}
            {selected.taxAmount > 0 && (
              <div><span>Tax ({selected.taxRate}%)</span><strong>{formatLKR(selected.taxAmount)}</strong></div>
            )}
          </div>

          <div className="cart-summary">
            <div><span>Total</span><strong>{formatLKR(selected.total)}</strong></div>
            <div><span>Paid</span><strong>{formatLKR(selected.paidTotal)}</strong></div>
            <div><span>Balance due</span><strong>{formatLKR(selected.balanceDue)}</strong></div>
          </div>

          <h3>Payments</h3>
          {payments.length === 0
            ? <p className="muted">No payments recorded against this invoice.</p>
            : (
              <ul className="info-list">
                {payments.map((p) => (
                  <li key={p.id}>
                    <div>
                      <strong>{formatLKR(p.amount)}</strong> · {METHOD_LABEL[p.method]} · {staffName(p.receivedBy)}
                      <div className="muted">
                        {new Date(p.paidAt).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' })}
                        {p.reference ? ` · ${p.reference}` : ''}
                        {p.reversesPaymentId ? ' · reversal' : ''}
                      </div>
                    </div>
                    <span className={`badge ${p.status === 'paid' ? 'approved' : p.status === 'refunded' ? 'rejected' : 'draft'}`}>
                      {PAYMENT_LABEL[p.status]}
                    </span>
                    {canEdit && p.status === 'paid' && (
                      <Button kind="secondary" disabled={busy} onClick={() => reverse(selected, p.id)}>Reverse</Button>
                    )}
                  </li>
                ))}
              </ul>
            )}

          {canEdit && selected.status === 'draft' && (
            <div className="form-actions">
              <Button onClick={() => issue(selected)} disabled={busy}>Issue invoice</Button>
              <Button kind="secondary" disabled={busy} onClick={() => voidInvoice(selected)}>Void</Button>
            </div>
          )}

          {canEdit && (selected.status === 'issued' || selected.status === 'partially_paid') && (
            <>
              <h3>Record a payment</h3>
              <div className="form-actions">
                <label>Amount
                  <input
                    placeholder={String((selected.balanceDue / 100).toFixed(2))}
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                  />
                </label>
                <label>Method
                  <select className="filter-select" value={method} onChange={(e) => setMethod(e.target.value as PaymentMethodId)}>
                    {METHODS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </label>
                <label>Reference
                  <input
                    placeholder="Optional — slip, last 4, cheque no."
                    value={reference}
                    onChange={(e) => setReference(e.target.value)}
                  />
                </label>
                <Button onClick={() => recordPayment(selected)} disabled={busy}>Record payment</Button>
              </div>
              <p className="muted">
                Up to {formatLKR(selected.balanceDue)} can be recorded. An overpayment is refused rather than parked as
                credit, because nothing here tracks a customer credit balance.
              </p>
            </>
          )}

          {selected.status === 'cancelled' && (
            <p className="muted">
              This invoice is void. The row and any payments recorded against it are kept so the void can be audited.
            </p>
          )}
        </div>
      )}
    </div>
  )
}

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
