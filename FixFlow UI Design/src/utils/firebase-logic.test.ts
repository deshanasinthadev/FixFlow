import { describe, expect, it } from 'vitest'
import {
  centsToInput,
  computeInvoice,
  computePartsCost,
  formatLKR,
  partStatusFor,
  toIsoDate,
} from './formatters'
import {
  isIsoDate,
  isValidEmail,
  isValidPhone,
  parseInteger,
  parseMoneyToCents,
  parsePercent,
  validateDiagnosis,
  validateInvoice,
  validatePayment,
  validateRepairRequest,
  validateSparePart,
  validateUser,
} from './validation'
import { ALLOWED_TRANSITIONS, canTransition } from '../services/repairService'
import { REPAIR_STATUSES, type RepairStatus } from '../firebase/types'

/**
 * These are the parts of the Firebase layer that are pure functions, so they
 * can be proven without a backend. Everything that touches Firestore itself
 * cannot be exercised from a sandbox with no network access to Google.
 */

// ---------------------------------------------------------------------------
// THE INVOICE FORMULA:  Total = Labor + Parts + Tax - Discount
// ---------------------------------------------------------------------------
describe('computeInvoice — Total = Labor + Parts + Tax - Discount', () => {
  it('applies the spec formula exactly', () => {
    // Rs 50 labor + Rs 100 parts, Rs 20 off, 18% VAT on the discounted base.
    const t = computeInvoice({ laborCost: 5000, partsCost: 10000, discount: 2000, taxRate: 18 })
    expect(t.subtotal).toBe(15000)
    expect(t.tax).toBe(2340) // 18% of 13000
    expect(t.totalAmount).toBe(15340)
    // Stated the way the spec states it:
    expect(t.laborCost + t.partsCost + t.tax - t.discount).toBe(t.totalAmount)
  })

  it('charges tax on the discounted subtotal, not the gross', () => {
    const t = computeInvoice({ laborCost: 10000, partsCost: 0, discount: 5000, taxRate: 18 })
    expect(t.tax).toBe(900) // 18% of 5000, not 18% of 10000
    expect(t.totalAmount).toBe(5900)
  })

  it('handles a zero-tax invoice', () => {
    const t = computeInvoice({ laborCost: 2500, partsCost: 2500, discount: 0, taxRate: 0 })
    expect(t.tax).toBe(0)
    expect(t.totalAmount).toBe(5000)
  })

  it('rounds half a cent up, once, at the tax step', () => {
    // 333 * 18% = 59.94 -> 60
    const t = computeInvoice({ laborCost: 333, partsCost: 0, discount: 0, taxRate: 18 })
    expect(t.tax).toBe(60)
    expect(t.totalAmount).toBe(393)
  })

  it('clamps a discount larger than the subtotal instead of going negative', () => {
    const t = computeInvoice({ laborCost: 1000, partsCost: 0, discount: 5000, taxRate: 18 })
    expect(t.discount).toBe(1000) // clamped to the subtotal
    expect(t.tax).toBe(0) // taxable base is 0
    expect(t.totalAmount).toBe(0)
  })

  it('clamps negative inputs to zero rather than storing nonsense', () => {
    const t = computeInvoice({ laborCost: -900, partsCost: -50, discount: -10, taxRate: 18 })
    expect(t.laborCost).toBe(0)
    expect(t.partsCost).toBe(0)
    expect(t.discount).toBe(0)
    expect(t.totalAmount).toBe(0)
  })

  it('clamps an out-of-range tax rate into 0-100', () => {
    expect(computeInvoice({ laborCost: 1000, partsCost: 0, discount: 0, taxRate: 150 }).taxRate).toBe(100)
    expect(computeInvoice({ laborCost: 1000, partsCost: 0, discount: 0, taxRate: -5 }).taxRate).toBe(0)
  })

  it('derives the invoice status from what has been paid', () => {
    const base = { laborCost: 10000, partsCost: 0, discount: 0, taxRate: 0 }
    expect(computeInvoice(base, 0).invoiceStatus).toBe('issued')
    expect(computeInvoice(base, 4000).invoiceStatus).toBe('partially_paid')
    expect(computeInvoice(base, 10000).invoiceStatus).toBe('paid')
    expect(computeInvoice(base, 20000).invoiceStatus).toBe('paid') // overpayment still reads paid
  })

  it('treats an all-zero invoice with nothing paid as a draft', () => {
    expect(computeInvoice({ laborCost: 0, partsCost: 0, discount: 0, taxRate: 18 }, 0).invoiceStatus).toBe('draft')
  })

  it('never reports a negative balance due', () => {
    const t = computeInvoice({ laborCost: 1000, partsCost: 0, discount: 0, taxRate: 0 }, 5000)
    expect(t.balanceDue).toBe(0)
  })

  it('formats the total as rupees at the edge', () => {
    const t = computeInvoice({ laborCost: 5000, partsCost: 10000, discount: 2000, taxRate: 18 })
    expect(formatLKR(t.totalAmount)).toContain('153.40')
    expect(centsToInput(t.totalAmount)).toBe('153.40')
  })
})

