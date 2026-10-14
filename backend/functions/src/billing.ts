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

/** Create an estimate for a repair. */
export const createEstimate = onCall(async (request) => {
  const context = getContext(request.auth);
  if (!context.isStaff) throwError(ErrorCode.PERMISSION_DENIED, "Staff only");

  const data = request.data as {
    repairId: string;
    items: { kind: "part" | "labour" | "service"; productId?: string; name: string; quantity: number; unitPriceCents: number }[];
    discountCents?: number;
    notes?: string;
    expiresInDays?: number;
  };

  if (!data.repairId) throwError(ErrorCode.INVALID_ARGUMENT, "Repair ID required");
  if (!data.items?.length) throwError(ErrorCode.INVALID_ARGUMENT, "At least one item required");

  const repairRef = db.collection("repairs").doc(data.repairId);
  const repairSnap = await repairRef.get();
  if (!repairSnap.exists) throwError(ErrorCode.NOT_FOUND, "Repair not found");

  const repair = repairSnap.data()!;
  requireBranchAccess(context, repair.branchId);

  const lineItems = data.items.map((item) => ({
    ...item,
    lineTotalCents: item.unitPriceCents * item.quantity,
  }));

  const totals = computeTotals({ lines: lineItems, discountCents: data.discountCents ?? 0, taxEnabled: false });

  const year = currentYear();
  const seq = await getNextSequence(`estimate_${year}`);
  const estimateNumber = formatDocNumber("EST", year, seq);
  const estimateId = `est-${seq}`;

  const estimate = {
    id: estimateId,
    number: estimateNumber,
    repairId: data.repairId,
    customerId: repair.customerId,
    branchId: repair.branchId,
    items: lineItems.map((item, i) => ({ id: `esi-${i}`, ...item })),
    subtotalCents: totals.subtotalCents,
    discountCents: totals.discountCents,
    taxCents: totals.taxCents,
    totalCents: totals.totalCents,
    notes: data.notes?.trim() ?? null,
    status: "draft" as const,
    revision: 1,
    createdByUserId: context.uid,
    createdAt: serverTimestamp(),
    expiresAt: data.expiresInDays ? new Date(Date.now() + data.expiresInDays * 86400000).toISOString() : null,
  };

  await db.collection("estimates").doc(estimateId).set(estimate);
  await repairRef.update({ estimateId, updatedAt: serverTimestamp() });

  return { ok: true, estimateId, estimateNumber };
});

/** Send estimate to customer. */
export const sendEstimate = onCall(async (request) => {
  const context = getContext(request.auth);
  if (!context.isStaff) throwError(ErrorCode.PERMISSION_DENIED, "Staff only");

  const { estimateId } = request.data as { estimateId: string };

  const estimateRef = db.collection("estimates").doc(estimateId);
  const snap = await estimateRef.get();
  if (!snap.exists) throwError(ErrorCode.NOT_FOUND, "Estimate not found");

  const estimate = snap.data()!;
  requireBranchAccess(context, estimate.branchId);

  if (estimate.status !== "draft") throwError(ErrorCode.FAILED_PRECONDITION, "Only draft estimates can be sent");

  await estimateRef.update({
    status: "sent",
    sentAt: serverTimestamp(),
  });

  const repairRef = db.collection("repairs").doc(estimate.repairId);
  await repairRef.collection("events").add({
    type: "estimate_sent",
    message: `Estimate ${estimate.number} sent to the customer for approval.`,
    visibility: "customer",
    actorUserId: context.uid,
    actorName: "Staff",
    actorRole: context.claims.role,
    createdAt: serverTimestamp(),
  });

  await db.collection("notifications").doc(estimate.customerId).collection("items").add({
    type: "estimate_request",
    title: "Estimate ready for review",
    body: `Your estimate ${estimate.number} is ready to review and approve.`,
    audience: { userId: estimate.customerId },
    link: { route: "/portal/estimates", id: estimateId },
    createdAt: serverTimestamp(),
  });

  return { ok: true };
});

