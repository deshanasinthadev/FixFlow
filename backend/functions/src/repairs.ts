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

/** Create a new repair job. */
export const createRepair = onCall(async (request) => {
  const context = getContext(request.auth);
  if (!context.isStaff) throwError(ErrorCode.PERMISSION_DENIED, "Staff only");
  requireBranchAccess(context, request.data.branchId);

  const data = request.data as {
    branchId: string;
    customerId?: string;
    customerName: string;
    customerPhone: string;
    customerEmail?: string;
    customerAddress?: string;
    device: {
      category: string;
      brand: string;
      model: string;
      serial?: string;
      condition?: string;
      accessories?: string;
    };
    complaint: string;
    notes?: string;
    priority: "urgent" | "high" | "normal" | "low";
    technicianId?: string;
    expectedAt?: string;
  };

  if (!data.customerName?.trim()) throwError(ErrorCode.INVALID_ARGUMENT, "Customer name required");
  if (!data.customerPhone?.trim()) throwError(ErrorCode.INVALID_ARGUMENT, "Customer phone required");
  if (!data.device?.brand?.trim() || !data.device?.model?.trim()) throwError(ErrorCode.INVALID_ARGUMENT, "Device brand and model required");
  if (!data.complaint?.trim()) throwError(ErrorCode.INVALID_ARGUMENT, "Complaint required");

  let customerId = data.customerId;
  let customerName = data.customerName.trim();
  let customerPhone = data.customerPhone.trim();

  if (!customerId) {
    const existing = await db.collection("customers")
      .where("homeBranchId", "==", data.branchId)
      .where("searchPhone", "==", customerPhone.replace(/\D/g, ""))
      .limit(1)
      .get();

    if (!existing.empty) {
      const doc = existing.docs[0]!;
      const data = doc.data() as Record<string, unknown>;
      customerId = doc.id;
      customerName = data.name as string;
      customerPhone = data.phone as string;
    } else {
      const customerRef = db.collection("customers").doc();
      customerId = customerRef.id;
      await customerRef.set({
        name: customerName,
        phone: customerPhone,
        email: data.customerEmail?.trim() ?? null,
        address: data.customerAddress?.trim() ?? null,
        homeBranchId: data.branchId,
        status: "active",
        emailNotifications: true,
        smsNotifications: true,
        registeredAt: serverTimestamp(),
        searchName: customerName.toLowerCase(),
        searchPhone: customerPhone.replace(/\D/g, ""),
      });
    }
  }

  let deviceId: string;
  if (data.device.serial) {
    const existing = await db.collection("customers").doc(customerId).collection("devices")
      .where("brand", "==", data.device.brand.trim())
      .where("model", "==", data.device.model.trim())
      .where("serial", "==", data.device.serial.trim())
      .limit(1)
      .get();

    if (!existing.empty) {
      deviceId = existing.docs[0]!.id;
    } else {
      const deviceRef = db.collection("customers").doc(customerId).collection("devices").doc();
      deviceId = deviceRef.id;
      await deviceRef.set({
        customerId,
        category: data.device.category,
        brand: data.device.brand.trim(),
        model: data.device.model.trim(),
        serial: data.device.serial.trim(),
        condition: data.device.condition?.trim() ?? null,
        createdAt: serverTimestamp(),
      });
    }
  } else {
    const deviceRef = db.collection("customers").doc(customerId).collection("devices").doc();
    deviceId = deviceRef.id;
    await deviceRef.set({
      customerId,
      category: data.device.category,
      brand: data.device.brand.trim(),
      model: data.device.model.trim(),
      serial: data.device.serial?.trim() ?? null,
      condition: data.device.condition?.trim() ?? null,
      createdAt: serverTimestamp(),
    });
  }

  const year = currentYear();
  const counterKey = `repair_${year}`;
  const seq = await getNextSequence(counterKey);
  const repairNumber = formatDocNumber("FX", year, seq);

  if (data.technicianId) {
    const techDoc = await db.collection("users").doc(data.technicianId).get();
    const techData = techDoc.data() as Record<string, unknown> | undefined;
    if (!techDoc.exists || techData?.role !== "technician" || techData?.branchId !== data.branchId) {
      throwError(ErrorCode.INVALID_ARGUMENT, "Invalid technician");
    }
  }

  const repairId = `rep-${seq}`;
  const now = new Date().toISOString();

  let technicianName: string | null = null;
  if (data.technicianId) {
    const techDoc = await db.collection("users").doc(data.technicianId).get();
    const techData = techDoc.data() as Record<string, unknown> | undefined;
    technicianName = techData?.displayName as string ?? null;
  }

  const repair = {
    id: repairId,
    number: repairNumber,
    sequence: seq,
    branchId: data.branchId,
    customerId,
    customerName,
    customerPhone,
    deviceId,
    device: {
      category: data.device.category,
      brand: data.device.brand.trim(),
      model: data.device.model.trim(),
      serial: data.device.serial?.trim() ?? null,
      condition: data.device.condition?.trim() ?? null,
      accessories: data.device.accessories?.trim() ?? null,
    },
    technicianId: data.technicianId ?? null,
    technicianName,
    priority: data.priority,
    status: "received",
    intake: {
      complaint: data.complaint.trim(),
      notes: data.notes?.trim() ?? null,
      receivedAt: now,
      receivedByUserId: context.uid,
    },
    expectedAt: data.expectedAt ?? null,
    labourCents: 0,
    testingChecklist: [
      { id: `chk-${Date.now()}-1`, label: "Device powers on", done: false },
      { id: `chk-${Date.now()}-2`, label: "Primary fault resolved", done: false },
      { id: `chk-${Date.now()}-3`, label: "No new issues introduced", done: false },
    ],
    createdAt: now,
    updatedAt: now,
    searchText: `${repairNumber} ${customerName} ${customerPhone} ${data.device.brand} ${data.device.model} ${data.device.serial ?? ""}`.toLowerCase(),
  };

  await db.collection("repairs").doc(repairId).set(repair);

  await db.collection("repairs").doc(repairId).collection("events").add({
    type: "created",
    to: "received",
    message: `Repair ${repairNumber} registered for ${customerName}.`,
    visibility: "customer",
    actorUserId: context.uid,
    actorName: "Staff",
    actorRole: context.claims.role,
    createdAt: serverTimestamp(),
  });

  if (data.technicianId) {
    await db.collection("notifications").doc(data.technicianId).collection("items").add({
      type: "repair_created",
      title: "New repair assigned",
      body: `${repairNumber} (${data.device.brand} ${data.device.model}) has been assigned to you.`,
      audience: { userId: data.technicianId },
      link: { route: "/repairs", id: repairId },
      createdAt: serverTimestamp(),
    });
  }

  const managers = await db.collection("users")
    .where("branchId", "==", data.branchId)
    .where("role", "in", ["admin", "manager"])
    .get();

  const batch = db.batch();
  managers.docs.forEach((doc) => {
    if (doc.id !== context.uid) {
      const notifRef = db.collection("notifications").doc(doc.id).collection("items").doc();
      batch.set(notifRef, {
        type: "repair_created",
        title: "New repair created",
        body: `${repairNumber} registered for ${customerName}.`,
        audience: { userId: doc.id },
        link: { route: "/repairs", id: repairId },
        createdAt: serverTimestamp(),
      });
    }
  });
  await batch.commit();

  await db.collection("audit_log").add({
    action: "repair.create",
    actorUid: context.uid,
    actorName: "Staff",
    actorRole: context.claims.role,
    entityType: "repair",
    entityId: repairId,
    branchId: data.branchId,
    summary: `Created repair ${repairNumber} for ${customerName}`,
    createdAt: serverTimestamp(),
  });

  return { ok: true, repairId, repairNumber };
});

