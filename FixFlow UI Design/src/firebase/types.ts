import type { Timestamp } from 'firebase/firestore'

/**
 * Firestore document types for Fix Flow.
 *
 * Money is stored as an INTEGER number of cents, never a float and never a
 * display string. Field names match the specification exactly; only the unit
 * is pinned down. Use `formatLKR()` from `utils/formatters` at the edge.
 */
export type Cents = number

/**
 * The specification lists Customer / Technician / Admin. The existing UI ships
 * five roles and must not be redesigned, so all five are modelled here.
 * Manager and Cashier are branch-scoped staff: Manager behaves like a
 * branch-level admin, Cashier like a POS-only Technician-adjacent role.
 * See `ROLE_PERMISSIONS` below and firestore.rules.
 */
export const ROLES = ['customer', 'technician', 'cashier', 'manager', 'admin'] as const
export type Role = (typeof ROLES)[number]

/** The three roles named in the specification. */
export type CoreRole = Extract<Role, 'customer' | 'technician' | 'admin'>

export const isRole = (v: unknown): v is Role => typeof v === 'string' && (ROLES as readonly string[]).includes(v)

/**
 * Staff roles may read across the branch; only admins may manage users.
 * Kept in code AND mirrored in firestore.rules — the rules are the authority,
 * this map drives the UI so we never render an action the rules will reject.
 */
export const ROLE_PERMISSIONS: Record<Role, {
  isStaff: boolean
  canAssignTechnicians: boolean
  canManageUsers: boolean
  canManageParts: boolean
  canChangeAnyStatus: boolean
  branchScoped: boolean
}> = {
  customer:   { isStaff: false, canAssignTechnicians: false, canManageUsers: false, canManageParts: false, canChangeAnyStatus: false, branchScoped: false },
  technician: { isStaff: true,  canAssignTechnicians: false, canManageUsers: false, canManageParts: false, canChangeAnyStatus: false, branchScoped: true },
  cashier:    { isStaff: true,  canAssignTechnicians: false, canManageUsers: false, canManageParts: false, canChangeAnyStatus: false, branchScoped: true },
  manager:    { isStaff: true,  canAssignTechnicians: true,  canManageUsers: false, canManageParts: true,  canChangeAnyStatus: true,  branchScoped: true },
  admin:      { isStaff: true,  canAssignTechnicians: true,  canManageUsers: true,  canManageParts: true,  canChangeAnyStatus: true,  branchScoped: false },
}

export type UserStatus = 'active' | 'disabled'

/** `users/{uid}` */
export interface UserDoc {
  uid: string
  fullName: string
  email: string
  phone: string
  address: string
  /** Firebase Storage download URL. Only the URL is stored, never the bytes. */
  profileImage: string
  role: Role
  status: UserStatus
  /** Branch this user belongs to; 'all' for admins who span branches. */
  branchId: string
  createdAt: Timestamp | null
  updatedAt: Timestamp | null
}

export type DeviceCategory = 'laptop' | 'desktop' | 'mobile' | 'tablet' | 'other'

export const REPAIR_STATUSES = [
  'pending',
  'approved',
  'diagnosing',
  'repairing',
  'waiting_for_parts',
  'completed',
  'delivered',
  'cancelled',
] as const
export type RepairStatus = (typeof REPAIR_STATUSES)[number]

/** The eight statuses from the specification, in workflow order. */
export const REPAIR_STATUS_FLOW: RepairStatus[] = [
  'pending',
  'approved',
  'diagnosing',
  'repairing',
  'waiting_for_parts',
  'completed',
  'delivered',
]

/** Human labels matching the wording already used in the UI. */
export const REPAIR_STATUS_LABEL: Record<RepairStatus, string> = {
  pending: 'Pending',
  approved: 'Approved',
  diagnosing: 'Diagnosing',
  repairing: 'Repairing',
  waiting_for_parts: 'Waiting for Parts',
  completed: 'Completed',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
}

export type RepairPriority = 'low' | 'normal' | 'high' | 'urgent'

/** `repair_requests/{requestId}` */
export interface RepairRequestDoc {
  requestId: string
  customerId: string
  customerName: string
  customerPhone: string
  branchId: string
  deviceType: DeviceCategory
  brand: string
  model: string
  serialNumber: string
  issueDescription: string
  /** Storage download URLs for photos of the device / reported issue. */
  issueImages: string[]
  /** ISO date string (yyyy-mm-dd) chosen by the customer. */
  preferredDate: string
  priority: RepairPriority
  status: RepairStatus
  assignedTechnicianId: string
  createdAt: Timestamp | null
  updatedAt: Timestamp | null
}

