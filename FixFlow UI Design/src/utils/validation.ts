import {
  REPAIR_STATUSES,
  ROLES,
  type DeviceCategory,
  type RepairPriority,
  type RepairStatus,
  type Role,
} from '../firebase/types'

/**
 * Validation is deliberately framework-free and side-effect free so it can be
 * unit tested and reused by forms, CSV import, and the service layer. Nothing
 * here touches Firebase — the service layer validates again before writing,
 * because a client-side check is a convenience, never a guarantee.
 */
export interface ValidationResult {
  ok: boolean
  /** Field name -> message. Empty when ok. */
  errors: Record<string, string>
}

const fail = (errors: Record<string, string>): ValidationResult => ({ ok: false, errors })
const pass = (): ValidationResult => ({ ok: true, errors: {} })

export const isNonEmptyString = (v: unknown, min = 1, max = 500): v is string =>
  typeof v === 'string' && v.trim().length >= min && v.trim().length <= max

/** Sri Lankan mobile/landline: optional +94, then 9 digits. */
const PHONE_RE = /^(?:\+94|0)(?:11|[1-9]\d)\d{7}$/

export const isValidEmail = (v: unknown): v is string =>
  typeof v === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim())

export const isValidPhone = (v: unknown): boolean =>
  typeof v === 'string' && PHONE_RE.test(v.replace(/[\s-]/g, ''))

export const isRole = (v: unknown): v is Role => typeof v === 'string' && (ROLES as readonly string[]).includes(v)

export const isRepairStatus = (v: unknown): v is RepairStatus =>
  typeof v === 'string' && (REPAIR_STATUSES as readonly string[]).includes(v)

export const isPositiveInt = (v: unknown): v is number => Number.isInteger(v) && (v as number) > 0

export const isNonNegativeInt = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 0

/** yyyy-mm-dd, and must be a real calendar date. */
export const isIsoDate = (v: unknown): v is string => {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false
  const [y, m, d] = v.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d))
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d
}

/**
 * Parses a money input to integer cents.
 *
 * Rejects rather than guesses: the earlier CSV importer silently turned
 * "Rs. 1,850" into 19 cents because a stray dot survived the filter, so a
 * leading alphabetic currency prefix is now stripped explicitly and anything
 * still ambiguous is refused.
 */
export const parseMoneyToCents = (v: unknown): number | null => {
  if (typeof v === 'number' && Number.isFinite(v)) return Math.round(v * 100)
  if (typeof v !== 'string') return null
  let s = v.trim()
  if (!s) return null
  s = s.replace(/^[a-z]{0,4}\.?\s*/i, '') // "Rs. 1850" / "LKR 1850"
  s = s.replace(/[,\s]/g, '')
  if (!/^-?\d+(\.\d{1,2})?$/.test(s)) return null
  return Math.round(Number(s) * 100)
}

/**
 * Parses an integer. Rejects decimals outright: an earlier version read "1.5"
 * as 15 and wrote a stock level ten times too high.
 */
export const parseInteger = (v: unknown): number | null => {
  if (typeof v === 'number' && Number.isInteger(v)) return v
  if (typeof v !== 'string') return null
  const s = v.trim()
  if (!/^-?\d+$/.test(s)) return null
  return Number(s)
}

/** Percent, clamped to 0-100. */
export const parsePercent = (v: unknown): number | null => {
  if (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 100) return v
  if (typeof v !== 'string') return null
  const s = v.trim().replace(/%$/, '')
  if (!/^\d+(\.\d{1,4})?$/.test(s)) return null
  const n = Number(s)
  return n >= 0 && n <= 100 ? n : null
}

const REQUIRED = (label: string) => `${label} is required.`

export interface UserFormInput {
  fullName: unknown
  email: unknown
  phone: unknown
  address: unknown
  role: unknown
  status: unknown
}