/** Change repair status with validation. */
export const updateRepairStatus = onCall(async (request) => {
  const context = getContext(request.auth);
  if (!context.isStaff) throwError(ErrorCode.PERMISSION_DENIED, "Staff only");

  const { repairId, to, note, policyException } = request.data as {
    repairId: string;
    to: string;
    note?: string;
    policyException?: { granted: boolean; reason: string };
  };

  if (!repairId || !to) throwError(ErrorCode.INVALID_ARGUMENT, "repairId and to are required");

  const repairRef = db.collection("repairs").doc(repairId);
  const repairSnap = await repairRef.get();
  if (!repairSnap.exists) throwError(ErrorCode.NOT_FOUND, "Repair not found");

  const repair = repairSnap.data()!;
  requireBranchAccess(context, repair.branchId);

  const validTransitions: Record<string, string[]> = {
    received: ["diagnosing", "waiting_approval", "cancelled"],
    diagnosing: ["waiting_approval", "waiting_parts", "repairing", "cancelled"],
    waiting_approval: ["approved", "waiting_parts", "repairing", "diagnosing", "cancelled"],
    approved: ["waiting_parts", "repairing", "cancelled"],
    waiting_parts: ["repairing", "cancelled"],
    repairing: ["testing", "waiting_parts", "cancelled"],
    testing: ["repairing", "completed", "cancelled"],
    completed: ["ready_for_collection"],
    ready_for_collection: ["delivered", "repairing"],
    delivered: [],
    cancelled: [],
  };

  const from = repair.status;
  if (from === to) throwError(ErrorCode.FAILED_PRECONDITION, "Already in that status");
  if (!validTransitions[from]?.includes(to)) {
    throwError(ErrorCode.FAILED_PRECONDITION, `Invalid transition: ${from} → ${to}`);
  }

  const postApprovalStatuses = ["approved", "waiting_parts", "repairing", "testing", "completed", "ready_for_collection", "delivered"];
  if (postApprovalStatuses.includes(to) && !repair.approvalId) {
    if (!policyException?.granted || !policyException?.reason?.trim()) {
      throwError(ErrorCode.FAILED_PRECONDITION, "Customer approval required before work can start. Record approval or policy exception.");
    }
  }

  const now = new Date().toISOString();
  const updates: any = { status: to, updatedAt: now };
  if (to === "delivered") updates.deliveredAt = now;
  if (to === "completed") updates.completedAt = now;
  if (to === "cancelled" && note) updates.cancelledReason = note;

  await repairRef.update(updates);

  await repairRef.collection("events").add({
    type: "status_change",
    from,
    to,
    message: note?.trim() || `Status changed from ${from.replace(/_/g, " ")} to ${to.replace(/_/g, " ")}.${policyException?.granted ? ` Policy exception: ${policyException.reason}` : ""}`,
    visibility: "customer",
    actorUserId: context.uid,
    actorName: "Staff",
    actorRole: context.claims.role,
    createdAt: serverTimestamp(),
  });

  await db.collection("audit_log").add({
    action: "repair.status_change",
    actorUid: context.uid,
    actorName: "Staff",
    actorRole: context.claims.role,
    entityType: "repair",
    entityId: repairId,
    branchId: repair.branchId,
    summary: `Repair ${repair.number} moved to ${to.replace(/_/g, " ")}`,
    changedFields: ["status"],
    createdAt: serverTimestamp(),
  });

  await db.collection("notifications").doc(repair.customerId).collection("items").add({
    type: "repair_status",
    title: "Repair status updated",
    body: `${repair.number} is now ${to.replace(/_/g, " ")}.`,
    audience: { userId: repair.customerId },
    link: { route: "/portal/repairs", id: repairId },
    createdAt: serverTimestamp(),
  });

  return { ok: true };
});

