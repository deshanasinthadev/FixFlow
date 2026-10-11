/**
 * FixFlow domain model.
 *
 * This is the single source of truth for entity shapes. The local demo stores
 * these in IndexedDB; the future production backend stores the same shapes in
 * PostgreSQL/MySQL. Keeping them in one file is what makes the persistence
 * layer replaceable (§26).
 *
 * MONEY: always integer minor units (cents), never a float and never a display
 * string. §27 forbids floating-point money; `domain/calculations.ts` is the
 * only place arithmetic happens.
 *
 * DATES: always ISO 8601 UTC strings on the wire, rendered in Asia/Colombo.
 */

/** Integer minor units. 1850 = LKR 18.50. */
export type MinorUnits = number

export type ID = string

/** ISO 8601 timestamp. */
export type ISODate = string

// ---------------------------------------------------------------------------
// Business configuration (§3, §25)
// ---------------------------------------------------------------------------

export interface BusinessSettings {
  businessName: string
  logoUrl: string
  phone: string
  email: string
  address: string
  currency: 'LKR'
  timezone: string
  taxEnabled: boolean
  /** Percent, e.g. 15. Ignored when taxEnabled is false. */
  taxRate: number
  invoicePrefix: string
  estimatePrefix: string
  repairPrefix: string
  receiptFooter: string
  paymentMethods: PaymentMethodId[]
  language: 'en'
}

export interface Branch {
  id: ID
  name: string
  code: string
  phone: string
  address: string
  active: boolean
}

// ---------------------------------------------------------------------------
// People (§5, §23)
// ---------------------------------------------------------------------------

/** Four staff roles plus the customer portal (§5). */
export const STAFF_ROLES = ['admin', 'manager', 'technician', 'cashier'] as const
export type StaffRole = (typeof STAFF_ROLES)[number]
export type Role = StaffRole | 'customer'

export interface User {
  id: ID
  fullName: string
  email: string
  phone: string
  role: Role
  branchId: ID | 'all'
  active: boolean
  createdAt: ISODate
  updatedAt: ISODate
}

export interface TechnicianProfile {
  id: ID
  userId: ID
  specialization: string
  skills: string[]
  experienceYears: number
  available: boolean
}

// ---------------------------------------------------------------------------
// Customers and devices (§13, §14)
// ---------------------------------------------------------------------------

export interface Customer {
  id: ID
  code: string
  fullName: string
  phone: string
  email: string
  address: string
  notes: string
  /** Per §20: unguessable token for passwordless tracking. */
  portalToken: string
  status: 'active' | 'inactive'
  createdAt: ISODate
}

export type DeviceCategory = 'laptop' | 'desktop' | 'mobile' | 'tablet' | 'other'

export interface Device {
  id: ID
  customerId: ID
  category: DeviceCategory
  brand: string
  model: string
  serialNumber: string
  purchaseDate: ISODate | ''
  notes: string
  createdAt: ISODate
}

// ---------------------------------------------------------------------------
// Repairs (§7)
// ---------------------------------------------------------------------------

/** The workflow in §7, in order. `cancelled` sits outside the linear path. */
export const REPAIR_STATUSES = [
  'received',
  'diagnosing',
  'waiting_for_approval',
  'waiting_for_parts',
  'approved',
  'repairing',
  'testing',
  'completed',
  'ready_for_collection',
  'delivered',
  'cancelled',
] as const
export type RepairStatus = (typeof REPAIR_STATUSES)[number]

export type RepairPriority = 'low' | 'normal' | 'high' | 'urgent'

export interface RepairJob {
  id: ID
  /** Human-facing number, e.g. FX-2026-000123. */
  jobNumber: string
  branchId: ID
  customerId: ID
  deviceId: ID
  customerName: string
  phone: string
  email: string
  deviceSummary: string
  serialNumber: string
  reportedIssue: string
  deviceCondition: string
  accessoriesReceived: string[]
  intakePhotoUrls: string[]
  completionPhotoUrls: string[]
  priority: RepairPriority
  status: RepairStatus
  technicianId: ID | ''
  receivedAt: ISODate
  expectedCompletion: ISODate | ''
  internalNotes: string
  /** Updates the customer is allowed to see. */
  customerVisibleNotes: string[]
  /** Labour, minor units. */
  labourCost: MinorUnits
  createdAt: ISODate
  updatedAt: ISODate
}

