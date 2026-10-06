import { useEffect, useMemo, useState } from "react";

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
  Admin: { id: "admin-1", name: "Admin Perera", email: "admin@fixflow.com", role: "Admin", branchId: "all", branch: "All branches" },
  Manager: { id: "manager-1", name: "Kaveesha Gehan", email: "manager@fixflow.com", role: "Manager", branchId: "colombo", branch: "Colombo 03" },
  Technician: { id: "tech-1", technicianId: "tech-1", name: "John Silva", email: "technician@fixflow.com", role: "Technician", branchId: "colombo", branch: "Colombo 03" },
  Cashier: { id: "cashier-1", name: "Dinithi Perera", email: "cashier@fixflow.com", role: "Cashier", branchId: "colombo", branch: "Colombo 03" },
  Customer: { id: "customer-1", customerId: "cust-1", name: "Nimal Perera", email: "customer@fixflow.com", role: "Customer", branchId: "colombo", branch: "Colombo 03" },
};

type IconName =
  | "grid" | "tool" | "board" | "plus" | "users" | "cart" | "sale" | "cash"
  | "box" | "transfer" | "truck" | "file" | "card" | "shield" | "wallet"
  | "spark" | "chart" | "bell" | "branch" | "team" | "settings" | "search"
  | "sun" | "moon" | "chevron" | "arrow" | "more" | "clock" | "check"
  | "alert" | "package" | "phone" | "laptop" | "filter" | "download" | "menu"
  | "close" | "brain" | "send" | "receipt" | "minus";

const paths: Record<IconName, React.ReactNode> = {
  grid: <><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></>,
  tool: <><path d="M14.7 6.3a4 4 0 0 0-5-5L12 3.6 9.6 6 7.3 3.7a4 4 0 0 0 5 5l-8.5 8.5a2.1 2.1 0 0 0 3 3l8.5-8.5a4 4 0 0 0 5-5L18 9l-2.4-2.4 2.3-2.3a4 4 0 0 0-3.2 2z"/></>,
  board: <><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M8 8v8M16 8v5"/></>,
  plus: <path d="M12 5v14M5 12h14"/>,
  users: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/></>,
  cart: <><circle cx="9" cy="20" r="1"/><circle cx="19" cy="20" r="1"/><path d="M3 4h2l2.6 11.4a2 2 0 0 0 2 1.6h7.8a2 2 0 0 0 2-1.6L21 8H6"/></>,
  sale: <><path d="M20 12v8H4V4h8"/><path d="m14 3 7 7M21 3v7h-7"/></>,
  cash: <><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2"/><path d="M6 10v4M18 10v4"/></>,
  box: <><path d="m21 8-9-5-9 5 9 5 9-5Z"/><path d="m3 8 9 5 9-5v9l-9 5-9-5Z"/><path d="M12 13v9"/></>,
  transfer: <><path d="M7 7h11l-3-3M17 17H6l3 3"/><path d="m18 7-3 3M6 17l3-3"/></>,
  truck: <><path d="M3 6h11v10H3zM14 10h4l3 3v3h-7z"/><circle cx="7" cy="18" r="2"/><circle cx="18" cy="18" r="2"/></>,
  file: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h5"/></>,
  card: <><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/></>,
  shield: <><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/><path d="m9 12 2 2 4-4"/></>,
  wallet: <><path d="M20 7V5a2 2 0 0 0-2-2H5a3 3 0 0 0 0 6h15v12H5a3 3 0 0 1-3-3V6"/><path d="M16 13h2"/></>,
  spark: <><path d="m12 3-1.3 4.2L6.5 8.5l4.2 1.3L12 14l1.3-4.2 4.2-1.3-4.2-1.3L12 3Z"/><path d="m19 14-.8 2.2-2.2.8 2.2.8.8 2.2.8-2.2 2.2-.8-2.2-.8L19 14ZM5 14l-.7 1.7-1.8.8 1.8.7L5 19l.7-1.8 1.8-.7-1.8-.8L5 14Z"/></>,
  brain: <><path d="M9.5 4A3 3 0 0 0 4 5.5a3 3 0 0 0-1 5.8V13a3 3 0 0 0 3 3h1v1a3 3 0 0 0 5 2.2V5.5A3.5 3.5 0 0 0 9.5 4Z"/><path d="M14.5 4A3 3 0 0 1 20 5.5a3 3 0 0 1 1 5.8V13a3 3 0 0 1-3 3h-1v1a3 3 0 0 1-5 2.2V5.5A3.5 3.5 0 0 1 14.5 4ZM8 9a3 3 0 0 0 4 0M16 9a3 3 0 0 1-4 0"/></>,
  chart: <><path d="M3 3v18h18"/><path d="m7 16 4-5 3 2 5-7"/></>,
  bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></>,
  branch: <><circle cx="6" cy="5" r="2"/><circle cx="18" cy="5" r="2"/><circle cx="12" cy="19" r="2"/><path d="M6 7v3c0 2 2 3 6 3s6-1 6-3V7M12 13v4"/></>,
  team: <><circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2"/><path d="M3 20v-2a5 5 0 0 1 10 0v2M14 16a4 4 0 0 1 7 3v1"/></>,
  settings: <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.6v-.2h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z"/></>,
  search: <><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></>,
  sun: <><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></>,
  moon: <path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8Z"/>,
  chevron: <path d="m9 18 6-6-6-6"/>,
  arrow: <path d="M5 12h14M13 6l6 6-6 6"/>,
  more: <><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></>,
  clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
  check: <path d="m5 12 4 4L19 6"/>,
  alert: <><path d="M10.3 3.6 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.6a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4M12 17h.01"/></>,
  package: <><path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3 8 9 5 9-5v9l-9 5-9-5V8Z"/></>,
  phone: <><rect x="6" y="2" width="12" height="20" rx="2"/><path d="M10 18h4"/></>,
  laptop: <><rect x="4" y="3" width="16" height="13" rx="2"/><path d="M2 20h20"/></>,
  filter: <path d="M4 5h16l-6 7v5l-4 2v-7L4 5Z"/>,
  download: <><path d="M12 3v12M7 10l5 5 5-5"/><path d="M5 21h14"/></>,
  menu: <path d="M4 7h16M4 12h16M4 17h16"/>,
  close: <path d="m6 6 12 12M18 6 6 18"/>,
  send: <><path d="m22 2-7 20-4-9-9-4 20-7Z"/><path d="M22 2 11 13"/></>,
  receipt: <><path d="M6 2h12v20l-3-2-3 2-3-2-3 2V2Z"/><path d="M9 7h6M9 11h6M9 15h3"/></>,
  minus: <path d="M5 12h14"/>,
};

