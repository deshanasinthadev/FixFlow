/**
 * FixFlow domain model.
 *
 * These types mirror the relational schema planned for production (see
 * docs/DATABASE-PLAN.md and spec section 27). The local demo stores them as
 * plain objects under the `fixflow.demo.v1` browser key, but the relationships
 * are identical so the persistence layer can be swapped for an API later.
 *
 * Money rule: every monetary amount is an INTEGER number of cents (LKR cents).
 * Never store rupees as a float — see domain/money.ts for the helpers.
 */

export type Cents = number;
export type ID = string;
/** ISO-8601 UTC instant, e.g. "2026-03-18T04:30:00.000Z". */
export type IsoDateTime = string;
/** Calendar day, "YYYY-MM-DD". */
export type IsoDate = string;

export type StaffRole = "admin" | "manager" | "technician" | "cashier";
export type Role = StaffRole | "customer";
export type BranchRef = ID | "all";

/* ------------------------------------------------------------------ */
/* Business configuration                                               */
/* ------------------------------------------------------------------ */

export type PaymentMethodId = "cash" | "card" | "bank" | "other";

export type PaymentMethod = {
  id: PaymentMethodId;
  label: string;
  enabled: boolean;
};

export type BusinessSettings = {
  name: string;
  tagline: string;
  address: string;
  phone: string;
  email: string;
  registrationNo?: string;
  currency: "LKR";
  currencySymbol: string;
  locale: string;
  timezone: string;
  taxEnabled: boolean;
  taxLabel: string;
  taxRatePercent: number;
  receiptFooter: string;
  defaultWarranty: {
    repairMonths: number;
    productMonths: number;
    partMonths: number;
  };
  numbering: {
    repair: string;
    estimate: string;
    invoice: string;
    sale: string;
    payment: string;
    purchaseOrder: string;
    warranty: string;
    claim: string;
  };
  paymentMethods: PaymentMethod[];
};

/* ------------------------------------------------------------------ */
/* Organisation                                                        */
/* ------------------------------------------------------------------ */

export type Branch = {
  id: ID;
  name: string;
  code: string;
  address: string;
  phone: string;
  email?: string;
  managerId?: ID;
  isActive: boolean;
  createdAt: IsoDateTime;
};

export type User = {
  id: ID;
  name: string;
  email: string;
  phone?: string;
  role: Role;
  branchId: BranchRef;
  isActive: boolean;
  /**
   * DEMO ONLY. Plain-text so the local prototype can sign in without a backend.
   * This is NOT authentication and provides no security — the production build
   * must hash passwords server-side and verify on every request.
   */
  demoPassword: string;
  lastLoginAt?: IsoDateTime;
  createdAt: IsoDateTime;
};

/* ------------------------------------------------------------------ */
/* Customers and devices                                               */
/* ------------------------------------------------------------------ */

export type Customer = {
  id: ID;
  name: string;
  phone: string;
  email?: string;
  address?: string;
  notes?: string;
  homeBranchId: ID;
  status: "active" | "blocked";
  emailNotifications: boolean;
  smsNotifications: boolean;
  registeredAt: IsoDateTime;
  /** Set when the customer has customer-portal access. */
  portalUserId?: ID;
};

export type DeviceCategory = "laptop" | "desktop" | "mobile" | "tablet" | "printer" | "other";

export type Device = {
  id: ID;
  customerId: ID;
  category: DeviceCategory;
  brand: string;
  model: string;
  serial?: string;
  imei?: string;
  purchasedAt?: IsoDate;
  notes?: string;
  createdAt: IsoDateTime;
};

/* ------------------------------------------------------------------ */
/* Repairs                                                             */
/* ------------------------------------------------------------------ */

/**
 * Repair workflow statuses. Transitions are validated in domain/workflows.ts —
 * never set a status directly from the UI.
 */
export type RepairStatus =
  | "received"
  | "diagnosing"
  | "waiting_approval"
  | "approved"
  | "waiting_parts"
  | "repairing"
  | "testing"
  | "completed"
  | "ready_for_collection"
  | "delivered"
  | "cancelled";