/** Customer approves or rejects an estimate. */
export const decideEstimate = onCall(async (request) => {
  const context = getContext(request.auth);
  if (!context.isCustomer) throwError(ErrorCode.PERMISSION_DENIED, "Customers only");

  const { estimateId, decision, note } = request.data as {
    estimateId: string;
    decision: "approved" | "rejected";
    note?: string;
  };

  const estimateRef = db.collection("estimates").doc(estimateId);
  const snap = await estimateRef.get();
  if (!snap.exists) throwError(ErrorCode.NOT_FOUND, "Estimate not found");

  const estimate = snap.data()!;
  if (estimate.customerId !== context.customerId) throwError(ErrorCode.PERMISSION_DENIED, "Not your estimate");
  if (estimate.status !== "sent") throwError(ErrorCode.FAILED_PRECONDITION, "Estimate is not pending approval");

  const now = serverTimestamp();
  const approvalId = `apr-${Date.now()}`;

  await db.runTransaction(async (tx) => {
    tx.update(estimateRef, {
      status: decision,
      decidedAt: now,
    });

    tx.set(db.collection("approvals").doc(approvalId), {
      estimateId,
      repairId: estimate.repairId,
      customerId: context.customerId,
      decision,
      method: "portal",
      note: note?.trim() ?? null,
      decidedAt: now,
    });

    const repairRef = db.collection("repairs").doc(estimate.repairId);
    if (decision === "approved") {
      tx.update(repairRef, { approvalId, status: "approved", updatedAt: now });
    } else {
      tx.update(repairRef, { status: "cancelled", cancelledReason: `Customer declined estimate: ${note ?? "No reason given"}`, updatedAt: now });
    }

    const eventRef = repairRef.collection("events").doc();
    tx.set(eventRef, {
      type: decision === "approved" ? "approval" : "note",
      message: decision === "approved"
        ? `Estimate ${estimate.number} approved by customer.`
        : `Estimate ${estimate.number} rejected by customer. ${note ?? ""}`,
      visibility: "customer",
      actorUserId: context.uid,
      actorName: "Customer",
      actorRole: "customer",
      createdAt: now,
    });
  });

  return { ok: true };
});

/** Create invoice from repair (after completion). */
export const createRepairInvoice = onCall(async (request) => {
  const context = getContext(request.auth);
  requireRole(context, "admin", "manager", "cashier");

  const { repairId } = request.data as { repairId: string };

  const repairRef = db.collection("repairs").doc(repairId);
  const repairSnap = await repairRef.get();
  if (!repairSnap.exists) throwError(ErrorCode.NOT_FOUND, "Repair not found");

  const repair = repairSnap.data()!;
  requireBranchAccess(context, repair.branchId);

  if (repair.invoiceId) throwError(ErrorCode.ALREADY_EXISTS, "Invoice already exists for this repair");
  if (!["completed", "ready_for_collection", "delivered"].includes(repair.status)) {
    throwError(ErrorCode.FAILED_PRECONDITION, "Repair must be completed before invoicing");
  }

  const partsSnap = await repairRef.collection("parts").get();
  const parts = partsSnap.docs.map((doc) => doc.data());

  const year = currentYear();
  const seq = await getNextSequence(`invoice_${year}`);
  const invoiceNumber = formatDocNumber("INV", year, seq);
  const invoiceId = `inv-${seq}`;

  const lineItems = [
    {
      id: `ivi-labour`,
      kind: "labour" as const,
      name: `Repair labour — ${repair.number}`,
      quantity: 1,
      unitPriceCents: repair.labourCents,
      lineTotalCents: repair.labourCents,
    },
    ...parts.map((part: any, i: number) => ({
      id: `ivi-part-${i}`,
      kind: "part" as const,
      productId: part.productId,
      name: part.name,
      quantity: part.quantity,
      unitPriceCents: part.unitPriceCents,
      lineTotalCents: part.lineTotalCents,
    })),
  ];

  const totals = computeTotals({ lines: lineItems, taxEnabled: false });

  const invoice = {
    id: invoiceId,
    number: invoiceNumber,
    branchId: repair.branchId,
    customerId: repair.customerId,
    customerName: repair.customerName,
    repairId,
    items: lineItems,
    subtotalCents: totals.subtotalCents,
    discountCents: totals.discountCents,
    taxCents: totals.taxCents,
    totalCents: totals.totalCents,
    status: "issued" as const,
    dueAt: new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10),
    createdByUserId: context.uid,
    createdAt: serverTimestamp(),
  };

  await db.collection("invoices").doc(invoiceId).set(invoice);
  await repairRef.update({ invoiceId, updatedAt: serverTimestamp() });

  await repairRef.collection("events").add({
    type: "invoice",
    message: `Invoice ${invoiceNumber} issued for ${totals.totalCents / 100} LKR.`,
    visibility: "customer",
    actorUserId: context.uid,
    actorName: "Staff",
    actorRole: context.claims.role,
    createdAt: serverTimestamp(),
  });

  await db.collection("notifications").doc(repair.customerId).collection("items").add({
    type: "repair_status",
    title: "Invoice issued",
    body: `Invoice ${invoiceNumber} for ${repair.number} has been issued.`,
    audience: { userId: repair.customerId },
    link: { route: "/portal/invoices", id: invoiceId },
    createdAt: serverTimestamp(),
  });

  return { ok: true, invoiceId, invoiceNumber };
});

