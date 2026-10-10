import { availableStock } from "../domain/calculations";
import { assertBranchAccess, assertCan, actorCan } from "../domain/permissions";
import { validateTransition } from "../domain/workflows";
import type {
  AuditLog,
  Branch,
  Customer,
  Database,
  Device,
  DeviceCategory,
  RepairEvent,
  RepairJob,
  RepairPriority,
  RepairStatus,
} from "../domain/types";
import type { Actor } from "../domain/permissions";

/**
 * Repair business logic.
 *
 * Every function is a pure mutation of a draft Database: it validates, applies
 * the change, writes the matching timeline entry and audit record, and returns a
 * Result. Nothing here touches React or localStorage, which is what lets the
 * same code run against a real backend later.
 */

export type Result<T = void> = { ok: true; value: T } | { ok: false; error: string };

const ok = <T>(value: T): Result<T> => ({ ok: true, value });
const fail = (error: string): Result<never> => ({ ok: false, error });

export function uid(prefix: string): string {
  const random =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `${prefix}-${random}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}

/** Allocates the next document number for a sequence, e.g. FX-2026-000119. */
export function documentNumber(db: Database, kind: keyof Database["business"]["numbering"]): string {
  const prefix = db.business.numbering[kind];
  const year = new Date().getFullYear();
  const key = `${prefix}:${year}`;
  const next = (db.sequences[key] ?? 0) + 1;
  db.sequences[key] = next;
  return `${prefix}-${year}-${String(next).padStart(6, "0")}`;
}

export function audit(
  db: Database,
  entry: Pick<AuditLog, "action" | "entityType" | "entityId" | "summary"> & {
    actor: Actor;
    branchId?: string;
    changedFields?: string[];
  },
): void {
  db.auditLogs.unshift({
    id: uid("aud"),
    action: entry.action,
    actorUserId: entry.actor.userId,
    actorName: entry.actor.name,
    actorRole: entry.actor.role,
    entityType: entry.entityType,
    entityId: entry.entityId,
    branchId: entry.branchId,
    summary: entry.summary,
    changedFields: entry.changedFields,
    createdAt: nowIso(),
  });
  // Keep the demo log bounded.
  if (db.auditLogs.length > 500) db.auditLogs.length = 500;
}

function addEvent(
  db: Database,
  event: Omit<RepairEvent, "id" | "createdAt"> & { createdAt?: string },
): void {
  db.repairEvents.push({ id: uid("rev"), createdAt: event.createdAt ?? nowIso(), ...event });
}

export function notify(
  db: Database,
  notification: Omit<Database["notifications"][number], "id" | "createdAt">,
): void {
  db.notifications.unshift({ id: uid("ntf"), createdAt: nowIso(), ...notification });
}

/* ------------------------------------------------------------------ */
/* Customers and devices                                               */
/* ------------------------------------------------------------------ */

export function findOrCreateCustomer(
  db: Database,
  input: { id?: string; name: string; phone: string; email?: string; address?: string; branchId: string },
  actor: Actor,
): Customer {
  if (input.id) {
    const existing = db.customers.find((customer) => customer.id === input.id);
    if (existing) return existing;
  }
  const byPhone = db.customers.find((customer) => customer.phone.replace(/\s/g, "") === input.phone.replace(/\s/g, ""));
  if (byPhone) return byPhone;

  const customer: Customer = {
    id: uid("cus"),
    name: input.name.trim(),
    phone: input.phone.trim(),
    email: input.email?.trim() || undefined,
    address: input.address?.trim() || undefined,
    homeBranchId: input.branchId,
    status: "active",
    emailNotifications: true,
    smsNotifications: true,
    registeredAt: nowIso(),
  };
  db.customers.push(customer);
  audit(db, {
    action: "repair.create",
    actor,
    entityType: "customer",
    entityId: customer.id,
    branchId: input.branchId,
    summary: `Customer ${customer.name} created during repair intake.`,
  });
  return customer;
}

export function findOrCreateDevice(
  db: Database,
  input: {
    customerId: string;
    category: DeviceCategory;
    brand: string;
    model: string;
    serial?: string;
  },
): Device {
  const match = db.devices.find(
    (device) =>
      device.customerId === input.customerId &&
      device.brand.toLowerCase() === input.brand.trim().toLowerCase() &&
      device.model.toLowerCase() === input.model.trim().toLowerCase() &&
      (input.serial ? device.serial?.toLowerCase() === input.serial.trim().toLowerCase() : true),
  );
  if (match) return match;

  const device: Device = {
    id: uid("dev"),
    customerId: input.customerId,
    category: input.category,
    brand: input.brand.trim(),
    model: input.model.trim(),
    serial: input.serial?.trim() || undefined,
    createdAt: nowIso(),
  };
  db.devices.push(device);
  return device;
}

/* ------------------------------------------------------------------ */
/* Repair intake                                                       */
/* ------------------------------------------------------------------ */

export type CreateRepairInput = {
  branchId: string;
  customerId?: string;
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  customerAddress?: string;
  category: DeviceCategory;
  brand: string;
  model: string;
  serial?: string;
  condition?: string;
  accessories?: string;
  complaint: string;
  notes?: string;
  priority: RepairPriority;
  technicianId?: string;
  expectedAt?: string;
};

export function createRepair(db: Database, input: CreateRepairInput, actor: Actor): Result<RepairJob> {
  try {
    assertCan(actor, "repairs.create");
    assertBranchAccess(actor, input.branchId);
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Permission denied.");
  }

  if (!input.customerName.trim()) return fail("Customer name is required.");
  if (!input.customerPhone.trim()) return fail("Customer phone number is required.");
  if (!input.brand.trim() || !input.model.trim()) return fail("Device brand and model are required.");
  if (!input.complaint.trim()) return fail("The customer-reported issue is required.");

  const branch: Branch | undefined = db.branches.find((item) => item.id === input.branchId);
  if (!branch) return fail("Select a valid branch.");

  const customer = findOrCreateCustomer(
    db,
    {
      id: input.customerId,
      name: input.customerName,
      phone: input.customerPhone,
      email: input.customerEmail,
      address: input.customerAddress,
      branchId: input.branchId,
    },
    actor,
  );

  const device = findOrCreateDevice(db, {
    customerId: customer.id,
    category: input.category,
    brand: input.brand,
    model: input.model,
    serial: input.serial,
  });

  const technician = input.technicianId ? db.users.find((user) => user.id === input.technicianId) : undefined;
  if (input.technicianId && (!technician || technician.role !== "technician")) {
    return fail("Select a valid technician.");
  }

  const receivedAt = nowIso();
  const repair: RepairJob = {
    id: uid("rep"),
    number: documentNumber(db, "repair"),
    branchId: input.branchId,
    customerId: customer.id,
    deviceId: device.id,
    device: {
      category: input.category,
      brand: input.brand.trim(),
      model: input.model.trim(),
      serial: input.serial?.trim() || undefined,
      condition: input.condition?.trim() || undefined,
      accessories: input.accessories?.trim() || undefined,
    },
    customerName: customer.name,
    customerPhone: customer.phone,
    technicianId: technician?.id,
    technicianName: technician?.name,
    priority: input.priority,
    status: "received",
    intake: {
      complaint: input.complaint.trim(),
      notes: input.notes?.trim() || undefined,
      receivedAt,
      receivedByUserId: actor.userId,
    },
    expectedAt: input.expectedAt || undefined,
    labourCents: 0,
    testingChecklist: [
      { id: uid("chk"), label: "Device powers on", done: false },
      { id: uid("chk"), label: "Primary fault resolved", done: false },
      { id: uid("chk"), label: "No new issues introduced", done: false },
    ],
    createdAt: receivedAt,
    updatedAt: receivedAt,
  };

  db.repairs.unshift(repair);

  addEvent(db, {
    repairId: repair.id,
    type: "created",
    to: "received",
    message: `Repair ${repair.number} registered for ${customer.name}.`,
    visibility: "customer",
    actorUserId: actor.userId,
    actorName: actor.name,
    actorRole: actor.role,
    createdAt: receivedAt,
  });

  if (technician) {
    addEvent(db, {
      repairId: repair.id,
      type: "note",
      message: `Assigned to ${technician.name}.`,
      visibility: "internal",
      actorUserId: actor.userId,
      actorName: actor.name,
      actorRole: actor.role,
    });
    notify(db, {
      type: "repair_created",
      title: "New repair assigned",
      body: `${repair.number} (${repair.device.brand} ${repair.device.model}) has been assigned to you.`,
      audience: { userId: technician.id },
      link: { route: "/repairs", id: repair.id },
    });
  }

  audit(db, {
    action: "repair.create",
    actor,
    entityType: "repair",
    entityId: repair.id,
    branchId: repair.branchId,
    summary: `Created repair ${repair.number} for ${customer.name}.`,
  });

  return ok(repair);
}

/* ------------------------------------------------------------------ */
/* Status transitions                                                  */
/* ------------------------------------------------------------------ */

export function changeStatus(
  db: Database,
  options: {
    repairId: string;
    to: RepairStatus;
    actor: Actor;
    /** Recorded manager override when approval has not come back yet. */
    policyException?: { granted: boolean; reason: string };
    note?: string;
  },
): Result<RepairJob> {
  const { repairId, to, actor, policyException, note } = options;
  const repair = db.repairs.find((item) => item.id === repairId);
  if (!repair) return fail("Repair not found.");

  try {
    assertBranchAccess(actor, repair.branchId);
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Permission denied.");
  }

  const check = validateTransition({
    from: repair.status,
    to,
    hasApproval: Boolean(repair.approvalId),
    policyException,
  });
  if (!check.ok) return fail(check.reason);

  const from = repair.status;
  repair.status = to;
  repair.updatedAt = nowIso();

  if (to === "delivered") repair.deliveredAt = repair.updatedAt;
  if (to === "completed") repair.completedAt = repair.updatedAt;
  if (to === "cancelled" && note) repair.cancelledReason = note;

  addEvent(db, {
    repairId: repair.id,
    type: "status_change",
    from,
    to,
    message:
      note?.trim() ||
      `Status changed from ${from.replace(/_/g, " ")} to ${to.replace(/_/g, " ")}.${
        policyException?.granted ? ` Policy exception: ${policyException.reason}` : ""
      }`,
    visibility: "customer",
    actorUserId: actor.userId,
    actorName: actor.name,
    actorRole: actor.role,
  });

  if (policyException?.granted) {
    audit(db, {
      action: "repair.status_change",
      actor,
      entityType: "repair",
      entityId: repair.id,
      branchId: repair.branchId,
      summary: `Policy exception recorded on ${repair.number}: ${policyException.reason}`,
      changedFields: ["status"],
    });
  }

  audit(db, {
    action: "repair.status_change",
    actor,
    entityType: "repair",
    entityId: repair.id,
    branchId: repair.branchId,
    summary: `Repair ${repair.number} moved to ${to.replace(/_/g, " ")}.`,
    changedFields: ["status"],
  });

  notify(db, {
    type: "repair_status",
    title: "Repair status updated",
    body: `${repair.number} is now ${to.replace(/_/g, " ")}.`,
    audience: { branchId: repair.branchId, role: "manager" },
    link: { route: "/repairs", id: repair.id },
  });

  return ok(repair);
}

/* ------------------------------------------------------------------ */
/* Assignment, diagnosis, parts, testing                               */
/* ------------------------------------------------------------------ */

export function assignTechnician(
  db: Database,
  repairId: string,
  technicianId: string | undefined,
  actor: Actor,
): Result<RepairJob> {
  const repair = db.repairs.find((item) => item.id === repairId);
  if (!repair) return fail("Repair not found.");
  if (!actorCan(actor, "repairs.assign")) return fail("You cannot assign technicians.");
  try {
    assertBranchAccess(actor, repair.branchId);
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Permission denied.");
  }

  const technician = technicianId ? db.users.find((user) => user.id === technicianId) : undefined;
  if (technicianId && (!technician || technician.role !== "technician")) return fail("Select a valid technician.");

  repair.technicianId = technician?.id;
  repair.technicianName = technician?.name;
  repair.updatedAt = nowIso();

  addEvent(db, {
    repairId: repair.id,
    type: "note",
    message: technician ? `Assigned to ${technician.name}.` : "Technician assignment cleared.",
    visibility: "internal",
    actorUserId: actor.userId,
    actorName: actor.name,
    actorRole: actor.role,
  });

  if (technician) {
    notify(db, {
      type: "repair_created",
      title: "Repair assigned to you",
      body: `${repair.number} (${repair.device.brand} ${repair.device.model}) is now yours.`,
      audience: { userId: technician.id },
      link: { route: "/repairs", id: repair.id },
    });
  }

  audit(db, {
    action: "repair.assign",
    actor,
    entityType: "repair",
    entityId: repair.id,
    branchId: repair.branchId,
    summary: `${repair.number} assigned to ${technician?.name ?? "nobody"}.`,
    changedFields: ["technicianId"],
  });

  return ok(repair);
}

export function recordDiagnosis(
  db: Database,
  input: { repairId: string; findings: string; recommended: string; technicianConfirmed: boolean },
  actor: Actor,
): Result<RepairJob> {
  const repair = db.repairs.find((item) => item.id === input.repairId);
  if (!repair) return fail("Repair not found.");
  if (!actorCan(actor, "repairs.diagnose")) return fail("You cannot record a diagnosis.");
  try {
    assertBranchAccess(actor, repair.branchId);
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Permission denied.");
  }
  if (!input.findings.trim()) return fail("Diagnosis findings are required.");

  repair.diagnosis = {
    findings: input.findings.trim(),
    recommended: input.recommended.trim(),
    recordedByUserId: actor.userId,
    recordedAt: nowIso(),
    technicianConfirmed: input.technicianConfirmed,
  };
  repair.updatedAt = repair.diagnosis.recordedAt;

  addEvent(db, {
    repairId: repair.id,
    type: "diagnosis",
    message: input.findings.trim(),
    visibility: "internal",
    actorUserId: actor.userId,
    actorName: actor.name,
    actorRole: actor.role,
  });

  audit(db, {
    action: "repair.diagnosis",
    actor,
    entityType: "repair",
    entityId: repair.id,
    branchId: repair.branchId,
    summary: `Diagnosis recorded on ${repair.number}.`,
    changedFields: ["diagnosis"],
  });

  return ok(repair);
}

export function addRepairPart(
  db: Database,
  input: { repairId: string; productId: string; quantity: number },
  actor: Actor,
): Result<RepairJob> {
  const repair = db.repairs.find((item) => item.id === input.repairId);
  if (!repair) return fail("Repair not found.");
  if (!actorCan(actor, "repairs.add_parts")) return fail("You cannot record parts.");
  try {
    assertBranchAccess(actor, repair.branchId);
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Permission denied.");
  }

  const product = db.products.find((item) => item.id === input.productId);
  if (!product) return fail("Select a valid product.");
  if (!Number.isInteger(input.quantity) || input.quantity <= 0) return fail("Quantity must be a whole number above zero.");

  const balance = db.inventory.find(
    (row) => row.productId === product.id && row.branchId === repair.branchId,
  );
  if (!balance) return fail(`${product.name} is not stocked at this branch.`);

  const available = availableStock(balance);
  if (available < input.quantity) {
    return fail(`Only ${available} × ${product.name} available at this branch.`);
  }

  // Consuming stock reduces on-hand; reserved stock is never allocated twice.
  balance.onHand -= input.quantity;
  balance.updatedAt = nowIso();

  const part = {
    id: uid("rpt"),
    repairId: repair.id,
    productId: product.id,
    sku: product.sku,
    name: product.name,
    quantity: input.quantity,
    unitPriceCents: product.sellingPriceCents,
    lineTotalCents: product.sellingPriceCents * input.quantity,
    addedByUserId: actor.userId,
    addedAt: nowIso(),
  };
  db.repairParts.push(part);

  db.stockMovements.unshift({
    id: uid("mov"),
    productId: product.id,
    branchId: repair.branchId,
    type: "repair_part",
    quantity: -input.quantity,
    balanceAfter: balance.onHand,
    unitCostCents: product.costPriceCents,
    reference: { type: "repair", id: repair.id },
    reason: `Fitted to ${repair.number}`,
    userId: actor.userId,
    createdAt: nowIso(),
  });

  repair.updatedAt = nowIso();

  addEvent(db, {
    repairId: repair.id,
    type: "part_added",
    message: `${input.quantity} × ${product.name} recorded against this repair.`,
    visibility: "internal",
    actorUserId: actor.userId,
    actorName: actor.name,
    actorRole: actor.role,
  });

  audit(db, {
    action: "repair.part_add",
    actor,
    entityType: "repair",
    entityId: repair.id,
    branchId: repair.branchId,
    summary: `${input.quantity} × ${product.name} added to ${repair.number}.`,
    changedFields: ["parts"],
  });

  return ok(repair);
}

export function setLabour(
  db: Database,
  input: { repairId: string; labourCents: number },
  actor: Actor,
): Result<RepairJob> {
  const repair = db.repairs.find((item) => item.id === input.repairId);
  if (!repair) return fail("Repair not found.");
  if (!actorCan(actor, "repairs.view_financials")) return fail("You cannot change labour charges.");
  try {
    assertBranchAccess(actor, repair.branchId);
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Permission denied.");
  }
  if (input.labourCents < 0) return fail("Labour cannot be negative.");

  repair.labourCents = Math.round(input.labourCents);
  repair.updatedAt = nowIso();
  audit(db, {
    action: "repair.part_add",
    actor,
    entityType: "repair",
    entityId: repair.id,
    branchId: repair.branchId,
    summary: `Labour charge updated on ${repair.number}.`,
    changedFields: ["labourCents"],
  });
  return ok(repair);
}

export function toggleChecklistItem(
  db: Database,
  input: { repairId: string; itemId: string; done: boolean },
  actor: Actor,
): Result<RepairJob> {
  const repair = db.repairs.find((item) => item.id === input.repairId);
  if (!repair) return fail("Repair not found.");
  if (!actorCan(actor, "repairs.test")) return fail("You cannot update the testing checklist.");
  try {
    assertBranchAccess(actor, repair.branchId);
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Permission denied.");
  }

  const item = repair.testingChecklist.find((entry) => entry.id === input.itemId);
  if (!item) return fail("Checklist item not found.");

  item.done = input.done;
  item.doneAt = input.done ? nowIso() : undefined;
  item.doneByUserId = input.done ? actor.userId : undefined;
  repair.updatedAt = nowIso();

  addEvent(db, {
    repairId: repair.id,
    type: "testing",
    message: `${input.done ? "Completed" : "Reopened"} test: ${item.label}`,
    visibility: "internal",
    actorUserId: actor.userId,
    actorName: actor.name,
    actorRole: actor.role,
  });

  audit(db, {
    action: "repair.testing",
    actor,
    entityType: "repair",
    entityId: repair.id,
    branchId: repair.branchId,
    summary: `Testing item "${item.label}" marked ${input.done ? "done" : "not done"} on ${repair.number}.`,
  });

  return ok(repair);
}

export function addRepairNote(
  db: Database,
  input: { repairId: string; message: string; visibility: "internal" | "customer" },
  actor: Actor,
): Result<RepairJob> {
  const repair = db.repairs.find((item) => item.id === input.repairId);
  if (!repair) return fail("Repair not found.");
  try {
    assertBranchAccess(actor, repair.branchId);
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Permission denied.");
  }
  if (!input.message.trim()) return fail("Write a note before saving.");

  addEvent(db, {
    repairId: repair.id,
    type: "note",
    message: input.message.trim(),
    visibility: input.visibility,
    actorUserId: actor.userId,
    actorName: actor.name,
    actorRole: actor.role,
  });
  repair.updatedAt = nowIso();
  return ok(repair);
}

/* ------------------------------------------------------------------ */
/* Queries                                                             */
/* ------------------------------------------------------------------ */

export function repairById(db: Database, id: string): RepairJob | undefined {
  return db.repairs.find((repair) => repair.id === id);
}

export function eventsForRepair(db: Database, repairId: string): RepairEvent[] {
  return db.repairEvents
    .filter((event) => event.repairId === repairId)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export function partsForRepair(db: Database, repairId: string) {
  return db.repairParts.filter((part) => part.repairId === repairId);
}

export function deviceHistory(db: Database, customerId: string, serial?: string): RepairJob[] {
  return db.repairs
    .filter((repair) => {
      if (repair.customerId !== customerId) return false;
      if (!serial) return true;
      return repair.device.serial?.toLowerCase() === serial.toLowerCase();
    })
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}
