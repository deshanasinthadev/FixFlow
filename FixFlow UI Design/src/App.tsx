import { useEffect, useMemo, useState } from "react";
import { Icon, type IconName } from "./components/Icon";
import { ProductsPage } from "./modules/products/ProductsPage";
import { CashRegisterPage } from "./modules/pos/CashRegisterPage";
import { SalesPage } from "./modules/pos/SalesPage";
import { EstimatesPage } from "./modules/estimates/EstimatesPage";
import { BillingPage } from "./modules/billing/BillingPage";
import { StockAdjustmentsPage } from "./modules/inventory/StockAdjustmentsPage";
import { CustomersPage } from "./modules/customers/CustomersPage";
import { ExpensesPage } from "./modules/finance/ExpensesPage";
import { ReportsPage } from "./modules/finance/ReportsPage";
import { deriveNotifications } from "./modules/notifications/derive";
import { toCsv } from "./csv/pipeline";
import { downloadText, stamp } from "./lib/download";
import { LOGIN_HASH, buildHash, readHash, writeHash } from "./app/routes";
import { useDb, useQuery } from "./db/store";
import { computeDocument } from "./domain/calculations";
import { formatLKR, formatLKRCompact } from "./lib/format";
import { nextRepairStatuses, mayPerformRepairTransition } from "./domain/workflows";
import { computeDashboardFigures, computeMoneyFigures, computeSeries, countOverdueRepairs, availableUnits, type DashboardFigures, type MoneyFigures, type SeriesPoint } from "./modules/dashboard/figures";
import { inspectionPlan, suggestDiagnosis, type DiagnosisResult } from "./modules/diagnosis/engine";
import type { RepairJob, RepairStatus, Sale , RepairPartUsage } from "./domain/types";
import type { Product } from "./db/schema";
import { scopeRepairsFor, technicianNames, toRepairRows, type RepairRow, STATUS_LABEL, PRIORITY_LABEL, formatEta, toDomainRole, boardColumns, customerProgress } from "./modules/repairs/repairView";

type Role = "Admin" | "Manager" | "Technician" | "Cashier" | "Customer";
type User = {
  id: string;
  customerId?: string;
  technicianId?: string;
  name: string;
  email: string;
  role: Role;
  branchId: string;
  branch: string;
};

const demoUsers: Record<Role, User> = {
  Admin: { id: "usr_admin", name: "Admin Perera", email: "admin@fixflow.com", role: "Admin", branchId: "all", branch: "All branches" },
  Manager: { id: "usr_manager", name: "Kaveesha Gehan", email: "manager@fixflow.com", role: "Manager", branchId: "br_colombo", branch: "Colombo 03" },
  Technician: { id: "usr_tech_1", technicianId: "usr_tech_1", name: "John Silva", email: "technician@fixflow.com", role: "Technician", branchId: "br_colombo", branch: "Colombo 03" },
  Cashier: { id: "usr_cashier", name: "Dinithi Perera", email: "cashier@fixflow.com", role: "Cashier", branchId: "br_colombo", branch: "Colombo 03" },
  Customer: { id: "cus_nimal", customerId: "cus_nimal", name: "Nimal Perera", email: "customer@fixflow.com", role: "Customer", branchId: "br_colombo", branch: "Colombo 03" },
};

const adminNav = [
  { label: "Overview", items: [["Dashboard", "grid"]] },
  { label: "Repairs", items: [["Repairs", "tool"], ["Repair Board", "board"], ["New Repair", "plus"]] },
  { label: "Sales & customers", items: [["Customers", "users"], ["Customer Portal", "users"], ["POS", "cart"], ["Sales", "sale"], ["Cash Register", "cash"]] },
  { label: "Inventory", items: [["Inventory", "box"], ["Stock Adjustments", "package"], ["Stock Transfers", "transfer"], ["Purchase Orders", "truck"], ["Suppliers", "users"]] },
  { label: "Billing", items: [["Estimates", "file"], ["Invoices", "file"], ["Payments", "card"], ["Refunds", "transfer"], ["Warranty", "shield"], ["Warranty Claims", "shield"]] },
  { label: "Finance", items: [["Finance", "wallet"], ["Expenses", "receipt"], ["Receivables", "cash"], ["Payables", "card"], ["Cashbook", "wallet"], ["Reports", "chart"]] },
  { label: "Intelligence", items: [["AI Diagnosis", "brain"], ["AI Assistant", "spark"]] },
  { label: "Administration", items: [["Notifications", "bell"], ["Branches", "branch"], ["Team", "team"], ["User Management", "users"], ["Permissions", "shield"], ["Workflow Settings", "settings"], ["Integration Settings", "settings"], ["Audit Log", "file"], ["Settings", "settings"]] },
] as const;



const roleNav: Record<Role, ReadonlyArray<{ label: string; items: ReadonlyArray<readonly [string, string]> }>> = {
  Admin: adminNav,
  Manager: [
    { label: "Branch overview", items: [["Dashboard", "grid"], ["Repairs", "tool"], ["Repair Board", "board"], ["Customers", "users"]] },
    { label: "Sales", items: [["POS", "cart"], ["Sales", "sale"], ["Invoices", "file"], ["Payments", "card"], ["Refunds", "transfer"]] },
    { label: "Stock", items: [["Inventory", "box"], ["Stock Adjustments", "package"], ["Stock Transfers", "transfer"], ["Purchase Orders", "truck"], ["Suppliers", "users"]] },
    { label: "Operations", items: [["Estimates", "file"], ["Warranty", "shield"], ["Warranty Claims", "shield"], ["Expenses", "receipt"], ["Receivables", "cash"], ["Payables", "card"], ["Cashbook", "wallet"], ["Reports", "chart"]] },
    { label: "Branch tools", items: [["AI Assistant", "spark"], ["Notifications", "bell"], ["Branch Operations", "branch"], ["Team", "team"]] },
  ],
  Technician: [
    { label: "My workspace", items: [["Dashboard", "grid"], ["My Repairs", "tool"], ["Diagnosis", "brain"], ["Parts", "package"], ["Testing", "check"]] },
    { label: "Account", items: [["Notifications", "bell"], ["Profile", "team"]] },
  ],
  Cashier: [
    { label: "Point of sale", items: [["Dashboard", "grid"], ["POS", "cart"], ["Customers", "users"], ["Products", "box"], ["Sales", "sale"], ["Invoices", "file"], ["Payments", "card"], ["Cash Register", "cash"], ["Refunds", "transfer"]] },
    { label: "Service", items: [["Paid Deliveries", "check"], ["Warranty", "shield"], ["Notifications", "bell"], ["Profile", "team"]] },
  ],
  Customer: [
    { label: "My account", items: [["Dashboard", "grid"], ["My Repairs", "tool"], ["Estimates", "file"], ["Invoices", "file"], ["Payments", "card"], ["Warranty", "shield"], ["Warranty Claims", "shield"], ["Repair History", "clock"]] },
    { label: "Help", items: [["Notifications", "bell"], ["Support", "phone"], ["Profile", "team"]] },
  ],
};


function Button({ children, kind = "primary", icon, onClick, disabled }: { children: React.ReactNode; kind?: "primary" | "secondary" | "ghost"; icon?: IconName; onClick?: () => void; disabled?: boolean }) {
  return <button className={`btn ${kind}`} onClick={onClick} disabled={disabled} aria-disabled={disabled || undefined}>{icon && <Icon name={icon} size={16} />}<span>{children}</span></button>;
}

function Badge({ children, tone }: { children: React.ReactNode; tone?: string }) {
  const t = tone || String(children).toLowerCase().replaceAll(" ", "-");
  return <span className={`badge ${t}`}><span className="badge-dot"/>{children}</span>;
}

function Card({ children, className = "", onClick }: { children: React.ReactNode; className?: string; onClick?: () => void }) {
  // A tile that opens its page is a button, so it is rendered as one for the
  // keyboard and screen readers rather than a div with a click handler.
  if (onClick) {
    return <button type="button" className={`card ${className} card-link`} onClick={onClick}>{children}</button>;
  }
  return <section className={`card ${className}`}>{children}</section>;
}

