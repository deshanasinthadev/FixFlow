import { onDocumentCreated, onDocumentUpdated, onDocumentWritten } from "firebase-functions/v2/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { db, serverTimestamp, increment } from "./types.js";

async function getMinStock(productId: string): Promise<number> {
  const doc = await db.collection("products").doc(productId).get();
  return doc.exists ? (doc.data()?.minStock ?? 0) : 0;
}

/** Update product totals when stock changes. */
export const onStockChange = onDocumentUpdated("products/{productId}/stock/{branchId}", async (event) => {
  const before = event.data?.before.data();
  const after = event.data?.after.data();
  if (!before || !after) return;

  const productId = event.params.productId;
  const branchId = event.params.branchId;

  const available = after.onHand - after.reserved;
  let stockStatus: "ok" | "low" | "critical" = "ok";
  if (available <= 0) stockStatus = "critical";
  else if (available <= (await getMinStock(productId))) stockStatus = "low";

  const productRef = db.collection("products").doc(productId);
  const allStockSnap = await productRef.collection("stock").get();
  let totalOnHand = 0;
  let totalReserved = 0;
  let overallStatus: "ok" | "low" | "critical" = "ok";

  for (const doc of allStockSnap.docs) {
    const stock = doc.data();
    totalOnHand += stock.onHand;
    totalReserved += stock.reserved;
    const avail = stock.onHand - stock.reserved;
    if (avail <= 0) overallStatus = "critical";
    else if (avail <= (await getMinStock(productId)) && overallStatus !== "critical") overallStatus = "low";
  }

  await productRef.update({
    "totals.onHand": totalOnHand,
    "totals.reserved": totalReserved,
    "totals.available": totalOnHand - totalReserved,
    stockStatus: overallStatus,
    updatedAt: serverTimestamp(),
  });
});

/** Update daily stats when sale is created. */
export const onSaleCreated = onDocumentCreated("sales/{saleId}", async (event) => {
  const sale = event.data?.data();
  if (!sale || sale.status !== "completed") return;

  const date = new Date(sale.createdAt).toISOString().slice(0, 10);
  const branchId = sale.branchId;

  await updateDailyStats(date, branchId, {
    salesTotal: increment(sale.totalCents),
    salesCount: increment(1),
  });

  if (sale.customerId) {
    await db.collection("customers").doc(sale.customerId).update({
      "totals.lifetimeValue": increment(sale.totalCents),
      "totals.saleCount": increment(1),
    });
  }
});

/** Update daily stats when payment is received. */
export const onPaymentCreated = onDocumentCreated("payments/{paymentId}", async (event) => {
  const payment = event.data?.data();
  if (!payment) return;

  const date = new Date(payment.receivedAt).toISOString().slice(0, 10);
  const branchId = payment.branchId;

  await updateDailyStats(date, branchId, {
    paymentsTotal: increment(payment.amountCents),
    paymentsCount: increment(1),
  });
});

/** Update daily stats when expense is created. */
export const onExpenseCreated = onDocumentCreated("expenses/{expenseId}", async (event) => {
  const expense = event.data?.data();
  if (!expense || expense.status !== "approved") return;

  const date = expense.incurredAt;
  const branchId = expense.branchId;

  await updateDailyStats(date, branchId, {
    expensesTotal: increment(expense.amountCents),
  });
});