// ---------------------------------------------------------------------------
// Parts cost
// ---------------------------------------------------------------------------
describe('computePartsCost', () => {
  it('sums quantity * unitPrice across lines', () => {
    expect(computePartsCost([
      { quantity: 2, unitPrice: 1500 },
      { quantity: 1, unitPrice: 9000 },
    ])).toBe(12000)
  })

  it('returns 0 for an empty list', () => {
    expect(computePartsCost([])).toBe(0)
  })

  it('ignores negative quantities and prices', () => {
    expect(computePartsCost([{ quantity: -3, unitPrice: 1000 }, { quantity: 2, unitPrice: -500 }])).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// Stock status
// ---------------------------------------------------------------------------
describe('partStatusFor', () => {
  it('flags zero as out of stock', () => {
    expect(partStatusFor(0, 5)).toBe('out_of_stock')
  })
  it('flags at-or-below the reorder point as low', () => {
    expect(partStatusFor(5, 5)).toBe('low_stock')
    expect(partStatusFor(3, 5)).toBe('low_stock')
  })
  it('flags above the reorder point as in stock', () => {
    expect(partStatusFor(6, 5)).toBe('in_stock')
  })
})

// ---------------------------------------------------------------------------
// Money and integer parsing — two silent-corruption bugs live here as guards
// ---------------------------------------------------------------------------
describe('parseMoneyToCents', () => {
  it('reads a plain amount', () => {
    expect(parseMoneyToCents('1850')).toBe(185000)
  })
  it('strips a currency prefix — regression: "Rs. 1,850" once became 19 cents', () => {
    expect(parseMoneyToCents('Rs. 1,850')).toBe(185000)
    expect(parseMoneyToCents('LKR 1850')).toBe(185000)
  })
  it('handles decimals', () => {
    expect(parseMoneyToCents('12.5')).toBe(1250)
    expect(parseMoneyToCents('12.50')).toBe(1250)
  })
  it('accepts a number', () => {
    expect(parseMoneyToCents(18.5)).toBe(1850)
  })
  it('refuses anything ambiguous instead of guessing', () => {
    expect(parseMoneyToCents('abc')).toBeNull()
    expect(parseMoneyToCents('1.234')).toBeNull() // three decimals
    expect(parseMoneyToCents('')).toBeNull()
    expect(parseMoneyToCents(null)).toBeNull()
  })
})

describe('parseInteger', () => {
  it('regression: "1.5" must NOT become 15', () => {
    expect(parseInteger('1.5')).toBeNull()
  })
  it('reads whole numbers, including negatives', () => {
    expect(parseInteger('15')).toBe(15)
    expect(parseInteger('-3')).toBe(-3)
    expect(parseInteger(7)).toBe(7)
  })
  it('refuses non-integers', () => {
    expect(parseInteger('abc')).toBeNull()
    expect(parseInteger(1.5)).toBeNull()
  })
})

describe('parsePercent', () => {
  it('accepts 0-100', () => {
    expect(parsePercent('18')).toBe(18)
    expect(parsePercent('18%')).toBe(18)
    expect(parsePercent(0)).toBe(0)
  })
  it('rejects out of range', () => {
    expect(parsePercent('101')).toBeNull()
    expect(parsePercent('-1')).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Field validation
// ---------------------------------------------------------------------------
describe('isValidEmail / isValidPhone / isIsoDate', () => {
  it('validates emails', () => {
    expect(isValidEmail('nimal@example.com')).toBe(true)
    expect(isValidEmail('no-at-sign')).toBe(false)
    expect(isValidEmail('a@b')).toBe(false)
  })
  it('validates Sri Lankan phone numbers', () => {
    expect(isValidPhone('0771234567')).toBe(true)
    expect(isValidPhone('+94771234567')).toBe(true)
    expect(isValidPhone('0112345678')).toBe(true)
    expect(isValidPhone('123')).toBe(false)
    expect(isValidPhone('077123456')).toBe(false)
  })
  it('rejects impossible dates', () => {
    expect(isIsoDate('2026-03-18')).toBe(true)
    expect(isIsoDate('2026-02-30')).toBe(false)
    expect(isIsoDate('18/03/2026')).toBe(false)
  })
  it('formats a date back to yyyy-mm-dd', () => {
    expect(toIsoDate(new Date(2026, 2, 18))).toBe('2026-03-18')
  })
})

describe('validateUser', () => {
  const good = {
    fullName: 'Nimal Perera',
    email: 'nimal@example.com',
    phone: '0771234567',
    address: '12 Galle Road, Colombo',
    role: 'customer',
    status: 'active',
  }
  it('accepts a complete record', () => {
    expect(validateUser(good).ok).toBe(true)
  })
  it('collects every problem, not just the first', () => {
    const r = validateUser({ ...good, fullName: 'x', email: 'bad', phone: '1' })
    expect(r.ok).toBe(false)
    expect(Object.keys(r.errors).sort()).toEqual(['email', 'fullName', 'phone'])
  })
  it('rejects an unknown role', () => {
    expect(validateUser({ ...good, role: 'superadmin' }).errors.role).toBeTruthy()
  })
})

describe('validateRepairRequest', () => {
  const good = {
    customerId: 'uid-1',
    customerName: 'Nimal Perera',
    deviceType: 'laptop',
    brand: 'Dell',
    model: 'XPS 13',
    serialNumber: 'SN123',
    issueDescription: 'Screen flickers when the lid is opened.',
    preferredDate: '2026-03-20',
    priority: 'high',
  }
  it('accepts a complete request', () => {
    expect(validateRepairRequest(good).ok).toBe(true)
  })
  it('requires a meaningful issue description', () => {
    expect(validateRepairRequest({ ...good, issueDescription: 'broken' }).errors.issueDescription).toBeTruthy()
  })
  it('rejects an unknown device type', () => {
    expect(validateRepairRequest({ ...good, deviceType: 'toaster' }).errors.deviceType).toBeTruthy()
  })
})

describe('validateDiagnosis', () => {
  const good = {
    symptoms: ['Screen flickers'],
    possibleProblems: ['Loose display cable'],
    suggestedSolutions: ['Reseat the cable'],
    recommendedActions: ['Inspect hinge'],
    confidence: 80,
    technicianNotes: 'Reproduced on the bench.',
  }
  it('accepts a complete diagnosis', () => {
    expect(validateDiagnosis(good).ok).toBe(true)
  })
  it('requires at least one possible problem', () => {
    expect(validateDiagnosis({ ...good, possibleProblems: [] }).errors.possibleProblems).toBeTruthy()
  })
  it('rejects a confidence above 100', () => {
    expect(validateDiagnosis({ ...good, confidence: 140 }).errors.confidence).toBeTruthy()
  })
  it('allows a null confidence when no AI model reported one', () => {
    expect(validateDiagnosis({ ...good, confidence: null }).ok).toBe(true)
  })
})

describe('validateSparePart', () => {
  const good = { partName: 'SSD 512GB', category: 'Storage', quantity: '10', minQuantity: '2', unitPrice: '18500', supplier: 'Nanotek' }
  it('accepts a valid part', () => {
    expect(validateSparePart(good).ok).toBe(true)
  })
  it('rejects a fractional quantity — a stock level cannot be 1.5', () => {
    expect(validateSparePart({ ...good, quantity: '1.5' }).errors.quantity).toBeTruthy()
  })
  it('rejects a negative price', () => {
    expect(validateSparePart({ ...good, unitPrice: '-5' }).errors.unitPrice).toBeTruthy()
  })
})

describe('validateInvoice', () => {
  it('accepts a normal invoice', () => {
    expect(validateInvoice({ laborCost: '5000', partsCost: '10000', discount: '2000', taxRate: '18' }).ok).toBe(true)
  })
  it('refuses a discount larger than labor + parts', () => {
    const r = validateInvoice({ laborCost: '100', partsCost: '100', discount: '500', taxRate: '18' })
    expect(r.errors.discount).toBeTruthy()
  })
  it('refuses a tax rate above 100', () => {
    expect(validateInvoice({ laborCost: '100', partsCost: '0', discount: '0', taxRate: '180' }).errors.taxRate).toBeTruthy()
  })
})

describe('validatePayment', () => {
  it('accepts a valid cash payment', () => {
    expect(validatePayment({ amount: '15.00', paymentMethod: 'cash', paymentStatus: 'paid', remainingCents: 5000 }).ok).toBe(true)
  })
  it('refuses zero', () => {
    expect(validatePayment({ amount: '0', paymentMethod: 'cash', paymentStatus: 'paid', remainingCents: 5000 }).errors.amount).toBeTruthy()
  })
  it('refuses more than the outstanding balance', () => {
    expect(validatePayment({ amount: '90.00', paymentMethod: 'card', paymentStatus: 'paid', remainingCents: 5000 }).errors.amount).toBeTruthy()
  })
  it('refuses an unknown method', () => {
    expect(validatePayment({ amount: '100', paymentMethod: 'crypto', paymentStatus: 'paid', remainingCents: 5000 }).errors.paymentMethod).toBeTruthy()
  })
})

// ---------------------------------------------------------------------------
// Status workflow
// ---------------------------------------------------------------------------
describe('repair status transitions', () => {
  it('allows the documented forward path', () => {
    expect(canTransition('pending', 'approved')).toBe(true)
    expect(canTransition('approved', 'diagnosing')).toBe(true)
    expect(canTransition('diagnosing', 'repairing')).toBe(true)
    expect(canTransition('repairing', 'completed')).toBe(true)
    expect(canTransition('completed', 'delivered')).toBe(true)
  })

  it('blocks skipping steps', () => {
    expect(canTransition('pending', 'completed')).toBe(false)
    expect(canTransition('pending', 'delivered')).toBe(false)
    expect(canTransition('approved', 'delivered')).toBe(false)
  })

  it('allows cancelling from any non-terminal state', () => {
    (['pending', 'approved', 'diagnosing', 'repairing', 'waiting_for_parts'] as RepairStatus[]).forEach((s) => {
      expect(canTransition(s, 'cancelled')).toBe(true)
    })
  })

  it('treats delivered and cancelled as terminal', () => {
    REPAIR_STATUSES.forEach((to) => {
      expect(canTransition('delivered', to)).toBe(false)
      expect(canTransition('cancelled', to)).toBe(false)
    })
  })

  it('defines transitions for every status in the enum', () => {
    REPAIR_STATUSES.forEach((s) => {
      expect(ALLOWED_TRANSITIONS[s]).toBeDefined()
    })
  })

  it('never allows a repair to go back to pending', () => {
    REPAIR_STATUSES.filter((s) => s !== 'pending').forEach((from) => {
      expect(canTransition(from, 'pending')).toBe(false)
    })
  })

  it('lets a waiting-for-parts repair resume', () => {
    expect(canTransition('waiting_for_parts', 'repairing')).toBe(true)
  })
})
