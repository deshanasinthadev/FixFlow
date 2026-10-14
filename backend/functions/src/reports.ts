import * as admin from "firebase-admin";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { db, CallContext, ErrorCode, throwError, requireRole, requireBranchAccess, serverTimestamp, increment } from "./types.js";

function getContext(auth: any): CallContext {
  if (!auth) throwError(ErrorCode.UNAUTHENTICATED, "You must be signed in");
  const claims = (auth.token ?? {}) as any;
  return {
    uid: auth.uid,
    claims,
    isAdmin: claims.role === "admin",
    isStaff: ["admin", "manager", "technician", "cashier"].includes(claims.role),
    isCustomer: claims.role === "customer",
    isTechnician: claims.role === "technician",
    isManager: claims.role === "manager",
    isCashier: claims.role === "cashier",
    branchId: claims.branchId,
    customerId: claims.customerId,
    technicianId: claims.technicianId,
  };
}

type DateRange = { from: string; to: string };

function parseRange(range: DateRange | undefined): { from: Date; to: Date } {
  const now = new Date();
  const to = range?.to ? new Date(range.to) : now;
  const from = range?.from ? new Date(range.from) : new Date(now.getTime() - 30 * 86400000);
  to.setHours(23, 59, 59, 999);
  from.setHours(0, 0, 0, 0);
  return { from, to };
}

/** Get repair statistics for dashboard. */
export const getRepairStats = onCall(async (request) => {
  const context = getContext(request.auth);
  if (!context.isStaff) throwError(ErrorCode.PERMISSION_DENIED, "Staff only");

  const { range, branchId } = request.data as { range?: DateRange; branchId?: string };
  const targetBranchId = context.isAdmin ? (branchId ?? context.branchId) : context.branchId;
  const { from, to } = parseRange(range);

  let query = db.collection("repairs")
    .where("branchId", "==", targetBranchId)
    .where("createdAt", ">=", from.toISOString())
    .where("createdAt", "<=", to.toISOString());

  const snap = await query.get();
  const repairs = snap.docs.map((doc): { id: string } & Record<string, unknown> => ({ id: doc.id, ...(doc.data() as Record<string, unknown>) }));

  const byStatus: Record<string, number> = {};
  const byPriority: Record<string, number> = {};
  let totalLabour = 0;
  let totalParts = 0;

  for (const repair of repairs) {
    byStatus[repair.status as string] = (byStatus[repair.status as string] ?? 0) + 1;
    byPriority[repair.priority as string] = (byPriority[repair.priority as string] ?? 0) + 1;
    totalLabour += (repair.labourCents as number) ?? 0;

    const partsSnap = await db.collection("repairs").doc(repair.id).collection("parts").get();
    for (const partDoc of partsSnap.docs) {
      totalParts += partDoc.data().lineTotalCents ?? 0;
    }
  }

  return {
    ok: true,
    total: repairs.length,
    byStatus,
    byPriority,
    totalLabourCents: totalLabour,
    totalPartsCents: totalParts,
    totalRevenueCents: totalLabour + totalParts,
    avgRepairValueCents: repairs.length ? Math.round((totalLabour + totalParts) / repairs.length) : 0,
  };
});

/** Get sales statistics. */
export const getSalesStats = onCall(async (request) => {
  const context = getContext(request.auth);
  if (!context.isStaff) throwError(ErrorCode.PERMISSION_DENIED, "Staff only");
  if (!["admin", "manager", "cashier"].includes(context.claims.role)) throwError(ErrorCode.PERMISSION_DENIED, "No access to sales data");

  const { range, branchId } = request.data as { range?: DateRange; branchId?: string };
  const targetBranchId = context.isAdmin ? (branchId ?? context.branchId) : context.branchId;
  const { from, to } = parseRange(range);

  const snap = await db.collection("sales")
    .where("branchId", "==", targetBranchId)
    .where("status", "==", "completed")
    .where("createdAt", ">=", from.toISOString())
    .where("createdAt", "<=", to.toISOString())
    .get();

  const sales = snap.docs.map((doc) => doc.data() as Record<string, unknown>);
  const totalRevenue = sales.reduce((sum, s) => sum + ((s.totalCents as number) ?? 0), 0);
  const totalCogs = sales.reduce((sum, s) => sum + ((s.items as unknown[]).reduce((s2: number, i: unknown) => s2 + (((i as Record<string, unknown>).costPriceCents as number) ?? 0) * (((i as Record<string, unknown>).quantity as number) ?? 0), 0)), 0);

  return {
    ok: true,
    count: sales.length,
    totalRevenueCents: totalRevenue,
    totalCogsCents: totalCogs,
    grossProfitCents: totalRevenue - totalCogs,
    avgSaleValueCents: sales.length ? Math.round(totalRevenue / sales.length) : 0,
  };
});