function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

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

const repairs = [
  { id: "FX-2026-004821", customerId: "cust-1", technicianId: "tech-1", branchId: "colombo", customer: "Nimal Perera", device: "Dell Latitude 5420", tech: "John Silva", priority: "High", status: "In Progress", amount: "Rs. 18,500", eta: "Today, 4:30 PM" },
  { id: "FX-2026-004820", customerId: "cust-2", technicianId: "tech-2", branchId: "colombo", customer: "Amaya Fernando", device: "iPhone 13", tech: "K. Silva", priority: "Normal", status: "Testing", amount: "Rs. 42,000", eta: "Today, 2:00 PM" },
  { id: "FX-2026-004819", customerId: "cust-3", technicianId: "tech-1", branchId: "colombo", customer: "Kasun Silva", device: "HP Victus 15", tech: "John Silva", priority: "Urgent", status: "Awaiting Parts", amount: "Rs. 12,800", eta: "Tomorrow" },
  { id: "FX-2026-004818", customerId: "cust-4", technicianId: "tech-3", branchId: "colombo", customer: "Tharindu Jayasinghe", device: "Samsung Galaxy S23", tech: "A. Perera", priority: "Normal", status: "Ready for Pickup", amount: "Rs. 28,500", eta: "Ready now" },
  { id: "FX-2026-004817", customerId: "cust-5", technicianId: "tech-2", branchId: "kandy", customer: "Ruwani Dias", device: "Lenovo ThinkPad T14", tech: "K. Silva", priority: "Low", status: "Diagnosing", amount: "Rs. 6,500", eta: "Mar 22" },
];

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

function recordsFor(user: User) {
  if (user.role === "Admin") return repairs;
  if (user.role === "Customer") return repairs.filter((r) => r.customerId === user.customerId);
  if (user.role === "Technician") return repairs.filter((r) => r.technicianId === user.technicianId);
  return repairs.filter((r) => r.branchId === user.branchId);
}

const products = [
  { name: "65W Laptop Charger", sku: "CHR-65W-001", price: 6500, stock: 14, icon: "laptop" as IconName, cat: "Chargers" },
  { name: "USB-C Fast Cable", sku: "CBL-USC-014", price: 1850, stock: 32, icon: "transfer" as IconName, cat: "Cables" },
  { name: "DDR4 8GB RAM", sku: "RAM-D4-8GB", price: 9200, stock: 8, icon: "box" as IconName, cat: "Spare Parts" },
  { name: "512GB NVMe SSD", sku: "SSD-NV-512", price: 14500, stock: 11, icon: "package" as IconName, cat: "Spare Parts" },
  { name: "iPhone 13 Display", sku: "DSP-IP13-O", price: 38500, stock: 3, icon: "phone" as IconName, cat: "Spare Parts" },
  { name: "Premium Thermal Paste", sku: "SRV-THM-005", price: 2200, stock: 24, icon: "tool" as IconName, cat: "Services" },
];

function Button({ children, kind = "primary", icon, onClick }: { children: React.ReactNode; kind?: "primary" | "secondary" | "ghost"; icon?: IconName; onClick?: () => void }) {
  return <button className={`btn ${kind}`} onClick={onClick}>{icon && <Icon name={icon} size={16} />}<span>{children}</span></button>;
}

