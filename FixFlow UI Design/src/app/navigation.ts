import type { IconName } from "../components/ui/Icon";
import type { Permission } from "../domain/permissions";
import type { Role } from "../domain/types";

/**
 * Navigation configuration.
 *
 * `planned: true` marks modules that are wired into navigation but not built
 * yet — the shell renders an explicit "planned" screen for them instead of a
 * fake page, so the prototype never pretends a feature exists.
 */

export type NavItem = {
  label: string;
  path: string;
  icon: IconName;
  permission: Permission;
  planned?: boolean;
  /** Which roadmap phase delivers it (spec section 31). */
  phase?: number;
};

export type NavGroup = {
  label: string;
  items: NavItem[];
};

export const STAFF_NAV: NavGroup[] = [
  {
    label: "Overview",
    items: [{ label: "Dashboard", path: "/dashboard", icon: "grid", permission: "dashboard.view" }],
  },
  {
    label: "Repairs",
    items: [
      { label: "Repairs", path: "/repairs", icon: "tool", permission: "repairs.view" },
      { label: "Repair Board", path: "/repairs/board", icon: "board", permission: "repairs.view" },
      { label: "New Repair", path: "/repairs/new", icon: "plus", permission: "repairs.create" },
    ],
  },
  {
    label: "Point of Sale",
    items: [
      { label: "POS", path: "/pos", icon: "cart", permission: "pos.access", planned: true, phase: 2 },
      { label: "Sales History", path: "/sales", icon: "sale", permission: "pos.access", planned: true, phase: 2 },
    ],
  },
  {
    label: "Inventory",
    items: [
      { label: "Inventory", path: "/inventory", icon: "box", permission: "inventory.view", planned: true, phase: 2 },
      { label: "Stock Movements", path: "/inventory/movements", icon: "package", permission: "inventory.view", planned: true, phase: 2 },
    ],
  },
  {
    label: "Purchasing",
    items: [
      { label: "Suppliers", path: "/purchasing/suppliers", icon: "truck", permission: "purchasing.view", planned: true, phase: 2 },
      { label: "Purchase Orders", path: "/purchasing/orders", icon: "file", permission: "purchasing.view", planned: true, phase: 2 },
    ],
  },
  {
    label: "Customers",
    items: [
      { label: "Customers", path: "/customers", icon: "users", permission: "customers.view", planned: true, phase: 3 },
      { label: "Devices", path: "/devices", icon: "laptop", permission: "devices.view", planned: true, phase: 3 },
    ],
  },
  {
    label: "Finance",
    items: [
      { label: "Finance", path: "/finance", icon: "wallet", permission: "finance.view", planned: true, phase: 3 },
      { label: "Expenses", path: "/finance/expenses", icon: "receipt", permission: "finance.expenses", planned: true, phase: 3 },
    ],
  },
  {
    label: "Invoices",
    items: [
      { label: "Invoices", path: "/invoices", icon: "file", permission: "invoices.view", planned: true, phase: 3 },
      { label: "Payments", path: "/payments", icon: "card", permission: "payments.view", planned: true, phase: 3 },
    ],
  },
  {
    label: "Warranties",
    items: [
      { label: "Warranties", path: "/warranties", icon: "shield", permission: "warranties.view", planned: true, phase: 3 },
      { label: "Warranty Claims", path: "/warranties/claims", icon: "alert", permission: "warranties.view", planned: true, phase: 3 },
    ],
  },
  {
    label: "Reports",
    items: [{ label: "Reports", path: "/reports", icon: "chart", permission: "reports.view", planned: true, phase: 4 }],
  },
  {
    label: "AI Assistant",
    items: [
      { label: "AI Diagnosis", path: "/ai/diagnosis", icon: "brain", permission: "ai.diagnose", planned: true, phase: 4 },
      { label: "AI Assistant", path: "/ai/assistant", icon: "spark", permission: "ai.diagnose", planned: true, phase: 4 },
    ],
  },
  {
    label: "Notifications",
    items: [{ label: "Notifications", path: "/notifications", icon: "bell", permission: "notifications.view", planned: true, phase: 4 }],
  },
  {
    label: "Branches",
    items: [{ label: "Branches", path: "/branches", icon: "branch", permission: "branches.view", planned: true, phase: 4 }],
  },
  {
    label: "Staff and Permissions",
    items: [
      { label: "Staff and Permissions", path: "/staff", icon: "team", permission: "users.view", planned: true, phase: 4 },
      { label: "Audit Logs", path: "/audit", icon: "history", permission: "audit.view", planned: true, phase: 4 },
    ],
  },
  {
    label: "Settings",
    items: [{ label: "Settings", path: "/settings", icon: "settings", permission: "settings.view", planned: true, phase: 4 }],
  },
];

export const PORTAL_NAV: NavGroup[] = [
  {
    label: "My account",
    items: [
      { label: "Overview", path: "/portal", icon: "grid", permission: "portal.access" },
      { label: "My Repairs", path: "/portal/repairs", icon: "tool", permission: "portal.access", planned: true, phase: 4 },
      { label: "Estimates", path: "/portal/estimates", icon: "file", permission: "portal.approve_estimate", planned: true, phase: 4 },
      { label: "Invoices", path: "/portal/invoices", icon: "receipt", permission: "portal.access", planned: true, phase: 4 },
      { label: "Warranties", path: "/portal/warranties", icon: "shield", permission: "portal.claim_warranty", planned: true, phase: 4 },
    ],
  },
];

export function navForRole(role: Role): NavGroup[] {
  return role === "customer" ? PORTAL_NAV : STAFF_NAV;
}

export function navGroups(role: Role, hasPermission: (permission: Permission) => boolean): NavGroup[] {
  return navForRole(role)
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => hasPermission(item.permission)),
    }))
    .filter((group) => group.items.length > 0);
}

/** Resolves a breadcrumb trail for a path, e.g. /repairs/rep-0001. */
export function breadcrumbFor(role: Role, path: string, recordLabel?: string): string[] {
  const groups = navForRole(role);
  const [pathname] = path.split("?");
  const segments = pathname.split("/").filter(Boolean);
  const section = `/${segments[0] ?? ""}`;

  for (const group of groups) {
    for (const item of group.items) {
      if (item.path === section) {
        const trail = [group.label, item.label];
        if (segments[1]) trail.push(recordLabel ?? segments[1]);
        return trail;
      }
    }
  }
  if (segments[0] === "portal") return ["Customer portal", "Overview"];
  return ["Home"];
}
