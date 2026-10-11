import { useMemo, useState } from 'react'
import { useDb, useQuery } from '../../db/store'
import { formatLKR } from '../../lib/format'
import { downloadText, stamp } from '../../lib/download'
import { toCsv } from '../../csv/pipeline'
import { saleCostOfGoods, saleRevenue } from '../../domain/calculations'
import { computeSeries } from '../../modules/dashboard/figures'

type Range = 'today' | 'week' | 'month' | 'custom'

const RANGE_LABEL: Record<Range, string> = {
  today: 'Today',
  week: 'Last 7 days',
  month: 'This month',
  custom: 'Custom range',
}

const startOf = (d: Date) => {
  const copy = new Date(d)
  copy.setHours(0, 0, 0, 0)
  return copy
}

/**
 * Profit and loss over a chosen period (§8, §18).
 *
 * Four numbers are kept separate because they answer different questions:
 *
 *   Sales revenue      what the counter took
 *   Repair income      what has been collected on repair invoices
 *   Cost of goods      what the sold stock cost to buy in
 *   Expenses           what the business costs to run
 *
 * Profit is the first two minus the last two. Cost of goods comes from the
 * recorded unit cost on each sale line, per transaction. §18 is explicit that
 * netting total purchases against total sales is the wrong calculation — it
 * charges this month with stock that is still on the shelf and hides what a sale
 * actually cost to make.
 *
 * Repair income counts what has been collected, not what has been billed: an
 * unpaid invoice is a receivable, and counting it as income would overstate the
 * period by whatever nobody has paid yet.
 */