export type RepairPriority = "urgent" | "high" | "normal" | "low";

export type RepairJob = {
  id: ID;
  /** Human readable job number, e.g. FX-2026-000123. */
  number: string;
  branchId: ID;
  customerId: ID;
  deviceId?: ID;
  device: {
    category: DeviceCategory;
    brand: string;
    model: string;
    serial?: string;
    condition?: string;
    accessories?: string;
  };
  /** Denormalised for list rendering; kept in sync when the customer changes. */
  customerName: string;
  customerPhone: string;
  technicianId?: ID;
  technicianName?: string;
  priority: RepairPriority;
  status: RepairStatus;
  intake: {
    complaint: string;
    notes?: string;
    receivedAt: IsoDateTime;
    receivedByUserId: ID;
  };
  expectedAt?: IsoDateTime;
  diagnosis?: {
    findings: string;
    recommended: string;
    recordedByUserId: ID;
    recordedAt: IsoDateTime;
    /** True once a technician confirms an AI suggestion. */
    technicianConfirmed: boolean;
  };
  estimateId?: ID;
  labourCents: Cents;
  /** Set when the job moves past waiting_approval via a recorded approval. */
  approvalId?: ID;
  testingChecklist: TestingChecklistItem[];
  completedAt?: IsoDateTime;
  deliveredAt?: IsoDateTime;
  cancelledReason?: string;
  warrantyId?: ID;
  invoiceId?: ID;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
};

export type TestingChecklistItem = {
  id: ID;
  label: string;
  done: boolean;
  doneAt?: IsoDateTime;
  doneByUserId?: ID;
};

/**
 * Append-only timeline for a repair. Covers status changes, notes and
 * customer-visible updates. `visibility` decides what the portal may show.
 */
export type RepairEvent = {
  id: ID;
  repairId: ID;
  type:
    | "created"
    | "status_change"
    | "note"
    | "diagnosis"
    | "estimate_sent"
    | "approval"
    | "part_added"
    | "testing"
    | "invoice"
    | "payment"
    | "warranty"
    | "attachment";
  from?: RepairStatus;
  to?: RepairStatus;
  message: string;
  visibility: "internal" | "customer";
  actorUserId?: ID;
  actorName: string;
  actorRole: Role | "system";
  createdAt: IsoDateTime;
};

export type RepairPart = {
  id: ID;
  repairId: ID;
  productId: ID;
  sku: string;
  name: string;
  quantity: number;
  unitPriceCents: Cents;
  lineTotalCents: Cents;
  /** Reserved against stock while fitted; released if removed. */
  reservationId?: ID;
  addedByUserId: ID;
  addedAt: IsoDateTime;
};

export type Diagnosis = {
  id: ID;
  repairId: ID;
  source: "ai" | "manual";
  model?: string;
  causes: DiagnosisCause[];
  inspectionSteps: string[];
  safetyWarnings: string[];
  suggestedParts: string[];
  confidence?: number;
  /** AI output is advisory until a technician confirms it. */
  technicianConfirmed: boolean;
  createdByUserId: ID;
  createdAt: IsoDateTime;
};

export type DiagnosisCause = {
  rank: number;
  title: string;
  detail: string;
  likelihood: "high" | "medium" | "low";
};

/* ------------------------------------------------------------------ */
/* Estimates and approvals                                             */
/* ------------------------------------------------------------------ */

export type EstimateStatus = "draft" | "sent" | "approved" | "rejected" | "expired" | "revised";

export type EstimateItem = {
  id: ID;
  kind: "part" | "labour" | "service";
  productId?: ID;
  name: string;
  quantity: number;
  unitPriceCents: Cents;
  lineTotalCents: Cents;
};

export type Estimate = {
  id: ID;
  number: string;
  repairId: ID;
  customerId: ID;
  branchId: ID;
  items: EstimateItem[];
  subtotalCents: Cents;
  discountCents: Cents;
  taxCents: Cents;
  totalCents: Cents;
  notes?: string;
  status: EstimateStatus;
  /** Set when this estimate supersedes an earlier revision. */
  revisionOf?: ID;
  revision: number;
  createdByUserId: ID;
  createdAt: IsoDateTime;
  sentAt?: IsoDateTime;
  expiresAt?: IsoDateTime;
  decidedAt?: IsoDateTime;
};

