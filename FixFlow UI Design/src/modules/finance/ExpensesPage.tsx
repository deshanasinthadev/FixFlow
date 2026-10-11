import { useMemo, useState } from 'react'
import { useDb, useQuery } from '../../db/store'
import { formatLKR } from '../../lib/format'
import { downloadText, stamp } from '../../lib/download'
import { toCsv } from '../../csv/pipeline'
import { EXPENSE_CATEGORIES, type ExpenseCategory, type PaymentMethodId } from '../../domain/types'

const CATEGORY_LABEL: Record<ExpenseCategory, string> = {
  rent: 'Rent',
  electricity: 'Electricity',
  internet: 'Internet',
  salaries: 'Salaries',
  transport: 'Transport',
  tools: 'Tools',
  consumables: 'Consumables',
  maintenance: 'Maintenance',
  other: 'Other',
}

const METHOD_LABEL: Record<PaymentMethodId, string> = {
  cash: 'Cash',
  card: 'Card',
  bank_transfer: 'Bank transfer',
  other: 'Other',
}

const todayIso = () => new Date().toISOString().slice(0, 10)

/**
 * Operating expenses (§8, §18).
 *
 * These are what the business costs to run whether it sells anything or not,
 * and are kept apart from cost of goods for that reason. COGS moves with
 * revenue; rent does not. Conflating the two is the specific mistake §18 warns
 * against, and it is why this screen has no "parts" category — parts used on a
 * repair are recorded against the repair, where they belong.
 *
 * A correction reverses rather than edits. The original row stays and a negative
 * one is added against it, so the books still show what was recorded and then
 * withdrawn.
 */