function Badge({ children, tone }: { children: React.ReactNode; tone?: string }) {
  const t = tone || String(children).toLowerCase().replaceAll(" ", "-");
  return <span className={`badge ${t}`}><span className="badge-dot"/>{children}</span>;
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
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
  const [dark, setDark] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [cart, setCart] = useState<Record<string, number>>({ "USB-C Fast Cable": 2 });
  const [analyzed, setAnalyzed] = useState(false);

  const currentNav = user ? roleNav[user.role] : [];
  const navPages = useMemo(() => currentNav.flatMap((group) => group.items.map(([label]) => label)), [currentNav]);
  const extraPages = user?.role === "Admin" || user?.role === "Manager" ? ["Repair Details", "New Repair", "Profile"] : user?.role === "Technician" ? ["Repair Details", "Profile"] : user?.role === "Customer" ? ["My Repair Details", "Profile"] : ["Profile"];
  const allowedPages = [...navPages, ...extraPages];
  const scopedRepairs = user ? recordsFor(user) : [];

  const routeFor = (to: string, activeUser = user) => {
    if (!activeUser) return "/login";
    const slug = to.toLowerCase().replaceAll(" ", "-");
    return `/${activeUser.role.toLowerCase()}/${slug}`;
  };
  const navigate = (to: string) => {
    if (!user || ![...allowedPages, "Dashboard"].includes(to)) {
      to = "Dashboard";
    }
    setPage(to);
    setMobileNav(false);
    setProfileOpen(false);
    window.history.pushState({ page: to }, "", routeFor(to));
  };
  const login = (nextUser: User, remember: boolean) => {
    setUser(nextUser);
    setPage("Dashboard");
    if (remember) localStorage.setItem("fixflow-session", JSON.stringify(nextUser));
    else localStorage.removeItem("fixflow-session");
    window.history.replaceState({ page: "Dashboard" }, "", routeFor("Dashboard", nextUser));
  };
  const logout = () => {
    localStorage.removeItem("fixflow-session");
    setUser(null);
    setPage("Dashboard");
    setProfileOpen(false);
    window.history.replaceState({}, "", "/login");
  };

  useEffect(() => {
    const guardBrowserRoute = () => {
      if (!user) {
        window.history.replaceState({}, "", "/login");
        return;
      }
      const statePage = window.history.state?.page as string | undefined;
      if (statePage && [...allowedPages, "Dashboard"].includes(statePage)) setPage(statePage);
      else if (window.location.pathname !== routeFor(page)) window.history.replaceState({ page: "Dashboard" }, "", routeFor("Dashboard"));
    };
    guardBrowserRoute();
    window.addEventListener("popstate", guardBrowserRoute);
    return () => window.removeEventListener("popstate", guardBrowserRoute);
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
            {!isCustomer && <button className="branch-select"><span className="branch-icon"><Icon name="branch" size={15}/></span><span>{user.branch}</span>{user.role === "Admin" && <Icon name="chevron" size={13}/>}</button>}
            <button className="icon-btn theme-toggle" onClick={() => setDark(!dark)} title="Switch theme"><Icon name={dark ? "sun" : "moon"}/></button>
            <button className="icon-btn notification" onClick={() => navigate("Notifications")}><Icon name="bell"/><span/></button>
            <button className="profile" onClick={() => setProfileOpen(!profileOpen)}><div className="avatar">{initials}</div><div><strong>{user.name}</strong><small>{user.role}</small></div><Icon name="chevron" size={13}/></button>
            {profileOpen && <div className="profile-menu"><div className="profile-menu-head"><div className="avatar">{initials}</div><div><strong>{user.name}</strong><span>{user.email}</span><small>{user.role} · {user.branch}</small></div></div><button onClick={() => navigate("Profile")}><Icon name="team"/>Profile</button>{["Admin", "Manager"].includes(user.role) && <button onClick={() => navigate(user.role === "Admin" ? "Settings" : "Branch Operations")}><Icon name="settings"/>Settings</button>}<button className="logout" onClick={logout}><Icon name="arrow"/>Logout</button></div>}
          </div>
        </header>

        <main>
          <div className="page-head">
            <div><div className="eyebrow">{page === "Dashboard" ? `${user.role} workspace · Monday, March 18` : `Home  /  ${page}`}</div><h1>{title}</h1>{page === "Dashboard" && <p>{isCustomer ? "Track your repairs, approvals, payments and warranty in one place." : `Here's what's happening in your ${user.role === "Admin" ? "repair business" : "workspace"} today.`}</p>}</div>
            <div className="head-actions">
              {page === "Dashboard" && !isCustomer && <button className="date-filter"><Icon name="clock"/><span>Mar 18, 2026</span><Icon name="chevron" size={13}/></button>}
              {page === "Repairs" && canCreateRepair && <><Button kind="secondary" icon="download">Export</Button><Button icon="plus" onClick={() => navigate("New Repair")}>New Repair</Button></>}
            </div>
          </div>

          {page === "Dashboard" && (user.role === "Admin" ? <Dashboard navigate={navigate} data={scopedRepairs}/> : <RoleDashboard user={user} data={scopedRepairs} navigate={navigate}/>)}
          {(page === "Repairs" || page === "My Repairs") && (isCustomer ? <CustomerRepairs data={scopedRepairs} navigate={navigate}/> : <Repairs navigate={navigate} data={scopedRepairs} technician={user.role === "Technician"}/>)}
          {page === "Repair Board" && <RepairBoard data={scopedRepairs}/>}
          {page === "New Repair" && <NewRepair navigate={navigate}/>}
          {page === "Repair Details" && <RepairDetails technician={user.role === "Technician"}/>}
          {page === "My Repair Details" && <CustomerRepairDetails data={scopedRepairs}/>}
          {page === "POS" && <POS cart={cart} setCart={setCart}/>}
          {page === "Inventory" && <Inventory/>}
          {(page === "AI Diagnosis" || page === "Diagnosis") && <AIDiagnosis analyzed={analyzed} setAnalyzed={setAnalyzed}/>}
          {!["Dashboard", "Repairs", "My Repairs", "Repair Board", "New Repair", "Repair Details", "My Repair Details", "POS", "Inventory", "AI Diagnosis", "Diagnosis"].includes(page) && <ModulePreview page={page} user={user}/>}
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

function Dashboard({ navigate, data }: { navigate: (p: string) => void; data: typeof repairs }) {
  const kpis = [
    ["Today's Sales", "Rs. 184,500", "+12.4%", "sale", "blue"],
    ["Active Repairs", "38", "+6 today", "tool", "purple"],
    ["Ready for Pickup", "12", "Rs. 146K value", "check", "cyan"],
    ["Outstanding", "Rs. 326,400", "18 invoices", "wallet", "pink"],
    ["Low Stock Items", "8", "3 critical", "alert", "amber"],
    ["Today's Expenses", "Rs. 24,800", "−8.2%", "receipt", "slate"],
  ] as const;
  return <>
    <div className="kpi-grid">
      {kpis.map(([label, value, change, icon, tone]) => <Card className="kpi" key={label}>
        <div className={`kpi-icon ${tone}`}><Icon name={icon}/></div>
        <div className="kpi-label">{label}<Icon name="more" size={16}/></div>
        <div className="kpi-value">{value}</div>
        <div className={`kpi-change ${change.startsWith("+") ? "positive" : ""}`}>{change} <span>{label === "Today's Sales" ? "vs yesterday" : "updated now"}</span></div>
      </Card>)}
    </div>
    <div className="dashboard-grid">
      <Card className="sales-chart">
        <div className="card-head"><div><h2>Sales overview</h2><p>Revenue performance across all channels</p></div><div className="segments"><button>7D</button><button className="active">30D</button><button>12M</button></div></div>
        <div className="chart-meta"><div><span className="legend purple"/><small>Revenue</small><strong>Rs. 1.84M</strong></div><div><span className="legend blue"/><small>Payments</small><strong>Rs. 1.52M</strong></div></div>
        <div className="line-chart">
          <div className="y-labels"><span>200K</span><span>150K</span><span>100K</span><span>50K</span><span>0</span></div>
          <svg viewBox="0 0 700 220" preserveAspectRatio="none">
            <defs><linearGradient id="area" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#8b5cf6" stopOpacity=".24"/><stop offset="1" stopColor="#8b5cf6" stopOpacity="0"/></linearGradient></defs>
            <path className="area" d="M0 176 C55 150 76 167 120 131 S192 143 240 92 S322 129 370 82 S449 110 498 61 S572 91 620 46 S672 58 700 32 L700 220 L0 220Z"/>
            <path className="chart-line revenue" d="M0 176 C55 150 76 167 120 131 S192 143 240 92 S322 129 370 82 S449 110 498 61 S572 91 620 46 S672 58 700 32"/>
            <path className="chart-line payments" d="M0 190 C60 181 80 143 130 161 S205 124 250 144 S321 106 380 121 S455 83 510 101 S584 67 635 80 S680 53 700 67"/>
          </svg>
          <div className="x-labels"><span>Feb 18</span><span>Feb 24</span><span>Mar 02</span><span>Mar 08</span><span>Mar 14</span><span>Mar 18</span></div>
        </div>
      </Card>
      <Card className="repair-overview">
        <div className="card-head"><div><h2>Repair overview</h2><p>Current workflow</p></div><button className="more-btn"><Icon name="more"/></button></div>
        <div className="donut-wrap"><div className="donut"><div><strong>64</strong><span>Total</span></div></div></div>
        <div className="status-list">
          {[["In progress", 18, "purple"], ["Testing", 12, "blue"], ["Ready for pickup", 12, "cyan"], ["Awaiting approval", 9, "pink"], ["Other", 13, "slate"]].map(([a,b,c]) => <div key={String(a)}><span className={`legend ${c}`}/><span>{a}</span><strong>{b}</strong></div>)}
        </div>
      </Card>
    </div>
    <div className="bottom-grid">
      <Card className="recent">
        <div className="card-head"><div><h2>Recent repairs</h2><p>Latest activity across your workshop</p></div><Button kind="ghost" onClick={() => navigate("Repairs")}>View all <Icon name="arrow" size={15}/></Button></div>
        <RepairTable compact navigate={navigate} data={data}/>
      </Card>
      <Card className="stock-card">
        <div className="card-head"><div><h2>Low stock</h2><p>Items needing attention</p></div><span className="count-badge">8</span></div>
        {products.slice(0,4).map((p, i) => <div className="stock-row" key={p.name}><div className="product-mini"><Icon name={p.icon}/></div><div><strong>{p.name}</strong><span>{p.sku}</span></div><div><strong className={i < 2 ? "danger-text" : ""}>{i + 2} left</strong><span>Min. {i+5}</span></div></div>)}
        <Button kind="secondary" onClick={() => navigate("Inventory")}>Open inventory</Button>
      </Card>
    </div>
  </>;
}

function RoleDashboard({ user, data, navigate }: { user: User; data: typeof repairs; navigate: (page: string) => void }) {
  if (user.role === "Customer") {
    const repair = data[0];
    return <div className="customer-dashboard">
      <Card className="customer-status-hero"><div className="customer-status-copy"><span className="portal-kicker">ACTIVE REPAIR</span><div><h2>{repair?.device || "No active repairs"}</h2>{repair && <Badge>{repair.status}</Badge>}</div><p>{repair?.id} · Estimated completion {repair?.eta}</p><Button onClick={() => navigate("My Repair Details")}>View repair details <Icon name="arrow" size={15}/></Button></div><div className="status-device"><Icon name="laptop" size={42}/><span>Repair in progress</span></div></Card>
      <div className="kpi-grid customer-kpis">
        {[
          ["My Active Repairs", String(data.length), "tool", "purple"],
          ["Pending Quote", "1", "file", "pink"],
          ["Outstanding Invoice", "Rs. 18,500", "receipt", "blue"],
          ["Warranty Status", "43 days", "shield", "cyan"],
        ].map(([label, value, icon, tone]) => <Card className="kpi" key={label}><div className={`kpi-icon ${tone}`}><Icon name={icon as IconName}/></div><div className="kpi-label">{label}</div><div className="kpi-value">{value}</div><div className="kpi-change positive">Up to date <span>your account only</span></div></Card>)}
      </div>
      <div className="customer-home-grid"><Card className="portal-timeline-card"><div className="card-head"><div><h2>Repair progress</h2><p>We'll notify you whenever your repair moves forward.</p></div><Badge>{repair?.status || "No repair"}</Badge></div><div className="portal-progress">{["Received","Diagnosing","Repairing","Testing","Ready for Pickup","Delivered"].map((item, index) => <div className={index < 3 ? "complete" : index === 3 ? "current" : ""} key={item}><span>{index < 3 ? <Icon name="check" size={14}/> : index + 1}</span><div><strong>{item}</strong><small>{index < 3 ? "Completed" : index === 3 ? "Next quality check" : "Pending"}</small></div></div>)}</div></Card>
        <Card className="portal-actions"><div className="card-head"><div><h2>Needs your attention</h2><p>Actions for your account</p></div></div><div className="attention-item"><div className="kpi-icon pink"><Icon name="file"/></div><div><strong>Estimate ready to review</strong><span>Review and approve Rs. 18,500</span></div><Icon name="chevron"/></div><div className="attention-item"><div className="kpi-icon blue"><Icon name="bell"/></div><div><strong>Latest update</strong><span>Repair work is now in progress</span></div><Icon name="chevron"/></div><Button kind="secondary" onClick={() => navigate("Support")}>Contact support</Button></Card>
      </div>
    </div>;
  }

  const roleCards: Record<Exclude<Role, "Admin" | "Customer">, Array<[string, string, IconName, string, string]>> = {
    Manager: [
      ["Branch Repairs", String(data.length), "tool", "purple", "Colombo 03 only"],
      ["Pending Repairs", String(data.filter((r) => r.status.includes("Awaiting")).length), "clock", "pink", "Needs attention"],
      ["Ready for Pickup", String(data.filter((r) => r.status === "Ready for Pickup").length), "check", "cyan", "Branch queue"],
      ["Branch Sales", "Rs. 142,800", "sale", "blue", "+8.4% today"],
      ["Inventory Alerts", "6", "alert", "amber", "2 critical"],
      ["Outstanding", "Rs. 84,500", "wallet", "slate", "Branch invoices"],
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
      ["Today's Sales", "Rs. 86,400", "sale", "blue", "Colombo 03"],
      ["Today's Payments", "24", "card", "purple", "Your branch"],
      ["Open Register", "Rs. 92,500", "cash", "cyan", "Started 8:45 AM"],
      ["Pending Payments", "7", "clock", "pink", "Branch invoices"],
      ["Ready for Pickup", String(data.filter((r) => r.status === "Ready for Pickup").length), "check", "blue", "Paid delivery queue"],
      ["Refund Requests", "1", "transfer", "amber", "Approval required"],
    ],
  };
  const cards = roleCards[user.role as keyof typeof roleCards];
  return <>
    <div className="role-scope"><Icon name={user.role === "Manager" ? "branch" : user.role === "Technician" ? "tool" : "cash"}/><span><strong>{user.role} workspace</strong>Data is restricted to {user.role === "Technician" ? "repairs assigned to you" : `${user.branch} branch`}.</span><Badge tone="in-stock">Protected</Badge></div>
    <div className="kpi-grid">{cards.map(([label, value, icon, tone, note]) => <Card className="kpi" key={label}><div className={`kpi-icon ${tone}`}><Icon name={icon}/></div><div className="kpi-label">{label}</div><div className="kpi-value">{value}</div><div className="kpi-change positive">{note}</div></Card>)}</div>
    {user.role === "Technician" ? <Card className="table-card role-table"><div className="card-head table-title"><div><h2>My assigned repairs</h2><p>Only work assigned directly to your technician account.</p></div><Button kind="ghost" onClick={() => navigate("My Repairs")}>View workspace <Icon name="arrow" size={14}/></Button></div><RepairTable compact data={data} navigate={navigate} showFinancial={false}/></Card> :
      user.role === "Cashier" ? <div className="bottom-grid"><Card className="recent"><div className="card-head table-title"><div><h2>Recent branch transactions</h2><p>Payments processed at your register</p></div><Button kind="ghost" onClick={() => navigate("POS")}>Open POS <Icon name="arrow" size={14}/></Button></div><TransactionList/></Card><Card className="register-card"><div className="card-head"><div><h2>Cash register</h2><p>Register #CR-CO3-04</p></div><Badge tone="in-stock">Open</Badge></div><div className="register-total"><span>Expected cash</span><strong>Rs. 92,500</strong><small>Opening float Rs. 15,000</small></div><Button kind="secondary" onClick={() => navigate("Cash Register")}>View register</Button></Card></div> :
      <div className="bottom-grid"><Card className="recent"><div className="card-head table-title"><div><h2>Branch repair activity</h2><p>Authorized Colombo 03 records only</p></div><Button kind="ghost" onClick={() => navigate("Repairs")}>View all <Icon name="arrow" size={14}/></Button></div><RepairTable compact data={data} navigate={navigate}/></Card><Card className="stock-card"><div className="card-head"><div><h2>Branch alerts</h2><p>Items needing attention</p></div><span className="count-badge">6</span></div>{products.slice(0,4).map((product, index) => <div className="stock-row" key={product.name}><div className="product-mini"><Icon name={product.icon}/></div><div><strong>{product.name}</strong><span>{product.sku}</span></div><div><strong className={index < 2 ? "danger-text" : ""}>{index + 2} left</strong><span>Colombo 03</span></div></div>)}</Card></div>}
  </>;
}

function TransactionList() {
  return <div className="transaction-list">{[["INV-2026-1024","Nimal Perera","Cash","Rs. 18,500"],["POS-2026-8842","Walk-in customer","Card","Rs. 6,500"],["INV-2026-1021","Amaya Fernando","Bank","Rs. 42,000"]].map(([id, customer, method, amount]) => <div key={id}><div className="product-mini"><Icon name="receipt"/></div><div><strong>{id}</strong><span>{customer} · {method}</span></div><strong>{amount}</strong></div>)}</div>;
}

function CustomerRepairs({ data, navigate }: { data: typeof repairs; navigate: (page: string) => void }) {
  return <div className="portal-repairs">{data.map((repair) => <Card className="portal-repair-card" key={repair.id}><div className="device-icon"><Icon name="laptop" size={24}/></div><div className="portal-repair-main"><div><span>{repair.id}</span><Badge>{repair.status}</Badge></div><h2>{repair.device}</h2><p>Estimated completion: {repair.eta}</p></div><Button kind="secondary" onClick={() => navigate("My Repair Details")}>Track repair</Button></Card>)}</div>;
}

function CustomerRepairDetails({ data }: { data: typeof repairs }) {
  const repair = data[0];
  if (!repair) return <Card className="empty-module"><Icon name="tool" size={32}/><h2>No repair found</h2><p>This account has no active repair records.</p></Card>;
  return <><Card className="repair-hero"><div className="repair-device"><div className="device-icon"><Icon name="laptop" size={25}/></div><div><div><span>{repair.id}</span><Badge>{repair.status}</Badge></div><h2>{repair.device}</h2><p>Your repair · Colombo 03</p></div></div><div className="repair-facts"><div><span>Estimated completion</span><strong>{repair.eta}</strong></div><div><span>Approved estimate</span><strong>{repair.amount}</strong></div></div></Card><div className="customer-detail-grid"><Card className="portal-timeline-card"><div className="card-head"><div><h2>Your repair journey</h2><p>Simple, customer-friendly progress updates.</p></div></div><div className="portal-progress horizontal">{["Received","Diagnosing","Repairing","Testing","Ready","Delivered"].map((item,index)=><div className={index<3?"complete":index===3?"current":""} key={item}><span>{index<3?<Icon name="check" size={14}/>:index+1}</span><strong>{item}</strong></div>)}</div><div className="customer-update"><Icon name="bell"/><div><strong>Your repair is progressing</strong><p>Our team has completed the repair work. Your device will now move to quality testing.</p><span>Updated today at 11:42 AM</span></div></div></Card><Card className="portal-actions"><h2>Repair summary</h2><div className="info-list"><div><span>Issue reported</span><strong>Overheats and shuts down</strong></div><div><span>Approved work</span><strong>Cooling service and thermal compound replacement</strong></div><div><span>Payment status</span><strong>Payment due on pickup</strong></div><div><span>Warranty</span><strong>90 days after delivery</strong></div></div><Button>Contact support</Button></Card></div></>;
}

function Repairs({ navigate, data, technician = false }: { navigate: (p: string) => void; data: typeof repairs; technician?: boolean }) {
  return <>
    <Card className="filter-card">
      <div className="filter-search"><Icon name="search"/><input placeholder="Search repair ID, customer or device..."/></div>
      <button>Status: All <Icon name="chevron" size={12}/></button>{!technician && <button>Technician <Icon name="chevron" size={12}/></button>}<button>Priority <Icon name="chevron" size={12}/></button><Button kind="secondary" icon="filter">More filters</Button>
    </Card>
    <div className="summary-strip"><div><span>{technician ? "My repairs" : "All repairs"}</span><strong>{data.length}</strong></div><div><span>Active</span><strong>{data.filter((r) => r.status === "In Progress").length}</strong></div><div><span>Waiting</span><strong>{data.filter((r) => r.status.includes("Awaiting")).length}</strong></div><div><span>Ready</span><strong>{data.filter((r) => r.status === "Ready for Pickup").length}</strong></div></div>
    <Card className="table-card"><RepairTable navigate={navigate} data={data} showFinancial={!technician}/><div className="pagination"><span>Showing {data.length} authorized repairs</span><div><button>Previous</button><button className="active">1</button><button>Next</button></div></div></Card>
  </>;
}

function RepairTable({ compact = false, navigate, data, showFinancial = true }: { compact?: boolean; navigate: (p: string) => void; data: typeof repairs; showFinancial?: boolean }) {
  return <div className="table-wrap"><table><thead><tr><th>Repair</th><th>Customer & device</th>{!compact && <th>Technician</th>}<th>Status</th>{!compact && <th>Priority</th>}<th>{compact || !showFinancial ? "Due" : "Amount"}</th><th/></tr></thead>
    <tbody>{data.slice(0, compact ? 4 : 5).map(r => <tr key={r.id} onClick={() => navigate("Repair Details")}>
      <td><strong className="id-link">{r.id}</strong><span className="mobile-only">{r.customer}</span></td>
      <td><strong>{r.customer}</strong><span>{r.device}</span></td>{!compact && <td><div className="tech"><span>{r.tech.split(" ").map(x=>x[0]).join("")}</span>{r.tech}</div></td>}
      <td><Badge>{r.status}</Badge></td>{!compact && <td><span className={`priority ${r.priority.toLowerCase()}`}>{r.priority}</span></td>}<td><strong>{compact ? r.eta : showFinancial ? r.amount : r.eta}</strong>{!compact && showFinancial && <span>{r.eta}</span>}</td><td><button className="more-btn"><Icon name="more"/></button></td>
    </tr>)}</tbody></table></div>;
}

function RepairBoard({ data }: { data: typeof repairs }) {
  const cols = ["Received", "Diagnosing", "Awaiting Approval", "In Progress", "Testing", "Ready for Pickup"];
  return <div className="kanban">{cols.map((col, i) => <div className="kanban-col" key={col}><div className="kanban-head"><Badge>{col}</Badge><span>{i === 3 ? 4 : i === 5 ? 3 : 2}</span></div>
    {data.length > 0 && [data[i%data.length], data[(i+2)%data.length]].map((r,j)=><Card className="repair-card" key={r.id+j}><div><strong>{r.id}</strong><span className={`priority ${r.priority.toLowerCase()}`}>{r.priority}</span></div><h3>{r.device}</h3><p>{r.customer}</p><div className="repair-card-foot"><span><Icon name="clock" size={14}/>{r.eta}</span><div className="avatar tiny">{r.tech.split(" ").map(x=>x[0]).join("")}</div></div></Card>)}
  </div>)}</div>;
}

function NewRepair({ navigate }: { navigate: (p: string) => void }) {
  const [step, setStep] = useState(1);
  const labels = ["Customer", "Device", "Problem", "Repair details", "Review"];
  return <div className="form-layout"><Card className="step-card"><div className="steps">{labels.map((l,i)=><div className={step === i+1 ? "active" : step > i+1 ? "done" : ""} key={l}><span>{step > i+1 ? <Icon name="check" size={14}/> : i+1}</span><div><strong>{l}</strong><small>Step {i+1}</small></div></div>)}</div></Card>
    <Card className="form-card"><div className="form-title"><div className="kpi-icon purple"><Icon name={step === 1 ? "users" : step === 2 ? "laptop" : "tool"}/></div><div><h2>{labels[step-1]}</h2><p>{step === 1 ? "Select an existing customer or create a new one." : "Add the information needed for this repair."}</p></div></div>
      {step === 1 && <><div className="toggle-tabs"><button className="active">Existing customer</button><button>New customer</button></div><label>Find customer<div className="input"><Icon name="search"/><input placeholder="Search name, phone or email"/></div></label><div className="customer-choice"><div className="avatar">NP</div><div><strong>Nimal Perera</strong><span>+94 77 456 8291 · nimal@email.lk</span></div><Icon name="check"/></div></>}
      {step === 2 && <div className="form-grid"><label>Device type<select><option>Laptop</option></select></label><label>Brand<select><option>Dell</option></select></label><label>Model<input defaultValue="Latitude 5420"/></label><label>Serial number<input placeholder="Enter serial / IMEI"/></label></div>}
      {step === 3 && <><label>Customer complaint<textarea defaultValue="Device overheats and shuts down after 20–30 minutes of use."/></label><div className="form-grid"><label>Device condition<select><option>Good — minor wear</option></select></label><label>Accessories received<input defaultValue="65W charger, laptop bag"/></label></div></>}
      {step >= 4 && <div className="form-grid"><label>Assign technician<select><option>D. Fernando</option></select></label><label>Priority<select><option>High</option></select></label><label>Estimated completion<input defaultValue="March 20, 2026"/></label><label>Initial estimate<input defaultValue="Rs. 18,500"/></label></div>}
      <div className="form-actions"><Button kind="secondary" onClick={() => step > 1 && setStep(step-1)}>Back</Button><Button onClick={() => step < 5 ? setStep(step+1) : navigate("Repair Details")}>{step === 5 ? "Create repair" : "Continue"} <Icon name="arrow" size={15}/></Button></div>
    </Card></div>;
}

function RepairDetails({ technician = false }: { technician?: boolean }) {
  const [tab, setTab] = useState("Overview");
  return <><Card className="repair-hero"><div className="repair-device"><div className="device-icon"><Icon name="laptop" size={25}/></div><div><div><span>FX-2026-004821</span><Badge>In Progress</Badge></div><h2>Dell Latitude 5420</h2><p>Nimal Perera · High priority</p></div></div><div className="repair-facts"><div><span>Technician</span><strong>John Silva</strong></div><div><span>Estimated completion</span><strong>Today, 4:30 PM</strong></div>{!technician && <div><span>Current total</span><strong>Rs. 18,500</strong></div>}</div></Card>
    <div className="tabs">{(technician ? ["Overview","Diagnosis","Parts","Activities","Testing","Warranty"] : ["Overview","Diagnosis","Estimate","Parts","Activities","Testing","Invoice","Warranty"]).map(x=><button className={tab===x?"active":""} onClick={()=>setTab(x)} key={x}>{x}</button>)}</div>
    <div className="detail-grid"><Card><div className="card-head"><div><h2>{tab === "Overview" ? "Repair workflow" : tab}</h2><p>Connected repair record and activity</p></div><Button kind="secondary">Update</Button></div>
      <div className="timeline">{["Received","Diagnosing","Approved","Repairing","Testing","Ready","Delivered"].map((x,i)=><div className={i<4?"complete":i===4?"current":""} key={x}><span>{i<4?<Icon name="check" size={13}/>:i+1}</span><small>{x}</small></div>)}</div>
      <div className="note-box"><div className="kpi-icon purple"><Icon name="tool"/></div><div><strong>Technician update</strong><p>Cooling system cleaned and thermal paste replaced. Running stress tests before final quality check.</p><span>Today at 11:42 AM · D. Fernando</span></div></div>
    </Card><Card className="customer-panel"><h2>Customer & device</h2><div className="customer-line"><div className="avatar">NP</div><div><strong>Nimal Perera</strong><span>+94 77 456 8291</span></div></div><hr/><div className="info-list"><div><span>Serial number</span><strong>DL5420-78X2</strong></div><div><span>Complaint</span><strong>Overheats and shuts down</strong></div><div><span>Accessories</span><strong>Charger, laptop bag</strong></div></div><Button kind="secondary">Contact customer</Button></Card></div>
  </>;
}

function POS({ cart, setCart }: { cart: Record<string, number>; setCart: React.Dispatch<React.SetStateAction<Record<string, number>>> }) {
  const add = (name: string) => setCart(c=>({...c,[name]:(c[name]||0)+1}));
  const change = (name:string,n:number) => setCart(c=>{const next={...c}; if(n<=0) delete next[name]; else next[name]=n; return next});
  const total = useMemo(()=>Object.entries(cart).reduce((s,[name,q])=>s+(products.find(p=>p.name===name)?.price||0)*q,0),[cart]);
  return <div className="pos-layout"><div className="pos-products"><div className="pos-search"><Icon name="search"/><input placeholder="Search products, SKU or scan barcode..."/><kbd>F2</kbd></div><div className="category-row">{["All products","Accessories","Chargers","Cables","Spare Parts","Services"].map((x,i)=><button className={i===0?"active":""} key={x}>{x}</button>)}</div><div className="product-grid">{products.map(p=><Card className="product-card" key={p.name}><div className="product-icon"><Icon name={p.icon} size={28}/></div><div className="stock-pill">{p.stock} in stock</div><h3>{p.name}</h3><p>{p.sku}</p><div><strong>Rs. {p.price.toLocaleString()}</strong><button onClick={()=>add(p.name)}><Icon name="plus" size={17}/></button></div></Card>)}</div></div>
    <Card className="cart-panel"><div className="cart-head"><div><h2>Current sale</h2><p>{Object.values(cart).reduce((a,b)=>a+b,0)} items</p></div><button className="more-btn"><Icon name="more"/></button></div><button className="customer-add"><Icon name="users"/><span><strong>Add customer</strong><small>Optional for walk-in sales</small></span><Icon name="chevron"/></button>
      <div className="cart-items">{Object.entries(cart).map(([name,q])=>{const p=products.find(x=>x.name===name)!;return <div className="cart-item" key={name}><div className="product-mini"><Icon name={p.icon}/></div><div><strong>{name}</strong><span>Rs. {p.price.toLocaleString()}</span><div className="qty"><button onClick={()=>change(name,q-1)}><Icon name="minus" size={13}/></button><span>{q}</span><button onClick={()=>change(name,q+1)}><Icon name="plus" size={13}/></button></div></div><strong>Rs. {(p.price*q).toLocaleString()}</strong></div>})}</div>
      <div className="cart-summary"><div><span>Subtotal</span><strong>Rs. {total.toLocaleString()}</strong></div><div><span>Discount</span><button>Add discount</button></div><div><span>Tax</span><strong>Rs. 0</strong></div><div className="total"><span>Total</span><strong>Rs. {total.toLocaleString()}</strong></div></div>
      <div className="payment-methods">{["cash","card","transfer"].map((x,i)=><button className={i===0?"active":""} key={x}><Icon name={x as IconName}/>{x==="transfer"?"Bank":x[0].toUpperCase()+x.slice(1)}</button>)}</div><Button>Complete sale · Rs. {total.toLocaleString()}</Button><Button kind="secondary">Hold sale</Button>
    </Card></div>;
}

function Inventory() {
  return <><div className="kpi-grid inventory-kpis">{[["Total Products","1,248","box"],["Stock Value","Rs. 8.42M","wallet"],["Low Stock","8","alert"],["Out of Stock","3","close"],["Reserved Stock","126 units","package"]].map(([a,b,c])=><Card className="kpi" key={a}><div className="kpi-icon blue"><Icon name={c as IconName}/></div><div className="kpi-label">{a}</div><div className="kpi-value">{b}</div></Card>)}</div><Card className="table-card"><div className="card-head table-title"><div><h2>Product inventory</h2><p>Available stock = On-hand stock − Reserved stock</p></div><div><Button kind="secondary" icon="download">Export</Button><Button icon="plus">Add product</Button></div></div><div className="table-wrap"><table><thead><tr><th>Product</th><th>SKU</th><th>On-hand</th><th>Reserved</th><th>Available</th><th>Cost</th><th>Selling price</th><th>Status</th></tr></thead><tbody>{products.map((p,i)=><tr key={p.name}><td><div className="product-name"><div className="product-mini"><Icon name={p.icon}/></div><strong>{p.name}</strong></div></td><td>{p.sku}</td><td><strong>{p.stock}</strong></td><td>{i+1}</td><td><strong>{p.stock-i-1}</strong></td><td>Rs. {Math.round(p.price*.64).toLocaleString()}</td><td><strong>Rs. {p.price.toLocaleString()}</strong></td><td><Badge tone={p.stock<5?"low-stock":"in-stock"}>{p.stock<5?"Low stock":"In stock"}</Badge></td></tr>)}</tbody></table></div></Card></>;
}

function AIDiagnosis({ analyzed, setAnalyzed }: { analyzed: boolean; setAnalyzed: (v:boolean)=>void }) {
  return <div className="ai-page"><div className="ai-banner"><div className="ai-orb"><Icon name="brain" size={30}/></div><div><span>FIXFLOW INTELLIGENCE</span><h2>AI Diagnosis Assistant</h2><p>Turn repair symptoms into a structured inspection plan in seconds.</p></div></div>
    <div className="ai-grid"><Card className="ai-form"><div className="card-head"><div><h2>Device information</h2><p>Provide accurate details for a stronger analysis.</p></div><Badge tone="ai">Advisory AI</Badge></div><div className="form-grid"><label>Device type<select><option>Laptop</option></select></label><label>Brand & model<input defaultValue="Dell Latitude 5420"/></label></div><label>Customer complaint<textarea defaultValue="Laptop gets very hot and powers off after 20–30 minutes. Fan is noticeably loud."/></label><label>Technician observations<textarea placeholder="Add initial observations, error codes or tests performed..."/></label><div className="advisory"><Icon name="alert"/><span>AI suggestions are advisory only. Review before applying to the repair record.</span></div><Button icon="spark" onClick={()=>setAnalyzed(true)}>{analyzed?"Run analysis again":"Analyze with AI"}</Button></Card>
      <Card className={`ai-results ${analyzed?"visible":""}`}>{!analyzed?<div className="empty-ai"><div className="ai-orb subtle"><Icon name="spark"/></div><h3>Ready to analyze</h3><p>Complete the device details to generate possible causes, inspection points and troubleshooting steps.</p></div>:<><div className="card-head"><div><span className="ai-label"><Icon name="spark" size={14}/> Analysis complete</span><h2>Diagnostic insight</h2></div><span className="confidence">86% confidence</span></div><div className="cause"><div><strong>1</strong></div><div><h3>Thermal system degradation</h3><p>Dust obstruction or degraded thermal compound is restricting heat transfer.</p><span>High likelihood · Inspect first</span></div></div><div className="cause"><div><strong>2</strong></div><div><h3>Cooling fan bearing failure</h3><p>Excessive fan noise indicates reduced fan efficiency under load.</p><span>Medium likelihood</span></div></div><div className="inspection"><h3>Recommended inspection</h3>{["Run CPU thermal stress test and monitor peak temperature","Inspect heatsink fins for dust obstruction","Check fan RPM and bearing noise","Inspect and replace thermal compound"].map((x,i)=><div key={x}><span>{i+1}</span>{x}</div>)}</div><Button kind="secondary">Add to technician notes</Button></>}</Card>
    </div></div>;
}

function ModulePreview({ page, user }: { page: string; user: User }) {
  const isAI = page === "AI Assistant";
  const isLimited = user.role === "Technician" || user.role === "Customer";
  if (page === "Notifications") {
    const messages: Record<Role, Array<[string,string,IconName]>> = {
      Admin: [["Security alert","A manager account signed in from a new device.","shield"],["Branch performance","Colombo 03 exceeded its weekly repair target.","branch"],["Payment summary","Daily collection summary is ready.","cash"]],
      Manager: [["Inventory alert","Six branch items are below minimum stock.","alert"],["Repair queue","Three repairs require branch approval.","tool"],["Branch collection","Today's payment summary is ready.","cash"]],
      Technician: [["New repair assigned","FX-2026-004819 has been assigned to you.","tool"],["Parts available","Requested cooling fan is ready for collection.","package"],["Estimate approved","You can begin work on FX-2026-004821.","check"]],
      Cashier: [["Pickup ready","One paid repair is ready for customer delivery.","check"],["Payment received","Bank transfer confirmed for INV-2026-1024.","card"],["Register reminder","Your register closes at 6:00 PM.","cash"]],
      Customer: [["Repair update","Your Dell Latitude 5420 is now in progress.","tool"],["Estimate approved","Your approval was recorded successfully.","file"],["Warranty reminder","Your repair includes a 90-day service warranty.","shield"]],
    };
    return <Card className="notification-center"><div className="card-head table-title"><div><h2>Your notifications</h2><p>Private updates for {user.name}</p></div><Button kind="secondary">Mark all read</Button></div>{messages[user.role].map(([title, body, icon], index) => <div className="notification-row" key={title}><div className={`kpi-icon ${index === 0 ? "purple" : "blue"}`}><Icon name={icon}/></div><div><strong>{title}</strong><p>{body}</p><span>{index + 1} hour{index ? "s" : ""} ago</span></div>{index === 0 && <i/>}</div>)}</Card>;
  }
  const insights = isAI
    ? [["Low stock alert","Five laptop chargers have reached the minimum stock level.","package"],["Repair workload","Technician workload is 18% higher than last week.","tool"],["Sales insight","Mobile accessories generated the highest sales this week.","chart"]]
    : [["Total records","248 active records","file"],["Needs attention","8 items require review","alert"],["This month","+12.4% vs last month","chart"]];
  return <><div className={`module-hero ${isAI?"ai-module":""}`}><div className="kpi-icon purple"><Icon name={isAI?"spark":"chart"} size={24}/></div><div><h2>{page}</h2><p>{isAI ? "Ask questions across your authorized business data and receive actionable insights." : `A connected view of your ${page.toLowerCase()} workspace.`}</p></div>{!isLimited && <Button icon="plus">{isAI ? "Ask FixFlow AI" : `New ${page.replace(/s$/,"")}`}</Button>}</div>{!isLimited && <div className="insight-grid">{insights.map(([title,body,icon])=><Card className="insight-card" key={title}><div className="kpi-icon purple"><Icon name={icon as IconName}/></div><h3>{title}</h3><p>{body}</p><button>View details <Icon name="arrow" size={14}/></button></Card>)}</div>}<Card className="empty-module"><Icon name={isAI?"brain":"settings"} size={32}/><h2>{isAI ? "Ask anything about your authorized data" : `${page} workspace`}</h2><p>{isLimited ? `This private ${user.role.toLowerCase()} view contains only records assigned to your account.` : isAI ? "Try “Which products should we reorder this week?”" : "This module is connected and ready for your team."}</p><Button>{isAI?"Start a conversation":"Explore records"}</Button></Card></>;
}

function SearchModal({ user, data, close, navigate }: { user: User; data: typeof repairs; close:()=>void; navigate:(p:string)=>void }) {
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
