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

/** Create a new product. */
export const createProduct = onCall(async (request) => {
  const context = getContext(request.auth);
  requireRole(context, "admin", "manager");

  const data = request.data as {
    sku: string;
    name: string;
    description?: string;
    categoryId: string;
    brand?: string;
    model?: string;
    costPriceCents: number;
    sellingPriceCents: number;
    minStock: number;
    supplierId?: string;
    warrantyMonths?: number;
    initialStock?: { branchId: string; quantity: number }[];
  };

  if (!data.sku?.trim() || !data.name?.trim() || !data.categoryId) {
    throwError(ErrorCode.INVALID_ARGUMENT, "SKU, name, and category required");
  }

  const existing = await db.collection("products").where("sku", "==", data.sku.trim()).limit(1).get();
  if (!existing.empty) throwError(ErrorCode.ALREADY_EXISTS, "SKU already exists");

  const productRef = db.collection("products").doc();
  await productRef.set({
    sku: data.sku.trim(),
    name: data.name.trim(),
    description: data.description?.trim() ?? null,
    categoryId: data.categoryId,
    brand: data.brand?.trim() ?? null,
    model: data.model?.trim() ?? null,
    costPriceCents: data.costPriceCents,
    sellingPriceCents: data.sellingPriceCents,
    minStock: data.minStock ?? 0,
    supplierId: data.supplierId ?? null,
    warrantyMonths: data.warrantyMonths ?? 6,
    isActive: true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    searchName: data.name.trim().toLowerCase(),
    searchSku: data.sku.trim().toLowerCase(),
  });

  if (data.initialStock?.length) {
    const batch = db.batch();
    for (const stock of data.initialStock) {
      requireBranchAccess(context, stock.branchId);
      const stockRef = productRef.collection("stock").doc(stock.branchId);
      batch.set(stockRef, {
        branchId: stock.branchId,
        onHand: stock.quantity,
        reserved: 0,
        updatedAt: serverTimestamp(),
      });
      const movRef = db.collection("stock_movements").doc();
      batch.set(movRef, {
        productId: productRef.id,
        sku: data.sku.trim(),
        productName: data.name.trim(),
        branchId: stock.branchId,
        type: "count_correction",
        quantity: stock.quantity,
        balanceAfter: stock.quantity,
        reference: { type: "adjustment", id: "opening-balance" },
        reason: "Initial stock",
        userId: context.uid,
        createdAt: serverTimestamp(),
      });
    }
    await batch.commit();
  }

  return { ok: true, productId: productRef.id };
});

/** Update a product. */
export const updateProduct = onCall(async (request) => {
  const context = getContext(request.auth);
  requireRole(context, "admin", "manager");

  const { productId, ...updates } = request.data as { productId: string; [key: string]: any };

  const productRef = db.collection("products").doc(productId);
  const snap = await productRef.get();
  if (!snap.exists) throwError(ErrorCode.NOT_FOUND, "Product not found");

  const allowedFields = ["name", "description", "categoryId", "brand", "model", "costPriceCents", "sellingPriceCents", "minStock", "supplierId", "warrantyMonths", "isActive"];
  const filtered: any = { updatedAt: serverTimestamp() };
  for (const key of allowedFields) {
    if (updates[key] !== undefined) filtered[key] = updates[key];
  }
  if (filtered.name) filtered.searchName = filtered.name.toLowerCase();
  if (updates.sku) throwError(ErrorCode.FAILED_PRECONDITION, "SKU cannot be changed");

  await productRef.update(filtered);
  return { ok: true };
});

/** Adjust stock (manager/admin only). */
export const adjustStock = onCall(async (request) => {
  const context = getContext(request.auth);
  requireRole(context, "admin", "manager");

  const { productId, branchId, quantity, reason } = request.data as {
    productId: string;
    branchId: string;
    quantity: number;
    reason: string;
  };

  if (!Number.isInteger(quantity) || quantity === 0) throwError(ErrorCode.INVALID_ARGUMENT, "Quantity must be non-zero integer");
  if (!reason?.trim()) throwError(ErrorCode.INVALID_ARGUMENT, "Reason required");

  requireBranchAccess(context, branchId);

  await db.runTransaction(async (tx) => {
    const productRef = db.collection("products").doc(productId);
    const productSnap = await tx.get(productRef);
    if (!productSnap.exists) throwError(ErrorCode.NOT_FOUND, "Product not found");
    const product = productSnap.data()!;

    const stockRef = productRef.collection("stock").doc(branchId);
    const stockSnap = await tx.get(stockRef);
    if (!stockSnap.exists) throwError(ErrorCode.NOT_FOUND, "Stock record not found for this branch");

    const stock = stockSnap.data()!;
    const newOnHand = stock.onHand + quantity;
    if (newOnHand < 0) throwError(ErrorCode.FAILED_PRECONDITION, "Insufficient stock");

    tx.update(stockRef, { onHand: newOnHand, updatedAt: serverTimestamp() });

    const movRef = db.collection("stock_movements").doc();
    tx.set(movRef, {
      productId,
      sku: product.sku,
      productName: product.name,
      branchId,
      type: "adjustment",
      quantity,
      balanceAfter: newOnHand,
      unitCostCents: product.costPriceCents,
      reference: { type: "adjustment", id: "manual" },
      reason: reason.trim(),
      userId: context.uid,
      createdAt: serverTimestamp(),
    });
  });

  return { ok: true };
});