export interface RepairStatusHistoryEntry {
  id: ID
  repairId: ID
  from: RepairStatus | ''
  to: RepairStatus
  byUserId: ID
  note: string
  at: ISODate
  /**
   * Monotonic per repair. Two status changes inside the same millisecond share
   * an `at` value, and an audit trail whose order depends on a sort tie-break
   * is not an audit trail (§28.17).
   */
  seq: number
}

export interface Diagnosis {
  id: ID
  repairId: ID
  technicianId: ID
  findings: string
  faultCause: string
  recommendedAction: string
  /** Distinguishes AI suggestions from technician-confirmed results (§8). */
  source: 'technician' | 'ai_rule_based' | 'ai_provider'
  /** Populated only when a real provider answered. Never fabricated. */
  providerLabel: string
  confidence: number | null
  createdAt: ISODate
}

export interface RepairNote {
  id: ID
  repairId: ID
  authorId: ID
  body: string
  /** Internal notes are never shown to the customer. */
  customerVisible: boolean
  createdAt: ISODate
}

export interface TestResult {
  id: ID
  repairId: ID
  checklist: { item: string; passed: boolean }[]
  testedBy: ID
  notes: string
  createdAt: ISODate
}

/** Parts consumed by a repair — the join between repairs and inventory. */
export interface RepairPartUsage {
  id: ID
  repairId: ID
  productId: ID
  productName: string
  quantity: number
  unitCost: MinorUnits
  addedBy: ID
  createdAt: ISODate
}

// ---------------------------------------------------------------------------
// Estimates and approvals (§9)
// ---------------------------------------------------------------------------

export const ESTIMATE_STATUSES = ['draft', 'sent', 'approved', 'rejected', 'expired', 'revised'] as const
export type EstimateStatus = (typeof ESTIMATE_STATUSES)[number]

export interface EstimateItem {
  id: ID
  productId: ID | ''
  description: string
  quantity: number
  unitPrice: MinorUnits
  lineTotal: MinorUnits
}

export interface Estimate {
  id: ID
  estimateNumber: string
  repairId: ID
  customerId: ID
  branchId: ID
  items: EstimateItem[]
  labourCost: MinorUnits
  discount: MinorUnits
  taxRate: number
  taxAmount: MinorUnits
  total: MinorUnits
  status: EstimateStatus
  notes: string
  /** Set when a revision supersedes this one (§9: preserve history). */
  supersededBy: ID | ''
  expiresAt: ISODate | ''
  createdAt: ISODate
}

export interface CustomerApproval {
  id: ID
  estimateId: ID
  repairId: ID
  customerId: ID
  decision: 'approved' | 'rejected'
  method: 'portal' | 'phone' | 'in_person' | 'email'
  recordedBy: ID
  note: string
  at: ISODate
}

// ---------------------------------------------------------------------------
// Products, stock, suppliers, purchasing (§11, §12)
// ---------------------------------------------------------------------------

export interface ProductCategory {
  id: ID
  name: string
}

export interface Product {
  id: ID
  sku: string
  barcode: string
  name: string
  description: string
  categoryId: ID
  brand: string
  model: string
  costPrice: MinorUnits
  sellingPrice: MinorUnits
  branchId: ID
  supplierId: ID | ''
  warrantyPolicyId: ID | ''
  /** Kept denormalised for cheap list rendering; derived, never authoritative. */
  quantityOnHand: number
  reservedQuantity: number
  minStockLevel: number
  active: boolean
  createdAt: ISODate
  updatedAt: ISODate
}

/** §11: every movement names its source transaction. */
export const STOCK_MOVEMENT_REASONS = [
  'opening_balance',
  'purchase_receipt',
  'sale',
  'sale_return',
  'repair_consumption',
  'repair_return',
  'manual_adjustment',
  'branch_transfer_out',
  'branch_transfer_in',
] as const
export type StockMovementReason = (typeof STOCK_MOVEMENT_REASONS)[number]