function App() {
  const [user, setUser] = useState<User | null>(() => {
    try {
      const stored = localStorage.getItem("fixflow-session");
      return stored ? JSON.parse(stored) as User : null;
    } catch {
      return null;
    }
  });
  const [page, setPage] = useState("Dashboard");
  /** Record identifier from the hash, e.g. a job number. Detail pages only. */
  const [param, setParam] = useState("");
  const [dark, setDark] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [analyzed, setAnalyzed] = useState(false);

  const currentNav = user ? roleNav[user.role] : [];
  const navPages = useMemo(() => currentNav.flatMap((group) => group.items.map(([label]) => label)), [currentNav]);
  const extraPages = user?.role === "Admin" || user?.role === "Manager" ? ["Repair Details", "New Repair", "Profile"] : user?.role === "Technician" ? ["Repair Details", "Profile"] : user?.role === "Customer" ? ["My Repair Details", "Profile"] : ["Profile"];
  const allowedPages = [...navPages, ...extraPages];
  // §6 — every figure on these screens derives from saved records.
  const { data: repairData, loading: repairsLoading, error: repairsError } = useQuery(
    async (d) => ({
      jobs: await d.repairs.list(),
      users: await d.users.list(),
      sales: await d.sales.list(),
      products: await d.products.list(),
      invoices: await d.invoices.list(),
      expenses: await d.expenses.list(),
    }),
    [],
  );
  /** Scoped to what this role may see, so no figure leaks another branch. */
  const scopedJobs = useMemo<RepairJob[]>(() => {
    if (!user || !repairData) return [];
    return scopeRepairsFor(repairData.jobs, {
      role: user.role,
      customerId: user.customerId,
      technicianId: user.technicianId,
      branchId: user.branchId,
    });
  }, [user, repairData]);
  const scopedRepairs = useMemo<RepairRow[]>(
    () => toRepairRows(scopedJobs, { technicians: technicianNames(repairData?.users ?? []) }),
    [scopedJobs, repairData],
  );
  // Both labels come from the clock. The hardcoded "Monday, March 18" was also
  // simply wrong — 18 March 2026 is a Wednesday.
  const now = new Date()
  const todayLabel = now.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })
  const shortDateLabel = now.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })

  /** §24 — the repairs list as CSV, from the rows actually on screen. */
  const exportRepairs = () => {
    if (!scopedRepairs.length) return
    const headers = ["Repair ID", "Customer", "Device", "Technician", "Status", "Priority", "Amount", "ETA"]
    const rows = scopedRepairs.map((r) => ({
      "Repair ID": r.id, Customer: r.customer, Device: r.device, Technician: r.tech,
      Status: r.status, Priority: r.priority, Amount: r.amount, ETA: r.eta,
    }))
    downloadText(stamp("fixflow-repairs", "csv"), toCsv(headers, rows))
  }

  /** §6 — every dashboard figure derives from saved records. */
  const scopedSales = useMemo<Sale[]>(() => {
    const all = repairData?.sales ?? [];
    const branchId = user?.role === "Admin" ? "" : user?.branchId ?? "";
    return branchId ? all.filter((sale) => sale.branchId === branchId) : all;
  }, [repairData, user]);
  const scopedProducts = useMemo<Product[]>(() => {
    const all = repairData?.products ?? [];
    const branchId = user?.role === "Admin" ? "" : user?.branchId ?? "";
    return branchId ? all.filter((product) => product.branchId === branchId) : all;
  }, [repairData, user]);
  const scopedInvoices = useMemo(() => {
    const all = repairData?.invoices ?? [];
    const branchId = user?.role === "Admin" ? "" : user?.branchId ?? "";
    return branchId ? all.filter((invoice) => invoice.branchId === branchId) : all;
  }, [repairData, user]);
  const scopedExpenses = useMemo(() => {
    const all = repairData?.expenses ?? [];
    const branchId = user?.role === "Admin" ? "" : user?.branchId ?? "";
    return branchId ? all.filter((expense) => expense.branchId === branchId) : all;
  }, [repairData, user]);
  /** §1 — money tiles and the chart series, all from saved records. */
  const money = useMemo(
    () => computeMoneyFigures({ sales: scopedSales, invoices: scopedInvoices, expenses: scopedExpenses }),
    [scopedSales, scopedInvoices, scopedExpenses],
  );
  const weekSeries = useMemo(
    () => computeSeries({ sales: scopedSales, invoices: scopedInvoices, expenses: scopedExpenses }, "day", 7),
    [scopedSales, scopedInvoices, scopedExpenses],
  );
  const monthSeries = useMemo(
    () => computeSeries({ sales: scopedSales, invoices: scopedInvoices, expenses: scopedExpenses }, "month", 6),
    [scopedSales, scopedInvoices, scopedExpenses],
  );
  const overdueRepairs = useMemo(() => countOverdueRepairs(scopedJobs), [scopedJobs]);
  /**
   * The low-stock list the dashboard shows. Computed from available units, not
   * stock on hand: stock reserved for a repair is not sellable, so a warning
   * based on the raw figure would arrive after the shelf is already promised
   * (§28.3).
   */
  const lowStockItems = useMemo(
    () => scopedProducts
      .filter((product) => availableUnits(product) <= product.minStock)
      .sort((a, b) => availableUnits(a) - availableUnits(b)),
    [scopedProducts],
  );
  /** Real counts per status, replacing the hardcoded donut figures. */
  const statusCounts = useMemo<Array<[string, number, string]>>(() => {
    const groups: Array<[string, string[], string]> = [
      ["In progress", ["diagnosing", "approved", "repairing"], "purple"],
      ["Testing", ["testing"], "blue"],
      ["Ready for pickup", ["ready_for_collection"], "cyan"],
      ["Awaiting approval", ["waiting_for_approval"], "pink"],
      ["Waiting for parts", ["waiting_for_parts"], "amber"],
    ];
    return groups.map(([label, statuses, tone]) => [
      label,
      scopedJobs.filter((job) => statuses.includes(job.status)).length,
      tone,
    ]);
  }, [scopedJobs]);
  const recentSales = useMemo(
    () => [...scopedSales].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).slice(0, 5),
    [scopedSales],
  );
  const figures = useMemo(
    () => computeDashboardFigures({ repairs: scopedJobs, sales: scopedSales, products: scopedProducts }),
    [scopedJobs, scopedSales, scopedProducts],
  );

  // §2 — hash-based routing. A hash never reaches the server, so reload and
  // shared links work on any static host without a rewrite rule.
  const routeFor = (to: string, activeUser = user, nextParam = "") =>
    activeUser ? buildHash(activeUser.role, to, nextParam) : LOGIN_HASH;
  const navigate = (to: string, nextParam = "") => {
    if (!user || ![...allowedPages, "Dashboard"].includes(to)) {
      to = "Dashboard";
      nextParam = "";
    }
    setPage(to);
    setParam(nextParam);
    setMobileNav(false);
    setProfileOpen(false);
    writeHash(routeFor(to, user, nextParam));
  };
  const login = (nextUser: User, remember: boolean) => {
    setUser(nextUser);
    setPage("Dashboard");
    if (remember) localStorage.setItem("fixflow-session", JSON.stringify(nextUser));
    else localStorage.removeItem("fixflow-session");
    // Replace, so Back cannot land on the login route again.
    writeHash(routeFor("Dashboard", nextUser), true);
  };
  const logout = () => {
    localStorage.removeItem("fixflow-session");
    setUser(null);
    setPage("Dashboard");
    setProfileOpen(false);
    writeHash(LOGIN_HASH, true);
  };

  useEffect(() => {
    /**
     * Reconciles the page state with the URL.
     *
     * A route the signed-in role is not allowed to see is redirected rather
     * than rendered — typing `#/admin/audit-logs` into the address bar must
     * not bypass the sidebar, because hiding a nav item is not access control.
     */
    const guardHashRoute = () => {
      if (!user) {
        writeHash(LOGIN_HASH, true);
        return;
      }
      const target = readHash();
      if (target && target.role !== "login" && [...allowedPages, "Dashboard"].includes(target.page)) {
        if (target.page !== page) setPage(target.page);
        if (target.param !== param) setParam(target.param);
        return;
      }
      writeHash(routeFor(page), true);
    };
    guardHashRoute();
    window.addEventListener("hashchange", guardHashRoute);
    return () => window.removeEventListener("hashchange", guardHashRoute);
  }, [user, allowedPages.join("|")]);

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen(true);
      }
      if (event.key === "Escape") {
        setSearchOpen(false);
        setProfileOpen(false);
      }
    };
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, []);

  if (!user) return <Login dark={dark} setDark={setDark} onLogin={login}/>;

  const title = page === "Dashboard" ? (user.role === "Customer" ? `Welcome back, ${user.name.split(" ")[0]}` : `Good morning, ${user.name.split(" ")[0]}`) : page;
  const canCreateRepair = user.role === "Admin" || user.role === "Manager";
  const isCustomer = user.role === "Customer";
  const initials = user.name.split(" ").map((part) => part[0]).join("").slice(0, 2);

  return (
    <div className={`${dark ? "app dark" : "app"} ${isCustomer ? "customer-app" : ""}`}>
      <aside className={`sidebar ${collapsed ? "collapsed" : ""} ${mobileNav ? "mobile-open" : ""}`}>
        <div className="brand" onClick={() => navigate("Dashboard")}>
          <div className="logo"><Icon name="tool" size={19}/></div>
          {!collapsed && <div><strong>FixFlow</strong><small>{isCustomer ? "Customer portal" : "Repair management"}</small></div>}
          <button className="mobile-close" onClick={() => setMobileNav(false)}><Icon name="close"/></button>
        </div>
        <nav>
          {currentNav.map(group => (
            <div className="nav-group" key={group.label}>
              {!collapsed && <div className="nav-label">{group.label}</div>}
              {group.items.map(([label, icon]) => (
                <button key={label} title={label} className={`nav-item ${page === label ? "active" : ""}`} onClick={() => navigate(label)}>
                  <Icon name={icon as IconName}/>{!collapsed && <span>{label}</span>}
                  {!collapsed && label === "Notifications" && <i>4</i>}
                </button>
              ))}
            </div>
          ))}
        </nav>
        <button className="collapse-btn" onClick={() => setCollapsed(!collapsed)}><Icon name="chevron"/><span>{collapsed ? "" : "Collapse sidebar"}</span></button>
      </aside>

      <div className="shell">
        <header className="topbar">
          <button className="icon-btn mobile-menu" onClick={() => setMobileNav(true)}><Icon name="menu"/></button>
          <button className="global-search" onClick={() => setSearchOpen(true)}><Icon name="search"/><span>Search customers, repairs, invoices...</span><kbd>⌘ K</kbd></button>
          <div className="top-actions">
            {!isCustomer && <span className="branch-select" title="Signed-in branch"><span className="branch-icon"><Icon name="branch" size={15}/></span><span>{user.branch}</span></span>}
            <button className="icon-btn theme-toggle" onClick={() => setDark(!dark)} title="Switch theme"><Icon name={dark ? "sun" : "moon"}/></button>
            <button className="icon-btn notification" onClick={() => navigate("Notifications")}><Icon name="bell"/><span/></button>
            <button className="profile" onClick={() => setProfileOpen(!profileOpen)}><div className="avatar">{initials}</div><div><strong>{user.name}</strong><small>{user.role}</small></div><Icon name="chevron" size={13}/></button>
            {profileOpen && <div className="profile-menu"><div className="profile-menu-head"><div className="avatar">{initials}</div><div><strong>{user.name}</strong><span>{user.email}</span><small>{user.role} · {user.branch}</small></div></div><button onClick={() => navigate("Profile")}><Icon name="team"/>Profile</button>{["Admin", "Manager"].includes(user.role) && <button onClick={() => navigate(user.role === "Admin" ? "Settings" : "Branch Operations")}><Icon name="settings"/>Settings</button>}<button className="logout" onClick={logout}><Icon name="arrow"/>Logout</button></div>}
          </div>
        </header>

        <main>
          <div className="page-head">
            <div><div className="eyebrow">{page === "Dashboard" ? `${user.role} workspace · ${todayLabel}` : `Home  /  ${page}`}</div><h1>{title}</h1>{page === "Dashboard" && <p>{isCustomer ? "Track your repairs, approvals, payments and warranty in one place." : `Here's what's happening in your ${user.role === "Admin" ? "repair business" : "workspace"} today.`}</p>}</div>
            <div className="head-actions">
              {page === "Dashboard" && !isCustomer && <span className="date-filter" aria-label="Today"><Icon name="clock"/><span>{shortDateLabel}</span></span>}
              {page === "Repairs" && canCreateRepair && <><Button kind="secondary" icon="download" onClick={exportRepairs}>Export</Button><Button icon="plus" onClick={() => navigate("New Repair")}>New Repair</Button></>}
            </div>
          </div>

          {page === "Dashboard" && (user.role === "Admin" ? <Dashboard navigate={navigate} data={scopedRepairs} figures={figures} money={money} weekSeries={weekSeries} monthSeries={monthSeries} overdueRepairs={overdueRepairs} lowStock={lowStockItems} statusCounts={statusCounts} recentSales={recentSales}/> : <RoleDashboard user={user} data={scopedRepairs} jobs={scopedJobs} navigate={navigate} figures={figures} sales={scopedSales} lowStock={lowStockItems}/>)}
          {(page === "Repairs" || page === "My Repairs") && (isCustomer ? <CustomerRepairs data={scopedRepairs} navigate={navigate}/> : <Repairs navigate={navigate} data={scopedRepairs} technician={user.role === "Technician"}/>)}
          {page === "Repair Board" && <RepairBoard data={scopedRepairs}/>}
          {page === "New Repair" && <NewRepair navigate={navigate} actor={user}/>}
          {page === "Repair Details" && <RepairDetails jobNumber={param} technician={user.role === "Technician"} actor={user} navigate={navigate}/>}
          {page === "My Repair Details" && <CustomerRepairDetails jobNumber={param} jobs={scopedJobs}/>}
          {page === "Estimates" && <EstimatesPage branchId={user.branchId} actorId={user.id} canDecide={user.role === "Admin" || user.role === "Manager"} canSend={user.role !== "Customer"} customerScope={user.role === "Customer" ? user.customerId : undefined}/>}
          {(page === "Invoices" || page === "Receivables" || page === "Payments") && <BillingPage branchId={user.branchId} actorId={user.id} canEdit={user.role !== "Customer"} customerScope={user.role === "Customer" ? user.customerId : undefined} mode={page === "Receivables" ? "receivables" : page === "Payments" ? "payments" : "invoices"}/>}
          {page === "Stock Adjustments" && <StockAdjustmentsPage branchId={user.branchId} actorId={user.id}/>}
          {page === "Customers" && <CustomersPage branchId={user.branchId} actorId={user.id}/>}
          {page === "Expenses" && <ExpensesPage branchId={user.branchId} actorId={user.id}/>}
          {(page === "Reports" || page === "Finance") && <ReportsPage branchId={user.branchId}/>}
          {page === "Cash Register" && <CashRegisterPage branchId={user.branchId} cashierId={user.id}/>}
          {(page === "Sales" || page === "Refunds") && <SalesPage branchId={user.branchId} actorId={user.id}/>}
          {page === "POS" && <POS cart={cart} setCart={setCart} actor={user}/>}
          {(page === "Inventory" || page === "Products") && <ProductsPage branchId={user.branchId}/>}
          {(page === "AI Diagnosis" || page === "Diagnosis") && <AIDiagnosis/>}
          {!["Dashboard", "Repairs", "My Repairs", "Repair Board", "New Repair", "Repair Details", "My Repair Details", "POS", "Inventory", "AI Diagnosis", "Diagnosis", "Cash Register", "Sales", "Refunds", "Estimates", "Invoices", "Receivables", "Payments", "Stock Adjustments", "Customers", "Expenses", "Reports", "Finance"].includes(page) && <ModulePreview page={page} user={user} source={{ repairs: scopedJobs, products: scopedProducts }}/>}
        </main>
      </div>

      {mobileNav && <div className="scrim" onClick={() => setMobileNav(false)}/>}
      {searchOpen && <SearchModal user={user} data={scopedRepairs} close={() => setSearchOpen(false)} navigate={(p) => { navigate(p); setSearchOpen(false); }}/>}
    </div>
  );
}