export type CustomerApproval = {
  id: ID;
  estimateId: ID;
  repairId: ID;
  customerId: ID;
  decision: "approved" | "rejected";
  method: "portal" | "in_person" | "phone" | "email";
  note?: string;
  decidedByUserId?: ID;
  decidedAt: IsoDateTime;
};

/* ------------------------------------------------------------------ */
/* Inventory                                                           */
/* ------------------------------------------------------------------ */

export type ProductCategory = {
  id: ID;
  name: string;
  description?: string;
};

export type Product = {
  id: ID;
  sku: string;
  barcode?: string;
  name: string;
  description?: string;
  categoryId: ID;
  brand?: string;
  model?: string;
  costPriceCents: Cents;
  sellingPriceCents: Cents;
  minStock: number;
  supplierId?: ID;
  warrantyMonths?: number;
  isActive: boolean;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
};

/** Per-branch stock balance. available = onHand - reserved, never negative. */
export type InventoryBalance = {
  id: ID;
  productId: ID;
  branchId: ID;
  onHand: number;
  reserved: number;
  updatedAt: IsoDateTime;
};

export type StockMovementType =
  | "purchase_receipt"
  | "sale"
  | "repair_part"
  | "adjustment"
  | "transfer_in"
  | "transfer_out"
  | "return"
  | "count_correction";

export type StockMovement = {
  id: ID;
  productId: ID;
  branchId: ID;
  type: StockMovementType;
  /** Signed: negative removes stock, positive adds it. */
  quantity: number;
  balanceAfter: number;
  unitCostCents?: Cents;
  /** Every movement must name the transaction that caused it. */
  reference: { type: "sale" | "repair" | "purchase_order" | "goods_receipt" | "transfer" | "adjustment"; id: ID };
  reason?: string;
  userId: ID;
  createdAt: IsoDateTime;
};

export type StockReservation = {
  id: ID;
  productId: ID;
  branchId: ID;
  quantity: number;
  reference: { type: "repair"; id: ID };
  status: "held" | "consumed" | "released";
  createdAt: IsoDateTime;
};

export type Supplier = {
  id: ID;
  name: string;
  contactPerson?: string;
  phone?: string;
  email?: string;
  address?: string;
  notes?: string;
  paymentTerms?: string;
  isActive: boolean;
  createdAt: IsoDateTime;
};

export type PurchaseOrderStatus = "draft" | "sent" | "partial" | "received" | "cancelled";

export type PurchaseOrderItem = {
  id: ID;
  productId: ID;
  name: string;
  quantityOrdered: number;
  quantityReceived: number;
  unitCostCents: Cents;
  lineTotalCents: Cents;
};

export type PurchaseOrder = {
  id: ID;
  number: string;
  supplierId: ID;
  supplierName: string;
  branchId: ID;
  items: PurchaseOrderItem[];
  subtotalCents: Cents;
  status: PurchaseOrderStatus;
  supplierInvoiceNo?: string;
  expectedAt?: IsoDate;
  createdByUserId: ID;
  createdAt: IsoDateTime;
  receivedAt?: IsoDateTime;
};

export type GoodsReceipt = {
  id: ID;
  purchaseOrderId: ID;
  branchId: ID;
  lines: { productId: ID; quantity: number }[];
  receivedByUserId: ID;
  receivedAt: IsoDateTime;
};

/* ------------------------------------------------------------------ */
/* Sales, invoices, payments                                           */
/* ------------------------------------------------------------------ */

export type SaleItem = {
  id: ID;
  productId: ID;
  sku: string;
  name: string;
  quantity: number;
  unitPriceCents: Cents;
  lineTotalCents: Cents;
  costPriceCents: Cents;
};

