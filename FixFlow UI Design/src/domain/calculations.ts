import { sumCents, applyPercent, clampNonNegative } from "./money";
import type {
  Cents,
  Database,
  Expense,
  Invoice,
  InventoryBalance,
  Payment,
  RepairJob,
  Sale,
  StockMovement,
} from "./types";

/**
 * Every number the dashboard and reports show is computed here from saved
 * transactions. Nothing in the UI is allowed to invent a figure.
 */

/* ---------------------------------------------------------------- */
/* Stock                                                             */
/* ---------------------------------------------------------------- */

/** Available = on hand − reserved, floored at zero. */
export function availableStock(balance: Pick<InventoryBalance, "onHand" | "reserved">): number {
  return Math.max(0, balance.onHand - balance.reserved);
}

export function balanceFor(
  db: Pick<Database, "inventory">,
  productId: string,
  branchId: string,
): InventoryBalance | undefined {
  return db.inventory.find((row) => row.productId === productId && row.branchId === branchId);
}

export function onHandFor(db: Pick<Database, "inventory">, productId: string, branchId: string): number {
  return balanceFor(db, productId, branchId)?.onHand ?? 0;
}

export function reservedFor(db: Pick<Database, "inventory">, productId: string, branchId: string): number {
  return balanceFor(db, productId, branchId)?.reserved ?? 0;
}

export function stockValueCents(db: Database, branchId: string | "all" = "all"): Cents {
  return sumCents(
    db.inventory
      .filter((row) => branchId === "all" || row.branchId === branchId)
      .map((row) => {
        const product = db.products.find((p) => p.id === row.productId);
        return (product?.costPriceCents ?? 0) * row.onHand;
      }),
  );
}

export function lowStockProducts(db: Database, branchId: string | "all" = "all") {
  return db.products
    .filter((product) => product.isActive)
    .map((product) => {
      const rows = db.inventory.filter(
        (row) => row.productId === product.id && (branchId === "all" || row.branchId === branchId),
      );
      const onHand = rows.reduce((total, row) => total + row.onHand, 0);
      const reserved = rows.reduce((total, row) => total + row.reserved, 0);
      return { product, onHand, reserved, available: availableStock({ onHand, reserved }) };
    })
    .filter((row) => row.available <= row.product.minStock)
    .sort((a, b) => a.available / Math.max(1, a.product.minStock) - b.available / Math.max(1, b.product.minStock));
}

/* ---------------------------------------------------------------- */
/* Invoices and payments                                             */
/* ---------------------------------------------------------------- */

export function paymentsForInvoice(payments: Payment[], invoiceId: string): Payment[] {
  return payments.filter((payment) => payment.invoiceId === invoiceId);
}

export function paidCentsForInvoice(payments: Payment[], invoiceId: string): Cents {
  return sumCents(paymentsForInvoice(payments, invoiceId).map((payment) => payment.amountCents));
}

/**
 * Balance due = invoice total − successful payments − applicable credits.
 * Never negative: an overpayment is a credit, shown separately.
 */
export function invoiceBalance(invoice: Invoice, payments: Payment[]): { paid: Cents; balance: Cents; credit: Cents } {
  const paid = paidCentsForInvoice(payments, invoice.id);
  if (invoice.status === "cancelled") return { paid, balance: 0, credit: Math.max(0, paid) };
  const raw = invoice.totalCents - paid;
  return { paid, balance: Math.max(0, raw), credit: Math.max(0, -raw) };
}

export function receivablesCents(db: Database, branchId: string | "all" = "all"): Cents {
  return sumCents(
    db.invoices
      .filter(
        (invoice) =>
          invoice.status !== "cancelled" &&
          invoice.status !== "draft" &&
          (branchId === "all" || invoice.branchId === branchId),
      )
      .map((invoice) => invoiceBalance(invoice, db.payments).balance),
  );
}

/* ---------------------------------------------------------------- */
/* Sales and profit                                                  */
/* ---------------------------------------------------------------- */

export function salesInRange(
  sales: Sale[],
  range: { from: Date; to: Date },
  branchId: string | "all" = "all",
): Sale[] {
  return sales.filter((sale) => {
    if (sale.status !== "completed") return false;
    if (branchId !== "all" && sale.branchId !== branchId) return false;
    const at = new Date(sale.createdAt).getTime();
    return at >= range.from.getTime() && at <= range.to.getTime();
  });
}

export function salesRevenueCents(sales: Sale[]): Cents {
  return sumCents(sales.map((sale) => sale.totalCents));
}

/** Cost of goods sold for completed sales, using the unit cost captured at sale time. */
export function costOfGoodsCents(sales: Sale[]): Cents {
  return sumCents(
    sales.flatMap((sale) => sale.items.map((item) => item.costPriceCents * item.quantity)),
  );
}

export function grossProfitCents(sales: Sale[]): Cents {
  return salesRevenueCents(sales) - costOfGoodsCents(sales);
}

/* ---------------------------------------------------------------- */
/* Repairs                                                           */
/* ---------------------------------------------------------------- */

/** Labour + parts recorded against a repair, in cents. */
export function repairValueCents(db: Database, repair: RepairJob): Cents {
  const parts = sumCents(db.repairParts.filter((part) => part.repairId === repair.id).map((p) => p.lineTotalCents));
  return parts + repair.labourCents;
}