function Login({ dark, setDark, onLogin }: { dark: boolean; setDark: (value: boolean) => void; onLogin: (user: User, remember: boolean) => void }) {
  const [mode, setMode] = useState<"login" | "forgot" | "reset" | "success">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const submitLogin = () => {
    setError("");
    setLoading(true);
    window.setTimeout(() => {
      const account = Object.values(demoUsers).find((candidate) => candidate.email.toLowerCase() === email.toLowerCase());
      if (!account || password !== "Demo@123") {
        setError("Invalid email or password.");
        setLoading(false);
        return;
      }
      onLogin(account, remember);
      setLoading(false);
    }, 650);
  };
  const selectDemo = (role: Role) => {
    setEmail(demoUsers[role].email);
    setPassword("Demo@123");
    setError("");
  };
  const resetPassword = () => {
    if (password.length < 8 || password !== confirmPassword) {
      setError(password.length < 8 ? "Password must contain at least 8 characters." : "Passwords do not match.");
      return;
    }
    setError("");
    setMode("success");
  };

  return <div className={`${dark ? "app dark" : "app"} auth-page`}>
    <button className="icon-btn auth-theme" onClick={() => setDark(!dark)} title="Switch theme"><Icon name={dark ? "sun" : "moon"}/></button>
    <div className="auth-brand-panel">
      <div className="auth-brand">
        <div className="brand auth-logo-row"><div className="logo"><Icon name="tool" size={22}/></div><div><strong>FixFlow</strong><small>Smart repair management & POS</small></div></div>
        <div className="auth-message"><span className="auth-kicker">ONE CONNECTED WORKFLOW</span><h1>Run your repair business with clarity.</h1><p>Repairs, inventory, sales and customer care — organized intelligently in one reliable workspace.</p></div>
        <div className="auth-flow">{[["Repair intake","tool"],["Smart diagnosis","brain"],["Payment & warranty","shield"]].map(([label, icon], index) => <div key={label}><span><Icon name={icon as IconName}/></span><strong>{label}</strong>{index < 2 && <Icon name="arrow" size={14}/>}</div>)}</div>
        <div className="auth-trust"><Icon name="shield"/><span><strong>Secure role-based workspace</strong><small>Every user sees only the tools and data they are authorized to access.</small></span></div>
      </div>
    </div>
    <div className="auth-form-panel">
      <Card className="login-card">
        {mode === "login" && <>
          <div className="login-heading"><span>WELCOME BACK</span><h2>Sign in to FixFlow</h2><p>Enter your details or choose a demo workspace.</p></div>
          {error && <div className="login-error"><Icon name="alert"/><span><strong>Unable to sign in</strong>{error}</span></div>}
          <label>Email address<div className="auth-input"><Icon name="users"/><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@company.com"/></div></label>
          <label>Password<div className="auth-input"><Icon name="shield"/><input type={showPassword ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Enter your password"/><button onClick={() => setShowPassword(!showPassword)}>{showPassword ? "Hide" : "Show"}</button></div></label>
          <div className="login-options"><label className="check-label"><input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)}/><span>Remember me</span></label><button onClick={() => { setMode("forgot"); setError(""); }}>Forgot password?</button></div>
          <Button onClick={submitLogin}>{loading ? <><span className="spinner"/>Signing in...</> : "Sign In"}</Button>
          <div className="demo-divider"><span>Prototype demo accounts</span></div>
          <div className="demo-roles">{(Object.keys(demoUsers) as Role[]).map((role) => <button className={email === demoUsers[role].email ? "selected" : ""} onClick={() => selectDemo(role)} key={role}><span><Icon name={role === "Admin" ? "shield" : role === "Manager" ? "branch" : role === "Technician" ? "tool" : role === "Cashier" ? "cash" : "users"}/></span><strong>{role}</strong><small>{role === "Customer" ? "Portal" : role === "Technician" ? "Repairs" : role === "Cashier" ? "POS" : role === "Manager" ? "Branch" : "Full access"}</small></button>)}</div>
          <p className="demo-hint">Demo password: <strong>Demo@123</strong></p>
        </>}
        {mode === "forgot" && <>
          <button className="auth-back" onClick={() => setMode("login")}><Icon name="chevron" size={15}/> Back to sign in</button>
          <div className="login-heading"><div className="reset-icon"><Icon name="send"/></div><h2>Forgot your password?</h2><p>Enter your account email and we'll simulate sending a secure reset link.</p></div>
          <label>Email address<div className="auth-input"><Icon name="users"/><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@company.com"/></div></label>
          <Button onClick={() => setMode("reset")}>Send reset link</Button>
        </>}
        {mode === "reset" && <>
          <button className="auth-back" onClick={() => setMode("forgot")}><Icon name="chevron" size={15}/> Back</button>
          <div className="login-heading"><div className="reset-icon"><Icon name="shield"/></div><h2>Create a new password</h2><p>Choose a secure password for {email || "your FixFlow account"}.</p></div>
          {error && <div className="login-error"><Icon name="alert"/><span>{error}</span></div>}
          <label>New password<div className="auth-input"><Icon name="shield"/><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="At least 8 characters"/></div></label>
          <label>Confirm password<div className="auth-input"><Icon name="shield"/><input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="Enter password again"/></div></label>
          <Button onClick={resetPassword}>Reset password</Button>
        </>}
        {mode === "success" && <div className="reset-success"><div className="success-mark"><Icon name="check" size={27}/></div><h2>Password reset successfully</h2><p>Your prototype password has been updated. You can now return to the login screen.</p><Button onClick={() => { setMode("login"); setPassword(""); setConfirmPassword(""); }}>Return to Login</Button></div>}
      </Card>
      <p className="auth-footer">Prototype environment · Protected by role-based access control</p>
    </div>
  </div>;
}

/**
 * A line chart built from the figures it is handed.
 *
 * The scale is derived from the data, so an empty week renders a flat line at
 * zero rather than a shape that implies activity. The old chart was a fixed SVG
 * path — the same curve whatever was in the database.
 */