export const validateUser = (input: UserFormInput): ValidationResult => {
  const errors: Record<string, string> = {}
  if (!isNonEmptyString(input.fullName, 2, 120)) errors.fullName = 'Full name must be 2-120 characters.'
  if (!isValidEmail(input.email)) errors.email = 'Enter a valid email address.'
  if (!isNonEmptyString(input.phone) || !isValidPhone(input.phone)) errors.phone = 'Enter a valid Sri Lankan phone number.'
  if (input.address !== undefined && input.address !== '' && !isNonEmptyString(input.address, 5, 300)) {
    errors.address = 'Address must be 5-300 characters.'
  }
  if (!isRole(input.role)) errors.role = REQUIRED('Role')
  if (input.status !== 'active' && input.status !== 'disabled') errors.status = REQUIRED('Status')
  return Object.keys(errors).length ? fail(errors) : pass()
}

export interface RepairFormInput {
  customerId: unknown
  customerName: unknown
  deviceType: unknown
  brand: unknown
  model: unknown
  serialNumber?: unknown
  issueDescription: unknown
  preferredDate: unknown
  priority: unknown
}

export const DEVICE_CATEGORIES: DeviceCategory[] = ['laptop', 'desktop', 'mobile', 'tablet', 'other']
export const PRIORITIES: RepairPriority[] = ['low', 'normal', 'high', 'urgent']

export const validateRepairRequest = (input: RepairFormInput): ValidationResult => {
  const errors: Record<string, string> = {}
  if (!isNonEmptyString(input.customerId)) errors.customerId = REQUIRED('Customer')
  if (!isNonEmptyString(input.customerName, 2, 120)) errors.customerName = 'Customer name must be 2-120 characters.'
  if (!DEVICE_CATEGORIES.includes(input.deviceType as DeviceCategory)) errors.deviceType = REQUIRED('Device type')
  if (!isNonEmptyString(input.brand, 1, 60)) errors.brand = REQUIRED('Brand')
  if (!isNonEmptyString(input.model, 1, 80)) errors.model = REQUIRED('Model')
  if (input.serialNumber !== undefined && !isNonEmptyString(input.serialNumber, 1, 80)) {
    errors.serialNumber = 'Serial number must be 80 characters or fewer.'
  }
  if (!isNonEmptyString(input.issueDescription, 10, 2000)) {
    errors.issueDescription = 'Describe the issue in at least 10 characters.'
  }
  if (!isIsoDate(input.preferredDate)) errors.preferredDate = 'Choose a valid preferred date (yyyy-mm-dd).'
  if (!PRIORITIES.includes(input.priority as RepairPriority)) errors.priority = REQUIRED('Priority')
  return Object.keys(errors).length ? fail(errors) : pass()
}

export interface DiagnosisFormInput {
  symptoms: unknown
  possibleProblems: unknown
  suggestedSolutions: unknown
  recommendedActions: unknown
  confidence: unknown
  technicianNotes: unknown
}

const stringArray = (v: unknown, field: string, label: string, min: number, errors: Record<string, string>): void => {
  if (!Array.isArray(v) || v.length < min) {
    errors[field] = `Add at least ${min} ${label}.`
    return
  }
  if (!v.every((x) => isNonEmptyString(x, 1, 500))) errors[field] = `${label} entries must be 1-500 characters.`
}

export const validateDiagnosis = (input: DiagnosisFormInput): ValidationResult => {
  const errors: Record<string, string> = {}
  stringArray(input.symptoms, 'symptoms', 'symptoms', 1, errors)
  stringArray(input.possibleProblems, 'possibleProblems', 'possible problems', 1, errors)
  stringArray(input.suggestedSolutions, 'suggestedSolutions', 'suggested solutions', 1, errors)
  if (input.recommendedActions !== undefined && input.recommendedActions !== null) {
    if (!Array.isArray(input.recommendedActions) || !input.recommendedActions.every((x) => isNonEmptyString(x, 1, 500))) {
      errors.recommendedActions = 'Recommended actions must be short non-empty strings.'
    }
  }
  if (input.confidence !== null && input.confidence !== undefined && input.confidence !== '') {
    const c = parsePercent(input.confidence)
    if (c === null) errors.confidence = 'Confidence must be a number from 0 to 100.'
  }
  if (input.technicianNotes !== undefined && input.technicianNotes !== '' && !isNonEmptyString(input.technicianNotes, 1, 4000)) {
    errors.technicianNotes = 'Notes must be 4000 characters or fewer.'
  }
  return Object.keys(errors).length ? fail(errors) : pass()
}