/** Record a payment against an invoice. */
export const recordPayment = onCall(async (request) => {
  const context = getContext(request.auth);
  requireRole(context, "admin", "manager", "cashier");

  const { invoiceId, amountCents, method, reference, cashRegisterId } = request.data as {
    invoiceId: string;
    amountCents: number;
    method: "cash" | "card" | "bank" | "other";
    reference?: string;
    cashRegisterId?: string;
  };

  if (!Number.isInteger(amountCents) || amountCents <= 0) throwError(ErrorCode.INVALID_ARGUMENT, "Amount must be positive");

  const invoiceRef = db.collection("invoices").doc(invoiceId);
  const invoiceSnap = await invoiceRef.get();
  if (!invoiceSnap.exists) throwError(ErrorCode.NOT_FOUND, "Invoice not found");

  const invoice = invoiceSnap.data()!;
  requireBranchAccess(context, invoice.branchId);

  const paymentsSnap = await db.collection("payments").where("invoiceId", "==", invoiceId).get();
  const paid = paymentsSnap.docs.reduce((sum, doc) => sum + doc.data().amountCents, 0);
  const balance = invoice.totalCents - paid;

  if (amountCents > balance) throwError(ErrorCode.FAILED_PRECONDITION, `Payment exceeds balance (${balance} cents remaining)`);

  const year = currentYear();
  const seq = await getNextSequence(`payment_${year}`);
  const paymentNumber = formatDocNumber("PAY", year, seq);
  const paymentId = `pay-${seq}`;

  await db.runTransaction(async (tx) => {
    tx.set(db.collection("payments").doc(paymentId), {
      number: paymentNumber,
      invoiceId,
      customerId: invoice.customerId,
      branchId: invoice.branchId,
      amountCents,
      method,
      reference: reference ?? null,
      receivedByUserId: context.uid,
      receivedAt: serverTimestamp(),
      cashRegisterId: cashRegisterId ?? null,
    });

    const newPaid = paid + amountCents;
    let newStatus = invoice.status;
    if (newPaid >= invoice.totalCents) newStatus = "paid";
    else if (newPaid > 0) newStatus = "partially_paid";

    tx.update(invoiceRef, { status: newStatus });

    const custRef = db.collection("customers").doc(invoice.customerId);
    tx.update(custRef, {
      "totals.outstandingBalance": increment(amountCents * -1),
    });
  });

  return { ok: true, paymentId, paymentNumber };
});

/** Get invoice balance. */
export const getInvoiceBalance = onCall(async (request) => {
  const context = getContext(request.auth);

  const { invoiceId } = request.data as { invoiceId: string };

  const invoiceRef = db.collection("invoices").doc(invoiceId);
  const snap = await invoiceRef.get();
  if (!snap.exists) throwError(ErrorCode.NOT_FOUND, "Invoice not found");

  const invoice = snap.data()!;

  if (context.isCustomer && invoice.customerId !== context.customerId) {
    throwError(ErrorCode.PERMISSION_DENIED, "Not your invoice");
  }
  if (context.isStaff && !context.isAdmin && invoice.branchId !== context.branchId) {
    throwError(ErrorCode.PERMISSION_DENIED, "Not your branch");
  }

  const paymentsSnap = await db.collection("payments").where("invoiceId", "==", invoiceId).get();
  const paid = paymentsSnap.docs.reduce((sum, doc) => sum + doc.data().amountCents, 0);

  return {
    ok: true,
    total: invoice.totalCents,
    paid,
    balance: Math.max(0, invoice.totalCents - paid),
    status: invoice.status,
  };
});