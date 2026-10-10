import { useMemo, useState } from "react";
import { useCan, useDatabase, useSession } from "../../app/store";
import { navigate as go } from "../../app/router";
import {
  activeRepairs,
  costOfGoodsCents,
  dailyBuckets,
  delayedRepairs,
  expenseTotalCents,
  expensesInRange,
  grossProfitCents,
  lowStockProducts,
  rangeFor,
  receivablesCents,
  repairRevenueCents,
  salesInRange,
  salesRevenueCents,
  stockValueCents,
  type RangeKey,
} from "../../domain/calculations";
import { inBranchScope, scopeFor } from "../../domain/permissions";
import { countRepairsByStatus, statusLabel, statusTone } from "../../domain/workflows";
import type { Branch } from "../../domain/types";
import { formatMoney, formatShortDate, relativeTime } from "../../utils/format";
import { Badge, Card, CardHead, DataTable, EmptyState, PageHeader, Segmented, Stat } from "../../components/ui";
import { BarList, DonutChart, LegendList, TrendChart } from "../../components/charts";
import { Icon } from "../../components/ui/Icon";

const RANGES: { value: RangeKey; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "7d", label: "7D" },
  { value: "30d", label: "30D" },
  { value: "mtd", label: "MTD" },
];

const STATUS_COLORS = [
  "#8b5cf6",
  "#3b82f6",
  "#06b6d4",
  "#f43f7a",
  "#f59e0b",
  "#10b981",
  "#64748b",
];

