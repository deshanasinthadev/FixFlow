import { onCall, HttpsError } from "firebase-functions/v2/https";
import { db, CallContext, ErrorCode, throwError, requireRole, requireBranchAccess, serverTimestamp, increment, getNextSequence, formatDocNumber, currentYear } from "./types.js";

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

/** Create a purchase order. */
export const createPurchaseOrder = onCall(async (request) => {
  const context = getContext(request.auth);
  requireRole(context, "admin", "manager");

  const data = request.data as {
    supplierId: string;
    branchId: string;
    lines: { productId: string; quantity: number; unitCostCents: number }[];
    expectedAt?: string;
  };

  if (!data.supplierId || !data.branchId || !data.lines?.length) {
    throwError(ErrorCode.INVALID_ARGUMENT, "Supplier, branch, and lines required");
  }

  requireBranchAccess(context, data.branchId);

  const supplierDoc = await db.collection("suppliers").doc(data.supplierId).get();
  if (!supplierDoc.exists) throwError(ErrorCode.NOT_FOUND, "Supplier not found");

  const year = currentYear();
  const seq = await getNextSequence(`purchaseOrder_${year}`);
  const poNumber = formatDocNumber("PO", year, seq);
  const poId = `po-${seq}`;

  const lines = await Promise.all(data.lines.map(async (line, i) => {
    const productDoc = await db.collection("products").doc(line.productId).get();
    if (!productDoc.exists) throwError(ErrorCode.NOT_FOUND, `Product ${line.productId} not found`);
    const product = productDoc.data()!;
    return {
      id: `pol-${i}`,
      productId: line.productId,
      sku: product.sku,
      name: product.name,
      quantityOrdered: line.quantity,
      quantityReceived: 0,
      unitCostCents: line.unitCostCents,
      lineTotalCents: line.unitCostCents * line.quantity,
    };
  }));

  const subtotal = lines.reduce((sum, l) => sum + l.lineTotalCents, 0);

  await db.collection("purchase_orders").doc(poId).set({
    id: poId,
    number: poNumber,
    supplierId: data.supplierId,
    supplierName: supplierDoc.data()!.name,
    branchId: data.branchId,
    lines,
    subtotalCents: subtotal,
    taxCents: 0,
    totalCents: subtotal,
    status: "draft",
    expectedAt: data.expectedAt ?? null,
    createdByUserId: context.uid,
    createdAt: serverTimestamp(),
  });

  return { ok: true, poId, poNumber };
});

/** Send purchase order to supplier. */
export const sendPurchaseOrder = onCall(async (request) => {
  const context = getContext(request.auth);
  requireRole(context, "admin", "manager");

  const { poId } = request.data as { poId: string };

  const poRef = db.collection("purchase_orders").doc(poId);
  const snap = await poRef.get();
  if (!snap.exists) throwError(ErrorCode.NOT_FOUND, "Purchase order not found");

  const po = snap.data()!;
  requireBranchAccess(context, po.branchId);
  if (po.status !== "draft") throwError(ErrorCode.FAILED_PRECONDITION, "Only draft POs can be sent");

  await poRef.update({ status: "sent", sentAt: serverTimestamp() });

  return { ok: true };
});

/** Receive goods against a purchase order. */
export const receivePurchaseOrder = onCall(async (request) => {
  const context = getContext(request.auth);
  requireRole(context, "admin", "manager");

  const { poId, lines } = request.data as {
    poId: string;
    lines: { productId: string; quantity: number }[];
  };

  if (!lines?.length) throwError(ErrorCode.INVALID_ARGUMENT, "At least one line required");

  const poRef = db.collection("purchase_orders").doc(poId);
  const poSnap = await poRef.get();
  if (!poSnap.exists) throwError(ErrorCode.NOT_FOUND, "Purchase order not found");

  const po = poSnap.data()!;
  requireBranchAccess(context, po.branchId);
  if (!["sent", "partial"].includes(po.status)) throwError(ErrorCode.FAILED_PRECONDITION, "PO must be sent or partially received");

  await db.runTransaction(async (tx) => {
    let allReceived = true;

    for (const line of lines) {
      const poLine = po.lines.find((l: any) => l.productId === line.productId);
      if (!poLine) throwError(ErrorCode.NOT_FOUND, `Product ${line.productId} not on this PO`);
      if (line.quantity <= 0) throwError(ErrorCode.INVALID_ARGUMENT, "Quantity must be positive");
      if (poLine.quantityReceived + line.quantity > poLine.quantityOrdered) {
        throwError(ErrorCode.FAILED_PRECONDITION, `Cannot receive more than ordered for ${poLine.name}`);
      }

      const productRef = db.collection("products").doc(line.productId);
      const productSnap = await tx.get(productRef);
      if (!productSnap.exists) throwError(ErrorCode.NOT_FOUND, `Product ${line.productId} not found`);
      const product = productSnap.data()!;

      const stockRef = productRef.collection("stock").doc(po.branchId);
      const stockSnap = await tx.get(stockRef);
      if (stockSnap.exists) {
        tx.update(stockRef, { onHand: increment(line.quantity), updatedAt: serverTimestamp() });
      } else {
        tx.set(stockRef, { branchId: po.branchId, onHand: line.quantity, reserved: 0, updatedAt: serverTimestamp() });
      }

      const movRef = db.collection("stock_movements").doc();
      tx.set(movRef, {
        productId: line.productId,
        sku: product.sku,
        productName: product.name,
        branchId: po.branchId,
        type: "purchase_receipt",
        quantity: line.quantity,
        balanceAfter: (stockSnap.data()?.onHand ?? 0) + line.quantity,
        unitCostCents: poLine.unitCostCents,
        reference: { type: "purchase_order", id: poId },
        reason: `Received from ${po.supplierName}`,
        userId: context.uid,
        createdAt: serverTimestamp(),
      });

      if (poLine.quantityReceived + line.quantity < poLine.quantityOrdered) {
        allReceived = false;
      }
    }

    const newStatus = allReceived ? "received" : "partial";
    tx.update(poRef, {
      status: newStatus,
      receivedAt: allReceived ? serverTimestamp() : null,
    });

    const grRef = db.collection("goods_receipts").doc();
    tx.set(grRef, {
      purchaseOrderId: poId,
      branchId: po.branchId,
      lines: lines.map(l => ({ productId: l.productId, quantity: l.quantity })),
      receivedByUserId: context.uid,
      receivedAt: serverTimestamp(),
    });
  });

  return { ok: true };
});