function LineChart({ points }: { points: SeriesPoint[] }) {
  const W = 700, H = 220, PAD = 8;
  const peak = Math.max(1, ...points.map((point) => Math.max(point.revenue, point.expenses)));
  const x = (i: number) => points.length <= 1 ? W / 2 : (i / (points.length - 1)) * W;
  const y = (value: number) => H - PAD - (value / peak) * (H - PAD * 2);

  const path = (pick: (point: SeriesPoint) => number) =>
    points.map((point, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)} ${y(pick(point)).toFixed(1)}`).join(" ");
  const revenue = path((point) => point.revenue);

  return <div className="line-chart">
    <div className="y-labels">
      {[1, 0.75, 0.5, 0.25, 0].map((fraction) => <span key={fraction}>{formatLKRCompact(Math.round(peak * fraction))}</span>)}
    </div>
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="Revenue and expenses over time">
      <defs><linearGradient id="area" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#8b5cf6" stopOpacity=".24"/><stop offset="1" stopColor="#8b5cf6" stopOpacity="0"/></linearGradient></defs>
      <path className="area" d={`${revenue} L${W} ${H} L0 ${H}Z`}/>
      <path className="chart-line revenue" d={revenue}/>
      <path className="chart-line payments" d={path((point) => point.expenses)}/>
    </svg>
    <div className="x-labels">{points.map((point) => <span key={point.key}>{point.label}</span>)}</div>
  </div>;
}

function Dashboard({ navigate, data, figures, money, weekSeries, monthSeries, overdueRepairs, lowStock, statusCounts, recentSales }: {
  navigate: (p: string) => void
  data: RepairRow[]
  figures: DashboardFigures
  money: MoneyFigures
  weekSeries: SeriesPoint[]
  monthSeries: SeriesPoint[]
  overdueRepairs: number
  lowStock: Product[]
  statusCounts: Array<[string, number, string]>
  recentSales: Sale[]
}) {
  /**
   * §6 — every figure comes from saved records. The two tiles the old
   * dashboard had for "Outstanding" and "Today's Expenses" are gone rather
   * than faked: there is no invoice or expense module behind them yet.
   */
  const kpis = [
    ["Today's Sales", formatLKR(money.todaySales), `${figures.todaySaleCount} sale${figures.todaySaleCount === 1 ? "" : "s"} today`, "sale", "blue", "Sales"],
    ["Repair Income", formatLKR(money.todayRepairIncome), "collected on repair invoices", "tool", "purple", "Estimates"],
    ["Today's Expenses", formatLKR(money.todayExpenses), "recorded against this branch", "receipt", "amber", "Expenses"],
    ["Today's Profit", formatLKR(money.todayProfit), "after cost of goods and expenses", "wallet", money.todayProfit < 0 ? "pink" : "cyan", "Finance"],
    ["Active Repairs", String(figures.activeRepairs), `${figures.unassignedRepairs} unassigned · ${overdueRepairs} overdue`, "tool", "purple", "Repairs"],
    ["Low Stock Items", String(figures.lowStockItems), `${figures.criticalStockItems} critical`, "alert", "amber", "Inventory"],
  ] as const;
  const [chartRange, setChartRange] = useState<"day" | "month">("day");
  const chart = chartRange === "day" ? weekSeries : monthSeries;
  return <>
    <div className="kpi-grid">
      {kpis.map(([label, value, change, icon, tone, target]) => <Card className="kpi" key={label} onClick={() => navigate(target)}>
        <div className={`kpi-icon ${tone}`}><Icon name={icon}/></div>
        <div className="kpi-label">{label}<Icon name="arrow" size={16}/></div>
        <div className="kpi-value">{value}</div>
        <div className="kpi-change">{change}</div>
      </Card>)}
    </div>
    <div className="dashboard-grid">
      <Card className="sales-chart">
        <div className="card-head">
          <div><h2>Income overview</h2><p>Revenue and expenses from saved records</p></div>
          <div className="chart-toggle">
            <button type="button" className={chartRange === "day" ? "active" : ""} onClick={() => setChartRange("day")}>Week</button>
            <button type="button" className={chartRange === "month" ? "active" : ""} onClick={() => setChartRange("month")}>Month</button>
          </div>
        </div>
        <div className="chart-meta">
          <div><span className="legend purple"/><small>Revenue in view</small><strong>{formatLKR(chart.reduce((sum, point) => sum + point.revenue, 0))}</strong></div>
          <div><span className="legend blue"/><small>Expenses in view</small><strong>{formatLKR(chart.reduce((sum, point) => sum + point.expenses, 0))}</strong></div>
        </div>
        <LineChart points={chart}/>
      </Card>
      <Card className="repair-overview">
        <div className="card-head"><div><h2>Repair overview</h2><p>Current workflow</p></div><Button kind="ghost" onClick={() => navigate("Repair Board")}>Board <Icon name="arrow" size={15}/></Button></div>
        <div className="donut-wrap"><div className="donut"><div><strong>{statusCounts.reduce((sum, row) => sum + row[1], 0)}</strong><span>In workflow</span></div></div></div>
        <div className="status-list">
          {statusCounts.every((row) => row[1] === 0)
            ? <p className="muted">No repairs are currently in the workflow.</p>
            : statusCounts.filter((row) => row[1] > 0).map(([label, count, tone]) => <div key={label}><span className={`legend ${tone}`}/><span>{label}</span><strong>{count}</strong></div>)}
        </div>
      </Card>
    </div>
    <div className="bottom-grid">
      <Card className="recent">
        <div className="card-head"><div><h2>Recent repairs</h2><p>Latest activity across your workshop</p></div><Button kind="ghost" onClick={() => navigate("Repairs")}>View all <Icon name="arrow" size={15}/></Button></div>
        <RepairTable compact navigate={navigate} data={data}/>
      </Card>
      <Card className="stock-card">
        <div className="card-head"><div><h2>Low stock</h2><p>At or below the reorder level</p></div><span className="count-badge">{lowStock.length}</span></div>
        {lowStock.length === 0
          ? <p className="muted">Nothing is at or below its reorder level.</p>
          : lowStock.slice(0, 4).map((product) => {
              const available = product.stockOnHand - product.reserved;
              return <div className="stock-row" key={product.id}>
                <div className="product-mini"><Icon name="box"/></div>
                <div><strong>{product.name}</strong><span>{product.sku}</span></div>
                <div><strong className={available <= 0 ? "danger-text" : ""}>{available} left</strong><span>Min. {product.minStock}</span></div>
              </div>;
            })}
        <Button kind="secondary" onClick={() => navigate("Stock Adjustments")}>Stock adjustments</Button>
      </Card>
      <Card className="recent">
        <div className="card-head"><div><h2>Recent sales</h2><p>Latest takings in this branch</p></div><Button kind="ghost" onClick={() => navigate("Sales")}>View all <Icon name="arrow" size={15}/></Button></div>
        {recentSales.length === 0
          ? <p className="muted">No sales recorded yet.</p>
          : <div className="transaction-list">{recentSales.map((sale) => <div key={sale.id}><div className="product-mini"><Icon name="receipt"/></div><div><strong>{sale.receiptNumber}</strong><span>{sale.customerName || "Walk-in customer"} · {new Date(sale.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span></div><strong>{formatLKR(sale.total)}</strong></div>)}</div>}
      </Card>
    </div>
  </>;
}

function RoleDashboard({ user, data, jobs, navigate, figures, sales, lowStock }: { user: User; data: RepairRow[]; jobs: RepairJob[]; navigate: (page: string, param?: string) => void; figures: DashboardFigures; sales: Sale[]; lowStock: Product[] }) {
  if (user.role === "Customer") {
    const repair = data[0];
    // Every figure below is computed from this visitor's own records. The card
    // used to show "Rs. 18,500" and "43 days" to whoever signed in — a customer
    // portal is the worst place for an invented number, because the person
    // reading it has no way to check it.
    const mySales = sales.filter((sale) => sale.customerId === user.customerId)
    const outstanding = mySales.reduce((sum, sale) => sum + Math.max(0, sale.total - sale.amountPaid), 0)
    const pendingQuotes = data.filter((row) => row.status === "Awaiting Approval").length
    // The timeline used to mark steps 1-3 complete and step 4 current for
    // everyone. Now it comes from the repair's actual status, via the same
    // five-step customer view the repair details page uses.
    const portalJob = repair ? jobs.find((j) => j.jobNumber === repair.id) : undefined
    const portalProgress = portalJob ? customerProgress(portalJob.status) : null
    return <div className="customer-dashboard">
      <Card className="customer-status-hero"><div className="customer-status-copy"><span className="portal-kicker">ACTIVE REPAIR</span><div><h2>{repair?.device || "No active repairs"}</h2>{repair && <Badge>{repair.status}</Badge>}</div><p>{repair?.id} · Estimated completion {repair?.eta}</p><Button onClick={() => navigate("My Repair Details")}>View repair details <Icon name="arrow" size={15}/></Button></div><div className="status-device"><Icon name="laptop" size={42}/><span>Repair in progress</span></div></Card>
      <div className="kpi-grid customer-kpis">
        {[
          ["My Active Repairs", String(data.length), "tool", "purple"],
          ["Pending Quote", String(pendingQuotes), "file", "pink"],
          ["Outstanding Invoice", formatLKR(outstanding), "receipt", "blue"],
        ].map(([label, value, icon, tone]) => <Card className="kpi" key={label}><div className={`kpi-icon ${tone}`}><Icon name={icon as IconName}/></div><div className="kpi-label">{label}</div><div className="kpi-value">{value}</div><div className="kpi-change positive">From your records <span>your account only</span></div></Card>)}
      </div>
      <div className="customer-home-grid"><Card className="portal-timeline-card"><div className="card-head"><div><h2>Repair progress</h2><p>We'll notify you whenever your repair moves forward.</p></div><Badge>{repair?.status || "No repair"}</Badge></div><div className="portal-progress">{portalProgress === null
            ? <p className="muted">No repair records to show progress for.</p>
            : portalProgress.cancelled
              ? <p className="danger-text" role="status">This repair was cancelled. Please contact the branch if that is unexpected.</p>
              : portalProgress.steps.map((item, index) => <div className={index < portalProgress.current ? "complete" : index === portalProgress.current ? "current" : ""} key={item}><span>{index < portalProgress.current ? <Icon name="check" size={14}/> : index + 1}</span><div><strong>{item}</strong><small>{index < portalProgress.current ? "Completed" : index === portalProgress.current ? "In progress" : "Pending"}</small></div></div>)}</div></Card>
        <Card className="portal-actions"><div className="card-head"><div><h2>Needs your attention</h2><p>Actions for your account</p></div></div>{pendingQuotes > 0 && <div className="attention-item"><div className="kpi-icon pink"><Icon name="file"/></div><div><strong>Estimate ready to review</strong><span>{pendingQuotes} repair{pendingQuotes === 1 ? "" : "s"} awaiting your approval</span></div><Icon name="chevron"/></div>}
          {repair && <div className="attention-item"><div className="kpi-icon blue"><Icon name="bell"/></div><div><strong>Latest update</strong><span>{repair.id} is {repair.status}</span></div><Icon name="chevron"/></div>}
          {pendingQuotes === 0 && !repair && <p className="muted">Nothing needs your attention right now.</p>}<Button kind="secondary" onClick={() => navigate("Support")}>Contact support</Button></Card>
      </div>
    </div>;
  }

  const roleCards: Record<Exclude<Role, "Admin" | "Customer">, Array<[string, string, IconName, string, string]>> = {
    Manager: [
      ["Branch Repairs", String(data.length), "tool", "purple", "Your branch"],
      ["Awaiting Approval", String(figures.awaitingApproval), "clock", "pink", "Needs a decision"],
      ["Ready for Pickup", String(figures.readyForPickup), "check", "cyan", "Branch queue"],
      ["Sales Today", formatLKR(figures.todaySales), "sale", "blue", `${figures.todaySaleCount} sales`],
      ["Inventory Alerts", String(figures.lowStockItems), "alert", "amber", `${figures.criticalStockItems} critical`],
      ["Unassigned", String(figures.unassignedRepairs), "users", "slate", "Needs a technician"],
    ],
    Technician: [
      ["My Assigned Repairs", String(data.length), "tool", "purple", "Assigned to you"],
      ["Diagnosing", String(data.filter((r) => r.status === "Diagnosing").length), "brain", "blue", "Your queue"],
      ["Awaiting Parts", String(data.filter((r) => r.status === "Awaiting Parts").length), "package", "pink", "Parts requested"],
      ["In Progress", String(data.filter((r) => r.status === "In Progress").length), "settings", "cyan", "Active work"],
      ["Testing", String(data.filter((r) => r.status === "Testing").length), "check", "blue", "Quality checks"],
      ["Ready", String(data.filter((r) => r.status === "Ready for Pickup").length), "shield", "slate", "Completed by you"],
    ],
    Cashier: [
      ["Today's Sales", formatLKR(figures.todaySales), "sale", "blue", `${figures.todaySaleCount} sales`],
      ["Active Repairs", String(figures.activeRepairs), "tool", "purple", "In the shop"],
      ["Ready for Pickup", String(figures.readyForPickup), "check", "blue", "Paid delivery queue"],
      ["Low Stock", String(figures.lowStockItems), "alert", "amber", `${figures.criticalStockItems} critical`],
    ],
  };
  const cards = roleCards[user.role as keyof typeof roleCards];
  return <>
    <div className="role-scope"><Icon name={user.role === "Manager" ? "branch" : user.role === "Technician" ? "tool" : "cash"}/><span><strong>{user.role} workspace</strong>Data is restricted to {user.role === "Technician" ? "repairs assigned to you" : `${user.branch} branch`}.</span><Badge tone="in-stock">Protected</Badge></div>
    <div className="kpi-grid">{cards.map(([label, value, icon, tone, note]) => <Card className="kpi" key={label}><div className={`kpi-icon ${tone}`}><Icon name={icon}/></div><div className="kpi-label">{label}</div><div className="kpi-value">{value}</div><div className="kpi-change positive">{note}</div></Card>)}</div>
    {user.role === "Technician" ? <Card className="table-card role-table"><div className="card-head table-title"><div><h2>My assigned repairs</h2><p>Only work assigned directly to your technician account.</p></div><Button kind="ghost" onClick={() => navigate("My Repairs")}>View workspace <Icon name="arrow" size={14}/></Button></div><RepairTable compact data={data} navigate={navigate} showFinancial={false}/></Card> :
      user.role === "Cashier" ? <div className="bottom-grid"><Card className="recent"><div className="card-head table-title"><div><h2>Recent branch transactions</h2><p>Payments processed at your register</p></div><Button kind="ghost" onClick={() => navigate("POS")}>Open POS <Icon name="arrow" size={14}/></Button></div><TransactionList sales={sales}/></Card></div> :
      <div className="bottom-grid"><Card className="recent"><div className="card-head table-title"><div><h2>Branch repair activity</h2><p>Authorized Colombo 03 records only</p></div><Button kind="ghost" onClick={() => navigate("Repairs")}>View all <Icon name="arrow" size={14}/></Button></div><RepairTable compact data={data} navigate={navigate}/></Card><Card className="stock-card"><div className="card-head"><div><h2>Branch alerts</h2><p>Items needing attention</p></div><span className="count-badge">{lowStock.length}</span></div>{lowStock.length === 0 ? <p className="muted">Nothing is at or below its reorder level.</p> : lowStock.slice(0, 4).map((product) => { const available = product.stockOnHand - product.reserved; return <div className="stock-row" key={product.id}><div className="product-mini"><Icon name="box"/></div><div><strong>{product.name}</strong><span>{product.sku}</span></div><div><strong className={available <= 0 ? "danger-text" : ""}>{available} left</strong><span>Min. {product.minStock}</span></div></div>; })}</Card></div>}
  </>;
}

const PAYMENT_LABEL: Record<string, string> = { cash: "Cash", card: "Card", bank_transfer: "Bank", other: "Other" };

function TransactionList({ sales }: { sales: Sale[] }) {
  const recent = sales.slice(0, 5);
  if (recent.length === 0) {
    return <div className="transaction-list"><p className="muted">No sales recorded yet.</p></div>;
  }
  return <div className="transaction-list">{recent.map((sale) => <div key={sale.id}><div className="product-mini"><Icon name="receipt"/></div><div><strong>{sale.receiptNumber}</strong><span>{sale.customerName || "Walk-in customer"} · {PAYMENT_LABEL[sale.paymentMethod] ?? sale.paymentMethod}</span></div><strong>{formatLKR(sale.total)}</strong></div>)}</div>;
}

function CustomerRepairs({ data, navigate }: { data: RepairRow[]; navigate: (page: string, param?: string) => void }) {
  if (data.length === 0) {
    return <Card className="empty-module"><Icon name="tool" size={32}/><h2>No repairs yet</h2><p>Repairs booked against this account will appear here.</p></Card>;
  }
  return <div className="portal-repairs">{data.map((repair) => <Card className="portal-repair-card" key={repair.id}><div className="device-icon"><Icon name="laptop" size={24}/></div><div className="portal-repair-main"><div><span>{repair.id}</span><Badge>{repair.status}</Badge></div><h2>{repair.device}</h2><p>Estimated completion: {repair.eta}</p></div><Button kind="secondary" onClick={() => navigate("My Repair Details", repair.id)}>Track repair</Button></Card>)}</div>;
}

function CustomerRepairDetails({ jobNumber, jobs }: { jobNumber: string; jobs: RepairJob[] }) {
  // The route parameter decides which repair this is; falling back to the
  // first only covers a customer who lands here without picking one.
  const repair = jobs.find((j) => j.jobNumber === jobNumber) ?? jobs[0];
  if (!repair) return <Card className="empty-module"><Icon name="tool" size={32}/><h2>No repair found</h2><p>This account has no active repair records.</p></Card>;

  const progress = customerProgress(repair.status);
  return <><Card className="repair-hero"><div className="repair-device"><div className="device-icon"><Icon name="laptop" size={25}/></div><div><div><span>{repair.jobNumber}</span><Badge>{STATUS_LABEL[repair.status]}</Badge></div><h2>{repair.deviceSummary}</h2><p>Your repair</p></div></div><div className="repair-facts"><div><span>Estimated completion</span><strong>{repair.expectedCompletion ? formatEta(repair) : "Not set yet"}</strong></div><div><span>Work recorded so far</span><strong>{formatLKR(repair.labourCost)}</strong></div></div></Card><div className="customer-detail-grid"><Card className="portal-timeline-card"><div className="card-head"><div><h2>Your repair journey</h2><p>Simple, customer-friendly progress updates.</p></div></div>
    {progress.cancelled
      ? <p className="danger-text" role="status">This repair was cancelled. Please contact the branch if that is unexpected.</p>
      : <div className="portal-progress horizontal">{progress.steps.map((step, index) => <div className={index < progress.current ? "complete" : index === progress.current ? "current" : ""} key={step}><span>{index < progress.current ? <Icon name="check" size={14}/> : index + 1}</span><strong>{step}</strong></div>)}</div>}
  </Card></div>
  </>;
}
function Repairs({ navigate, data, technician = false }: { navigate: (p: string) => void; data: RepairRow[]; technician?: boolean }) {
  const [term, setTerm] = useState("");
  const [status, setStatus] = useState("all");
  const [assignee, setAssignee] = useState("all");

  // These three controls filter the table below. A filter that appears to work
  // but does not is worse than no filter, because the count under it stops
  // matching what anyone believes they are looking at.
  const statuses = Array.from(new Set(data.map((r) => r.status))).sort();
  const techs = Array.from(new Set(data.map((r) => r.tech).filter(Boolean))).sort();
  const needle = term.trim().toLowerCase();

  const rows = data.filter((r) => {
    if (status !== "all" && r.status !== status) return false;
    if (assignee !== "all" && r.tech !== assignee) return false;
    if (!needle) return true;
    return [r.id, r.customer, r.device, r.tech].some((v) => v.toLowerCase().includes(needle));
  });

  const clearFilters = term !== "" || status !== "all" || assignee !== "all";

  return <>
    <Card className="filter-card">
      <div className="filter-search"><Icon name="search"/><input value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Search repair ID, customer or device..."/></div>
      <select className="filter-select" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter by status">
        <option value="all">Status: All</option>
        {statuses.map((v) => <option key={v} value={v}>{v}</option>)}
      </select>
      {!technician && <select className="filter-select" value={assignee} onChange={(e) => setAssignee(e.target.value)} aria-label="Filter by technician">
        <option value="all">All technicians</option>
        {techs.map((v) => <option key={v} value={v}>{v}</option>)}
      </select>}
      {clearFilters && <Button kind="secondary" onClick={() => { setTerm(""); setStatus("all"); setAssignee("all"); }}>Clear filters</Button>}
    </Card>
    <div className="summary-strip"><div><span>{technician ? "My repairs" : "All repairs"}</span><strong>{data.length}</strong></div><div><span>Showing</span><strong>{rows.length}</strong></div><div><span>Waiting</span><strong>{rows.filter((r) => r.status.includes("Awaiting")).length}</strong></div><div><span>Ready</span><strong>{rows.filter((r) => r.status === "Ready for Collection").length}</strong></div></div>
    <Card className="table-card">
      {rows.length === 0
        ? <p className="muted" style={{ padding: "18px 4px" }}>No repair matches these filters{clearFilters ? "" : " yet"}.</p>
        : <RepairTable navigate={navigate} data={rows} showFinancial={!technician}/>}
      <div className="pagination"><span>Showing {rows.length} of {data.length} authorized repairs</span></div>
    </Card>
  </>;
}

function RepairTable({ compact = false, navigate, data, showFinancial = true }: { compact?: boolean; navigate: (p: string) => void; data: RepairRow[]; showFinancial?: boolean }) {
  return <div className="table-wrap"><table><thead><tr><th>Repair</th><th>Customer & device</th>{!compact && <th>Technician</th>}<th>Status</th>{!compact && <th>Priority</th>}<th>{compact || !showFinancial ? "Due" : "Amount"}</th><th/></tr></thead>
    <tbody>{data.slice(0, compact ? 4 : 5).map(r => <tr key={r.id} onClick={() => navigate("Repair Details")}>
      <td><strong className="id-link">{r.id}</strong><span className="mobile-only">{r.customer}</span></td>
      <td><strong>{r.customer}</strong><span>{r.device}</span></td>{!compact && <td><div className="tech"><span>{r.tech.split(" ").map(x=>x[0]).join("")}</span>{r.tech}</div></td>}
      <td><Badge>{r.status}</Badge></td>{!compact && <td><span className={`priority ${r.priority.toLowerCase()}`}>{r.priority}</span></td>}<td><strong>{compact ? r.eta : showFinancial ? r.amount : r.eta}</strong>{!compact && showFinancial && <span>{r.eta}</span>}</td><td><button className="more-btn"><Icon name="more"/></button></td>
    </tr>)}</tbody></table></div>;
}

function RepairBoard({ data }: { data: RepairRow[] }) {
  const columns = boardColumns(data);
  return <div className="kanban">{columns.map((col) => <div className="kanban-col" key={col.label}><div className="kanban-head"><Badge>{col.label}</Badge><span>{col.rows.length}</span></div>
    {col.rows.length === 0 && <p className="muted">Nothing here.</p>}
    {col.rows.map((r) => <Card className="repair-card" key={r.id}><div><strong>{r.id}</strong><span className={`priority ${r.priority.toLowerCase()}`}>{r.priority}</span></div><h3>{r.device}</h3><p>{r.customer}</p><div className="repair-card-foot"><span><Icon name="clock" size={14}/>{r.eta}</span><div className="avatar tiny">{r.tech.split(" ").map(x=>x[0]).join("")}</div></div></Card>)}
  </div>)}</div>;
}

function NewRepair({ navigate, actor }: { navigate: (p: string) => void; actor: User }) {
  const { db, bump } = useDb();
  const { data: catalogue } = useQuery(async (d) => ({
    customers: await d.customers.list(),
    technicians: await d.users.technicians(),
    branches: await d.branches.list(),
  }), []);

  const [step, setStep] = useState(1);
  const [mode, setMode] = useState<"existing" | "new">("existing");
  const [term, setTerm] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [draft, setDraft] = useState({ fullName: "", phone: "", email: "", address: "" });
  const [device, setDevice] = useState({ category: "laptop", brand: "", model: "", serialNumber: "" });
  const [problem, setProblem] = useState({ issue: "", condition: "Good — minor wear", accessories: "" });
  const [details, setDetails] = useState({ technicianId: "", priority: "normal", expectedCompletion: "", labour: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const labels = ["Customer", "Device", "Problem", "Repair details", "Review"];

  const matches = useMemo(() => {
    const needle = term.trim().toLowerCase();
    const all = catalogue?.customers ?? [];
    if (!needle) return all.slice(0, 5);
    return all
      .filter((c) => `${c.fullName} ${c.phone} ${c.email} ${c.code}`.toLowerCase().includes(needle))
      .slice(0, 5);
  }, [term, catalogue]);

  /** Per-step validation, so a problem is caught where it was made. */
  const stepError = (): string => {
    if (step === 1) {
      if (mode === "existing") return customerId ? "" : "Choose a customer first.";
      if (draft.fullName.trim().length < 2) return "Enter the customer's full name.";
      if (!/^\+?[0-9]{9,15}$/.test(draft.phone.replace(/[\s-]/g, ""))) return "Enter a valid phone number.";
      return "";
    }
    if (step === 2) {
      if (!device.brand.trim()) return "Enter the device brand.";
      if (!device.model.trim()) return "Enter the device model.";
      return "";
    }
    if (step === 3) {
      if (problem.issue.trim().length < 10) return "Describe the reported issue in at least 10 characters.";
      return "";
    }
    if (step === 4 && details.labour && !/^\d+(\.\d{1,2})?$/.test(details.labour)) {
      return "Enter the labour estimate as a number of rupees.";
    }
    return "";
  };

  const advance = () => {
    const problem_ = stepError();
    if (problem_) { setError(problem_); return; }
    setError("");
    setStep((s) => Math.min(5, s + 1));
  };

  const submit = async () => {
    const problem_ = stepError();
    if (problem_) { setError(problem_); return; }
    setBusy(true);
    setError("");
    try {
      // Customer, device and repair are created in sequence: each later record
      // needs the id of the one before it.
      let resolvedCustomerId = customerId;
      if (mode === "new") {
        const created = await db.customers.create({
          fullName: draft.fullName.trim(),
          phone: draft.phone.trim(),
          email: draft.email.trim(),
          address: draft.address.trim(),
          notes: "",
          status: "active",
        });
        resolvedCustomerId = created.id;
      }
      const chosen = (catalogue?.customers ?? []).find((c) => c.id === resolvedCustomerId);
      const newDevice = await db.devices.create({
        customerId: resolvedCustomerId,
        category: device.category as "laptop",
        brand: device.brand.trim(),
        model: device.model.trim(),
        serialNumber: device.serialNumber.trim(),
        purchaseDate: "",
        notes: "",
      });
      const labourCents = details.labour ? Math.round(Number(details.labour) * 100) : 0;
      await db.repairs.create({
        branchId: actor.branchId === "all" ? (catalogue?.branches[0]?.id ?? "br_colombo") : actor.branchId,
        customerId: resolvedCustomerId,
        deviceId: newDevice.id,
        customerName: chosen?.fullName ?? draft.fullName.trim(),
        phone: chosen?.phone ?? draft.phone.trim(),
        email: chosen?.email ?? draft.email.trim(),
        deviceSummary: `${device.brand.trim()} ${device.model.trim()}`,
        serialNumber: device.serialNumber.trim(),
        reportedIssue: problem.issue.trim(),
        deviceCondition: problem.condition,
        accessoriesReceived: problem.accessories.split(",").map((a) => a.trim()).filter(Boolean),
        intakePhotoUrls: [],
        completionPhotoUrls: [],
        priority: details.priority as "normal",
        status: "received",
        technicianId: details.technicianId,
        receivedAt: new Date().toISOString(),
        expectedCompletion: details.expectedCompletion || "",
        internalNotes: "",
        customerVisibleNotes: [],
        labourCost: labourCents,
      });
      bump();
      navigate("Repairs");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the repair.");
      setBusy(false);
    }
  };

  const selectedName = mode === "new"
    ? draft.fullName
    : (catalogue?.customers ?? []).find((c) => c.id === customerId)?.fullName ?? "";
  const techName = (catalogue?.technicians ?? []).find((t) => t.id === details.technicianId)?.fullName ?? "Unassigned";

  return <div className="form-layout"><Card className="step-card"><div className="steps">{labels.map((l,i)=><div className={step === i+1 ? "active" : step > i+1 ? "done" : ""} key={l}><span>{step > i+1 ? <Icon name="check" size={14}/> : i+1}</span><div><strong>{l}</strong><small>Step {i+1}</small></div></div>)}</div></Card>
    <Card className="form-card"><div className="form-title"><div className="kpi-icon purple"><Icon name={step === 1 ? "users" : step === 2 ? "laptop" : "tool"}/></div><div><h2>{labels[step-1]}</h2><p>{step === 1 ? "Select an existing customer or create a new one." : step === 5 ? "Check the details, then create the repair job." : "Add the information needed for this repair."}</p></div></div>
      {step === 1 && <><div className="toggle-tabs"><button className={mode === "existing" ? "active" : ""} onClick={() => setMode("existing")}>Existing customer</button><button className={mode === "new" ? "active" : ""} onClick={() => setMode("new")}>New customer</button></div>
        {mode === "existing"
          ? <><label>Find customer<div className="input"><Icon name="search"/><input value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Search name, phone or email"/></div></label>
              {matches.length === 0 && <p className="muted">No customer matches that search.</p>}
              {matches.map((c) => <button className="customer-choice" key={c.id} onClick={() => setCustomerId(c.id)} style={{ width: "100%", textAlign: "left" }}><div className="avatar">{c.fullName.split(" ").map((x) => x[0]).join("").slice(0,2)}</div><div><strong>{c.fullName}</strong><span>{c.phone}{c.email ? ` · ${c.email}` : ""}</span></div>{customerId === c.id && <Icon name="check"/>}</button>)}</>
          : <div className="form-grid"><label>Full name<input value={draft.fullName} onChange={(e) => setDraft({ ...draft, fullName: e.target.value })} placeholder="Nimal Perera"/></label><label>Phone<input value={draft.phone} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} placeholder="+94 77 123 4567"/></label><label>Email<input value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} placeholder="optional"/></label><label>Address<input value={draft.address} onChange={(e) => setDraft({ ...draft, address: e.target.value })} placeholder="optional"/></label></div>}</>}
      {step === 2 && <div className="form-grid"><label>Device type<select value={device.category} onChange={(e) => setDevice({ ...device, category: e.target.value })}>{["laptop","desktop","mobile","tablet","other"].map((c) => <option key={c} value={c}>{c[0].toUpperCase() + c.slice(1)}</option>)}</select></label><label>Brand<input value={device.brand} onChange={(e) => setDevice({ ...device, brand: e.target.value })} placeholder="Dell"/></label><label>Model<input value={device.model} onChange={(e) => setDevice({ ...device, model: e.target.value })} placeholder="Latitude 5420"/></label><label>Serial number<input value={device.serialNumber} onChange={(e) => setDevice({ ...device, serialNumber: e.target.value })} placeholder="Enter serial / IMEI"/></label></div>}
      {step === 3 && <><label>Customer complaint<textarea value={problem.issue} onChange={(e) => setProblem({ ...problem, issue: e.target.value })} placeholder="Describe what the customer reported."/></label><div className="form-grid"><label>Device condition<select value={problem.condition} onChange={(e) => setProblem({ ...problem, condition: e.target.value })}>{["Good — minor wear","Fair — visible damage","Poor — major damage"].map((c) => <option key={c}>{c}</option>)}</select></label><label>Accessories received<input value={problem.accessories} onChange={(e) => setProblem({ ...problem, accessories: e.target.value })} placeholder="65W charger, laptop bag"/></label></div></>}
      {step === 4 && <div className="form-grid"><label>Assign technician<select value={details.technicianId} onChange={(e) => setDetails({ ...details, technicianId: e.target.value })}><option value="">Unassigned</option>{(catalogue?.technicians ?? []).map((t) => <option key={t.id} value={t.id}>{t.fullName}</option>)}</select></label><label>Priority<select value={details.priority} onChange={(e) => setDetails({ ...details, priority: e.target.value })}>{["low","normal","high","urgent"].map((p) => <option key={p} value={p}>{p[0].toUpperCase() + p.slice(1)}</option>)}</select></label><label>Expected completion<input type="date" value={details.expectedCompletion} onChange={(e) => setDetails({ ...details, expectedCompletion: e.target.value })}/></label><label>Labour estimate (Rs.)<input value={details.labour} onChange={(e) => setDetails({ ...details, labour: e.target.value })} placeholder="0.00"/></label></div>}
      {step === 5 && <div className="info-list"><div><span>Customer</span><strong>{selectedName || "—"}</strong></div><div><span>Device</span><strong>{device.brand && device.model ? `${device.brand} ${device.model}` : "—"}</strong></div><div><span>Serial number</span><strong>{device.serialNumber || "—"}</strong></div><div><span>Reported issue</span><strong>{problem.issue || "—"}</strong></div><div><span>Technician</span><strong>{techName}</strong></div><div><span>Priority</span><strong>{details.priority[0].toUpperCase() + details.priority.slice(1)}</strong></div></div>}
      {error && <p className="danger-text" role="alert">{error}</p>}
      <div className="form-actions"><Button kind="secondary" onClick={() => { setError(""); step > 1 && setStep(step-1); }}>Back</Button><Button onClick={step < 5 ? advance : submit}>{busy ? "Creating…" : step === 5 ? "Create repair" : "Continue"} <Icon name="arrow" size={15}/></Button></div>
    </Card></div>;
}

/**
 * Parts fitted to a repair (§2, §11).
 *
 * Recording a part here is what takes it off the shelf: the write goes through
 * `db.repairs.addPart`, which decrements stock and writes the movement naming
 * this job in one transaction. Nothing on this panel computes a stock figure
 * itself.
 *
 * Only parts are offered — services are excluded because fitting one makes no
 * sense, and the catalogue is filtered to this repair's branch so stock cannot
 * be drawn from a shelf that is not here.
 */
function RepairPartsPanel({ repair, parts, products, productId, setProductId, quantity, setQuantity, busy, error, onAdd, onRemove }: {
  repair: RepairJob;
  parts: RepairPartUsage[];
  products: Product[];
  productId: string;
  setProductId: (value: string) => void;
  quantity: string;
  setQuantity: (value: string) => void;
  busy: boolean;
  error: string;
  onAdd: () => void;
  onRemove: (partUsageId: string) => void;
}) {
  const fitted = parts.filter((part) => part.quantity > 0);
  const partsCost = fitted.reduce((sum, part) => sum + part.unitCost * part.quantity, 0);
  const selected = products.find((product) => product.id === productId);

  return <Card>
    <div className="card-head">
      <div><h2>Parts used</h2><p>{fitted.length} fitted · {formatLKR(partsCost)} at cost</p></div>
    </div>

    {error && <p className="danger-text" role="alert">{error}</p>}

    {fitted.length === 0
      ? <p className="muted">No parts recorded against this repair yet.</p>
      : <div className="table-wrap"><table>
          <thead><tr><th>Part</th><th>Qty</th><th>Unit cost</th><th>Line</th><th/></tr></thead>
          <tbody>
            {fitted.map((part) => <tr key={part.id}>
              <td><strong>{part.productName}</strong></td>
              <td>{part.quantity}</td>
              <td>{formatLKR(part.unitCost)}</td>
              <td><strong>{formatLKR(part.unitCost * part.quantity)}</strong></td>
              <td><button className="btn secondary" disabled={busy} onClick={() => onRemove(part.id)}>Return to stock</button></td>
            </tr>)}
          </tbody>
        </table></div>}

    {parts.some((part) => part.quantity === 0) && (
      <p className="muted">A part returned to stock stays listed at zero, so the repair still shows it was fitted and taken back off.</p>
    )}

    <h3>Record a part</h3>
    <div className="form-actions">
      <label>Part
        <select className="filter-select" value={productId} onChange={(event) => setProductId(event.target.value)}>
          <option value="">Select a part…</option>
          {products.map((product) => (
            <option key={product.id} value={product.id}>
              {product.sku} — {product.name} ({product.stockOnHand - product.reserved} available)
            </option>
          ))}
        </select>
      </label>
      <label>Quantity
        <input type="number" min="1" step="1" value={quantity} onChange={(event) => setQuantity(event.target.value)}/>
      </label>
      <button className="btn" disabled={busy || !productId} onClick={onAdd}>Record part</button>
    </div>
    {selected && (
      <p className="muted">
        {selected.name}: {selected.stockOnHand} on hand, {selected.reserved} reserved,
        {" "}{selected.stockOnHand - selected.reserved} available to fit.
      </p>
    )}
    <p className="muted">
      Recording a part takes it off the shelf immediately and writes a stock movement naming {repair.jobNumber}.
      Units held for another repair are not available here.
    </p>
  </Card>;
}

function RepairDetails({ jobNumber, technician = false, actor, navigate }: {
  jobNumber: string;
  technician?: boolean;
  actor: User;
  navigate: (to: string, param?: string) => void;
}) {
  const { db, bump } = useDb();
  const { data, loading } = useQuery(
    async (d) => ({
      jobs: await d.repairs.list(),
      users: await d.users.list(),
      products: await d.products.list(),
    }),
    [],
  );
  const [partProductId, setPartProductId] = useState("");
  const [partQty, setPartQty] = useState("1");
  const [tab, setTab] = useState("Overview");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const repair = useMemo(
    () => (data?.jobs ?? []).find((r) => r.jobNumber === jobNumber),
    [data, jobNumber],
  );
  const techs = useMemo(() => technicianNames(data?.users ?? []), [data]);
  const { data: history } = useQuery(
    async (d) => (repair ? await d.repairs.history(repair.id) : []),
    [repair?.id ?? ""],
  );
  // Parts consumed on this repair, and what could still be fitted.
  const { data: partRows } = useQuery(
    async (d) => (repair ? await d.repairs.parts(repair.id) : []),
    [repair?.id ?? ""],
  );

  if (loading) return <Card><p className="muted">Loading repair…</p></Card>;
  if (!repair) {
    return <Card><h2>Repair not found</h2><p className="danger-text" role="alert">No repair matches {jobNumber ? `"${jobNumber}"` : "that reference"}.</p><Button kind="secondary" onClick={() => navigate("Repairs")}>Back to repairs</Button></Card>;
  }

  /** §28.10 — only the moves the workflow and this role actually permit. */
  const moves = nextRepairStatuses(repair.status).map((to) => ({
    to,
    ...mayPerformRepairTransition(toDomainRole(actor.role), repair.status, to),
  }));

  const moveTo = async (to: RepairStatus) => {
    setBusy(true);
    setError("");
    try {
      await db.repairs.changeStatus(repair.id, to, actor.id);
      bump();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update the status.");
    } finally {
      setBusy(false);
    }
  };

  const tabs = technician
    ? ["Overview", "Diagnosis", "Parts", "Activities", "Testing", "Warranty"]
    : ["Overview", "Diagnosis", "Estimate", "Parts", "Activities", "Testing", "Invoice", "Warranty"];
  const trail = history ?? [];
  const currentIndex = trail.length ? trail.length - 1 : 0;

  return <><Card className="repair-hero"><div className="repair-device"><div className="device-icon"><Icon name="laptop" size={25}/></div><div><div><span>{repair.jobNumber}</span><Badge>{STATUS_LABEL[repair.status]}</Badge></div><h2>{repair.deviceSummary}</h2><p>{repair.customerName} · {PRIORITY_LABEL[repair.priority]} priority</p></div></div><div className="repair-facts"><div><span>Technician</span><strong>{techs[repair.technicianId] ?? "Unassigned"}</strong></div><div><span>Estimated completion</span><strong>{formatEta(repair)}</strong></div>{!technician && <div><span>Labour so far</span><strong>{formatLKR(repair.labourCost)}</strong></div>}</div></Card>
    <div className="tabs">{tabs.map((x) => <button className={tab === x ? "active" : ""} onClick={() => setTab(x)} key={x}>{x}</button>)}</div>
    <div className="detail-grid">{tab === "Parts" ? <RepairPartsPanel
        repair={repair}
        parts={partRows ?? []}
        products={(data?.products ?? []).filter((product) => product.branchId === repair.branchId && !product.isService)}
        productId={partProductId}
        setProductId={setPartProductId}
        quantity={partQty}
        setQuantity={setPartQty}
        busy={busy}
        error={error}
        onAdd={async () => {
          setBusy(true); setError("");
          try {
            await db.repairs.addPart({ repairId: repair.id, productId: partProductId, quantity: Number(partQty), actorId: actor.id });
            setPartProductId(""); setPartQty("1"); bump();
          } catch (err) {
            setError(err instanceof Error ? err.message : "Could not record that part.");
          } finally { setBusy(false); }
        }}
        onRemove={async (partUsageId) => {
          setBusy(true); setError("");
          try { await db.repairs.removePart(partUsageId, actor.id); bump(); }
          catch (err) { setError(err instanceof Error ? err.message : "Could not return that part."); }
          finally { setBusy(false); }
        }}
      /> : <Card><div className="card-head"><div><h2>{tab === "Overview" ? "Repair workflow" : tab}</h2><p>Connected repair record and activity</p></div></div>
      <div className="timeline">{trail.length === 0 && <p className="muted">No status history yet.</p>}
        {trail.map((entry, i) => <div className={i < currentIndex ? "complete" : "current"} key={`${entry.seq}-${entry.at}`}><span>{i < currentIndex ? <Icon name="check" size={13}/> : i + 1}</span><small>{STATUS_LABEL[entry.to] ?? entry.to}</small></div>)}</div>
      {moves.length > 0 && <><h3>Move this repair on</h3><div className="payment-methods">{moves.map((m) => <button key={m.to} className={m.allowed ? "active" : ""} disabled={!m.allowed || busy} title={m.allowed ? "" : m.reason} onClick={() => moveTo(m.to)}>{STATUS_LABEL[m.to] ?? m.to}</button>)}</div></>}
      {error && <p className="danger-text" role="alert">{error}</p>}
    </Card>}<Card className="customer-panel"><h2>Customer & device</h2><div className="customer-line"><div className="avatar">{repair.customerName.split(" ").map((x) => x[0]).join("").slice(0, 2)}</div><div><strong>{repair.customerName}</strong><span>{repair.phone}</span></div></div><hr/><div className="info-list"><div><span>Serial number</span><strong>{repair.serialNumber || "—"}</strong></div><div><span>Complaint</span><strong>{repair.reportedIssue}</strong></div><div><span>Accessories</span><strong>{repair.accessoriesReceived.length ? repair.accessoriesReceived.join(", ") : "None"}</strong></div></div></Card></div>
  </>;
}
const CATEGORY_ICON: Record<string, IconName> = {
  Accessories: "tool", Chargers: "tool", Cables: "tool", "Spare Parts": "tool", Services: "tool",
};

function POS({ cart, setCart, actor }: {
  cart: Record<string, number>;
  setCart: React.Dispatch<React.SetStateAction<Record<string, number>>>;
  actor: User;
}) {
  const { db, bump } = useDb();
  const { data: posData, loading } = useQuery(
    async (d) => ({
      products: await d.products.list(),
      held: await d.heldSales.list(actor.branchId),
      customers: await d.customers.list(),
    }),
    [actor.branchId],
  );
  const all = posData?.products ?? [];
  const held = posData?.held ?? [];
  const customers = posData?.customers ?? [];

  const [term, setTerm] = useState("");
  const [category, setCategory] = useState("All products");
  const [method, setMethod] = useState<"cash" | "card" | "bank_transfer">("cash");
  const [discount, setDiscount] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [receipt, setReceipt] = useState<{ number: string; total: number; method: string } | null>(null);
  const [customerId, setCustomerId] = useState("");
  const [pickingCustomer, setPickingCustomer] = useState(false);
  const [customerTerm, setCustomerTerm] = useState("");

  const categories = useMemo(
    () => ["All products", ...Array.from(new Set(all.map((p) => p.category)))],
    [all],
  );

  const visible = useMemo(() => {
    const needle = term.trim().toLowerCase();
    return all.filter((p) => {
      if (category !== "All products" && p.category !== category) return false;
      if (!needle) return true;
      return `${p.name} ${p.sku} ${p.barcode}`.toLowerCase().includes(needle);
    });
  }, [all, term, category]);

  const byId = useMemo(() => new Map(all.map((p) => [p.id, p])), [all]);
  const lines = useMemo(
    () => Object.entries(cart).map(([id, quantity]) => ({ product: byId.get(id), quantity })).filter((l): l is { product: Product; quantity: number } => Boolean(l.product)),
    [cart, byId],
  );

  // One money rule for the whole app: the same domain function the repository
  // uses at checkout, so the cart and the saved sale can never disagree.
  const totals = useMemo(
    () => computeDocument(
      {
        labourCost: 0,
        partsCost: lines.reduce((s, l) => s + l.product.priceCents * l.quantity, 0),
        discount,
        taxRate: 0,
      },
      false,
    ),
    [lines, discount],
  );

  const itemCount = lines.reduce((s, l) => s + l.quantity, 0);

  const change = (id: string, next: number) => setCart((c) => {
    const copy = { ...c };
    if (next <= 0) delete copy[id];
    else copy[id] = next;
    return copy;
  });

  /** A line can never exceed what is actually available to sell. */
  const availableFor = (product: Product) =>
    product.stockOnHand - product.reserved - (cart[product.id] ?? 0) + (cart[product.id] ?? 0);

  const holdSale = async () => {
    if (!lines.length) { setError("There is nothing in the cart to hold."); return; }
    setBusy(true);
    setError("");
    try {
      await db.heldSales.hold({
        branchId: actor.branchId === "all" ? "br_colombo" : actor.branchId,
        cashierId: actor.id,
        customerId: customerId || undefined,
        customerName: customers.find((c) => c.id === customerId)?.fullName ?? "",
        items: lines.map((l) => ({ productId: l.product.id, quantity: l.quantity })),
        discount,
      });
      setCart({});
      setDiscount(0);
      bump();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not hold the sale.");
    } finally {
      setBusy(false);
    }
  };

  const resume = async (heldId: string) => {
    const parked = held.find((h) => h.id === heldId);
    if (!parked) return;
    setCart(Object.fromEntries(parked.items.map((i) => [i.productId, i.quantity])));
    setDiscount(parked.discount);
    setCustomerId(parked.customerId);
    setReceipt(null);
    await db.heldSales.discard(heldId);
    bump();
  };

  const discardHeld = async (heldId: string) => {
    await db.heldSales.discard(heldId);
    bump();
  };

  const complete = async () => {
    if (!lines.length) { setError("Add at least one product to the cart."); return; }
    setBusy(true);
    setError("");
    try {
      const sale = await db.sales.checkout({
        branchId: actor.branchId === "all" ? "br_colombo" : actor.branchId,
        customerId: customerId || undefined,
        lines: lines.map((l) => ({ productId: l.product.id, quantity: l.quantity })),
        discount,
        taxEnabled: false,
        paymentMethod: method,
        cashierId: actor.id,
        idempotencyKey: `pos-${Date.now()}-${itemCount}`,
      });
      setCart({});
      setDiscount(0);
      setCustomerId("");
      bump();
      setReceipt({ number: sale.receiptNumber, total: sale.total, method });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not complete the sale.");
    } finally {
      setBusy(false);
    }
  };

  return <div className="pos-layout"><div className="pos-products"><div className="pos-search"><Icon name="search"/><input value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Search products, SKU or scan barcode..."/><kbd>F2</kbd></div><div className="category-row">{categories.map((x) => <button className={category === x ? "active" : ""} key={x} onClick={() => setCategory(x)}>{x}</button>)}</div><div className="product-grid">{loading && <p className="muted">Loading products…</p>}
      {!loading && visible.length === 0 && <p className="muted">No products match that search.</p>}
      {visible.map((p) => <Card className="product-card" key={p.id}><div className="product-icon"><Icon name={CATEGORY_ICON[p.category] ?? "tool"} size={28}/></div><div className="stock-pill">{p.stockOnHand - p.reserved} available</div><h3>{p.name}</h3><p>{p.sku}</p><div><strong>{formatLKR(p.priceCents)}</strong><button onClick={() => change(p.id, (cart[p.id] ?? 0) + 1)}><Icon name="plus" size={17}/></button></div></Card>)}</div></div>
    <Card className="cart-panel"><div className="cart-head"><div><h2>Current sale</h2><p>{itemCount} item{itemCount === 1 ? "" : "s"}</p></div><button className="more-btn" onClick={() => setCart({})} title="Clear the cart"><Icon name="more"/></button></div>{customerId
        ? <button className="customer-add" onClick={() => { setCustomerId(""); }} title="Remove the customer and sell as a walk-in"><Icon name="users"/><span><strong>{customers.find((c) => c.id === customerId)?.fullName ?? "Customer"}</strong><small>Click to sell as a walk-in instead</small></span><Icon name="check"/></button>
        : <button className="customer-add" onClick={() => { setPickingCustomer((v) => !v); setCustomerTerm(""); }}><Icon name="users"/><span><strong>Add customer</strong><small>Optional for walk-in sales</small></span><Icon name="chevron"/></button>}
      {pickingCustomer && !customerId && <div className="customer-picker"><div className="input"><Icon name="search"/><input autoFocus value={customerTerm} onChange={(e) => setCustomerTerm(e.target.value)} placeholder="Search name or phone"/></div>
        {customers.filter((c) => `${c.fullName} ${c.phone}`.toLowerCase().includes(customerTerm.trim().toLowerCase())).slice(0, 6).map((c) => <button className="customer-choice" key={c.id} onClick={() => { setCustomerId(c.id); setPickingCustomer(false); }}><div className="avatar">{c.fullName.split(" ").map((x) => x[0]).join("").slice(0, 2)}</div><div><strong>{c.fullName}</strong><span>{c.phone}</span></div></button>)}
        {customers.filter((c) => `${c.fullName} ${c.phone}`.toLowerCase().includes(customerTerm.trim().toLowerCase())).length === 0 && <p className="muted">No customer matches that search.</p>}
      </div>}
      <div className="cart-items">{lines.length === 0 && <p className="muted">The cart is empty.</p>}
        {lines.map(({ product: p, quantity: q }) => {
          const max = p.stockOnHand - p.reserved;
          return <div className="cart-item" key={p.id}><div className="product-mini"><Icon name={CATEGORY_ICON[p.category] ?? "tool"}/></div><div><strong>{p.name}</strong><span>{formatLKR(p.priceCents)} · {max} available</span><div className="qty"><button onClick={() => change(p.id, q - 1)}><Icon name="minus" size={13}/></button><span>{q}</span><button onClick={() => q < max ? change(p.id, q + 1) : setError(`Only ${max} of "${p.name}" available.`)}><Icon name="plus" size={13}/></button></div></div><strong>{formatLKR(p.priceCents * q)}</strong></div>;
        })}</div>
      <div className="cart-summary"><div><span>Subtotal</span><strong>{formatLKR(totals.gross)}</strong></div>
        <div><span>Discount</span><input className="input" type="number" min={0} value={discount / 100} onChange={(e) => setDiscount(Math.max(0, Math.round((Number(e.target.value) || 0) * 100)))} style={{ width: 90 }} placeholder="0"/></div>
        <div><span>Tax</span><strong>{formatLKR(totals.taxAmount)}</strong></div>
        <div className="total"><span>Total</span><strong>{formatLKR(totals.total)}</strong></div></div>
      {receipt && <p className="success-text" role="status">Sale {receipt.number} completed · {formatLKR(receipt.total)} · {receipt.method}</p>}
      {error && <p className="danger-text" role="alert">{error}</p>}
      <div className="payment-methods">{(["cash", "card", "bank_transfer"] as const).map((x) => <button className={method === x ? "active" : ""} key={x} onClick={() => setMethod(x)}><Icon name={x === "bank_transfer" ? "transfer" : x}/>{x === "bank_transfer" ? "Bank" : x[0].toUpperCase() + x.slice(1)}</button>)}</div>
      <Button onClick={complete}>{busy ? "Completing…" : `Complete sale · ${formatLKR(totals.total)}`}</Button>
      {held.length > 0 && <div className="held-sales"><h3>Held sales</h3>{held.map((h) => <div className="held-row" key={h.id}><div><strong>{h.items.reduce((sum, i) => sum + i.quantity, 0)} item{h.items.reduce((sum, i) => sum + i.quantity, 0) === 1 ? "" : "s"}</strong><span>{new Date(h.createdAt).toLocaleTimeString()}{h.customerName ? ` · ${h.customerName}` : " · Walk-in"}</span></div><div className="held-actions"><button className="btn secondary" onClick={() => resume(h.id)}>Resume</button><button className="btn ghost" onClick={() => discardHeld(h.id)}>Discard</button></div></div>)}</div>}<Button kind="secondary" onClick={holdSale}>Hold sale</Button>
    </Card></div>;
}

function AIDiagnosis() {
  const [device, setDevice] = useState("laptop");
  const [brand, setBrand] = useState("");
  const [complaint, setComplaint] = useState("");
  const [observations, setObservations] = useState("");
  const [result, setResult] = useState<DiagnosisResult | null>(null);

  const run = () => setResult(suggestDiagnosis({
    complaint: `${complaint} ${brand}`.trim(),
    observations,
    deviceCategory: device,
  }));
  const plan = result ? inspectionPlan(result) : [];

  return <div className="ai-page"><div className="ai-banner"><div className="ai-orb"><Icon name="brain" size={30}/></div><div><span>RULE-BASED ASSISTANT</span><h2>Diagnosis Assistant</h2><p>Matches reported symptoms against the built-in fault rule base. No external AI service is connected.</p></div></div>
    <div className="ai-grid"><Card className="ai-form"><div className="card-head"><div><h2>Device information</h2><p>Provide accurate details for a stronger analysis.</p></div><Badge tone="ai">Rule base</Badge></div><div className="form-grid"><label>Device type<select value={device} onChange={(e) => setDevice(e.target.value)}>{["laptop","desktop","mobile","tablet","other"].map((c) => <option key={c} value={c}>{c[0].toUpperCase() + c.slice(1)}</option>)}</select></label><label>Brand & model<input value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="Dell Latitude 5420"/></label></div><label>Customer complaint<textarea value={complaint} onChange={(e) => setComplaint(e.target.value)} placeholder="Describe what the customer reported."/></label><label>Technician observations<textarea value={observations} onChange={(e) => setObservations(e.target.value)} placeholder="Add initial observations, error codes or tests performed..."/></label><div className="advisory"><Icon name="alert"/><span>Suggestions come from a local rule base and are advisory only. Review before applying to the repair record.</span></div><Button icon="spark" onClick={run} disabled={!complaint.trim()}>Analyze symptoms</Button></Card>
      <Card className={`ai-results ${result ? "visible" : ""}`}>{!result?<div className="empty-ai"><div className="ai-orb subtle"><Icon name="spark"/></div><h3>Ready to analyze</h3><p>Describe the fault and run the analysis to get likely causes and an inspection order.</p></div>:<>
        <div className="card-head"><div><span className="ai-label"><Icon name="spark" size={14}/> Analysis complete</span><h2>Diagnostic insight</h2></div><span className="confidence">{result.matches.length} match{result.matches.length === 1 ? "" : "es"}</span></div>
        {result.noMatch
          ? <div className="empty-ai"><div className="ai-orb subtle"><Icon name="alert"/></div><h3>No rule matched</h3><p>Nothing in the rule base fits those symptoms. {result.unmatchedTerms.length ? `Unrecognised terms: ${result.unmatchedTerms.join(", ")}.` : ""} Inspect manually, or add a rule for this fault.</p></div>
          : <>
            {result.matches.slice(0, 4).map((match, index) => <div className="cause" key={match.ruleId}><div><strong>{index + 1}</strong></div><div><h3>{match.title}</h3><p>{match.explanation}</p><span>Matched on: {match.matchedKeywords.join(", ")} · score {Math.round(match.score * 100)}%</span></div></div>)}
            <div className="inspection"><h3>Recommended inspection</h3>{plan.map((step, i) => <div key={step}><span>{i + 1}</span>{step}</div>)}</div>
          </>}
      </>}</Card>
    </div></div>;
}
const NOTIFICATION_ICON: Record<string, IconName> = {
  low_stock: "alert",
  estimate_approval_request: "file",
  new_repair: "tool",
  parts_available: "package",
  repair_status: "check",
  payment_receipt: "cash",
};

function ModulePreview({ page, user, source }: { page: string; user: User; source: { repairs: RepairJob[]; products: Product[] } }) {
  if (page === "Notifications") {
    // §21 — derived from live records. A notification that cannot be traced to
    // a record trains people to ignore the panel.
    const notes = deriveNotifications({
      role: user.role,
      technicianId: user.technicianId,
      repairs: source.repairs,
      products: source.products,
    });
    return <Card className="notification-center"><div className="card-head table-title"><div><h2>Your notifications</h2><p>Derived from live records for {user.name}</p></div></div>
      {notes.length === 0 && <p className="muted">Nothing needs your attention right now.</p>}
      {notes.map((note, index) => <div className="notification-row" key={note.id}><div className={`kpi-icon ${note.severity === "warning" ? "amber" : note.severity === "success" ? "cyan" : index === 0 ? "purple" : "blue"}`}><Icon name={NOTIFICATION_ICON[note.kind] ?? "bell"}/></div><div><strong>{note.title}</strong><p>{note.body}</p><span>{note.link}</span></div>{index === 0 && <i/>}</div>)}
    </Card>;
  }
  // Anything reaching here is a sidebar label with no screen behind it. It says
  // so plainly. Inventing record counts, growth percentages or a "connected and
  // ready" claim for a module that does not exist is worse than an empty state,
  // because it cannot be distinguished from a module that does work (§32).
  return <Card className="empty-module"><Icon name="settings" size={32}/><h2>{page} is not built yet</h2><p>This menu item has no screen behind it. Nothing on this page is connected to your data, and no records will appear here until the module is implemented.</p></Card>;
}

function SearchModal({ user, data, close, navigate }: { user: User; data: RepairRow[]; close:()=>void; navigate:(p:string)=>void }) {
  const [query, setQuery] = useState("");
  const actions: Record<Role, Array<[string,string,IconName]>> = {
    Admin: [["Create new repair","New Repair","plus"],["Open point of sale","POS","cart"],["Run AI diagnosis","AI Diagnosis","brain"]],
    Manager: [["View branch repairs","Repairs","tool"],["Open point of sale","POS","cart"],["View branch inventory","Inventory","box"]],
    Technician: [["Open my repairs","My Repairs","tool"],["Run diagnosis","Diagnosis","brain"],["View testing queue","Testing","check"]],
    Cashier: [["Open point of sale","POS","cart"],["Search branch customers","Customers","users"],["Open cash register","Cash Register","cash"]],
    Customer: [["Track my repair","My Repairs","tool"],["View my invoice","Invoices","file"],["Contact support","Support","phone"]],
  };
  const visibleRepairs = query.trim() ? data.filter((repair) => `${repair.id} ${repair.device} ${repair.customer}`.toLowerCase().includes(query.toLowerCase())) : [];
  return <div className="modal-wrap" onMouseDown={close}><div className="search-modal" onMouseDown={e=>e.stopPropagation()}><div className="command-input"><Icon name="search"/><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Search your ${user.role.toLowerCase()} workspace...`}/><kbd>ESC</kbd></div>{visibleRepairs.length > 0 && <div className="search-section"><span>AUTHORIZED REPAIR RESULTS</span>{visibleRepairs.map((repair)=><button key={repair.id} onClick={()=>navigate(user.role === "Customer" ? "My Repair Details" : "Repair Details")}><span><Icon name="tool"/></span><div><strong>{repair.device}</strong><small>{repair.id} · {repair.status}</small></div><Icon name="chevron"/></button>)}</div>}<div className="search-section"><span>{query ? "AUTHORIZED ACTIONS" : "QUICK ACTIONS"}</span>{actions[user.role].map(([label,page,icon])=><button key={label} onClick={()=>navigate(page)}><span><Icon name={icon}/></span><div><strong>{label}</strong><small>{page}</small></div><Icon name="chevron"/></button>)}</div><div className="search-foot"><span><kbd>↑</kbd><kbd>↓</kbd> Navigate</span><span><kbd>↵</kbd> Open</span><span className="search-scope"><Icon name="shield" size={12}/>{user.role} results only</span></div></div></div>;
}

export default App;
