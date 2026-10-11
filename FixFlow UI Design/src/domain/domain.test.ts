import { describe, expect, it } from 'vitest'
import {
  addMonths,
  averageTurnaroundHours,
  availableQuantity,
  balanceDue,
  checkStockAvailability,
  computeDocument,
  daysUntil,
  estimateToInvoiceAmounts,
  grossProfit,
  invoiceStatusFor,
  isEstimateExpired,
  isLowStock,
  monthsBetween,
  operatingResult,
  purchaseOrderTotal,
  purchaseQuantityReceived,
  refundableAmount,
  saleCostOfGoods,
  saleRevenue,
  sumLines,
} from './calculations'
import {
  canDecideClaim,
  canRecordApproval,
  canStartWork,
  canTransitionClaim,
  canTransitionEstimate,
  canTransitionRepair,
  isPurchaseOrderReceivable,
  isOpenClaim,
  isTerminalRepair,
  mayPerformRepairTransition,
  nextRepairStatuses,
  purchaseOrderStatusFor,
  REPAIR_TRANSITIONS,
} from './workflows'
import {
  can,
  canAccessBranch,
  canCustomerAccess,
  canSeeNavGroup,
  maySeeFinancials,
  permissionsFor,
} from './permissions'
import { REPAIR_STATUSES, type RepairStatus } from './types'

/**
 * §28's business rules, as executable assertions. Each `it` names the rule it
 * enforces so a future reader can trace a failure back to the spec.
 */

// ---------------------------------------------------------------------------
// The document formula: Total = Labour + Parts - Discount + Tax
// ---------------------------------------------------------------------------
describe('computeDocument', () => {
  it('applies Total = Labour + Parts - Discount + Tax', () => {
    const d = computeDocument({ labourCost: 5000, partsCost: 10000, discount: 2000, taxRate: 15 })
    expect(d.gross).toBe(15000)
    expect(d.taxAmount).toBe(1950) // 15% of the discounted 13000
    expect(d.total).toBe(14950)
    expect(d.labourCost + d.partsCost - d.discount + d.taxAmount).toBe(d.total)
  })

  it('charges tax on the discounted base, not the gross', () => {
    expect(computeDocument({ labourCost: 10000, discount: 5000, taxRate: 15 }).taxAmount).toBe(750)
  })

  it('produces no tax when tax is disabled (§3 default)', () => {
    const d = computeDocument({ labourCost: 5000, partsCost: 10000, taxRate: 15 }, false)
    expect(d.taxRate).toBe(0)
    expect(d.taxAmount).toBe(0)
    expect(d.total).toBe(15000)
  })

  it('clamps a discount that exceeds the base instead of going negative', () => {
    const d = computeDocument({ labourCost: 1000, discount: 5000, taxRate: 15 })
    expect(d.discount).toBe(1000) // clamped to the gross, not 5000
    expect(d.subtotal).toBe(0) // taxable base is zero
    expect(d.taxAmount).toBe(0) // and so is the tax on it
    expect(d.total).toBe(0) // a 100% discount is a free job, not a negative one
  })

  it('applies a partial discount correctly', () => {
    const d = computeDocument({ labourCost: 1000, discount: 400, taxRate: 15 })
    expect(d.subtotal).toBe(600)
    expect(d.taxAmount).toBe(90)
    expect(d.total).toBe(690)
  })

  it('clamps negatives and out-of-range rates', () => {
    expect(computeDocument({ labourCost: -500 }).labourCost).toBe(0)
    expect(computeDocument({ labourCost: 1000, taxRate: 150 }).taxRate).toBe(100)
    expect(computeDocument({ labourCost: 1000, taxRate: -5 }).taxRate).toBe(0)
  })

  it('rounds half a cent up, once, at the tax step', () => {
    expect(computeDocument({ labourCost: 333, taxRate: 15 }).taxAmount).toBe(50) // 49.95
  })
})