export interface StockMovement {
  id: ID
  productId: ID
  branchId: ID
  /** Positive adds stock, negative removes it. */
  quantityDelta: number
  reason: StockMovementReason
  /** The sale / purchase / repair this came from. */
  sourceType: 'sale' | 'purchase' | 'repair' | 'return' | 'transfer' | 'manual'
  sourceId: ID | ''
  quantityBefore: number
  quantityAfter: number
  note: string
  byUserId: ID
  at: ISODate
}

export interface StockReservation {
  id: ID
  productId: ID
  repairId: ID
  quantity: number
  createdAt: ISODate
}

export interface Supplier {
  id: ID
  name: string
  contactPerson: string
  phone: string
  email: string
  address: string
  notes: string
  /** Minor units owed to this supplier. Derived from purchases/payments. */
  balancePayable: MinorUnits
  createdAt: ISODate
}

export const PURCHASE_ORDER_STATUSES = ['draft', 'sent', 'partially_received', 'received', 'cancelled'] as const
export type PurchaseOrderStatus = (typeof PURCHASE_ORDER_STATUSES)[number]

export interface PurchaseOrderItem {
  id: ID
  productId: ID
  productName: string
  quantityOrdered: number
  quantityReceived: number
  unitCost: MinorUnits
}

export interface PurchaseOrder {
  id: ID
  poNumber: string
  supplierId: ID
  branchId: ID
  items: PurchaseOrderItem[]
  status: PurchaseOrderStatus
  supplierInvoiceNumber: string
  total: MinorUnits
  createdAt: ISODate
  receivedAt: ISODate | ''
}

// ---------------------------------------------------------------------------
// Sales, invoices, payments (§10, §15, §16)
// ---------------------------------------------------------------------------

export const PAYMENT_METHODS = ['cash', 'card', 'bank_transfer', 'other'] as const
export type PaymentMethodId = (typeof PAYMENT_METHODS)[number]

export interface SaleItem {
  id: ID
  productId: ID
  productName: string
  quantity: number
  unitPrice: MinorUnits
  unitCost: MinorUnits
  lineTotal: MinorUnits
}

export interface Sale {
  id: ID
  receiptNumber: string
  branchId: ID
  customerId: ID | ''
  /** '' means walk-in. */
  customerName: string
  items: SaleItem[]
  subtotal: MinorUnits
  discount: MinorUnits
  taxRate: number
  taxAmount: MinorUnits
  total: MinorUnits
  amountPaid: MinorUnits
  paymentMethod: PaymentMethodId
  cashierId: ID
  /** Set when this sale reverses an earlier one (§16, §28.6). */
  refundedFromSaleId: ID | ''
  /**
   * Caller-supplied key so a retried checkout cannot create a second sale
   * (§28.16). Empty for sales created without one.
   */
  idempotencyKey: string
  createdAt: ISODate
}

export const INVOICE_STATUSES = ['draft', 'issued', 'partially_paid', 'paid', 'cancelled'] as const
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number]

export interface Invoice {
  id: ID
  invoiceNumber: string
  branchId: ID
  customerId: ID
  repairId: ID | ''
  saleId: ID | ''
  items: EstimateItem[]
  labourCost: MinorUnits
  subtotal: MinorUnits
  discount: MinorUnits
  taxRate: number
  taxAmount: MinorUnits
  total: MinorUnits
  status: InvoiceStatus
  createdAt: ISODate
}

export const PAYMENT_STATUSES = ['pending', 'paid', 'failed', 'refunded'] as const
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number]

export interface Payment {
  id: ID
  invoiceId: ID
  customerId: ID
  branchId: ID
  amount: MinorUnits
  method: PaymentMethodId
  status: PaymentStatus
  reference: string
  receivedBy: ID
  paidAt: ISODate
  /**
   * Set on a reversal row: the payment it reverses. Empty on a normal payment.
   *
   * A refund reverses by appending a row with status 'refunded', never by
   * editing the original — `balanceDue` subtracts refunded rows back out, so
   * the two together net to zero and the original stays on the record.
   */
  reversesPaymentId: ID
}