export type Sale = {
  id: ID;
  number: string;
  branchId: ID;
  customerId?: ID;
  customerName?: string;
  items: SaleItem[];
  subtotalCents: Cents;
  discountCents: Cents;
  taxCents: Cents;
  totalCents: Cents;
  payments: SalePayment[];
  cashSessionId?: ID;
  userId: ID;
  status: "completed" | "held" | "refunded";
  invoiceId?: ID;
  createdAt: IsoDateTime;
};

export type SalePayment = {
  method: PaymentMethodId;
  amountCents: Cents;
  reference?: string;
};

export type InvoiceStatus = "draft" | "issued" | "partially_paid" | "paid" | "overdue" | "cancelled";

export type InvoiceItem = {
  id: ID;
  kind: "part" | "labour" | "service" | "product";
  productId?: ID;
  name: string;
  quantity: number;
  unitPriceCents: Cents;
  lineTotalCents: Cents;
};

export type Invoice = {
  id: ID;
  number: string;
  branchId: ID;
  customerId: ID;
  customerName: string;
  repairId?: ID;
  saleId?: ID;
  items: InvoiceItem[];
  subtotalCents: Cents;
  discountCents: Cents;
  taxCents: Cents;
  totalCents: Cents;
  status: InvoiceStatus;
  dueAt?: IsoDate;
  notes?: string;
  createdByUserId: ID;
  createdAt: IsoDateTime;
  cancelledAt?: IsoDateTime;
};

export type Payment = {
  id: ID;
  number: string;
  invoiceId: ID;
  customerId: ID;
  branchId: ID;
  amountCents: Cents;
  method: PaymentMethodId;
  reference?: string;
  receivedByUserId: ID;
  receivedAt: IsoDateTime;
  cashSessionId?: ID;
};

export type Refund = {
  id: ID;
  number: string;
  saleId?: ID;
  invoiceId?: ID;
  customerId?: ID;
  branchId: ID;
  amountCents: Cents;
  reason: string;
  method: PaymentMethodId;
  status: "requested" | "approved" | "rejected" | "processed";
  items: { productId: ID; quantity: number; restock: boolean }[];
  requestedByUserId: ID;
  approvedByUserId?: ID;
  createdAt: IsoDateTime;
  processedAt?: IsoDateTime;
};

/* ------------------------------------------------------------------ */
/* Warranties                                                          */
/* ------------------------------------------------------------------ */

export type WarrantyKind = "repair" | "product" | "part";

export type Warranty = {
  id: ID;
  number: string;
  kind: WarrantyKind;
  customerId: ID;
  customerName: string;
  repairId?: ID;
  productId?: ID;
  productName?: string;
  branchId: ID;
  startDate: IsoDate;
  expiryDate: IsoDate;
  durationMonths: number;
  terms: string;
  exclusions: string;
  status: "active" | "expired" | "void";
  createdAt: IsoDateTime;
};

export type WarrantyClaimStatus =
  | "submitted"
  | "under_inspection"
  | "approved"
  | "rejected"
  | "in_progress"
  | "resolved"
  | "closed";

export type WarrantyClaim = {
  id: ID;
  number: string;
  warrantyId: ID;
  customerId: ID;
  customerName: string;
  branchId: ID;
  repairId?: ID;
  reportedIssue: string;
  findings?: string;
  resolution?: string;
  status: WarrantyClaimStatus;
  submittedAt: IsoDateTime;
  updatedAt: IsoDateTime;
  history: { status: WarrantyClaimStatus; note?: string; actorUserId?: ID; actorName: string; at: IsoDateTime }[];
};

/* ------------------------------------------------------------------ */
/* Finance                                                             */
/* ------------------------------------------------------------------ */

export type ExpenseCategory =
  | "rent"
  | "electricity"
  | "internet"
  | "salaries"
  | "transport"
  | "tools"
  | "consumables"
  | "maintenance"
  | "other";

export type Expense = {
  id: ID;
  branchId: ID;
  category: ExpenseCategory;
  amountCents: Cents;
  description: string;
  vendor?: string;
  method: PaymentMethodId;
  incurredAt: IsoDate;
  attachmentUrl?: string;
  status: "pending" | "approved" | "rejected";
  createdByUserId: ID;
  approvedByUserId?: ID;
  createdAt: IsoDateTime;
};

