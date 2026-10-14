import { onCall, HttpsError } from "firebase-functions/v2/https";
import { db, CallContext, ErrorCode, throwError, requireRole, requireBranchAccess, serverTimestamp, increment, getNextSequence, getNextSequenceTx, formatDocNumber, currentYear } from "./types.js";

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

function computeTotals(input: { lines: { lineTotalCents: number }[]; discountCents?: number; taxEnabled?: boolean; taxRatePercent?: number }): { subtotalCents: number; discountCents: number; taxCents: number; totalCents: number } {
  const subtotalCents = input.lines.reduce((sum, l) => sum + l.lineTotalCents, 0);
  const discountCents = Math.min(input.discountCents ?? 0, subtotalCents);
  const taxable = subtotalCents - discountCents;
  const taxCents = input.taxEnabled ? Math.round((taxable * (input.taxRatePercent ?? 0)) / 100) : 0;
  return { subtotalCents, discountCents, taxCents, totalCents: taxable + taxCents };
}

/** Complete a sale (POS). Atomically creates sale, decrements stock, creates invoice, records payment. */
export const completeSale = onCall(async (request) => {
  const context = getContext(request.auth);
  if (!context.isStaff) throwError(ErrorCode.PERMISSION_DENIED, "Staff only");
  if (!["admin", "manager", "cashier"].includes(context.claims.role)) throwError(ErrorCode.PERMISSION_DENIED, "Only cashiers and above can complete sales");

  const data = request.data as {
    branchId: string;
    customerId?: string;
    lines: { productId: string; quantity: number }[];
    payments: { method: "cash" | "card" | "bank" | "other"; amountCents: number; reference?: string }[];
    cashRegisterId?: string;
    discountCents?: number;
  };

  if (!data.branchId) throwError(ErrorCode.INVALID_ARGUMENT, "Branch required");
  if (!data.lines?.length) throwError(ErrorCode.INVALID_ARGUMENT, "At least one line required");
  if (!data.payments?.length) throwError(ErrorCode.INVALID_ARGUMENT, "At least one payment required");

  requireBranchAccess(context, data.branchId);

  const paymentTotal = data.payments.reduce((sum, p) => sum + p.amountCents, 0);

  const lineItems = await Promise.all(data.lines.map(async (line) => {
    const productDoc = await db.collection("products").doc(line.productId).get();
    if (!productDoc.exists) throwError(ErrorCode.NOT_FOUND, `Product ${line.productId} not found`);
    const product = productDoc.data()!;
    if (!product.isActive) throwError(ErrorCode.FAILED_PRECONDITION, `${product.name} is not active`);
    return {
      productId: line.productId,
      sku: product.sku,
      name: product.name,
      quantity: line.quantity,
      unitPriceCents: product.sellingPriceCents,
      lineTotalCents: product.sellingPriceCents * line.quantity,
      costPriceCents: product.costPriceCents,
    };
  }));

  const subtotal = lineItems.reduce((sum, l) => sum + l.lineTotalCents, 0);
  const discount = data.discountCents ?? 0;
  const totals = computeTotals({ lines: lineItems.map(l => ({ lineTotalCents: l.lineTotalCents })), discountCents: discount, taxEnabled: false });

  if (paymentTotal !== totals.totalCents) {
    throwError(ErrorCode.INVALID_ARGUMENT, `Payment total (${paymentTotal}) does not match sale total (${totals.totalCents})`);
  }

  const result = await db.runTransaction(async (tx) => {
    for (const line of data.lines) {
      const productRef = db.collection("products").doc(line.productId);
      const stockRef = productRef.collection("stock").doc(data.branchId);
      const stockSnap = await tx.get(stockRef);
      if (!stockSnap.exists) throwError(ErrorCode.NOT_FOUND, `Product not stocked at this branch`);
      const available = stockSnap.data()!.onHand - stockSnap.data()!.reserved;
      if (available < line.quantity) throwError(ErrorCode.FAILED_PRECONDITION, `Insufficient stock`);
    }

    const year = currentYear();
    const seq = await getNextSequenceTx(tx, `sale_${year}`);
    const saleNumber = formatDocNumber("POS", year, seq);
    const saleId = `sal-${seq}`;

    const sale = {
      id: saleId,
      number: saleNumber,
      branchId: data.branchId,
      customerId: data.customerId ?? null,
      customerName: data.customerId ? (await db.collection("customers").doc(data.customerId).get()).data()?.name ?? null : null,
      items: lineItems,
      subtotalCents: totals.subtotalCents,
      discountCents: totals.discountCents,
      taxCents: totals.taxCents,
      totalCents: totals.totalCents,
      payments: data.payments,
      cashRegisterId: data.cashRegisterId ?? null,
      userId: context.uid,
      status: "completed" as const,
      createdAt: serverTimestamp(),
    };

    const saleRef = db.collection("sales").doc(saleId);
    tx.set(saleRef, sale);

    for (const line of data.lines) {
      const productRef = db.collection("products").doc(line.productId);
      const stockRef = productRef.collection("stock").doc(data.branchId);
      const productSnap = await tx.get(productRef);
      const product = productSnap.data()!;

      tx.update(stockRef, { onHand: increment(-line.quantity), updatedAt: serverTimestamp() });

      const movRef = db.collection("stock_movements").doc();
      tx.set(movRef, {
        productId: line.productId,
        sku: product.sku,
        productName: product.name,
        branchId: data.branchId,
        type: "sale",
        quantity: -line.quantity,
        balanceAfter: increment(-line.quantity),
        unitCostCents: product.costPriceCents,
        reference: { type: "sale", id: saleId },
        userId: context.uid,
        createdAt: serverTimestamp(),
      });
    }

    const invoiceSeq = await getNextSequenceTx(tx, `invoice_${year}`);
    const invoiceNumber = formatDocNumber("INV", year, invoiceSeq);
    const invoiceId = `inv-${invoiceSeq}`;

    const invoice = {
      id: invoiceId,
      number: invoiceNumber,
      branchId: data.branchId,
      customerId: data.customerId ?? "cus-walkin",
      customerName: data.customerId ? (await db.collection("customers").doc(data.customerId).get()).data()?.name ?? "Walk-in customer" : "Walk-in customer",
      saleId,
      items: lineItems.map(l => ({
        id: `ivi-${Date.now()}-${Math.random()}`,
        kind: "product" as const,
        productId: l.productId,
        name: l.name,
        quantity: l.quantity,
        unitPriceCents: l.unitPriceCents,
        lineTotalCents: l.lineTotalCents,
      })),
      subtotalCents: totals.subtotalCents,
      discountCents: totals.discountCents,
      taxCents: totals.taxCents,
      totalCents: totals.totalCents,
      status: "paid" as const,
      dueAt: new Date().toISOString().slice(0, 10),
      createdByUserId: context.uid,
      createdAt: serverTimestamp(),
    };

    const invoiceRef = db.collection("invoices").doc(invoiceId);
    tx.set(invoiceRef, invoice);

    for (const payment of data.payments) {
      const payRef = db.collection("payments").doc();
      tx.set(payRef, {
        number: formatDocNumber("PAY", year, await getNextSequenceTx(tx, `payment_${year}`)),
        invoiceId,
        customerId: data.customerId ?? "cus-walkin",
        branchId: data.branchId,
        amountCents: payment.amountCents,
        method: payment.method,
        reference: payment.reference ?? null,
        receivedByUserId: context.uid,
        receivedAt: serverTimestamp(),
        cashRegisterId: data.cashRegisterId ?? null,
      });
    }

    if (data.customerId) {
      const custRef = db.collection("customers").doc(data.customerId);
      tx.update(custRef, {
        "totals.lifetimeValue": increment(totals.totalCents),
        "totals.saleCount": increment(1),
      });
    }

    return { saleId, saleNumber, invoiceId, invoiceNumber };
  });

  return { ok: true, ...result };
});