/** Assign a technician to a repair. */
export const assignTechnician = onCall(async (request) => {
  const context = getContext(request.auth);
  if (!context.isStaff) throwError(ErrorCode.PERMISSION_DENIED, "Staff only");
  if (!["admin", "manager"].includes(context.claims.role)) throwError(ErrorCode.PERMISSION_DENIED, "Only admins and managers can assign technicians");

  const { repairId, technicianId } = request.data as { repairId: string; technicianId?: string };

  const repairRef = db.collection("repairs").doc(repairId);
  const repairSnap = await repairRef.get();
  if (!repairSnap.exists) throwError(ErrorCode.NOT_FOUND, "Repair not found");

  const repair = repairSnap.data()!;
  requireBranchAccess(context, repair.branchId);

  let technicianName: string | null = null;
  if (technicianId) {
    const techDoc = await db.collection("users").doc(technicianId).get();
    const techData = techDoc.data() as Record<string, unknown> | undefined;
    if (!techDoc.exists || techData?.role !== "technician" || techData?.branchId !== repair.branchId) {
      throwError(ErrorCode.INVALID_ARGUMENT, "Invalid technician");
    }
    technicianName = techData?.displayName as string ?? null;
  }

  await repairRef.update({
    technicianId: technicianId ?? null,
    technicianName,
    updatedAt: new Date().toISOString(),
  });

  await repairRef.collection("events").add({
    type: "note",
    message: technicianId ? `Assigned to ${technicianName}.` : "Technician assignment cleared.",
    visibility: "internal",
    actorUserId: context.uid,
    actorName: "Staff",
    actorRole: context.claims.role,
    createdAt: serverTimestamp(),
  });

  if (technicianId) {
    await db.collection("notifications").doc(technicianId).collection("items").add({
      type: "repair_created",
      title: "Repair assigned to you",
      body: `${repair.number} (${repair.device.brand} ${repair.device.model}) is now yours.`,
      audience: { userId: technicianId },
      link: { route: "/repairs", id: repairId },
      createdAt: serverTimestamp(),
    });
  }

  return { ok: true };
});

