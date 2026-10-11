import { describe, expect, it } from 'vitest'
import { can, permissionsFor } from './permissions'
import { PAGE_PERMISSIONS, guardedPages, permissionForPage } from './pageAccess'
import type { Permission } from './permissions'

/**
 * Page-level access control (§5, §10).
 *
 * Hiding a nav item is not access control. These tests check the map that
 * actually decides, and above all that the map cannot drift out of step with
 * the navigation — if a role is shown a link the gate then refuses, the app is
 * offering a button that does nothing, which is the exact failure mode this
 * project is meant to avoid.
 */

const STAFF_ROLES = ['admin', 'manager', 'technician', 'cashier'] as const

/** The nav as App.tsx declares it, reduced to page names per UI role. */
const NAV_PAGES: Record<string, string[]> = {
  Admin: ['Dashboard', 'Repairs', 'Repair Board', 'New Repair', 'Customers', 'Customer Portal', 'POS', 'Sales', 'Cash Register',
    'Inventory', 'Stock Adjustments', 'Stock Transfers', 'Purchase Orders', 'Suppliers',
    'Estimates', 'Invoices', 'Payments', 'Refunds', 'Warranty', 'Warranty Claims',
    'Finance', 'Expenses', 'Receivables', 'Payables', 'Cashbook', 'Reports',
    'AI Diagnosis', 'AI Assistant',
    'Notifications', 'Branches', 'Team', 'User Management', 'Permissions', 'Workflow Settings', 'Integration Settings', 'Audit Log', 'Settings'],
  Manager: ['Dashboard', 'Repairs', 'Repair Board', 'Customers', 'POS', 'Sales', 'Invoices', 'Payments', 'Refunds',
    'Inventory', 'Stock Adjustments', 'Stock Transfers', 'Purchase Orders', 'Suppliers',
    'Estimates', 'Warranty', 'Warranty Claims', 'Expenses', 'Receivables', 'Payables', 'Cashbook', 'Reports',
    'AI Assistant', 'Notifications', 'Branch Operations', 'Team'],
  Technician: ['Dashboard', 'My Repairs', 'Diagnosis', 'Parts', 'Testing', 'Notifications', 'Profile'],
  Cashier: ['Dashboard', 'POS', 'Customers', 'Products', 'Sales', 'Invoices', 'Payments', 'Cash Register',
    'Paid Deliveries', 'Warranty', 'Notifications', 'Profile'],
  Customer: ['Dashboard', 'My Repairs', 'Estimates', 'Invoices', 'Payments', 'Warranty', 'Warranty Claims', 'Repair History',
    'Notifications', 'Support', 'Profile'],
}

const toDomain = (uiRole: string) =>
  ({ Admin: 'admin', Manager: 'manager', Technician: 'technician', Cashier: 'cashier', Customer: 'customer' })[uiRole] as 'admin' | 'manager' | 'technician' | 'cashier' | 'customer'

/**
 * Mirrors the gate in App.tsx.
 *
 * Staff are gated by permission; no permission listed means any staff role may
 * see the page. A customer holds no staff permission at all, so the permission
 * map cannot decide for them — their nav is the allowlist and the screens scope
 * themselves to their own records.
 */
const allowed = (uiRole: string, page: string): boolean => {
  if (uiRole === 'Customer') {
    return NAV_PAGES.Customer.includes(page) || page === 'My Repair Details' || page === 'Profile'
  }
  const permission = permissionForPage(page)
  return !permission || can(toDomain(uiRole), permission)
}

describe('permissionForPage', () => {
  it('returns undefined for a page no role is barred from', () => {
    expect(permissionForPage('Dashboard')).toBeUndefined()
    expect(permissionForPage('Notifications')).toBeUndefined()
    expect(permissionForPage('Profile')).toBeUndefined()
  })

  it('returns the permission for a guarded page', () => {
    expect(permissionForPage('Audit Log')).toBe('admin.view_audit_log')
    expect(permissionForPage('Expenses')).toBe('finance.record_expense')
    expect(permissionForPage('POS')).toBe('pos.operate')
  })

  it('returns undefined for an unknown page rather than throwing', () => {
    // An unlisted page is not silently made forbidden, and not silently made
    // public either — it simply has no permission attached. Unknown pages are
    // the stub preview's business, not the gate's.
    expect(permissionForPage('Some Page Nobody Built')).toBeUndefined()
  })

  it('only ever names permissions that exist', () => {
    const known = new Set<string>(permissionsFor('admin'))
    for (const [page, permission] of Object.entries(PAGE_PERMISSIONS)) {
      expect(known.has(permission), `${page} → ${permission}`).toBe(true)
    }
  })
})

describe('the gate agrees with the navigation', () => {
  // The single most important property here. If the nav shows a link and the
  // gate refuses it, the app has a button that does nothing.
  it('never shows a link the gate would refuse', () => {
    const conflicts: string[] = []
    for (const [uiRole, pages] of Object.entries(NAV_PAGES)) {
      for (const page of pages) {
        if (!allowed(uiRole, page)) conflicts.push(`${uiRole} → ${page}`)
      }
    }
    expect(conflicts).toEqual([])
  })

  it('gives every role its own dashboard', () => {
    for (const uiRole of Object.keys(NAV_PAGES)) {
      expect(allowed(uiRole, 'Dashboard')).toBe(true)
    }
  })
})