export function ReportsPage({ branchId }: { branchId: string }) {
  const { db: _db } = useDb()
  void _db
  const [range, setRange] = useState<Range>('month')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')

  const { data, loading } = useQuery(
    async (d) => ({
      sales: await d.sales.list({ branchId }),
      invoices: await d.invoices.list({ branchId }),
      expenses: await d.expenses.list({ branchId }),
    }),
    [branchId],
  )

  const sales = data?.sales ?? []
  const invoices = data?.invoices ?? []
  const expenses = data?.expenses ?? []

  const window = useMemo(() => {
    const now = new Date()
    if (range === 'today') return { from: startOf(now).getTime(), to: Infinity, label: 'today' }
    if (range === 'week') {
      const from = startOf(now)
      from.setDate(from.getDate() - 6)
      return { from: from.getTime(), to: Infinity, label: 'the last 7 days' }
    }
    if (range === 'month') {
      return { from: startOf(new Date(now.getFullYear(), now.getMonth(), 1)).getTime(), to: Infinity, label: 'this month' }
    }
    return {
      from: customFrom ? startOf(new Date(`${customFrom}T12:00:00`)).getTime() : -Infinity,
      to: customTo ? startOf(new Date(`${customTo}T12:00:00`)).getTime() + 86_400_000 : Infinity,
      label: customFrom || customTo ? `${customFrom || '…'} to ${customTo || '…'}` : 'all time',
    }
  }, [range, customFrom, customTo])

  const inWindow = (iso: string) => {
    const at = new Date(iso).getTime()
    return !Number.isNaN(at) && at >= window.from && at < window.to
  }

  const figures = useMemo(() => {
    let salesRevenue = 0
    let costOfGoods = 0
    let saleCount = 0
    for (const sale of sales) {
      if (!inWindow(sale.createdAt)) continue
      salesRevenue += saleRevenue(sale)
      costOfGoods += saleCostOfGoods(sale.items)
      saleCount += 1
    }

    let repairIncome = 0
    let outstanding = 0
    for (const invoice of invoices) {
      if (!invoice.repairId) continue
      if (!inWindow(invoice.createdAt)) continue
      repairIncome += invoice.paidTotal
      outstanding += invoice.balanceDue
    }

    let expensesTotal = 0
    for (const expense of expenses) {
      if (!inWindow(expense.spentAt)) continue
      expensesTotal += expense.amount
    }

    const grossProfit = salesRevenue + repairIncome - costOfGoods
    return {
      salesRevenue, repairIncome, costOfGoods, expensesTotal,
      grossProfit,
      operatingResult: grossProfit - expensesTotal,
      saleCount, outstanding,
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sales, invoices, expenses, window])

  const series = useMemo(
    () => computeSeries({ sales, invoices, expenses }, range === 'month' || range === 'custom' ? 'month' : 'day', range === 'month' || range === 'custom' ? 6 : 7),
    [sales, invoices, expenses, range],
  )

  const exportCsv = () => {
    downloadText(stamp(`fixflow-report-${range}`, 'csv'), toCsv(
      ['Measure', 'Amount'],
      [
        { Measure: `Period (${window.label})`, Amount: '' },
        { Measure: 'Sales revenue', Amount: (figures.salesRevenue / 100).toFixed(2) },
        { Measure: 'Repair income collected', Amount: (figures.repairIncome / 100).toFixed(2) },
        { Measure: 'Cost of goods sold', Amount: (figures.costOfGoods / 100).toFixed(2) },
        { Measure: 'Gross profit', Amount: (figures.grossProfit / 100).toFixed(2) },
        { Measure: 'Operating expenses', Amount: (figures.expensesTotal / 100).toFixed(2) },
        { Measure: 'Operating result', Amount: (figures.operatingResult / 100).toFixed(2) },
        { Measure: 'Sales count', Amount: String(figures.saleCount) },
        { Measure: 'Still outstanding on invoices in period', Amount: (figures.outstanding / 100).toFixed(2) },
      ],
    ))
  }

  const rows: Array<[string, number, string]> = [
    ['Sales revenue', figures.salesRevenue, 'Counter sales, net of discount'],
    ['Repair income', figures.repairIncome, 'Collected on repair invoices'],
    ['Cost of goods sold', -figures.costOfGoods, 'Recorded unit cost of what was sold'],
    ['Gross profit', figures.grossProfit, 'Revenue less cost of goods'],
    ['Operating expenses', -figures.expensesTotal, 'Rent, salaries, utilities and the rest'],
    ['Operating result', figures.operatingResult, 'What the period actually made'],
  ]

  return (
    <div className="pos-layout">
      <div className="card" style={{ marginBottom: 14 }}>
        <div className="card-head table-title">
          <div>
            <h2>Profit and loss</h2>
            <p>{RANGE_LABEL[range]}{range === 'custom' && window.label !== 'all time' ? ` · ${window.label}` : ''} · this branch</p>
          </div>
          <button className="btn secondary" onClick={exportCsv}>Export CSV</button>
        </div>

        <div className="form-actions">
          {(Object.keys(RANGE_LABEL) as Range[]).map((value) => (
            <button
              key={value}
              className={`btn ${range === value ? '' : 'secondary'}`}
              onClick={() => setRange(value)}
            >
              {RANGE_LABEL[value]}
            </button>
          ))}
          {range === 'custom' && <>
            <label>From
              <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} />
            </label>
            <label>To
              <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} />
            </label>
          </>}
        </div>

        {loading && <p className="muted"><span className="spinner" aria-hidden="true" />Loading report…</p>}

        <div className="info-list" style={{ marginTop: 14 }}>
          {rows.map(([label, amount, note]) => (
            <div key={label}>
              <span>{label}<br/><small className="muted">{note}</small></span>
              <strong className={amount < 0 ? 'danger-text' : label === 'Operating result' ? (amount < 0 ? 'danger-text' : 'success-text') : ''}>
                {amount < 0 ? `−${formatLKR(-amount)}` : formatLKR(amount)}
              </strong>
            </div>
          ))}
        </div>

        <p className="muted">
          Cost of goods is taken from the recorded unit cost of each sale line, not from subtracting purchases from
          sales. Netting purchases against sales would charge this period with stock still sitting on the shelf.
          Repair income counts what has been collected; {formatLKR(figures.outstanding)} is still outstanding on
          invoices raised in this period and is not counted as income.
        </p>
      </div>

      <div className="card table-card">
        <div className="card-head table-title">
          <div>
            <h2>{range === 'month' || range === 'custom' ? 'Monthly' : 'Daily'} trend</h2>
            <p>Revenue and expenses over time</p>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Period</th><th>Revenue</th><th>Expenses</th><th>Net</th></tr></thead>
            <tbody>
              {series.map((point) => (
                <tr key={point.key}>
                  <td>{point.key}</td>
                  <td>{formatLKR(point.revenue)}</td>
                  <td>{formatLKR(point.expenses)}</td>
                  <td>
                    <strong className={point.revenue - point.expenses < 0 ? 'danger-text' : ''}>
                      {formatLKR(point.revenue - point.expenses)}
                    </strong>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="muted">
          Periods with nothing recorded are shown rather than skipped, so a quiet stretch reads as quiet instead of
          disappearing and making the rest look closer together than it was.
        </p>
      </div>
    </div>
  )
}