export function DashboardPage() {
  const db = useDatabase();
  const session = useSession();
  const can = useCan();
  const [rangeKey, setRangeKey] = useState<RangeKey>("30d");

  const scope = scopeFor(session);
  const range = useMemo(() => rangeFor(rangeKey), [rangeKey]);
  const symbol = db.business.currencySymbol;
  const showFinancials = can("dashboard.financials");

  // Branch selector in the top bar already narrows admin scope; non-admins are
  // locked to their own branch and cannot widen it.
  const branchFilter = scope.branchId;
  const visibleBranches: Branch[] = useMemo(
    () => db.branches.filter((branch) => inBranchScope(scope, branch.id)),
    [db.branches, scope],
  );

  const scopedRepairs = useMemo(
    () => db.repairs.filter((repair) => inBranchScope(scope, repair.branchId)),
    [db.repairs, scope],
  );
  const scopedSales = useMemo(
    () => salesInRange(db.sales, range, branchFilter),
    [db.sales, range, branchFilter],
  );
  const scopedExpenses = useMemo(
    () => expensesInRange(db.expenses, range, branchFilter),
    [db.expenses, range, branchFilter],
  );

  const statusCounts = useMemo(() => countRepairsByStatus(scopedRepairs), [scopedRepairs]);
  const active = useMemo(() => activeRepairs(scopedRepairs), [scopedRepairs]);
  const delayed = useMemo(() => delayedRepairs(scopedRepairs), [scopedRepairs]);

  const salesTotal = salesRevenueCents(scopedSales);
  const repairRevenue = repairRevenueCents(db, range, branchFilter);
  const cogs = costOfGoodsCents(scopedSales);
  const grossProfit = grossProfitCents(scopedSales);
  const expensesTotal = expenseTotalCents(scopedExpenses);
  const operatingResult = grossProfit + repairRevenue - expensesTotal;
  const outstanding = receivablesCents(db, branchFilter);
  const lowStock = useMemo(() => lowStockProducts(db, branchFilter), [db, branchFilter]);
  const stockValue = stockValueCents(db, branchFilter);

  const todayRange = useMemo(() => rangeFor("today"), []);
  const todaySales = salesInRange(db.sales, todayRange, branchFilter);
  const todayPayments = db.payments.filter((payment) => {
    if (!inBranchScope(scope, payment.branchId)) return false;
    const at = new Date(payment.receivedAt).getTime();
    return at >= todayRange.from.getTime() && at <= todayRange.to.getTime();
  });

  const openClaims = db.warrantyClaims.filter(
    (claim) =>
      inBranchScope(scope, claim.branchId) && (claim.status === "submitted" || claim.status === "under_inspection"),
  );

  const trend = useMemo(() => {
    const buckets = dailyBuckets(range);
    return buckets.map((bucket) => ({
      label: bucket.label,
      value: scopedSales
        .filter((sale) => sale.createdAt.slice(0, 10) === bucket.date)
        .reduce((total, sale) => total + sale.totalCents, 0),
    }));
  }, [range, scopedSales]);

  const statusSegments = useMemo(() => {
    const entries = Object.entries(statusCounts).sort((a, b) => b[1] - a[1]);
    return entries.slice(0, 7).map(([status, value], index) => ({
      label: statusLabel(status as never),
      value,
      color: STATUS_COLORS[index % STATUS_COLORS.length],
    }));
  }, [statusCounts]);

  const branchPerformance = useMemo(
    () =>
      visibleBranches.map((branch) => ({
        label: branch.name,
        value: salesRevenueCents(salesInRange(db.sales, range, branch.id)),
      })),
    [visibleBranches, db.sales, range],
  );

  const recentRepairs = useMemo(
    () =>
      [...scopedRepairs]
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
        .slice(0, 6),
    [scopedRepairs],
  );

  const recentTransactions = useMemo(
    () =>
      [...db.payments]
        .filter((payment) => inBranchScope(scope, payment.branchId))
        .sort((a, b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime())
        .slice(0, 6),
    [db.payments, scope],
  );

  return (
    <>
      <PageHeader
        title={`Good morning${session ? "" : ""} — ${db.business.name}`}
        subtitle={`${visibleBranches.map((branch) => branch.name).join(" · ")} · Figures computed from saved records for the selected period.`}
        actions={
          <Segmented options={RANGES} value={rangeKey} onChange={setRangeKey} />
        }
      />

      <div className="kpi-grid">
        <Stat
          label="Total sales"
          value={formatMoney(salesTotal, symbol, 0)}
          hint={`${scopedSales.length} transactions`}
          tone="blue"
          icon="cart"
          trend="up"
        />
        <Stat
          label="Repair service revenue"
          value={formatMoney(repairRevenue, symbol, 0)}
          hint="Invoiced repairs in period"
          tone="purple"
          icon="tool"
          trend="up"
        />
        <Stat
          label="Active repairs"
          value={String(active.length)}
          hint={`${delayed.length} past due date`}
          tone="cyan"
          icon="clock"
        />
        <Stat
          label="Awaiting approval"
          value={String(statusCounts.waiting_approval ?? 0)}
          hint="Customer decision pending"
          tone="pink"
          icon="file"
        />
        <Stat
          label="Waiting for parts"
          value={String(statusCounts.waiting_parts ?? 0)}
          hint="Stock on order"
          tone="amber"
          icon="package"
        />
        <Stat
          label="Ready for collection"
          value={String(statusCounts.ready_for_collection ?? 0)}
          hint="Awaiting customer"
          tone="slate"
          icon="check"
        />
      </div>

      <div className="kpi-grid">
        <Stat label="Today's transactions" value={String(todaySales.length + todayPayments.length)} hint={`${todaySales.length} sales · ${todayPayments.length} payments`} tone="blue" icon="refresh" />
        <Stat label="Pending customer payments" value={formatMoney(outstanding, symbol, 0)} hint="Outstanding invoice balance" tone="pink" icon="wallet" />
        <Stat label="Low-stock products" value={String(lowStock.length)} hint="At or below reorder level" tone="amber" icon="alert" />
        <Stat label="Warranty claims to review" value={String(openClaims.length)} hint="Submitted or in inspection" tone="cyan" icon="shield" />
        {showFinancials ? (
          <Stat label="Gross profit" value={formatMoney(grossProfit, symbol, 0)} hint={`COGS ${formatMoney(cogs, symbol, 0)}`} tone="purple" icon="chart" trend="up" />
        ) : (
          <Stat label="Stock value" value={formatMoney(stockValue, symbol, 0)} hint="At cost price" tone="purple" icon="box" />
        )}
        {showFinancials ? (
          <Stat
            label="Operating result"
            value={formatMoney(operatingResult, symbol, 0)}
            hint={`Expenses ${formatMoney(expensesTotal, symbol, 0)}`}
            tone="slate"
            icon="chart"
            trend={operatingResult >= 0 ? "up" : "flat"}
          />
        ) : (
          <Stat label="My open jobs" value={String(active.filter((repair) => repair.technicianId === session?.userId).length)} hint="Assigned to you" tone="slate" icon="tool" />
        )}
      </div>

      <div className="dashboard-grid">
        <Card className="sales-chart">
          <CardHead
            title="Sales trend"
            subtitle={`Product sales per day, ${formatShortDate(range.from)} – ${formatShortDate(range.to)}`}
          />
          {trend.length === 0 || trend.every((point) => point.value === 0) ? (
            <EmptyState icon="chart" title="No sales in this period" message="Adjust the date range to see a trend." />
          ) : (
            <>
              <div className="chart-meta">
                <div>
                  <span className="legend purple" />
                  <small>Product sales</small>
                  <strong>{formatMoney(salesTotal, symbol, 0)}</strong>
                </div>
                <div>
                  <span className="legend blue" />
                  <small>Transactions</small>
                  <strong>{scopedSales.length}</strong>
                </div>
              </div>
              <div className="line-chart">
                <div className="y-labels">
                  <span>{formatMoney(Math.max(1, ...trend.map((p) => p.value)), symbol, 0)}</span>
                  <span />
                  <span />
                  <span />
                  <span>0</span>
                </div>
                <TrendChart series={trend} />
                <div className="x-labels">
                  {trend.map((point, index) =>
                    trend.length > 8 && index % Math.ceil(trend.length / 6) !== 0 ? null : (
                      <span key={`${point.label}-${index}`}>{point.label}</span>
                    ),
                  )}
                </div>
              </div>
            </>
          )}
        </Card>

        <Card className="repair-overview">
          <CardHead title="Repair status" subtitle="Current workflow distribution" />
          <DonutChart segments={statusSegments} total={scopedRepairs.length} centreLabel="Total" />
          <LegendList segments={statusSegments} />
        </Card>
      </div>

      <div className="bottom-grid">
        <Card className="recent">
          <div className="card-head" style={{ padding: "18px 18px 13px" }}>
            <div>
              <h2>Recent repair activity</h2>
              <p>Latest updates across your scope</p>
            </div>
            <button type="button" className="btn ghost" onClick={() => go("/repairs")}>
              View all <Icon name="arrow" size={14} />
            </button>
          </div>
          {recentRepairs.length === 0 ? (
            <EmptyState icon="tool" title="No repairs yet" message="Create your first repair job to see activity here." />
          ) : (
            <div className="activity-list">
              {recentRepairs.map((repair) => (
                <button key={repair.id} type="button" onClick={() => go(`/repairs/${repair.id}`)}>
                  <div className="kpi-icon purple">
                    <Icon name="tool" size={16} />
                  </div>
                  <div>
                    <strong>
                      {repair.number} · {repair.device.brand} {repair.device.model}
                    </strong>
                    <span>
                      {repair.customerName} · {repair.technicianName ?? "Unassigned"}
                    </span>
                    <small>Updated {relativeTime(repair.updatedAt)}</small>
                  </div>
                  <Badge tone={statusTone(repair.status)}>{statusLabel(repair.status)}</Badge>
                </button>
              ))}
            </div>
          )}
        </Card>

        <Card className="stock-card">
          <CardHead
            title={showFinancials ? "Branch performance" : "Low stock"}
            subtitle={showFinancials ? "Sales by branch in period" : "Items needing attention"}
          />
          {showFinancials ? (
            <BarList series={branchPerformance} currencySymbol={symbol} />
          ) : lowStock.length === 0 ? (
            <EmptyState icon="check" title="Stock healthy" message="No products are at or below their reorder level." />
          ) : (
            <>
              {lowStock.slice(0, 5).map((row) => (
                <div className="stock-row" key={row.product.id}>
                  <div className="product-mini">
                    <Icon name="package" />
                  </div>
                  <div>
                    <strong>{row.product.name}</strong>
                    <span>{row.product.sku}</span>
                  </div>
                  <div>
                    <strong className={row.available === 0 ? "danger-text" : ""}>{row.available} left</strong>
                    <span>Min. {row.product.minStock}</span>
                  </div>
                </div>
              ))}
              <button type="button" className="btn secondary" onClick={() => go("/inventory")}>
                Open inventory
              </button>
            </>
          )}
        </Card>
      </div>

      {showFinancials && (
        <Card className="table-card">
          <div className="card-head table-title">
            <div>
              <h2>Recent transactions</h2>
              <p>Payments recorded against invoices</p>
            </div>
          </div>
          <DataTable
            rows={recentTransactions}
            rowKey={(payment) => payment.id}
            empty="No payments recorded yet."
            columns={[
              {
                key: "number",
                header: "Payment",
                render: (payment) => <strong className="id-link">{payment.number}</strong>,
              },
              {
                key: "customer",
                header: "Customer",
                render: (payment) => db.customers.find((c) => c.id === payment.customerId)?.name ?? "—",
              },
              {
                key: "method",
                header: "Method",
                render: (payment) => (
                  <Badge tone="in-stock">
                    {db.business.paymentMethods.find((method) => method.id === payment.method)?.label ?? payment.method}
                  </Badge>
                ),
              },
              {
                key: "amount",
                header: "Amount",
                align: "right",
                render: (payment) => <strong>{formatMoney(payment.amountCents, symbol)}</strong>,
              },
              {
                key: "at",
                header: "Received",
                align: "right",
                render: (payment) => relativeTime(payment.receivedAt),
              },
            ]}
          />
        </Card>
      )}
    </>
  );
}