/** Get inventory statistics. */
export const getInventoryStats = onCall(async (request) => {
  const context = getContext(request.auth);
  if (!context.isStaff) throwError(ErrorCode.PERMISSION_DENIED, "Staff only");

  const { branchId } = request.data as { branchId?: string };
  const targetBranchId = context.isAdmin ? (branchId ?? context.branchId) : context.branchId;

  const productsSnap = await db.collection("products").where("isActive", "==", true).get();
  const products = productsSnap.docs.map((doc): { id: string } & Record<string, unknown> => ({ id: doc.id, ...(doc.data() as Record<string, unknown>) }));

  let totalValue = 0;
  let lowStock = 0;
  let outOfStock = 0;

  for (const product of products) {
    const stockDoc = await db.collection("products").doc(product.id).collection("stock").doc(targetBranchId).get();
    if (stockDoc.exists) {
      const stock = stockDoc.data()!;
      const available = (stock.onHand as number) - (stock.reserved as number);
      totalValue += ((product.costPriceCents as number) ?? 0) * (stock.onHand as number);
      if (available <= 0) outOfStock++;
      else if (available <= ((product.minStock as number) ?? 0)) lowStock++;
    }
  }

  return {
    ok: true,
    totalProducts: products.length,
    totalValueCents: totalValue,
    lowStockCount: lowStock,
    outOfStockCount: outOfStock,
  };
});

/** Get financial summary (admin/manager only). */
export const getFinancialSummary = onCall(async (request) => {
  const context = getContext(request.auth);
  if (!["admin", "manager"].includes(context.claims.role)) throwError(ErrorCode.PERMISSION_DENIED, "Financial data restricted");

  const { range, branchId } = request.data as { range?: DateRange; branchId?: string };
  const targetBranchId = context.isAdmin ? (branchId ?? context.branchId) : context.branchId;
  const { from, to } = parseRange(range);

  const salesSnap = await db.collection("sales")
    .where("branchId", "==", targetBranchId)
    .where("status", "==", "completed")
    .where("createdAt", ">=", from.toISOString())
    .where("createdAt", "<=", to.toISOString())
    .get();

  const salesRevenue = salesSnap.docs.reduce((sum, doc) => sum + ((doc.data() as Record<string, unknown>).totalCents as number ?? 0), 0);

  const invoicesSnap = await db.collection("invoices")
    .where("branchId", "==", targetBranchId)
    .where("createdAt", ">=", from.toISOString())
    .where("createdAt", "<=", to.toISOString())
    .where("status", "in", ["issued", "partially_paid", "paid"])
    .get();

  const repairRevenue = invoicesSnap.docs
    .filter((doc) => (doc.data() as Record<string, unknown>).repairId)
    .reduce((sum, doc) => sum + ((doc.data() as Record<string, unknown>).totalCents as number ?? 0), 0);

  const expensesSnap = await db.collection("expenses")
    .where("branchId", "==", targetBranchId)
    .where("incurredAt", ">=", from.toISOString().slice(0, 10))
    .where("incurredAt", "<=", to.toISOString().slice(0, 10))
    .where("status", "==", "approved")
    .get();

  const expenses = expensesSnap.docs.reduce((sum, doc) => sum + ((doc.data() as Record<string, unknown>).amountCents as number ?? 0), 0);

  const openInvoicesSnap = await db.collection("invoices")
    .where("branchId", "==", targetBranchId)
    .where("status", "in", ["issued", "partially_paid"])
    .get();

  let outstanding = 0;
  for (const doc of openInvoicesSnap.docs) {
    const inv = doc.data() as Record<string, unknown>;
    const paymentsSnap = await db.collection("payments").where("invoiceId", "==", doc.id).get();
    const paid = paymentsSnap.docs.reduce((sum, p) => sum + ((p.data() as Record<string, unknown>).amountCents as number ?? 0), 0);
    outstanding += Math.max(0, (inv.totalCents as number ?? 0) - paid);
  }

  return {
    ok: true,
    salesRevenueCents: salesRevenue,
    repairRevenueCents: repairRevenue,
    totalRevenueCents: salesRevenue + repairRevenue,
    expensesCents: expenses,
    netProfitCents: salesRevenue + repairRevenue - expenses,
    outstandingReceivablesCents: outstanding,
  };
});

/** Export data to CSV (admin only). */
export const exportData = onCall(async (request) => {
  const context = getContext(request.auth);
  if (!context.isAdmin) throwError(ErrorCode.PERMISSION_DENIED, "Admin only");

  const { collection, range, branchId } = request.data as {
    collection: "repairs" | "sales" | "invoices" | "customers" | "products" | "expenses";
    range?: DateRange;
    branchId?: string;
  };

  const targetBranchId = branchId ?? (context.isAdmin && context.branchId !== "all" ? context.branchId : null);
  const { from, to } = parseRange(range);

  let query: admin.firestore.Query = db.collection(collection);

  if (targetBranchId && ["repairs", "sales", "invoices", "expenses", "customers"].includes(collection)) {
    query = query.where("branchId", "==", targetBranchId);
  }

  if (range && ["repairs", "sales", "invoices", "expenses"].includes(collection)) {
    const dateField = collection === "expenses" ? "incurredAt" : "createdAt";
    query = query.where(dateField, ">=", from.toISOString())
      .where(dateField, "<=", to.toISOString());
  }

  const snap = await query.limit(5000).get();
  const rows = snap.docs.map((doc): { id: string } & Record<string, unknown> => ({ id: doc.id, ...(doc.data() as Record<string, unknown>) }));

  if (rows.length === 0) return { ok: true, csv: "", count: 0 };

  const headers = Object.keys(rows[0] as Record<string, unknown>);
  const csvRows = [
    headers.join(","),
    ...rows.map((row) =>
      headers.map((h) => {
        const val = row[h];
        if (val === null || val === undefined) return "";
        if (typeof val === "object") return JSON.stringify(val).replace(/"/g, '""');
        return `"${String(val).replace(/"/g, '""')}"`;
      }).join(",")
    ),
  ];

  return { ok: true, csv: csvRows.join("\n"), count: rows.length };
});