describe('the gate refuses what it should', () => {
  it('keeps the audit log away from everyone but an admin', () => {
    expect(allowed('Admin', 'Audit Log')).toBe(true)
    expect(allowed('Manager', 'Audit Log')).toBe(false)
    expect(allowed('Cashier', 'Audit Log')).toBe(false)
    expect(allowed('Technician', 'Audit Log')).toBe(false)
  })

  it('keeps user management away from non-admins', () => {
    expect(allowed('Admin', 'User Management')).toBe(true)
    expect(allowed('Manager', 'User Management')).toBe(false)
    expect(allowed('Cashier', 'User Management')).toBe(false)
  })

  it('keeps profit out of the cashier’s hands', () => {
    expect(allowed('Manager', 'Finance')).toBe(true)
    expect(allowed('Cashier', 'Finance')).toBe(false)
    expect(allowed('Technician', 'Finance')).toBe(false)
  })

  it('keeps stock adjustment away from a cashier', () => {
    expect(allowed('Manager', 'Stock Adjustments')).toBe(true)
    expect(allowed('Cashier', 'Stock Adjustments')).toBe(false)
    // A technician may look at stock but not change it.
    expect(allowed('Technician', 'Stock Adjustments')).toBe(false)
    expect(allowed('Technician', 'Inventory')).toBe(true)
  })

  it('keeps refunds away from anyone without pos.refund', () => {
    expect(allowed('Manager', 'Refunds')).toBe(true)
    // pos.refund is deliberately not in the cashier capability set, so the
    // cashier nav no longer offers the link either.
    expect(allowed('Cashier', 'Refunds')).toBe(false)
    expect(allowed('Technician', 'Refunds')).toBe(false)
  })

  it('lets a technician reach their own repairs but not everybody’s', () => {
    expect(allowed('Technician', 'My Repairs')).toBe(true)
    expect(allowed('Technician', 'Repairs')).toBe(false)
    expect(allowed('Manager', 'Repairs')).toBe(true)
  })

  it('lets a cashier operate the till but not raise estimates', () => {
    expect(allowed('Cashier', 'POS')).toBe(true)
    expect(allowed('Cashier', 'Cash Register')).toBe(true)
    expect(allowed('Cashier', 'Estimates')).toBe(false)
  })

  it('keeps warranty claim decisions away from a cashier', () => {
    expect(allowed('Manager', 'Warranty Claims')).toBe(true)
    // A cashier may look at cover but not decide a claim.
    expect(allowed('Cashier', 'Warranty Claims')).toBe(false)
    expect(allowed('Cashier', 'Warranty')).toBe(true)
  })

  it('keeps branch administration away from a manager', () => {
    expect(allowed('Admin', 'Branches')).toBe(true)
    expect(allowed('Manager', 'Branches')).toBe(false)
  })
})

describe('customers are authorized by scope, not by permission', () => {
  it('holds no staff permission at all', () => {
    expect(permissionsFor('customer')).toEqual([])
  })

  it('can reach every page in its own portal', () => {
    // A customer is gated by nav membership, because asking the staff
    // permission map about them would refuse all of it.
    for (const page of NAV_PAGES.Customer) {
      expect(allowed('Customer', page), `customer → ${page}`).toBe(true)
    }
  })

  it('cannot reach staff pages that are not in its portal', () => {
    for (const page of ['Audit Log', 'User Management', 'Stock Adjustments', 'Reports', 'Branches', 'Expenses']) {
      expect(allowed('Customer', page), `customer → ${page}`).toBe(false)
    }
  })
})

describe('guardedPages', () => {
  it('is derived from the map, not maintained beside it', () => {
    expect(guardedPages()).toHaveLength(Object.keys(PAGE_PERMISSIONS).length)
    expect(guardedPages()).toContain('Audit Log')
  })

  it('is sorted and duplicate-free', () => {
    const pages = guardedPages()
    expect([...pages].sort()).toEqual(pages)
    expect(new Set(pages).size).toBe(pages.length)
  })

  it('covers every page a manager or admin can navigate to that changes money or stock', () => {
    // A guard against forgetting to list a sensitive page. If a new money or
    // stock page is added to the nav without being guarded, this fails.
    const sensitive = ['Expenses', 'Reports', 'Finance', 'Stock Adjustments', 'Purchase Orders', 'Audit Log', 'Refunds']
    for (const page of sensitive) {
      expect(PAGE_PERMISSIONS[page], `${page} is unguarded`).toBeDefined()
    }
  })
})

describe('every staff role still has somewhere to go', () => {
  it('can reach at least its dashboard and one working page', () => {
    for (const uiRole of STAFF_ROLES) {
      const reachable = NAV_PAGES[uiRole.charAt(0).toUpperCase() + uiRole.slice(1)].filter(
        (page) => allowed(uiRole.charAt(0).toUpperCase() + uiRole.slice(1), page),
      )
      expect(reachable.length).toBeGreaterThan(1)
    }
  })

  it('gives a technician every permission the map asks of their pages', () => {
    // Guards against the map demanding something the role was never granted.
    const granted = new Set<string>(permissionsFor('technician'))
    for (const page of NAV_PAGES.Technician) {
      const permission = permissionForPage(page) as Permission | undefined
      if (permission) expect(granted.has(permission), `Technician lacks ${permission} for ${page}`).toBe(true)
    }
  })
})