export type CashSession = {
  id: ID;
  branchId: ID;
  code: string;
  openedByUserId: ID;
  openedAt: IsoDateTime;
  openingFloatCents: Cents;
  closedByUserId?: ID;
  closedAt?: IsoDateTime;
  expectedCents: Cents;
  countedCents?: Cents;
  varianceCents?: Cents;
  status: "open" | "closed";
};

/* ------------------------------------------------------------------ */
/* System                                                              */
/* ------------------------------------------------------------------ */

export type NotificationType =
  | "repair_created"
  | "repair_status"
  | "estimate_request"
  | "repair_delayed"
  | "parts_available"
  | "low_stock"
  | "payment_received"
  | "invoice_outstanding"
  | "warranty_expiry"
  | "warranty_claim"
  | "system";

export type Notification = {
  id: ID;
  type: NotificationType;
  title: string;
  body: string;
  /** Target audience: a user id, a role, or a branch. */
  audience: { userId?: ID; role?: Role; branchId?: ID };
  readAt?: IsoDateTime;
  link?: { route: string; id?: ID };
  createdAt: IsoDateTime;
};

export type FileAttachment = {
  id: ID;
  repairId?: ID;
  /** Data URL in the demo; object storage URLs in production. */
  url: string;
  name: string;
  kind: "intake" | "completion" | "document";
  uploadedByUserId: ID;
  uploadedAt: IsoDateTime;
};

export type AuditAction =
  | "auth.login"
  | "auth.logout"
  | "repair.create"
  | "repair.status_change"
  | "repair.assign"
  | "repair.diagnosis"
  | "repair.part_add"
  | "repair.testing"
  | "estimate.create"
  | "estimate.send"
  | "estimate.approve"
  | "estimate.reject"
  | "invoice.create"
  | "payment.record"
  | "refund.request"
  | "refund.approve"
  | "stock.adjust"
  | "stock.transfer"
  | "purchase.receive"
  | "warranty.create"
  | "warranty.claim_update"
  | "expense.create"
  | "user.role_change"
  | "settings.change";

export type AuditLog = {
  id: ID;
  action: AuditAction;
  actorUserId?: ID;
  actorName: string;
  actorRole: Role | "system";
  entityType: string;
  entityId: ID;
  branchId?: ID;
  summary: string;
  changedFields?: string[];
  createdAt: IsoDateTime;
};

/* ------------------------------------------------------------------ */
/* Database root                                                       */
/* ------------------------------------------------------------------ */

export type Database = {
  business: BusinessSettings;
  branches: Branch[];
  users: User[];
  customers: Customer[];
  devices: Device[];
  repairs: RepairJob[];
  repairEvents: RepairEvent[];
  repairParts: RepairPart[];
  diagnoses: Diagnosis[];
  estimates: Estimate[];
  approvals: CustomerApproval[];
  categories: ProductCategory[];
  products: Product[];
  inventory: InventoryBalance[];
  stockMovements: StockMovement[];
  stockReservations: StockReservation[];
  suppliers: Supplier[];
  purchaseOrders: PurchaseOrder[];
  goodsReceipts: GoodsReceipt[];
  sales: Sale[];
  invoices: Invoice[];
  payments: Payment[];
  refunds: Refund[];
  warranties: Warranty[];
  warrantyClaims: WarrantyClaim[];
  expenses: Expense[];
  cashSessions: CashSession[];
  notifications: Notification[];
  attachments: FileAttachment[];
  auditLogs: AuditLog[];
  /** Number sequence counters, keyed like "repair:2026". */
  sequences: Record<string, number>;
};

/** The signed-in identity. Mirrors the claims a production token would carry. */
export type Session = {
  userId: ID;
  role: Role;
  branchId: BranchRef;
  /** Active branch filter chosen in the top bar; admin only. */
  activeBranchId: ID | "all";
  customerId?: ID;
  loggedInAt: IsoDateTime;
};

export type PersistedState = {
  schemaVersion: number;
  db: Database;
  session: Session | null;
};