/** Record diagnosis. */
export const recordDiagnosis = onCall(async (request) => {
  const context = getContext(request.auth);
  if (!context.isStaff) throwError(ErrorCode.PERMISSION_DENIED, "Staff only");
  if (!["admin", "manager", "technician"].includes(context.claims.role)) throwError(ErrorCode.PERMISSION_DENIED, "Only technicians and above can record diagnosis");

  const { repairId, findings, recommended, technicianConfirmed } = request.data as {
    repairId: string;
    findings: string;
    recommended: string;
    technicianConfirmed: boolean;
  };

  if (!findings?.trim()) throwError(ErrorCode.INVALID_ARGUMENT, "Findings required");
  if (!recommended?.trim()) throwError(ErrorCode.INVALID_ARGUMENT, "Recommended action required");

  const repairRef = db.collection("repairs").doc(repairId);
  const repairSnap = await repairRef.get();
  if (!repairSnap.exists) throwError(ErrorCode.NOT_FOUND, "Repair not found");

  const repair = repairSnap.data()!;
  requireBranchAccess(context, repair.branchId);

  const diagnosis = {
    findings: findings.trim(),
    recommended: recommended.trim(),
    recordedByUserId: context.uid,
    recordedAt: new Date().toISOString(),
    technicianConfirmed: technicianConfirmed ?? false,
  };

  await repairRef.update({ diagnosis, updatedAt: diagnosis.recordedAt });

  await repairRef.collection("events").add({
    type: "diagnosis",
    message: findings.trim(),
    visibility: "internal",
    actorUserId: context.uid,
    actorName: "Technician",
    actorRole: context.claims.role,
    createdAt: serverTimestamp(),
  });

  return { ok: true };
});