export function repairRevenueCents(db: Database, range: { from: Date; to: Date }, branchId: string | "all" = "all"): Cents {
  // Repair revenue is recognised when the linked invoice is paid or issued.
  return sumCents(
    db.invoices
      .filter((invoice) => {
        if (!invoice.repairId || invoice.status === "cancelled" || invoice.status === "draft") return false;
        if (branchId !== "all" && invoice.branchId !== branchId) return false;
        const at = new Date(invoice.createdAt).getTime();
        return at >= range.from.getTime() && at <= range.to.getTime();
      })
      .map((invoice) => invoice.totalCents),
  );
}

export function countRepairsByStatus(repairs: RepairJob[]): Record<string, number> {
  return repairs.reduce<Record<string, number>>((counts, repair) => {
    counts[repair.status] = (counts[repair.status] ?? 0) + 1;
    return counts;
  }, {});
}

export function activeRepairs(repairs: RepairJob[]): RepairJob[] {
  return repairs.filter(
    (repair) => repair.status !== "delivered" && repair.status !== "cancelled",
  );
}

export function isDelayed(repair: RepairJob, now = new Date()): boolean {
  if (!repair.expectedAt) return false;
  if (repair.status === "delivered" || repair.status === "cancelled") return false;
  return new Date(repair.expectedAt).getTime() < now.getTime();
}

export function delayedRepairs(repairs: RepairJob[], now = new Date()): RepairJob[] {
  return activeRepairs(repairs).filter((repair) => isDelayed(repair, now));
}

/* ---------------------------------------------------------------- */
/* Expenses                                                           */
/* ---------------------------------------------------------------- */

export function expensesInRange(
  expenses: Expense[],
  range: { from: Date; to: Date },
  branchId: string | "all" = "all",
): Expense[] {
  return expenses.filter((expense) => {
    if (expense.status === "rejected") return false;
    if (branchId !== "all" && expense.branchId !== branchId) return false;
    const at = new Date(`${expense.incurredAt}T00:00:00.000Z`).getTime();
    return at >= range.from.getTime() && at <= range.to.getTime();
  });
}

export function expenseTotalCents(expenses: Expense[]): Cents {
  return sumCents(expenses.map((expense) => expense.amountCents));
}

/* ---------------------------------------------------------------- */
/* Document totals                                                   */
/* ---------------------------------------------------------------- */

export type TotalsInput = {
  lines: { lineTotalCents: Cents }[];
  discountCents?: Cents;
  taxEnabled?: boolean;
  taxRatePercent?: number;
};

export type Totals = {
  subtotalCents: Cents;
  discountCents: Cents;
  taxCents: Cents;
  totalCents: Cents;
};

/** One place that computes document totals, so invoices, estimates and sales agree. */
export function computeTotals(input: TotalsInput): Totals {
  const subtotalCents = sumCents(input.lines.map((line) => line.lineTotalCents));
  const discountCents = clampNonNegative(Math.min(input.discountCents ?? 0, subtotalCents));
  const taxable = subtotalCents - discountCents;
  const taxCents = input.taxEnabled ? applyPercent(taxable, input.taxRatePercent ?? 0) : 0;
  return { subtotalCents, discountCents, taxCents, totalCents: taxable + taxCents };
}

/* ---------------------------------------------------------------- */
/* Ranges                                                            */
/* ---------------------------------------------------------------- */

export type RangeKey = "today" | "7d" | "30d" | "mtd" | "ytd" | "all";

export function rangeFor(key: RangeKey, now = new Date()): { from: Date; to: Date } {
  const to = new Date(now);
  const from = new Date(now);
  switch (key) {
    case "today":
      from.setHours(0, 0, 0, 0);
      break;
    case "7d":
      from.setDate(from.getDate() - 6);
      from.setHours(0, 0, 0, 0);
      break;
    case "30d":
      from.setDate(from.getDate() - 29);
      from.setHours(0, 0, 0, 0);
      break;
    case "mtd":
      from.setDate(1);
      from.setHours(0, 0, 0, 0);
      break;
    case "ytd":
      from.setMonth(0, 1);
      from.setHours(0, 0, 0, 0);
      break;
    case "all":
      return { from: new Date("2000-01-01T00:00:00.000Z"), to };
  }
  return { from, to };
}

/** Daily buckets for trend charts, zero-filled so gaps are visible. */
export function dailyBuckets(range: { from: Date; to: Date }): { date: string; label: string }[] {
  const buckets: { date: string; label: string }[] = [];
  const cursor = new Date(range.from);
  cursor.setHours(0, 0, 0, 0);
  const end = new Date(range.to);
  end.setHours(0, 0, 0, 0);
  while (cursor.getTime() <= end.getTime()) {
    const iso = cursor.toISOString().slice(0, 10);
    buckets.push({
      date: iso,
      label: cursor.toLocaleDateString("en-LK", { day: "2-digit", month: "short", timeZone: "Asia/Colombo" }),
    });
    cursor.setDate(cursor.getDate() + 1);
  }
  return buckets;
}

export function movementsForProduct(movements: StockMovement[], productId: string, branchId?: string): StockMovement[] {
  return movements
    .filter((movement) => movement.productId === productId && (!branchId || movement.branchId === branchId))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}