/** `repair_diagnosis/{diagnosisId}` */
export interface RepairDiagnosisDoc {
  diagnosisId: string
  requestId: string
  /** Free-text symptoms captured from the technician or the AI intake form. */
  symptoms: string[]
  possibleProblems: string[]
  suggestedSolutions: string[]
  recommendedActions: string[]
  /** 0-100. Null when no AI model has produced a confidence score. */
  confidence: number | null
  technicianNotes: string
  /**
   * Where the diagnosis came from. 'ai' is reserved for a real model — the
   * adapter in `services/diagnosisService.ts` is the only place allowed to
   * set it, and it must be backed by an actual API call.
   */
  source: 'technician' | 'ai'
  createdAt: Timestamp | null
}

/** `repair_updates/{updateId}` — append-only timeline. */
export interface RepairUpdateDoc {
  updateId: string
  requestId: string
  status: RepairStatus
  message: string
  updatedBy: string
  updatedByName: string
  createdAt: Timestamp | null
}

export type TechnicianAvailability = 'available' | 'busy' | 'on_leave' | 'inactive'

/** `technicians/{technicianId}` */
export interface TechnicianDoc {
  technicianId: string
  /** Links to `users/{uid}`. */
  userId: string
  fullName: string
  specialization: string
  /** Years. */
  experience: number
  availability: TechnicianAvailability
  skills: string[]
  /** Storage download URLs for certificates / documents. */
  documents: string[]
  branchId: string
  status: UserStatus
  createdAt: Timestamp | null
  updatedAt: Timestamp | null
}

export type PartStatus = 'in_stock' | 'low_stock' | 'out_of_stock'

/** `spare_parts/{partId}` */
export interface SparePartDoc {
  partId: string
  partName: string
  category: string
  compatibleDevices: string[]
  /** Units on hand. Never negative — enforced by the service layer. */
  quantity: number
  /** Stock level at which the part is flagged for reorder. */
  minQuantity: number
  unitPrice: Cents
  supplier: string
  status: PartStatus
  createdAt: Timestamp | null
  updatedAt: Timestamp | null
}

/** `repair_requests/{requestId}/parts/{repairPartId}` — subcollection. */
export interface RepairPartDoc {
  requestId: string
  repairPartId: string
  partId: string
  partName: string
  quantity: number
  unitPrice: Cents
  /** Always `quantity * unitPrice`, recomputed server-side. */
  totalPrice: Cents
  addedBy: string
  createdAt: Timestamp | null
}

export type InvoiceStatus = 'draft' | 'issued' | 'paid' | 'partially_paid' | 'overdue' | 'cancelled'

/** `invoices/{invoiceId}` */
export interface InvoiceDoc {
  invoiceId: string
  requestId: string
  customerId: string
  branchId: string
  laborCost: Cents
  partsCost: Cents
  discount: Cents
  /** Percent, e.g. 18 for Sri Lanka standard VAT. */
  taxRate: number
  tax: Cents
  totalAmount: Cents
  /** Amount actually received, summed from `payments`. */
  amountPaid: Cents
  invoiceStatus: InvoiceStatus
  /** Storage download URL for the generated PDF, if any. */
  documentUrl: string
  createdAt: Timestamp | null
  updatedAt: Timestamp | null
}

export type PaymentMethod = 'cash' | 'card' | 'bank_transfer' | 'online'
export type PaymentStatus = 'pending' | 'paid' | 'failed' | 'refunded'

/** `payments/{paymentId}` */
export interface PaymentDoc {
  paymentId: string
  invoiceId: string
  requestId: string
  customerId: string
  amount: Cents
  paymentMethod: PaymentMethod
  paymentStatus: PaymentStatus
  /** Gateway reference. Empty for cash. */
  transactionId: string
  note: string
  paidAt: Timestamp | null
  createdAt: Timestamp | null
}

export const NOTIFICATION_EVENTS = [
  'repair_created',
  'repair_approved',
  'technician_assigned',
  'diagnosis_completed',
  'status_changed',
  'repair_completed',
  'payment_requested',
  'payment_completed',
] as const
export type NotificationEvent = (typeof NOTIFICATION_EVENTS)[number]

/** `users/{uid}/notifications/{notificationId}` — subcollection, per user. */
export interface NotificationDoc {
  notificationId: string
  /** Owner of the notification (a user uid). */
  userId: string
  event: NotificationEvent
  title: string
  body: string
  /** Deep link target inside the app, e.g. 'repair:FX-2026-004821'. */
  link: string
  requestId: string
  read: boolean
  createdAt: Timestamp | null
}

/** Aggregates for the admin dashboard — always computed, never stored. */
export interface DashboardStats {
  totalCustomers: number
  totalTechnicians: number
  activeRepairs: number
  completedRepairs: number
  pendingRepairs: number
  totalRevenue: Cents
  outstanding: Cents
  lowStockParts: number
}