export interface Refund {
  id: ID
  /** §28.6 — a refund must reference the original sale. */
  originalSaleId: ID
  invoiceId: ID | ''
  amount: MinorUnits
  reason: string
  approvedBy: ID
  createdAt: ISODate
}

// ---------------------------------------------------------------------------
// Warranties (§17)
// ---------------------------------------------------------------------------

export interface WarrantyPolicy {
  id: ID
  name: string
  /** Months of cover. 0 means no warranty. */
  durationMonths: number
  terms: string
  exclusions: string
  appliesTo: 'product' | 'repair_service' | 'component'
}

export const WARRANTY_STATUSES = ['active', 'expired', 'claimed', 'void'] as const
export type WarrantyStatus = (typeof WARRANTY_STATUSES)[number]

export interface Warranty {
  id: ID
  warrantyNumber: string
  policyId: ID
  customerId: ID
  productId: ID | ''
  repairId: ID | ''
  startsAt: ISODate
  expiresAt: ISODate
  status: WarrantyStatus
  createdAt: ISODate
}

export const WARRANTY_CLAIM_STATUSES = [
  'submitted',
  'under_inspection',
  'approved',
  'rejected',
  'in_progress',
  'resolved',
  'closed',
] as const
export type WarrantyClaimStatus = (typeof WARRANTY_CLAIM_STATUSES)[number]

export interface WarrantyClaim {
  id: ID
  claimNumber: string
  warrantyId: ID
  customerId: ID
  repairId: ID | ''
  reportedIssue: string
  findings: string
  resolution: string
  status: WarrantyClaimStatus
  decidedBy: ID | ''
  createdAt: ISODate
  decidedAt: ISODate | ''
}

// ---------------------------------------------------------------------------
// Finance, cash, notifications, audit (§18, §21, §23)
// ---------------------------------------------------------------------------

export const EXPENSE_CATEGORIES = [
  'rent',
  'electricity',
  'internet',
  'salaries',
  'transport',
  'tools',
  'consumables',
  'maintenance',
  'other',
] as const
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number]

export interface Expense {
  id: ID
  branchId: ID
  category: ExpenseCategory
  amount: MinorUnits
  description: string
  method: PaymentMethodId
  attachmentUrl: string
  spentAt: ISODate
  recordedBy: ID
  createdAt: ISODate
}

/**
 * A cart set aside mid-sale (§10 "hold/park"). Holding must not touch stock:
 * the goods are still on the shelf and still sellable, so a held cart reserves
 * nothing until it is completed.
 */
export interface HeldSale {
  id: ID
  branchId: ID
  cashierId: ID
  customerId: ID | ''
  customerName: string
  items: { productId: ID; quantity: number }[]
  /** Minor units. */
  discount: MinorUnits
  note: string
  createdAt: ISODate
}

export interface CashSession {
  id: ID
  branchId: ID
  cashierId: ID
  openingBalance: MinorUnits
  closingBalance: MinorUnits | null
  expectedClosingBalance: MinorUnits | null
  note: string
  openedAt: ISODate
  closedAt: ISODate | ''
}

export type NotificationKind =
  | 'new_repair'
  | 'repair_status'
  | 'estimate_approval_request'
  | 'repair_delayed'
  | 'parts_available'
  | 'low_stock'
  | 'payment_receipt'
  | 'outstanding_invoice'
  | 'warranty_expiry'
  | 'warranty_claim_update'

export interface AppNotification {
  id: ID
  kind: NotificationKind
  userId: ID | ''
  customerId: ID | ''
  title: string
  body: string
  link: string
  read: boolean
  createdAt: ISODate
}

/** §23 — audit entries never contain passwords, keys or other secrets. */
export interface AuditLogEntry {
  id: ID
  actorId: ID
  actorName: string
  action: string
  targetType: string
  targetId: ID
  /** Non-sensitive change summary only. */
  detail: string
  branchId: ID | ''
  at: ISODate
}