/** Transfer stock between branches. */
export const transferStock = onCall(async (request) => {
  const context = getContext(request.auth);
  requireRole(context, "admin", "manager");

  const { fromBranchId, toBranchId, lines, note } = request.data as {
    fromBranchId: string;
    toBranchId: string;
    lines: { productId: string; quantity: number }[];
    note?: string;
  };

  if (fromBranchId === toBranchId) throwError(ErrorCode.INVALID_ARGUMENT, "Branches must differ");
  if (!lines?.length) throwError(ErrorCode.INVALID_ARGUMENT, "No lines provided");

  requireBranchAccess(context, fromBranchId);
  requireBranchAccess(context, toBranchId);

  const transferRef = db.collection("stock_transfers").doc();
  const transferNumber = `TRF-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`;

  await db.runTransaction(async (tx) => {
    for (const line of lines) {
      if (!Number.isInteger(line.quantity) || line.quantity <= 0) {
        throwError(ErrorCode.INVALID_ARGUMENT, "Quantities must be positive integers");
      }

      const productRef = db.collection("products").doc(line.productId);
      const productSnap = await tx.get(productRef);
      if (!productSnap.exists) throwError(ErrorCode.NOT_FOUND, `Product ${line.productId} not found`);
      const product = productSnap.data()!;

      const fromStockRef = productRef.collection("stock").doc(fromBranchId);
      const fromStockSnap = await tx.get(fromStockRef);
      if (!fromStockSnap.exists) throwError(ErrorCode.NOT_FOUND, `${product.name} not stocked at source branch`);
      const fromStock = fromStockSnap.data()!;
      const fromAvailable = fromStock.onHand - fromStock.reserved;
      if (fromAvailable < line.quantity) {
        throwError(ErrorCode.FAILED_PRECONDITION, `Only ${fromAvailable} × ${product.name} available at source`);
      }

      tx.update(fromStockRef, { onHand: fromStock.onHand - line.quantity, updatedAt: serverTimestamp() });

      const toStockRef = productRef.collection("stock").doc(toBranchId);
      const toStockSnap = await tx.get(toStockRef);
      if (toStockSnap.exists) {
        tx.update(toStockRef, { onHand: toStockSnap.data()!.onHand + line.quantity, updatedAt: serverTimestamp() });
      } else {
        tx.set(toStockRef, { branchId: toBranchId, onHand: line.quantity, reserved: 0, updatedAt: serverTimestamp() });
      }

      const outRef = db.collection("stock_movements").doc();
      tx.set(outRef, {
        productId: line.productId,
        sku: product.sku,
        productName: product.name,
        branchId: fromBranchId,
        type: "transfer_out",
        quantity: -line.quantity,
        balanceAfter: fromStock.onHand - line.quantity,
        unitCostCents: product.costPriceCents,
        reference: { type: "transfer", id: transferRef.id },
        reason: note?.trim() ?? `Transfer to ${toBranchId}`,
        userId: context.uid,
        createdAt: serverTimestamp(),
      });

      const inRef = db.collection("stock_movements").doc();
      const toStock = toStockSnap.data() ?? { onHand: 0 };
      tx.set(inRef, {
        productId: line.productId,
        sku: product.sku,
        productName: product.name,
        branchId: toBranchId,
        type: "transfer_in",
        quantity: line.quantity,
        balanceAfter: (toStock.onHand ?? 0) + line.quantity,
        unitCostCents: product.costPriceCents,
        reference: { type: "transfer", id: transferRef.id },
        reason: note?.trim() ?? `Transfer from ${fromBranchId}`,
        userId: context.uid,
        createdAt: serverTimestamp(),
      });
    }

    tx.set(transferRef, {
      transferNumber,
      fromBranchId,
      toBranchId,
      status: "in_transit",
      lines: lines.map((l) => ({ productId: l.productId, quantity: l.quantity })),
      createdBy: context.uid,
      createdAt: serverTimestamp(),
    });
  });

  return { ok: true, transferId: transferRef.id, transferNumber };
});

/** Create a product category. */
export const createCategory = onCall(async (request) => {
  const context = getContext(request.auth);
  requireRole(context, "admin", "manager");

  const { name, description } = request.data as { name: string; description?: string };
  if (!name?.trim()) throwError(ErrorCode.INVALID_ARGUMENT, "Name required");

  const ref = await db.collection("categories").add({
    name: name.trim(),
    description: description?.trim() ?? null,
    createdAt: serverTimestamp(),
  });

  return { ok: true, categoryId: ref.id };
});

/** Create a supplier. */
export const createSupplier = onCall(async (request) => {
  const context = getContext(request.auth);
  requireRole(context, "admin", "manager");

  const data = request.data as {
    name: string;
    contactPerson?: string;
    phone?: string;
    email?: string;
    address?: string;
    paymentTerms?: string;
  };

  if (!data.name?.trim()) throwError(ErrorCode.INVALID_ARGUMENT, "Name required");

  const ref = await db.collection("suppliers").add({
    name: data.name.trim(),
    contactPerson: data.contactPerson?.trim() ?? null,
    phone: data.phone?.trim() ?? null,
    email: data.email?.trim() ?? null,
    address: data.address?.trim() ?? null,
    paymentTerms: data.paymentTerms?.trim() ?? null,
    isActive: true,
    createdAt: serverTimestamp(),
  });

  return { ok: true, supplierId: ref.id };
});