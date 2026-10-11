import type { Role, StaffRole } from './types'

/**
 * Centralized authorization (§5, §28.14).
 *
 * One table, one predicate. Every screen asks `can(role, 'pos.refund')` rather
 * than inventing its own condition, so a capability can never be granted in
 * one place and forgotten in another.
 *
 * This is the DEMO's authority. In production the same table must be mirrored
 * by the backend — a browser check stops a misclick, not an attacker (§5).
 */

export const PERMISSIONS = [
  // Repairs
  'repair.view_all',
  'repair.view_assigned',
  'repair.create',
  'repair.assign_technician',
  'repair.change_status',
  'repair.approve_handover',
  'repair.record_diagnosis',
  'repair.record_parts',
  'repair.record_test',
  'repair.view_customer_details',
  // Estimates
  'estimate.create',
  'estimate.send',
  'estimate.record_approval',
  'estimate.revise',
  // POS
  'pos.operate',
  'pos.discount',
  'pos.refund',
  'pos.open_cash_session',
  'pos.close_cash_session',
  // Inventory
  'inventory.view',
  'inventory.edit_products',
  'inventory.adjust_stock',
  'inventory.transfer_branch',
  // Purchasing
  'purchasing.view',
  'purchasing.create_order',
  'purchasing.receive_goods',
  // Customers
  'customer.view_all',
  'customer.edit',
  // Finance
  'finance.view',
  'finance.record_payment',
  'finance.record_expense',
  'finance.view_profit',
  // Warranties
  'warranty.view',
  'warranty.create',
  'warranty.decide_claim',
  // Reports
  'reports.view',
  // Admin
  'admin.manage_branches',
  'admin.manage_users',
  'admin.manage_permissions',
  'admin.manage_settings',
  'admin.view_audit_log',
] as const

export type Permission = (typeof PERMISSIONS)[number]

type CapabilityMap = Record<StaffRole, readonly Permission[]>

const TECHNICIAN: readonly Permission[] = [
  'repair.view_assigned',
  'repair.change_status',
  'repair.record_diagnosis',
  'repair.record_parts',
  'repair.record_test',
  'repair.view_customer_details',
  'inventory.view',
]

const CASHIER: readonly Permission[] = [
  'pos.operate',
  'pos.open_cash_session',
  'pos.close_cash_session',
  'inventory.view',
  'customer.view_all',
  'finance.record_payment',
  'warranty.view',
]

const MANAGER: readonly Permission[] = [
  ...TECHNICIAN,
  'repair.view_all',
  'repair.create',
  'repair.assign_technician',
  'repair.approve_handover',
  'estimate.create',
  'estimate.send',
  'estimate.record_approval',
  'estimate.revise',
  'pos.operate',
  'pos.discount',
  'pos.refund',
  'pos.open_cash_session',
  'pos.close_cash_session',
  'inventory.edit_products',
  'inventory.adjust_stock',
  'inventory.transfer_branch',
  'purchasing.view',
  'purchasing.create_order',
  'purchasing.receive_goods',
  'customer.edit',
  'finance.view',
  'finance.record_payment',
  'finance.record_expense',
  'finance.view_profit',
  'warranty.create',
  'warranty.decide_claim',
  'reports.view',
]

const CAPABILITIES: CapabilityMap = {
  technician: TECHNICIAN,
  cashier: CASHIER,
  manager: MANAGER,
  // Admin holds everything (§5).
  admin: PERMISSIONS,
}

export const permissionsFor = (role: Role): readonly Permission[] =>
  role === 'customer' ? [] : CAPABILITIES[role] ?? []

export const can = (role: Role, permission: Permission): boolean =>
  permissionsFor(role).includes(permission)

/** Convenience for guards that need a sentence to show the user. */
export interface PermissionCheck {
  allowed: boolean
  reason: string
}

export const requirePermission = (role: Role, permission: Permission): PermissionCheck =>
  can(role, permission)
    ? { allowed: true, reason: '' }
    : { allowed: false, reason: `Your role (${role}) does not permit "${permission}".` }

/**
 * §22 — branch isolation. A manager or technician is confined to their branch;
 * an admin with branchId 'all' spans every branch.
 */
export const canAccessBranch = (role: Role, userBranchId: string, targetBranchId: string): boolean => {
  if (role === 'customer') return false
  if (role === 'admin') return userBranchId === 'all' || userBranchId === targetBranchId
  return userBranchId === targetBranchId
}

/**
 * §20 — a customer may only ever touch their own records. The portal token is
 * unguessable and is the only credential for passwordless tracking, so this
 * comparison is the whole authorization decision.
 */
export const canCustomerAccess = (
  suppliedToken: string,
  recordCustomerId: string,
  recordPortalToken: string,
): boolean => {
  if (!suppliedToken || !recordPortalToken) return false
  if (suppliedToken !== recordPortalToken) return false
  return !!recordCustomerId
}

/**
 * §5 — technicians must not automatically receive unrestricted financial or
 * administrative data. Used to strip fields rather than merely hide columns.
 */
export const TECHNICIAN_BLOCKED_FIELDS = [
  'costPrice',
  'supplierId',
  'balancePayable',
  'operatingResult',
  'grossProfit',
] as const

export const maySeeFinancials = (role: Role): boolean => can(role, 'finance.view')

/**
 * Which navigation groups a role may see. Kept here so the sidebar and the
 * router agree — a route a role cannot see must also be unreachable by typing
 * its hash.
 */
export const NAV_GROUPS_FOR_ROLE: Record<Role, string[]> = {
  admin: [
    'Overview', 'Repairs', 'Point of Sale', 'Inventory', 'Purchasing', 'Customers',
    'Finance', 'Invoices', 'Warranties', 'Reports', 'AI Assistant', 'Notifications',
    'Branches', 'Staff and Permissions', 'Audit Logs', 'Settings',
  ],
  manager: [
    'Overview', 'Repairs', 'Point of Sale', 'Inventory', 'Purchasing', 'Customers',
    'Finance', 'Invoices', 'Warranties', 'Reports', 'AI Assistant', 'Notifications', 'Settings',
  ],
  technician: ['Overview', 'Repairs', 'Inventory', 'AI Assistant', 'Notifications'],
  cashier: ['Overview', 'Point of Sale', 'Inventory', 'Customers', 'Invoices', 'Notifications'],
  customer: ['My Repairs', 'My Devices', 'Estimates', 'Invoices', 'Warranty', 'Notifications'],
}

export const canSeeNavGroup = (role: Role, group: string): boolean =>
  NAV_GROUPS_FOR_ROLE[role]?.includes(group) ?? false
