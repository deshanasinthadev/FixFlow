import type { Permission } from '../domain/permissions'

/**
 * Which permission a page requires (§5, §10).
 *
 * Hiding a nav item is not access control — it only removes the link. A page
 * can still be reached by a stale bookmark, the search palette, a dashboard
 * card, or a URL typed by hand. This map is what actually decides, and it is
 * checked on every render rather than once at navigation time.
 *
 * A page absent from the map needs no permission. That is deliberate for the
 * handful of pages every signed-in role may see (Dashboard, Notifications,
 * Profile); it is not a way to make a sensitive page reachable by forgetting
 * to list it, because the guard below is the only thing that renders a page
 * and the map is the only source it consults.
 */
export const PAGE_PERMISSIONS: Record<string, Permission> = {
  // Repairs
  Repairs: 'repair.view_all',
  'Repair Board': 'repair.view_all',
  'New Repair': 'repair.create',
  'Repair Details': 'repair.view_all',
  'My Repairs': 'repair.view_assigned',
  'My Repair Details': 'repair.view_assigned',
  Diagnosis: 'repair.record_diagnosis',
  Testing: 'repair.record_test',
  'AI Diagnosis': 'repair.record_diagnosis',

  // Estimates and billing
  Estimates: 'estimate.create',
  Invoices: 'finance.record_payment',
  Payments: 'finance.record_payment',
  Refunds: 'pos.refund',
  Receivables: 'finance.view',

  // Point of sale
  POS: 'pos.operate',
  Sales: 'pos.operate',
  'Cash Register': 'pos.open_cash_session',

  // Inventory
  Inventory: 'inventory.view',
  Products: 'inventory.view',
  Parts: 'inventory.view',
  'Stock Adjustments': 'inventory.adjust_stock',
  'Stock Transfers': 'inventory.transfer_branch',
  'Purchase Orders': 'purchasing.create_order',
  Suppliers: 'purchasing.view',

  // Customers
  Customers: 'customer.view_all',

  // Finance
  Finance: 'finance.view_profit',
  Expenses: 'finance.record_expense',
  Payables: 'finance.view',
  Cashbook: 'finance.view',
  Reports: 'reports.view',

  // Warranty
  Warranty: 'warranty.view',
  'Warranty Claims': 'warranty.decide_claim',

  // Administration
  // `Branches` administers branch records, which is an admin act.
  // `Branch Operations` is a manager running their own branch — moving stock
  // between shelves is what they actually do there, so that is the permission
  // it asks for, not the right to create branches.
  Branches: 'admin.manage_branches',
  'Branch Operations': 'inventory.transfer_branch',
  // A manager sees the team because they assign technicians to jobs. They do
  // not get to create or delete accounts, which stays with
  // `admin.manage_users` on User Management.
  Team: 'repair.assign_technician',
  'User Management': 'admin.manage_users',
  Permissions: 'admin.manage_permissions',
  'Workflow Settings': 'admin.manage_settings',
  'Integration Settings': 'admin.manage_settings',
  Settings: 'admin.manage_settings',
  'Audit Log': 'admin.view_audit_log',

  // Customer portal
  'Customer Portal': 'customer.view_all',
  'Repair History': 'repair.view_assigned',
  'Paid Deliveries': 'pos.operate',
}

/** The permission a page needs, or undefined when any signed-in role may see it. */
export const permissionForPage = (page: string): Permission | undefined =>
  PAGE_PERMISSIONS[page]

/**
 * Every page the map covers, for tests and for the permissions screen.
 *
 * Kept as a function of the map rather than a second hand-written list, so the
 * two cannot drift apart.
 */
export const guardedPages = (): string[] => Object.keys(PAGE_PERMISSIONS).sort()