export interface PartFormInput {
  partName: unknown
  category: unknown
  quantity: unknown
  minQuantity: unknown
  unitPrice: unknown
  supplier: unknown
}

export const validateSparePart = (input: PartFormInput): ValidationResult => {
  const errors: Record<string, string> = {}
  if (!isNonEmptyString(input.partName, 2, 120)) errors.partName = 'Part name must be 2-120 characters.'
  if (!isNonEmptyString(input.category, 1, 60)) errors.category = REQUIRED('Category')
  if (parseInteger(input.quantity) === null || !isNonNegativeInt(parseInteger(input.quantity))) {
    errors.quantity = 'Quantity must be a whole number.'
  }
  if (parseInteger(input.minQuantity) === null || !isNonNegativeInt(parseInteger(input.minQuantity))) {
    errors.minQuantity = 'Minimum quantity must be a whole number.'
  }
  const price = parseMoneyToCents(input.unitPrice)
  if (price === null || price < 0) errors.unitPrice = 'Enter a valid price.'
  if (input.supplier !== undefined && input.supplier !== '' && !isNonEmptyString(input.supplier, 2, 120)) {
    errors.supplier = 'Supplier must be 2-120 characters.'
  }
  // A part may legitimately start below its reorder point, so quantity <
  // minQuantity is not an error — it just gets flagged low_stock on write.
  return Object.keys(errors).length ? fail(errors) : pass()
}

export interface InvoiceFormInput {
  laborCost: unknown
  partsCost: unknown
  discount: unknown
  taxRate: unknown
}

export const validateInvoice = (input: InvoiceFormInput): ValidationResult => {
  const errors: Record<string, string> = {}
  const labor = parseMoneyToCents(input.laborCost)
  const parts = parseMoneyToCents(input.partsCost)
  const discount = parseMoneyToCents(input.discount ?? 0)
  const rate = parsePercent(input.taxRate ?? 0)
  if (labor === null || labor < 0) errors.laborCost = 'Enter a valid labor cost.'
  if (parts === null || parts < 0) errors.partsCost = 'Enter a valid parts cost.'
  if (discount === null || discount < 0) errors.discount = 'Enter a valid discount.'
  if (rate === null) errors.taxRate = 'Tax rate must be between 0 and 100.'
  if (labor !== null && parts !== null && discount !== null && discount > labor + parts) {
    errors.discount = 'Discount cannot exceed the labor + parts subtotal.'
  }
  return Object.keys(errors).length ? fail(errors) : pass()
}

export interface PaymentFormInput {
  amount: unknown
  paymentMethod: unknown
  paymentStatus: unknown
  /** Outstanding balance, already in integer cents. */
  remainingCents: unknown
}

export const PAYMENT_METHODS = ['cash', 'card', 'bank_transfer', 'online'] as const
export const PAYMENT_STATUSES = ['pending', 'paid', 'failed', 'refunded'] as const

export const validatePayment = (input: PaymentFormInput): ValidationResult => {
  const errors: Record<string, string> = {}
  const amount = parseMoneyToCents(input.amount)
  if (amount === null || amount <= 0) errors.amount = 'Enter an amount greater than zero.'
  else if (isNonNegativeInt(input.remainingCents) && amount > (input.remainingCents as number)) {
    errors.amount = 'Amount exceeds the outstanding balance.'
  }
  if (!(PAYMENT_METHODS as readonly string[]).includes(String(input.paymentMethod))) {
    errors.paymentMethod = REQUIRED('Payment method')
  }
  if (!(PAYMENT_STATUSES as readonly string[]).includes(String(input.paymentStatus))) {
    errors.paymentStatus = REQUIRED('Payment status')
  }
  // transactionId is optional for cash; the service layer records a local
  // reference so every payment row is still traceable.
  return Object.keys(errors).length ? fail(errors) : pass()
}