/** Hold a sale (park it). */
export const holdSale = onCall(async (request) => {
  const context = getContext(request.auth);
  if (!context.isStaff) throwError(ErrorCode.PERMISSION_DENIED, "Staff only");

  const { branchId, customerId, lines, cashRegisterId } = request.data as {
    branchId: string;
    customerId?: string;
    lines: { productId: string; quantity: number }[];
    cashRegisterId?: string;
  };

  requireBranchAccess(context, branchId);

  const year = currentYear();
  const seq = await getNextSequence(`sale_${year}`);
  const saleNumber = formatDocNumber("POS", year, seq);
  const saleId = `sal-${seq}`;

  const lineItems = await Promise.all(lines.map(async (line) => {
    const productDoc = await db.collection("products").doc(line.productId).get();
    if (!productDoc.exists) throwError(ErrorCode.NOT_FOUND, `Product ${line.productId} not found`);
    const product = productDoc.data()!;
    return {
      productId: line.productId,
      sku: product.sku,
      name: product.name,
      quantity: line.quantity,
      unitPriceCents: product.sellingPriceCents,
      lineTotalCents: product.sellingPriceCents * line.quantity,
      costPriceCents: product.costPriceCents,
    };
  }));

  const totals = computeTotals({ lines: lineItems.map(l => ({ lineTotalCents: l.lineTotalCents })), taxEnabled: false });

  await db.collection("sales").doc(saleId).set({
    id: saleId,
    number: saleNumber,
    branchId,
    customerId: customerId ?? null,
    items: lineItems,
    subtotalCents: totals.subtotalCents,
    discountCents: 0,
    taxCents: totals.taxCents,
    totalCents: totals.totalCents,
    payments: [],
    cashRegisterId: cashRegisterId ?? null,
    userId: context.uid,
    status: "held",
    createdAt: serverTimestamp(),
  });

  return { ok: true, saleId, saleNumber };
});