export function ExpensesPage({ branchId, actorId }: {
  branchId: string
  actorId: string
}) {
  const { db, bump } = useDb()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState('')

  const [category, setCategory] = useState<ExpenseCategory>('rent')
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')
  const [method, setMethod] = useState<PaymentMethodId>('cash')
  const [spentAt, setSpentAt] = useState(todayIso())

  const [filterCategory, setFilterCategory] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')

  const { data, loading } = useQuery(
    async (d) => d.expenses.list({
      branchId,
      category: filterCategory ? (filterCategory as ExpenseCategory) : undefined,
      from: from ? new Date(`${from}T00:00:00.000Z`).toISOString() : undefined,
      to: to ? new Date(`${to}T23:59:59.999Z`).toISOString() : undefined,
    }),
    [branchId, filterCategory, from, to],
  )

  const expenses = data ?? []

  const byCategory = useMemo(() => {
    const map = new Map<ExpenseCategory, number>()
    for (const expense of expenses) {
      map.set(expense.category, (map.get(expense.category) ?? 0) + expense.amount)
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1])
  }, [expenses])

  const total = useMemo(() => expenses.reduce((sum, e) => sum + e.amount, 0), [expenses])

  const cents = (rupees: string) => {
    const n = Number(rupees.replace(/[^0-9.]/g, ''))
    return Number.isFinite(n) ? Math.round(n * 100) : 0
  }

  const record = async () => {
    const value = cents(amount)
    if (value <= 0) { setError('Enter an amount greater than zero.'); return }
    if (!description.trim()) { setError('An expense needs a description.'); return }
    if (!spentAt) { setError('An expense needs the date it was spent.'); return }

    setBusy(true)
    setError('')
    setDone('')
    try {
      await db.expenses.create({
        branchId,
        category,
        amount: value,
        description: description.trim(),
        method,
        spentAt: new Date(`${spentAt}T12:00:00.000Z`).toISOString(),
        recordedBy: actorId,
      })
      setDone(`${CATEGORY_LABEL[category]} expense of ${formatLKR(value)} recorded.`)
      setAmount('')
      setDescription('')
      bump()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That could not be recorded.')
    } finally {
      setBusy(false)
    }
  }

  const reverse = async (id: string) => {
    const reason = window.prompt('Reverse this expense? Record why:')
    if (reason === null) return
    setBusy(true)
    setError('')
    setDone('')
    try {
      await db.expenses.reverse(id, actorId, reason)
      setDone('Expense reversed. The original stays on the record.')
      bump()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That could not be reversed.')
    } finally {
      setBusy(false)
    }
  }

  const exportCsv = () => {
    if (!expenses.length) return
    downloadText(stamp('fixflow-expenses', 'csv'), toCsv(
      ['Date', 'Category', 'Description', 'Method', 'Amount', 'Recorded by'],
      expenses.map((e) => ({
        Date: e.spentAt.slice(0, 10),
        Category: CATEGORY_LABEL[e.category],
        Description: e.description,
        Method: METHOD_LABEL[e.method],
        Amount: (e.amount / 100).toFixed(2),
        'Recorded by': e.recordedBy,
      })),
    ))
  }

  return (
    <div className="pos-layout">
      <div className="card" style={{ marginBottom: 14 }}>
        <div className="card-head table-title">
          <div>
            <h2>Record an expense</h2>
            <p>What the business costs to run. Parts used on a repair are recorded against the repair, not here.</p>
          </div>
        </div>

        {error && <p className="danger-text" role="alert">{error}</p>}
        {done && <p className="success-text" role="status">{done}</p>}

        <div className="form-actions">
          <label>Category
            <select className="filter-select" value={category} onChange={(e) => setCategory(e.target.value as ExpenseCategory)}>
              {EXPENSE_CATEGORIES.map((value) => (
                <option key={value} value={value}>{CATEGORY_LABEL[value]}</option>
              ))}
            </select>
          </label>
          <label>Amount
            <input placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </label>
          <label>Description
            <input
              placeholder="Shop rent, March"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </label>
          <label>Method
            <select className="filter-select" value={method} onChange={(e) => setMethod(e.target.value as PaymentMethodId)}>
              {(Object.keys(METHOD_LABEL) as PaymentMethodId[]).map((value) => (
                <option key={value} value={value}>{METHOD_LABEL[value]}</option>
              ))}
            </select>
          </label>
          <label>Date spent
            <input type="date" value={spentAt} onChange={(e) => setSpentAt(e.target.value)} />
          </label>
          <button className="btn" onClick={record} disabled={busy}>Record</button>
        </div>
        <p className="muted">
          The date is when the money was spent, not the day it was typed in — a rent payment entered late still belongs
          to the month it covers.
        </p>
      </div>

      <div className="card table-card">
        <div className="card-head table-title">
          <div>
            <h2>Expenses</h2>
            <p>{formatLKR(total)} across {expenses.length} entries</p>
          </div>
          <button className="btn secondary" onClick={exportCsv} disabled={!expenses.length}>Export CSV</button>
        </div>

        <div className="form-actions">
          <label>Category
            <select className="filter-select" value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)}>
              <option value="">All categories</option>
              {EXPENSE_CATEGORIES.map((value) => (
                <option key={value} value={value}>{CATEGORY_LABEL[value]}</option>
              ))}
            </select>
          </label>
          <label>From
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label>To
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </label>
          {(filterCategory || from || to) && (
            <button className="btn secondary" onClick={() => { setFilterCategory(''); setFrom(''); setTo('') }}>Clear</button>
          )}
        </div>

        {loading && <p className="muted"><span className="spinner" aria-hidden="true" />Loading expenses…</p>}

        {byCategory.length > 0 && (
          <div className="info-list" style={{ marginBottom: 14 }}>
            {byCategory.map(([cat, sum]) => (
              <div key={cat}><span>{CATEGORY_LABEL[cat]}</span><strong>{formatLKR(sum)}</strong></div>
            ))}
          </div>
        )}

        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Date</th><th>Category</th><th>Description</th><th>Method</th><th>Amount</th><th>By</th><th/></tr>
            </thead>
            <tbody>
              {expenses.length === 0 && (
                <tr><td colSpan={7} className="muted">
                  {loading ? 'Loading…' : 'No expenses recorded for this filter.'}
                </td></tr>
              )}
              {expenses.map((expense) => (
                <tr key={expense.id}>
                  <td>{new Date(expense.spentAt).toLocaleDateString('en-GB', { dateStyle: 'short' })}</td>
                  <td>{CATEGORY_LABEL[expense.category]}</td>
                  <td>{expense.description}</td>
                  <td>{METHOD_LABEL[expense.method]}</td>
                  <td>
                    <strong className={expense.amount < 0 ? 'success-text' : ''}>
                      {expense.amount < 0 ? `−${formatLKR(-expense.amount)}` : formatLKR(expense.amount)}
                    </strong>
                  </td>
                  <td>{expense.recordedBy}</td>
                  <td>
                    {expense.amount > 0 && (
                      <button className="btn secondary" disabled={busy} onClick={() => reverse(expense.id)}>Reverse</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="muted">
          A reversal is a negative row against the original, which stays on the record. Editing the original would
          leave no trace that anything had been corrected.
        </p>
      </div>
    </div>
  )
}