/** Add a part to a repair (consumes stock). */
export const addRepairPart = onCall(async (request) => {
  const context = getContext(request.auth);
  if (!context.isStaff) throwError(ErrorCode.PERMISSION_DENIED, "Staff only");
  if (!["admin", "manager", "technician"].includes(context.claims.role)) throwError(ErrorCode.PERMISSION_DENIED, "Only technicians and above can add parts");

  const { repairId, productId, quantity } = request.data as { repairId: string; productId: string; quantity: number };

  if (!productId || !Number.isInteger(quantity) || quantity <= 0) {
    throwError(ErrorCode.INVALID_ARGUMENT, "Valid productId and quantity required");
  }

  const repairRef = db.collection("repairs").doc(repairId);
  const repairSnap = await repairRef.get();
  if (!repairSnap.exists) throwError(ErrorCode.NOT_FOUND, "Repair not found");

  const repair = repairSnap.data()!;
  requireBranchAccess(context, repair.branchId);

  const productDoc = await db.collection("products").doc(productId).get();
  if (!productDoc.exists) throwError(ErrorCode.NOT_FOUND, "Product not found");

  const product = productDoc.data()!;
  if (!product.isActive) throwError(ErrorCode.FAILED_PRECONDITION, "Product is not active");

  const balanceDoc = await db.collection("products").doc(productId).collection("stock").doc(repair.branchId).get();
  if (!balanceDoc.exists) throwError(ErrorCode.FAILED_PRECONDITION, `${product.name} not stocked at this branch`);

  const balance = balanceDoc.data()!;
  const available = balance.onHand - balance.reserved;
  if (available < quantity) {
    throwError(ErrorCode.FAILED_PRECONDITION, `Only ${available} × ${product.name} available`);
  }

  await db.runTransaction(async (tx) => {
    const balanceRef = db.collection("products").doc(productId).collection("stock").doc(repair.branchId);
    const balanceSnap = await tx.get(balanceRef);
    const currentBalance = balanceSnap.data()!;
    const currentAvailable = currentBalance.onHand - currentBalance.reserved;
    if (currentAvailable < quantity) {
      throwError(ErrorCode.FAILED_PRECONDITION, `Only ${currentAvailable} × ${product.name} available`);
    }

    tx.update(balanceRef, { onHand: increment(-quantity), updatedAt: serverTimestamp() });

    const partRef = repairRef.collection("parts").doc();
    tx.set(partRef, {
      productId,
      sku: product.sku,
      name: product.name,
      quantity,
      unitPriceCents: product.sellingPriceCents,
      lineTotalCents: product.sellingPriceCents * quantity,
      addedByUserId: context.uid,
      addedAt: serverTimestamp(),
    });

    const movRef = db.collection("stock_movements").doc();
    tx.set(movRef, {
      productId,
      branchId: repair.branchId,
      type: "repair_part",
      quantity: -quantity,
      balanceAfter: currentBalance.onHand - quantity,
      unitCostCents: product.costPriceCents,
      reference: { type: "repair", id: repairId },
      reason: `Fitted to ${repair.number}`,
      userId: context.uid,
      createdAt: serverTimestamp(),
    });

    tx.update(repairRef, { updatedAt: serverTimestamp() });

    const eventRef = repairRef.collection("events").doc();
    tx.set(eventRef, {
      type: "part_added",
      message: `${quantity} × ${product.name} recorded against this repair.`,
      visibility: "internal",
      actorUserId: context.uid,
      actorName: "Technician",
      actorRole: context.claims.role,
      createdAt: serverTimestamp(),
    });
  });

  return { ok: true };
});