/** Update daily stats when repair is created/closed. */
export const onRepairChange = onDocumentWritten("repairs/{repairId}", async (event) => {
  const before = event.data?.before.data();
  const after = event.data?.after.data();

  const date = new Date().toISOString().slice(0, 10);
  const branchId = after?.branchId ?? before?.branchId;
  if (!branchId) return;

  const updates: Record<string, any> = {};

  if (!before && after) {
    updates.repairsOpened = increment(1);
  } else if (before && after && before.status !== after.status) {
    if (["delivered", "cancelled"].includes(after.status) && !["delivered", "cancelled"].includes(before.status)) {
      updates.repairsClosed = increment(1);
    }
  }

  if (Object.keys(updates).length > 0) {
    await updateDailyStats(date, branchId, updates);
  }

  if (before && after && before.status !== after.status) {
    const repairId = event.params.repairId;
    const repair = after!;
    await db.collection("notifications").doc(repair.customerId).collection("items").add({
      type: "repair_status",
      title: "Repair status updated",
      body: `${repair.number} is now ${after.status.replace(/_/g, " ")}.`,
      audience: { userId: repair.customerId },
      link: { route: "/portal/repairs", id: repairId },
      createdAt: serverTimestamp(),
    });
  }
});

/** Update daily stats when invoice status changes to paid. */
export const onInvoiceChange = onDocumentUpdated("invoices/{invoiceId}", async (event) => {
  const before = event.data?.before.data();
  const after = event.data?.after.data();
  if (!before || !after) return;

  if (before.status !== "paid" && after.status === "paid") {
    const date = new Date().toISOString().slice(0, 10);
    const branchId = after.branchId;

    await updateDailyStats(date, branchId, {
      paymentsTotal: increment(after.totalCents),
      paymentsCount: increment(1),
    });
  }
});

/** Scheduled nightly rollup (runs at 00:30). */
export const scheduledNightlyRollup = onSchedule("30 0 * * *", async () => {
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const dateRef = db.collection("daily_stats").doc(yesterday);
  const branchesSnap = await dateRef.collection("by_branch").get();

  let totalSales = 0;
  let totalSalesCount = 0;
  let totalPayments = 0;
  let totalPaymentsCount = 0;
  let totalExpenses = 0;
  let totalRepairsOpened = 0;
  let totalRepairsClosed = 0;
  let lowStockCount = 0;

  for (const branchDoc of branchesSnap.docs) {
    const data = branchDoc.data();
    totalSales += data.salesTotal ?? 0;
    totalSalesCount += data.salesCount ?? 0;
    totalPayments += data.paymentsTotal ?? 0;
    totalPaymentsCount += data.paymentsCount ?? 0;
    totalExpenses += data.expensesTotal ?? 0;
    totalRepairsOpened += data.repairsOpened ?? 0;
    totalRepairsClosed += data.repairsClosed ?? 0;
    lowStockCount += data.lowStockCount ?? 0;
  }

  const avgRepairValue = totalRepairsClosed > 0 ? Math.round(totalPayments / totalRepairsClosed) : 0;

  const invoicesSnap = await db.collection("invoices")
    .where("status", "in", ["issued", "partially_paid"])
    .get();

  let outstanding = 0;
  for (const doc of invoicesSnap.docs) {
    const inv = doc.data();
    const paymentsSnap = await db.collection("payments").where("invoiceId", "==", doc.id).get();
    const paid = paymentsSnap.docs.reduce((sum, p) => sum + p.data().amountCents, 0);
    outstanding += Math.max(0, inv.totalCents - paid);
  }

  await dateRef.set({
    salesTotal: totalSales,
    salesCount: totalSalesCount,
    paymentsTotal: totalPayments,
    paymentsCount: totalPaymentsCount,
    expensesTotal: totalExpenses,
    repairsOpened: totalRepairsOpened,
    repairsClosed: totalRepairsClosed,
    avgRepairValue,
    outstandingTotal: outstanding,
    lowStockCount,
    updatedAt: serverTimestamp(),
  }, { merge: true });
});

async function updateDailyStats(date: string, branchId: string, increments: Record<string, any>) {
  const statRef = db.collection("daily_stats").doc(date);
  const branchStatRef = statRef.collection("by_branch").doc(branchId);

  const batch = db.batch();
  batch.set(statRef, increments, { merge: true });
  batch.set(branchStatRef, increments, { merge: true });
  await batch.commit();
}