describe('sumLines', () => {
  it('multiplies quantity by unit price', () => {
    expect(sumLines([{ quantity: 2, unitPrice: 1500 }, { quantity: 1, unitPrice: 9000 }])).toBe(12000)
  })
  it('is zero for nothing', () => {
    expect(sumLines([])).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// §28.1 / §28.3 — availability
// ---------------------------------------------------------------------------
describe('availability (§28.1, §28.3)', () => {
  it('Available = On Hand - Reserved', () => {
    expect(availableQuantity(10, 3)).toBe(7)
  })
  it('never reports negative availability when over-reserved', () => {
    expect(availableQuantity(2, 5)).toBe(0)
  })
  it('rejects a sale that exceeds what is available, naming the line', () => {
    const failures = checkStockAvailability(
      [{ productId: 'p1', productName: 'SSD 512GB', quantity: 5 }],
      { p1: 3 },
    )
    expect(failures).toHaveLength(1)
    expect(failures[0]).toMatchObject({ productName: 'SSD 512GB', requested: 5, available: 3 })
  })
  it('passes when stock is sufficient', () => {
    expect(checkStockAvailability([{ productId: 'p1', productName: 'x', quantity: 2 }], { p1: 2 })).toHaveLength(0)
  })
  it('treats a product with no known availability as unavailable', () => {
    expect(checkStockAvailability([{ productId: 'ghost', productName: 'x', quantity: 1 }], {})).toHaveLength(1)
  })
})

describe('isLowStock (§11)', () => {
  it('flags at or below the minimum', () => {
    expect(isLowStock(2, 2)).toBe(true)
    expect(isLowStock(1, 2)).toBe(true)
  })
  it('does not flag above the minimum', () => {
    expect(isLowStock(3, 2)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// §28.8 — outstanding balances
// ---------------------------------------------------------------------------
describe('balanceDue (§16, §28.8)', () => {
  it('subtracts only settled payments', () => {
    expect(balanceDue(10000, [{ amount: 3000, status: 'paid' }])).toBe(7000)
  })
  it('ignores pending and failed payments', () => {
    expect(balanceDue(10000, [{ amount: 3000, status: 'pending' }, { amount: 2000, status: 'failed' }])).toBe(10000)
  })
  it('adds a refunded payment back, so a refund cannot leave an invoice marked settled', () => {
    expect(balanceDue(10000, [{ amount: 3000, status: 'paid' }, { amount: 3000, status: 'refunded' }])).toBe(10000)
  })
  it('applies credits', () => {
    expect(balanceDue(10000, [{ amount: 2000, status: 'paid' }], 1000)).toBe(7000)
  })
  it('never returns a negative balance', () => {
    expect(balanceDue(10000, [{ amount: 20000, status: 'paid' }])).toBe(0)
  })
})

describe('invoiceStatusFor (§15)', () => {
  it('derives the status from what is still owed', () => {
    expect(invoiceStatusFor(10000, 10000)).toBe('issued')
    expect(invoiceStatusFor(10000, 4000)).toBe('partially_paid')
    expect(invoiceStatusFor(10000, 0)).toBe('paid')
  })
  it('treats a zero-value invoice as a draft', () => {
    expect(invoiceStatusFor(0, 0)).toBe('draft')
  })
})

// ---------------------------------------------------------------------------
// §28.4 / §28.5 — purchasing must not inflate stock
// ---------------------------------------------------------------------------
describe('purchasing (§28.4, §28.5)', () => {
  it('a draft purchase order cannot be received, so creating one cannot raise stock', () => {
    expect(isPurchaseOrderReceivable('draft')).toBe(false)
    expect(isPurchaseOrderReceivable('received')).toBe(false)
    expect(isPurchaseOrderReceivable('cancelled')).toBe(false)
  })
  it('only sent and partially-received orders may be received', () => {
    expect(isPurchaseOrderReceivable('sent')).toBe(true)
    expect(isPurchaseOrderReceivable('partially_received')).toBe(true)
  })
  it('counts only the quantity actually received', () => {
    expect(purchaseQuantityReceived([{ quantityReceived: 7 }, { quantityReceived: 0 }])).toBe(7)
  })
  it('ignores a negative received quantity', () => {
    expect(purchaseQuantityReceived([{ quantityReceived: -4 }])).toBe(0)
  })
  it('totals on the ORDERED quantity, not what arrived', () => {
    expect(purchaseOrderTotal([{ quantityOrdered: 10, unitCost: 500 }])).toBe(5000)
  })
  it('derives the order status from received vs ordered', () => {
    expect(purchaseOrderStatusFor(0, 10)).toBe('sent')
    expect(purchaseOrderStatusFor(7, 10)).toBe('partially_received')
    expect(purchaseOrderStatusFor(10, 10)).toBe('received')
  })
})

// ---------------------------------------------------------------------------
// §28.6 — refunds reference and are bounded by the original sale
// ---------------------------------------------------------------------------
describe('refundableAmount (§28.6)', () => {
  it('allows refunding up to what was paid', () => {
    expect(refundableAmount({ total: 10000, amountPaid: 4000 }, [])).toBe(4000)
  })
  it('subtracts refunds already issued', () => {
    expect(refundableAmount({ total: 10000, amountPaid: 10000 }, [{ amount: 3000 }])).toBe(7000)
  })
  it('cannot exceed the sale total even if overpaid', () => {
    expect(refundableAmount({ total: 10000, amountPaid: 15000 }, [])).toBe(10000)
  })
  it('refuses a second refund once fully refunded', () => {
    expect(refundableAmount({ total: 5000, amountPaid: 5000 }, [{ amount: 5000 }])).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// §18 — profit is not revenue minus purchases
// ---------------------------------------------------------------------------
describe('profit (§18)', () => {
  const sale = {
    subtotal: 10000,
    discount: 1000,
    taxAmount: 0,
    items: [{ quantity: 2, unitCost: 1000, unitPrice: 5000 }],
  }
  it('revenue is the discounted subtotal, excluding tax', () => {
    expect(saleRevenue(sale)).toBe(9000)
  })
  it('COGS uses line COST, never selling price', () => {
    expect(saleCostOfGoods(sale.items)).toBe(2000)
  })
  it('gross profit separates revenue from cost', () => {
    expect(grossProfit(sale)).toBe(7000)
  })
  it('operating result keeps expenses separate from COGS', () => {
    const r = operatingResult([sale], 3000)
    expect(r).toMatchObject({ revenue: 9000, costOfGoods: 2000, grossProfit: 7000, operatingExpenses: 3000, operatingResult: 4000 })
  })
  it('reports a loss rather than clamping to zero', () => {
    expect(operatingResult([sale], 20000).operatingResult).toBe(-13000)
  })
  it('handles no sales at all', () => {
    expect(operatingResult([], 0)).toMatchObject({ revenue: 0, grossProfit: 0, operatingResult: 0 })
  })
})

// ---------------------------------------------------------------------------
// §28.10 — repair status transitions
// ---------------------------------------------------------------------------
describe('repair transitions (§7, §28.10)', () => {
  it('allows the documented forward path', () => {
    const path: RepairStatus[] = [
      'received', 'diagnosing', 'waiting_for_approval', 'approved',
      'repairing', 'testing', 'completed', 'ready_for_collection', 'delivered',
    ]
    for (let i = 0; i < path.length - 1; i++) {
      expect(canTransitionRepair(path[i], path[i + 1])).toBe(true)
    }
  })

  it('blocks skipping steps', () => {
    expect(canTransitionRepair('received', 'delivered')).toBe(false)
    expect(canTransitionRepair('received', 'completed')).toBe(false)
    expect(canTransitionRepair('diagnosing', 'delivered')).toBe(false)
  })

  it('lets a failed test go back to repairing', () => {
    expect(canTransitionRepair('testing', 'repairing')).toBe(true)
  })

  it('lets a repair resume when parts arrive', () => {
    expect(canTransitionRepair('waiting_for_parts', 'repairing')).toBe(true)
  })

  it('allows cancelling from any non-terminal state', () => {
    REPAIR_STATUSES.filter((s) => !isTerminalRepair(s)).forEach((s) => {
      expect(canTransitionRepair(s, 'cancelled')).toBe(true)
    })
  })

  it('treats delivered and cancelled as terminal', () => {
    REPAIR_STATUSES.forEach((to) => {
      expect(canTransitionRepair('delivered', to)).toBe(false)
      expect(canTransitionRepair('cancelled', to)).toBe(false)
    })
  })

  it('never lets a job go back to received', () => {
    REPAIR_STATUSES.filter((s) => s !== 'received').forEach((from) => {
      expect(canTransitionRepair(from, 'received')).toBe(false)
    })
  })

  it('defines transitions for every status in the enum', () => {
    REPAIR_STATUSES.forEach((s) => expect(REPAIR_TRANSITIONS[s]).toBeDefined())
  })

  it('offers only legal next steps', () => {
    expect(nextRepairStatuses('received')).toEqual(['diagnosing', 'cancelled'])
    expect(nextRepairStatuses('delivered')).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// §28.9 — approval gate
// ---------------------------------------------------------------------------
describe('canStartWork (§7, §9, §28.9)', () => {
  it('blocks paid work with no approval and no exception', () => {
    const r = canStartWork('repairing', false, false)
    expect(r.allowed).toBe(false)
    expect(r.reason).toMatch(/not approved/i)
  })
  it('allows work once the customer has approved', () => {
    expect(canStartWork('repairing', true, false).allowed).toBe(true)
  })
  it('allows work under a recorded policy exception', () => {
    const r = canStartWork('repairing', false, true)
    expect(r.allowed).toBe(true)
    expect(r.reason).toMatch(/exception/i)
  })
  it('does not gate pre-approval stages', () => {
    expect(canStartWork('diagnosing', false, false).allowed).toBe(true)
    expect(canStartWork('waiting_for_approval', false, false).allowed).toBe(true)
  })
  it('gates testing and completion too', () => {
    expect(canStartWork('testing', false, false).allowed).toBe(false)
    expect(canStartWork('completed', false, false).allowed).toBe(false)
  })
})

describe('mayPerformRepairTransition (§5)', () => {
  it('lets a technician advance the work they own', () => {
    expect(mayPerformRepairTransition('technician', 'approved', 'repairing').allowed).toBe(true)
    expect(mayPerformRepairTransition('technician', 'repairing', 'testing').allowed).toBe(true)
  })
  it('stops a technician performing the handover', () => {
    expect(mayPerformRepairTransition('technician', 'ready_for_collection', 'delivered').allowed).toBe(false)
  })
  it('lets a manager do everything legal', () => {
    expect(mayPerformRepairTransition('manager', 'ready_for_collection', 'delivered').allowed).toBe(true)
  })
  it('rejects an illegal move even for an admin', () => {
    expect(mayPerformRepairTransition('admin', 'received', 'delivered').allowed).toBe(false)
  })
  it('rejects a cashier entirely', () => {
    expect(mayPerformRepairTransition('cashier', 'approved', 'repairing').allowed).toBe(false)
  })
  it('rejects a customer entirely', () => {
    expect(mayPerformRepairTransition('customer', 'approved', 'repairing').allowed).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// §9 — estimates
// ---------------------------------------------------------------------------
describe('estimate workflow (§9)', () => {
  it('moves draft -> sent -> decision', () => {
    expect(canTransitionEstimate('draft', 'sent')).toBe(true)
    expect(canTransitionEstimate('sent', 'approved')).toBe(true)
    expect(canTransitionEstimate('sent', 'rejected')).toBe(true)
  })
  it('never lets a customer decide on a draft', () => {
    expect(canRecordApproval('draft')).toBe(false)
    expect(canRecordApproval('sent')).toBe(true)
  })
  it('treats approved as final', () => {
    expect(canTransitionEstimate('approved', 'revised')).toBe(false)
    expect(canTransitionEstimate('approved', 'rejected')).toBe(false)
  })
  it('lets a rejected or expired estimate be revised rather than edited', () => {
    expect(canTransitionEstimate('rejected', 'revised')).toBe(true)
    expect(canTransitionEstimate('expired', 'revised')).toBe(true)
  })
  it('detects an expired estimate', () => {
    const past = new Date(Date.now() - 86_400_000).toISOString()
    expect(isEstimateExpired({ expiresAt: past, status: 'sent' })).toBe(true)
    expect(isEstimateExpired({ expiresAt: past, status: 'approved' })).toBe(false)
  })
  it('converts an estimate into invoice amounts without losing the discount', () => {
    const a = estimateToInvoiceAmounts({
      labourCost: 5000,
      items: [{ id: 'i', productId: '', description: 'SSD', quantity: 2, unitPrice: 1500, lineTotal: 3000 }],
      discount: 500,
      taxRate: 15,
    })
    expect(a).toEqual({ labourCost: 5000, partsCost: 3000, discount: 500, taxRate: 15 })
  })
})

// ---------------------------------------------------------------------------
// §17 — warranty claims
// ---------------------------------------------------------------------------
describe('warranty claims (§17)', () => {
  it('follows the documented path', () => {
    expect(canTransitionClaim('submitted', 'under_inspection')).toBe(true)
    expect(canTransitionClaim('under_inspection', 'approved')).toBe(true)
    expect(canTransitionClaim('approved', 'in_progress')).toBe(true)
    expect(canTransitionClaim('in_progress', 'resolved')).toBe(true)
    expect(canTransitionClaim('resolved', 'closed')).toBe(true)
  })
  it('cannot be decided before inspection', () => {
    expect(canTransitionClaim('submitted', 'approved')).toBe(false)
  })
  it('requires findings before a decision', () => {
    expect(canDecideClaim('under_inspection', 'Cracked panel')).toBe(true)
    expect(canDecideClaim('under_inspection', '   ')).toBe(false)
    expect(canDecideClaim('submitted', 'Cracked panel')).toBe(false)
  })
  it('recognises an open claim', () => {
    expect(isOpenClaim('in_progress')).toBe(true)
    expect(isOpenClaim('closed')).toBe(false)
    expect(isOpenClaim('rejected')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// §17 — warranty date maths
// ---------------------------------------------------------------------------
describe('warranty dates (§17)', () => {
  it('counts whole months', () => {
    expect(monthsBetween('2026-01-15', '2026-07-15')).toBe(6)
    expect(monthsBetween('2026-01-15', '2027-01-15')).toBe(12)
  })
  it('returns 0 for an unparseable date rather than NaN', () => {
    expect(monthsBetween('not-a-date', '2026-01-01')).toBe(0)
  })
  it('adds months', () => {
    expect(addMonths('2026-01-15', 12)).toBe('2027-01-15T00:00:00.000Z')
  })
  it('leaves an unparseable date untouched', () => {
    expect(addMonths('nope', 3)).toBe('nope')
  })
  it('counts days until expiry', () => {
    const inTenDays = new Date(Date.now() + 10 * 86_400_000).toISOString()
    expect(daysUntil(inTenDays)).toBe(10)
  })
  it('goes negative once expired', () => {
    expect(daysUntil(new Date(Date.now() - 5 * 86_400_000).toISOString())).toBeLessThan(0)
  })
})

// ---------------------------------------------------------------------------
// §19 — turnaround, and the "no data" case
// ---------------------------------------------------------------------------
describe('averageTurnaroundHours (§19)', () => {
  it('averages delivered jobs in hours', () => {
    const base = Date.parse('2026-03-01T00:00:00Z')
    const jobs = [
      { receivedAt: new Date(base).toISOString(), deliveredAt: new Date(base + 24 * 3600_000).toISOString() },
      { receivedAt: new Date(base).toISOString(), deliveredAt: new Date(base + 48 * 3600_000).toISOString() },
    ]
    expect(averageTurnaroundHours(jobs)).toBe(36)
  })
  it('returns null with nothing to measure, so the UI shows a dash not a false zero', () => {
    expect(averageTurnaroundHours([])).toBeNull()
  })
  it('ignores impossible negative durations', () => {
    const base = Date.parse('2026-03-01T00:00:00Z')
    expect(averageTurnaroundHours([
      { receivedAt: new Date(base).toISOString(), deliveredAt: new Date(base - 3600_000).toISOString() },
    ])).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// §28.14 — permissions and branch isolation
// ---------------------------------------------------------------------------
describe('permissions (§5, §28.14)', () => {
  it('gives an admin everything', () => {
    expect(can('admin', 'admin.manage_users')).toBe(true)
    expect(can('admin', 'finance.view_profit')).toBe(true)
  })
  it('blocks a technician from financial and administrative data', () => {
    expect(can('technician', 'finance.view')).toBe(false)
    expect(can('technician', 'finance.view_profit')).toBe(false)
    expect(can('technician', 'admin.manage_users')).toBe(false)
    expect(can('technician', 'pos.refund')).toBe(false)
  })
  it('lets a technician do the technical work', () => {
    expect(can('technician', 'repair.record_diagnosis')).toBe(true)
    expect(can('technician', 'repair.record_parts')).toBe(true)
    expect(can('technician', 'repair.view_all')).toBe(false)
  })
  it('lets a cashier operate the POS but not refund unilaterally', () => {
    expect(can('cashier', 'pos.operate')).toBe(true)
    expect(can('cashier', 'pos.refund')).toBe(false)
  })
  it('gives a customer no staff capability at all', () => {
    expect(permissionsFor('customer')).toEqual([])
    expect(maySeeFinancials('customer')).toBe(false)
  })
  it('grants a manager the financial view a technician lacks', () => {
    expect(maySeeFinancials('manager')).toBe(true)
    expect(maySeeFinancials('technician')).toBe(false)
  })
})

describe('branch isolation (§22)', () => {
  it('confines a manager to their own branch', () => {
    expect(canAccessBranch('manager', 'colombo', 'colombo')).toBe(true)
    expect(canAccessBranch('manager', 'colombo', 'kandy')).toBe(false)
  })
  it('lets an admin spanning all branches reach any branch', () => {
    expect(canAccessBranch('admin', 'all', 'kandy')).toBe(true)
  })
  it('confines a branch-scoped admin to that branch', () => {
    expect(canAccessBranch('admin', 'colombo', 'kandy')).toBe(false)
  })
  it('never lets a customer through the staff branch check', () => {
    expect(canAccessBranch('customer', 'colombo', 'colombo')).toBe(false)
  })
})

describe('customer portal access (§20)', () => {
  it('grants access only on an exact unguessable token match', () => {
    expect(canCustomerAccess('tok-abc', 'cust-1', 'tok-abc')).toBe(true)
  })
  it('rejects a wrong token', () => {
    expect(canCustomerAccess('tok-wrong', 'cust-1', 'tok-abc')).toBe(false)
  })
  it('rejects an empty or missing token on either side', () => {
    expect(canCustomerAccess('', 'cust-1', 'tok-abc')).toBe(false)
    expect(canCustomerAccess('tok-abc', 'cust-1', '')).toBe(false)
  })
  it('rejects a token match with no owning customer', () => {
    expect(canCustomerAccess('tok-abc', '', 'tok-abc')).toBe(false)
  })
})

describe('navigation by role (§5)', () => {
  it('hides administration from non-admins', () => {
    expect(canSeeNavGroup('admin', 'Audit Logs')).toBe(true)
    expect(canSeeNavGroup('manager', 'Audit Logs')).toBe(false)
    expect(canSeeNavGroup('technician', 'Audit Logs')).toBe(false)
  })
  it('keeps the cashier inside the POS', () => {
    expect(canSeeNavGroup('cashier', 'Point of Sale')).toBe(true)
    expect(canSeeNavGroup('cashier', 'Finance')).toBe(false)
  })
  it('gives a customer only portal groups', () => {
    expect(canSeeNavGroup('customer', 'My Repairs')).toBe(true)
    expect(canSeeNavGroup('customer', 'Inventory')).toBe(false)
  })
  it('returns false for an unknown group rather than throwing', () => {
    expect(canSeeNavGroup('admin', 'Nonexistent')).toBe(false)
  })
})