/** Set labour charge. */
export const setLabour = onCall(async (request) => {
  const context = getContext(request.auth);
  if (!context.isStaff) throwError(ErrorCode.PERMISSION_DENIED, "Staff only");
  if (!["admin", "manager"].includes(context.claims.role)) throwError(ErrorCode.PERMISSION_DENIED, "Only managers can set labour");

  const { repairId, labourCents } = request.data as { repairId: string; labourCents: number };

  if (!Number.isInteger(labourCents) || labourCents < 0) {
    throwError(ErrorCode.INVALID_ARGUMENT, "Labour must be a non-negative integer (cents)");
  }

  const repairRef = db.collection("repairs").doc(repairId);
  const repairSnap = await repairRef.get();
  if (!repairSnap.exists) throwError(ErrorCode.NOT_FOUND, "Repair not found");

  const repair = repairSnap.data()!;
  requireBranchAccess(context, repair.branchId);

  await repairRef.update({ labourCents, updatedAt: serverTimestamp() });

  await db.collection("audit_log").add({
    action: "repair.part_add",
    actorUid: context.uid,
    actorName: "Manager",
    actorRole: context.claims.role,
    entityType: "repair",
    entityId: repairId,
    branchId: repair.branchId,
    summary: `Labour charge updated on ${repair.number}`,
    changedFields: ["labourCents"],
    createdAt: serverTimestamp(),
  });

  return { ok: true };
});

/** Toggle checklist item. */
export const toggleChecklistItem = onCall(async (request) => {
  const context = getContext(request.auth);
  if (!context.isStaff) throwError(ErrorCode.PERMISSION_DENIED, "Staff only");
  if (!["admin", "manager", "technician"].includes(context.claims.role)) throwError(ErrorCode.PERMISSION_DENIED, "Only technicians and above can update checklist");

  const { repairId, itemId, done } = request.data as { repairId: string; itemId: string; done: boolean };

  const repairRef = db.collection("repairs").doc(repairId);
  const repairSnap = await repairRef.get();
  if (!repairSnap.exists) throwError(ErrorCode.NOT_FOUND, "Repair not found");

  const repair = repairSnap.data()!;
  requireBranchAccess(context, repair.branchId);

  const item = repair.testingChecklist?.find((c: any) => c.id === itemId);
  if (!item) throwError(ErrorCode.NOT_FOUND, "Checklist item not found");

  const updatedChecklist = repair.testingChecklist.map((c: any) =>
    c.id === itemId ? { ...c, done, doneAt: done ? new Date().toISOString() : null, doneByUserId: done ? context.uid : null } : c
  );

  await repairRef.update({ testingChecklist: updatedChecklist, updatedAt: serverTimestamp() });

  await repairRef.collection("events").add({
    type: "testing",
    message: `${done ? "Completed" : "Reopened"} test: ${item.label}`,
    visibility: "internal",
    actorUserId: context.uid,
    actorName: "Technician",
    actorRole: context.claims.role,
    createdAt: serverTimestamp(),
  });

  return { ok: true };
});

/** Add a note to a repair. */
export const addRepairNote = onCall(async (request) => {
  const context = getContext(request.auth);
  if (!context.isStaff) throwError(ErrorCode.PERMISSION_DENIED, "Staff only");

  const { repairId, message, visibility } = request.data as { repairId: string; message: string; visibility: "internal" | "customer" };

  if (!message?.trim()) throwError(ErrorCode.INVALID_ARGUMENT, "Message required");

  const repairRef = db.collection("repairs").doc(repairId);
  const repairSnap = await repairRef.get();
  if (!repairSnap.exists) throwError(ErrorCode.NOT_FOUND, "Repair not found");

  const repair = repairSnap.data()!;
  requireBranchAccess(context, repair.branchId);

  await repairRef.collection("events").add({
    type: "note",
    message: message.trim(),
    visibility,
    actorUserId: context.uid,
    actorName: "Staff",
    actorRole: context.claims.role,
    createdAt: serverTimestamp(),
  });

  await repairRef.update({ updatedAt: serverTimestamp() });

  if (visibility === "customer") {
    await db.collection("notifications").doc(repair.customerId).collection("items").add({
      type: "repair_status",
      title: "Update from the workshop",
      body: message.trim(),
      audience: { userId: repair.customerId },
      link: { route: "/portal/repairs", id: repairId },
      createdAt: serverTimestamp(),
    });
  }

  return { ok: true };
});