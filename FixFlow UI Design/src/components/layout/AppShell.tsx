import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useStore } from "../../app/store";
import { breadcrumbFor, navGroups } from "../../app/navigation";
import { navigate as go } from "../../app/router";
import { inBranchScope, scopeFor } from "../../domain/permissions";
import { formatMoney, initials, relativeTime } from "../../utils/format";
import { Badge, IconButton, Modal } from "../ui";
import { Icon } from "../ui/Icon";

/* ------------------------------------------------------------------ */
/* Page header                                                         */
/* ------------------------------------------------------------------ */

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="page-head">
      <div>
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {actions && <div className="head-actions">{actions}</div>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Branch selector                                                     */
/* ------------------------------------------------------------------ */

function BranchSelector() {
  const { db, session, setActiveBranch, can } = useStore();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  if (!session || session.role === "customer") return null;

  const branchLabel =
    session.activeBranchId === "all"
      ? "All branches"
      : (db.branches.find((branch) => branch.id === session.activeBranchId)?.name ?? "Select branch");

  // Only admins can widen the scope to every branch.
  const options =
    can("branches.manage") || session.branchId === "all"
      ? [{ id: "all" as const, name: "All branches" }, ...db.branches.filter((branch) => branch.isActive)]
      : db.branches.filter((branch) => branch.isActive && branch.id === session.branchId);

  if (options.length <= 1) {
    return (
      <div className="branch-select" aria-label="Branch">
        <span className="branch-icon">
          <Icon name="branch" size={15} />
        </span>
        <span>{branchLabel}</span>
      </div>
    );
  }

  return (
    <div className="branch-selector" ref={ref}>
      <button type="button" className="branch-select" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className="branch-icon">
          <Icon name="branch" size={15} />
        </span>
        <span>{branchLabel}</span>
        <Icon name="chevron" size={13} />
      </button>
      {open && (
        <div className="dropdown" role="menu">
          {options.map((branch) => (
            <button
              key={branch.id}
              type="button"
              role="menuitem"
              className={branch.id === session.activeBranchId ? "active" : ""}
              onClick={() => {
                setActiveBranch(branch.id);
                setOpen(false);
              }}
            >
              {branch.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Notifications                                                       */
/* ------------------------------------------------------------------ */

function NotificationsMenu() {
  const { db, session, actor } = useStore();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  const items = useMemo(() => {
    if (!session || !actor) return [];
    return db.notifications
      .filter((notification) => {
        const { audience } = notification;
        if (audience.userId) return audience.userId === session.userId;
        if (audience.role) {
          if (audience.role !== actor.role) return false;
          if (audience.branchId && session.activeBranchId !== "all") {
            return audience.branchId === session.activeBranchId;
          }
        }
        return true;
      })
      .slice(0, 20);
  }, [db.notifications, session, actor]);

  const unread = items.filter((item) => !item.readAt).length;

  return (
    <div className="topbar-menu" ref={ref}>
      <button
        type="button"
        className="icon-btn notification"
        onClick={() => setOpen(!open)}
        aria-label={`Notifications (${unread} unread)`}
        aria-expanded={open}
      >
        <Icon name="bell" />
        {unread > 0 && <span />}
      </button>
      {open && (
        <div className="dropdown wide" role="menu">
          <div className="dropdown-head">
            <strong>Notifications</strong>
            <span>{unread} unread</span>
          </div>
          {items.length === 0 && <p className="dropdown-empty">No notifications for you.</p>}
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              role="menuitem"
              className={`notification-row-item${item.readAt ? "" : " unread"}`}
              onClick={() => {
                if (item.link) go(item.link.id ? `${item.link.route}/${item.link.id}` : item.link.route);
                setOpen(false);
              }}
            >
              <strong>{item.title}</strong>
              <span>{item.body}</span>
              <small>{relativeTime(item.createdAt)}</small>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Profile menu                                                        */
/* ------------------------------------------------------------------ */

function ProfileMenu() {
  const { db, session, actor, logout, pushToast } = useStore();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  if (!session || !actor) return null;
  const user = db.users.find((item) => item.id === session.userId);
  const branchName =
    session.role === "customer"
      ? "Customer portal"
      : session.activeBranchId === "all"
        ? "All branches"
        : (db.branches.find((branch) => branch.id === session.activeBranchId)?.name ?? "—");

  return (
    <div className="topbar-menu" ref={ref}>
      <button type="button" className="profile" onClick={() => setOpen(!open)} aria-expanded={open} aria-haspopup="menu">
        <div className="avatar">{initials(actor.name)}</div>
        <div>
          <strong>{actor.name}</strong>
          <small>{actor.role}</small>
        </div>
        <Icon name="chevron" size={13} />
      </button>
      {open && (
        <div className="profile-menu" role="menu">
          <div className="profile-menu-head">
            <div className="avatar">{initials(actor.name)}</div>
            <div>
              <strong>{actor.name}</strong>
              <span>{user?.email}</span>
              <small>
                {actor.role} · {branchName}
              </small>
            </div>
          </div>
          <button type="button" role="menuitem" className="logout" onClick={() => { logout(); setOpen(false); }}>
            <Icon name="arrow" />
            Sign out
          </button>
          {session.role === "admin" && (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                void navigator.clipboard?.writeText(JSON.stringify(db)).then(
                  () => pushToast("success", "Demo database copied to clipboard."),
                  () => pushToast("error", "Clipboard access was blocked by the browser."),
                );
                setOpen(false);
              }}
            >
              <Icon name="copy" />
              Export demo data
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Global search                                                       */
/* ------------------------------------------------------------------ */

type SearchHit = { key: string; group: string; title: string; meta: string; path: string };

export function GlobalSearch({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { db, can, session } = useStore();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);

  useEffect(() => {
    if (open) {
      setQuery("");
      setActive(0);
    }
  }, [open]);

  const scope = scopeFor(session);

  const hits = useMemo<SearchHit[]>(() => {
    const term = query.trim().toLowerCase();
    if (!term) return [];
    const matches: SearchHit[] = [];
    const inScope = (branchId: string) => inBranchScope(scope, branchId);

    if (can("repairs.view")) {
      db.repairs
        .filter((repair) => inScope(repair.branchId))
        .filter((repair) =>
          `${repair.number} ${repair.customerName} ${repair.customerPhone} ${repair.device.brand} ${repair.device.model} ${repair.device.serial ?? ""}`
            .toLowerCase()
            .includes(term),
        )
        .slice(0, 6)
        .forEach((repair) =>
          matches.push({
            key: repair.id,
            group: "Repairs",
            title: `${repair.number} · ${repair.device.brand} ${repair.device.model}`,
            meta: `${repair.customerName} · ${repair.status.replace(/_/g, " ")}`,
            path: `/repairs/${repair.id}`,
          }),
        );
    }
    if (can("customers.view")) {
      db.customers
        .filter((customer) => `${customer.name} ${customer.phone} ${customer.email ?? ""}`.toLowerCase().includes(term))
        .slice(0, 5)
        .forEach((customer) =>
          matches.push({
            key: customer.id,
            group: "Customers",
            title: customer.name,
            meta: customer.phone,
            path: "/customers",
          }),
        );
    }
    if (can("inventory.view")) {
      db.products
        .filter((product) => `${product.name} ${product.sku} ${product.brand ?? ""}`.toLowerCase().includes(term))
        .slice(0, 5)
        .forEach((product) =>
          matches.push({
            key: product.id,
            group: "Products",
            title: product.name,
            meta: `${product.sku} · ${formatMoney(product.sellingPriceCents, db.business.currencySymbol)}`,
            path: "/inventory",
          }),
        );
    }
    if (can("invoices.view")) {
      db.invoices
        .filter((invoice) => inScope(invoice.branchId))
        .filter((invoice) => `${invoice.number} ${invoice.customerName}`.toLowerCase().includes(term))
        .slice(0, 5)
        .forEach((invoice) =>
          matches.push({
            key: invoice.id,
            group: "Invoices",
            title: `${invoice.number} · ${invoice.customerName}`,
            meta: formatMoney(invoice.totalCents, db.business.currencySymbol),
            path: "/invoices",
          }),
        );
    }
    if (can("devices.view")) {
      db.devices
        .filter((device) => `${device.brand} ${device.model} ${device.serial ?? ""}`.toLowerCase().includes(term))
        .slice(0, 5)
        .forEach((device) =>
          matches.push({
            key: device.id,
            group: "Devices",
            title: `${device.brand} ${device.model}`,
            meta: device.serial ?? "No serial",
            path: "/devices",
          }),
        );
    }
    if (can("purchasing.view")) {
      db.suppliers
        .filter((supplier) => supplier.name.toLowerCase().includes(term))
        .slice(0, 4)
        .forEach((supplier) =>
          matches.push({
            key: supplier.id,
            group: "Suppliers",
            title: supplier.name,
            meta: supplier.phone ?? "",
            path: "/purchasing/suppliers",
          }),
        );
    }
    if (can("warranties.view")) {
      db.warrantyClaims
        .filter((claim) => inScope(claim.branchId))
        .filter((claim) => `${claim.number} ${claim.customerName}`.toLowerCase().includes(term))
        .slice(0, 4)
        .forEach((claim) =>
          matches.push({
            key: claim.id,
            group: "Warranty claims",
            title: `${claim.number} · ${claim.customerName}`,
            meta: claim.status.replace(/_/g, " "),
            path: "/warranties/claims",
          }),
        );
    }
    return matches;
  }, [query, db, can, scope]);

  const selected = hits.length ? Math.min(active, hits.length - 1) : -1;

  const openHit = (index: number) => {
    const hit = hits[index];
    if (!hit) return;
    go(hit.path);
    onClose();
  };

  if (!open) return null;

  return (
    <Modal open={open} title="Search FixFlow" onClose={onClose} width={620}>
      <div className="command-input">
        <Icon name="search" />
        <input
          autoFocus
          value={query}
          aria-label="Search records"
          placeholder="Search repairs, customers, devices, invoices, products…"
          onChange={(event) => {
            setQuery(event.target.value);
            setActive(0);
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setActive(selected + 1 < hits.length ? selected + 1 : 0);
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              setActive(selected > 0 ? selected - 1 : Math.max(0, hits.length - 1));
            } else if (event.key === "Enter") {
              event.preventDefault();
              openHit(selected);
            }
          }}
        />
        <kbd>ESC</kbd>
      </div>
      {query.trim() && hits.length === 0 && <p className="dropdown-empty">No authorized records match “{query}”.</p>}
      {hits.length > 0 && (
        <div className="search-results">
          {hits.map((hit, index) => (
            <button
              key={`${hit.group}-${hit.key}`}
              type="button"
              className={index === selected ? "active" : ""}
              onMouseEnter={() => setActive(index)}
              onClick={() => openHit(index)}
            >
              <div>
                <strong>{hit.title}</strong>
                <small>{hit.meta}</small>
              </div>
              <Badge tone="in-stock">{hit.group}</Badge>
            </button>
          ))}
        </div>
      )}
      <div className="search-foot">
        <span>
          <kbd>↑</kbd>
          <kbd>↓</kbd> Navigate
        </span>
        <span>
          <kbd>↵</kbd> Open
        </span>
        <span className="search-scope">
          <Icon name="shield" size={12} />
          Results limited to your role and branch
        </span>
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* Shell                                                               */
/* ------------------------------------------------------------------ */

export function AppShell({
  children,
  path,
  recordLabel,
}: {
  children: ReactNode;
  path: string;
  recordLabel?: string;
}) {
  const { session, actor, db, can, resetDemo } = useStore();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [dark, setDark] = useState(false);

  const groups = useMemo(
    () => (actor ? navGroups(actor.role, (permission) => actor.permissions.has(permission)) : []),
    [actor],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  if (!session || !actor) return <>{children}</>;

  const crumbs = breadcrumbFor(actor.role, path, recordLabel);

  return (
    <div className={`${dark ? "app dark" : "app"}`}>
      <aside className={`sidebar${collapsed ? " collapsed" : ""}${mobileNav ? " mobile-open" : ""}`}>
        <div className="brand" onClick={() => go(actor.role === "customer" ? "/portal" : "/dashboard")}>
          <div className="logo">
            <Icon name="tool" size={19} />
          </div>
          {!collapsed && (
            <div>
              <strong>{db.business.name}</strong>
              <small>{actor.role === "customer" ? "Customer portal" : db.business.tagline}</small>
            </div>
          )}
          <button type="button" className="mobile-close" onClick={() => setMobileNav(false)} aria-label="Close menu">
            <Icon name="close" />
          </button>
        </div>

        <nav aria-label="Main navigation">
          {groups.map((group) => (
            <div className="nav-group" key={group.label}>
              {!collapsed && <div className="nav-label">{group.label}</div>}
              {group.items.map((item) => (
                <button
                  key={item.path}
                  type="button"
                  title={item.label}
                  className={`nav-item${path === item.path || path.startsWith(`${item.path}/`) ? " active" : ""}`}
                  onClick={() => go(item.path)}
                  aria-current={path === item.path ? "page" : undefined}
                >
                  <Icon name={item.icon} />
                  {!collapsed && <span>{item.label}</span>}
                  {!collapsed && item.planned && <em>P{item.phase}</em>}
                </button>
              ))}
            </div>
          ))}
        </nav>

        {actor.role !== "customer" && (
          <button type="button" className="collapse-btn" onClick={() => setCollapsed(!collapsed)}>
            <Icon name="chevron" />
            <span>{collapsed ? "" : "Collapse sidebar"}</span>
          </button>
        )}
      </aside>

      <div className="shell">
        <header className="topbar">
          <button type="button" className="icon-btn mobile-menu" onClick={() => setMobileNav(true)} aria-label="Open menu">
            <Icon name="menu" />
          </button>

          <button type="button" className="global-search" onClick={() => setSearchOpen(true)}>
            <Icon name="search" />
            <span>Search repairs, customers, invoices…</span>
            <kbd>⌘ K</kbd>
          </button>

          <div className="top-actions">
            <BranchSelector />
            <IconButton icon={dark ? "sun" : "moon"} label="Switch theme" onClick={() => setDark(!dark)} active={dark} />
            <NotificationsMenu />
            <ProfileMenu />
          </div>
        </header>

        <main>
          <div className="breadcrumb" aria-label="Breadcrumb">
            {crumbs.map((crumb, index) => (
              <span key={`${crumb}-${index}`}>
                {index > 0 && <Icon name="chevron" size={11} />}
                {crumb}
              </span>
            ))}
          </div>
          {children}
        </main>
      </div>

      {mobileNav && <div className="scrim" onClick={() => setMobileNav(false)} role="presentation" />}
      <GlobalSearch open={searchOpen} onClose={() => setSearchOpen(false)} />
      {can("settings.manage") && (
        <button type="button" className="demo-reset" onClick={resetDemo} title="Restore the seeded demo data">
          <Icon name="refresh" size={13} />
          Reset demo data
        </button>
      )}
    </div>
  );
}