/** Open a cash register. */
export const openRegister = onCall(async (request) => {
  const context = getContext(request.auth);
  if (!context.isStaff) throwError(ErrorCode.PERMISSION_DENIED, "Staff only");

  const { branchId, code, openingFloatCents } = request.data as {
    branchId: string;
    code: string;
    openingFloatCents: number;
  };

  requireBranchAccess(context, branchId);
  if (!Number.isInteger(openingFloatCents) || openingFloatCents < 0) throwError(ErrorCode.INVALID_ARGUMENT, "Opening float must be non-negative");

  const registerRef = db.collection("cash_registers").doc();
  await registerRef.set({
    branchId,
    code,
    openedByUserId: context.uid,
    openedAt: serverTimestamp(),
    openingFloatCents,
    expectedCents: openingFloatCents,
    status: "open",
  });

  return { ok: true, registerId: registerRef.id };
});

/** Close a cash register. */
export const closeRegister = onCall(async (request) => {
  const context = getContext(request.auth);
  if (!context.isStaff) throwError(ErrorCode.PERMISSION_DENIED, "Staff only");

  const { registerId, countedCents } = request.data as { registerId: string; countedCents: number };

  if (!Number.isInteger(countedCents) || countedCents < 0) throwError(ErrorCode.INVALID_ARGUMENT, "Counted amount must be non-negative");

  const registerRef = db.collection("cash_registers").doc(registerId);
  const snap = await registerRef.get();
  if (!snap.exists) throwError(ErrorCode.NOT_FOUND, "Register not found");

  const register = snap.data()!;
  requireBranchAccess(context, register.branchId);
  if (register.status !== "open") throwError(ErrorCode.FAILED_PRECONDITION, "Register already closed");

  const paymentsSnap = await db.collection("payments")
    .where("cashRegisterId", "==", registerId)
    .where("method", "==", "cash")
    .get();

  let expectedCash = register.openingFloatCents;
  paymentsSnap.docs.forEach((doc) => {
    expectedCash += doc.data().amountCents;
  });

  const variance = countedCents - expectedCash;

  await registerRef.update({
    closedByUserId: context.uid,
    closedAt: serverTimestamp(),
    expectedCents: expectedCash,
    countedCents,
    varianceCents: variance,
    status: "closed",
  });

  return { ok: true, expectedCash, variance };
});