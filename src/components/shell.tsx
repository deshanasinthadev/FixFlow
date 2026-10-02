"use client";
import React, { useState } from "react";
import { useApp } from "@/lib/store";
import { Logo } from "./ui";
import { LayoutDashboard, Wrench, FileText, Users, Cpu, ShoppingCart, Receipt, Wallet, RotateCcw, Package, Boxes, ShoppingBag, Truck, ArrowLeftRight, QrCode, PiggyBank, TrendingUp, BarChart3, ShieldCheck, BadgeCheck, Bot, Sparkles, Bell, MessageSquare, HardDrive, UserCog, Settings, LifeBuoy, LogOut, Search, Plus, Menu, X, Store } from "lucide-react";

const NAV: { section: string; items: { id: string; label: string; icon: any }[] }[] = [
  { section: "", items: [{ id: "dashboard", label: "Dashboard", icon: LayoutDashboard }] },
  { section: "Operations", items: [
    { id: "repairs", label: "Repairs", icon: Wrench },
    { id: "quotations", label: "Quotations", icon: FileText },
    { id: "customers", label: "Customers", icon: Users },
    { id: "tech", label: "Technicians", icon: Cpu },
  ]},
  { section: "Sales", items: [
    { id: "pos", label: "POS", icon: ShoppingCart },
    { id: "invoices", label: "Invoices", icon: Receipt },
    { id: "payments", label: "Payments", icon: Wallet },
    { id: "returns", label: "Returns & Refunds", icon: RotateCcw },
  ]},
  { section: "Inventory", items: [
    { id: "products", label: "Products", icon: Package },
    { id: "purchases", label: "Purchases", icon: ShoppingBag },
    { id: "suppliers", label: "Suppliers", icon: Truck },
    { id: "movements", label: "Stock Movements", icon: ArrowLeftRight },
    { id: "barcode", label: "Barcode / QR", icon: QrCode },
  ]},
  { section: "Finance", items: [
    { id: "expenses", label: "Expenses", icon: PiggyBank },
    { id: "pnl", label: "Profit & Loss", icon: TrendingUp },
    { id: "reports", label: "Financial Reports", icon: BarChart3 },
  ]},
  { section: "Warranty", items: [
    { id: "warranty", label: "Active Warranties", icon: ShieldCheck },
    { id: "claims", label: "Warranty Claims", icon: BadgeCheck },
  ]},
  { section: "AI", items: [
    { id: "ai-diagnosis", label: "AI Diagnosis", icon: Bot },
    { id: "ai-assistant", label: "AI Business Assistant", icon: Sparkles },
    { id: "forecast", label: "Stock Forecast", icon: Boxes },
  ]},
  { section: "Communication", items: [
    { id: "notifications", label: "Notifications", icon: Bell },
    { id: "messages", label: "Customer Messages", icon: MessageSquare },
  ]},
  { section: "Reports", items: [
    { id: "sales-reports", label: "Sales Reports", icon: BarChart3 },
    { id: "staff", label: "Staff Performance", icon: UserCog },
  ]},
  { section: "Settings", items: [
    { id: "portal", label: "Customer Portal", icon: Store },
    { id: "settings", label: "Settings", icon: Settings },
    { id: "audit", label: "Audit Log", icon: HardDrive },
  ]},
];

export function Sidebar({ mobile, close }: { mobile?: boolean; close?: () => void }) {
  const { route, go, user, logout } = useApp();
  return (
    <aside className={`${mobile ? "fixed inset-y-0 left-0 z-50 w-[264px]" : "hidden lg:flex w-[264px]"} flex-col shrink-0 border-r no-print`} style={{ background: "#0d1430", borderColor: "rgba(148,163,184,0.1)" }}>
      <div className="p-4 flex items-center justify-between">
        <Logo />
        {mobile && <button className="btn-ghost !p-2" onClick={close}><X size={16} /></button>}
      </div>
      <div className="flex-1 overflow-y-auto px-3 pb-4">
        {NAV.map((g, i) => (
          <div key={i}>
            {g.section && <div className="nav-section">{g.section}</div>}
            {g.items.map((it) => (
              <div key={it.id} className={`nav-item ${route === it.id ? "active" : ""}`} onClick={() => { go(it.id); close?.(); }}>
                <it.icon size={17} /> {it.label}
              </div>
            ))}
          </div>
        ))}
      </div>
      <div className="p-3 border-t" style={{ borderColor: "rgba(148,163,184,0.1)" }}>
        <div className="nav-item" onClick={() => go("settings")}><LifeBuoy size={17} /> Help & Support</div>
        <div className="flex items-center gap-2.5 p-2 mt-1 rounded-xl" style={{ background: "rgba(148,163,184,0.06)" }}>
          <div className="w-9 h-9 rounded-full flex items-center justify-center font-bold text-white text-[13px]" style={{ background: "linear-gradient(135deg,#2f7bff,#8b5cf6)" }}>{user?.name?.[0] ?? "A"}</div>
          <div className="flex-1 min-w-0">
            <div className="text-[13px] font-bold text-white truncate">{user?.name}</div>
            <div className="text-[11px] text-slate-400">{user?.role}</div>
          </div>
          <button className="btn-ghost !p-2" title="Logout" onClick={logout}><LogOut size={15} /></button>
        </div>
      </div>
    </aside>
  );
}

export function Topbar({ onMenu }: { onMenu: () => void }) {
  const { search, setSearch, go, user, data, toast } = useApp();
  const [qa, setQa] = useState(false);
  const [notif, setNotif] = useState(false);
  const notifs = data.notifications ?? [];
  const unread = notifs.filter((n: any) => !n.isRead).length;
  const quicks = [
    { label: "New Repair", id: "repair-new" },
    { label: "New Sale (POS)", id: "pos" },
    { label: "New Customer", id: "customers" },
    { label: "New Product", id: "products" },
    { label: "New Quotation", id: "quotations" },
    { label: "Add Expense", id: "expenses" },
  ];
  return (
    <header className="sticky top-0 z-30 glass border-b no-print" style={{ borderColor: "rgba(148,163,184,0.1)" }}>
      <div className="flex items-center gap-3 px-4 py-3">
        <button className="btn-ghost !p-2 lg:hidden" onClick={onMenu}><Menu size={18} /></button>
        <div className="relative flex-1 max-w-[480px]">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input className="input !pl-9" placeholder="Search customers, repairs, products, invoices..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="flex-1" />
        <div className="relative">
          <button className="btn-primary !py-2.5" onClick={() => setQa(!qa)}><Plus size={16} /> <span className="hidden sm:inline">Quick Action</span></button>
          {qa && (
            <div className="absolute right-0 mt-2 w-52 card p-2 z-50">
              {quicks.map((q) => <div key={q.id} className="nav-item" onClick={() => { go(q.id); setQa(false); }}><Plus size={14} /> {q.label}</div>)}
            </div>
          )}
        </div>
        <div className="relative">
          <button className="btn-ghost !p-2.5 relative" onClick={() => setNotif(!notif)}>
            <Bell size={17} />
            {unread > 0 && <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center text-white" style={{ background: "#ef4444" }}>{unread}</span>}
          </button>
          {notif && (
            <div className="absolute right-0 mt-2 w-[340px] card p-2 z-50 max-h-[420px] overflow-y-auto">
              <div className="flex items-center justify-between px-2 py-1.5">
                <span className="font-bold text-white text-[14px]">Notifications</span>
                <button className="text-[12px] text-blue-400" onClick={() => { go("notifications"); setNotif(false); }}>View all</button>
              </div>
              {notifs.slice(0, 7).map((n: any) => (
                <div key={n.id} className="p-2.5 rounded-xl hover:bg-white/5 cursor-pointer" onClick={() => { go("notifications"); setNotif(false); }}>
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full" style={{ background: n.isRead ? "#334155" : "#2f7bff" }} />
                    <span className="text-[13px] font-semibold text-white">{n.title}</span>
                  </div>
                  <div className="text-[12px] text-slate-400 ml-4 mt-0.5">{n.message}</div>
                </div>
              ))}
            </div>
          )}
        </div>
        <button className="btn-ghost !p-2.5 hidden sm:flex" onClick={() => toast("Help center: support@fixflow.lk • 011 234 5678")}><LifeBuoy size={17} /></button>
        <div className="hidden md:flex items-center gap-2 pl-2">
          <div className="w-9 h-9 rounded-full flex items-center justify-center font-bold text-white text-[13px]" style={{ background: "linear-gradient(135deg,#2f7bff,#8b5cf6)" }}>{user?.name?.[0]}</div>
          <div>
            <div className="text-[12px] font-bold text-white leading-none">{user?.name?.split(" ")[0]}</div>
            <span className="badge mt-1" style={{ background: "rgba(47,123,255,0.12)", color: "#93c5fd", border: "1px solid rgba(47,123,255,0.3)", fontSize: 10 }}>{user?.role}</span>
          </div>
        </div>
      </div>
    </header>
  );
}

export function AuthScreen() {
  const { login } = useApp();
  const [email, setEmail] = useState("admin@fixflow.lk");
  const [pw, setPw] = useState("password");
  const [role, setRole] = useState<any>("Admin");
  const [mode, setMode] = useState<"login" | "forgot" | "verify">("login");
  return (
    <div className="min-h-screen flex">
      <div className="hidden lg:flex w-1/2 flex-col justify-between p-12 relative overflow-hidden" style={{ background: "linear-gradient(160deg,#0b1230,#131b45 60%,#1a1445)" }}>
        <Logo />
        <div className="relative z-10">
          <div className="inline-flex badge mb-4" style={{ background: "rgba(47,123,255,0.12)", color: "#93c5fd", border: "1px solid rgba(47,123,255,0.3)" }}>● Trusted by 500+ repair shops</div>
          <h1 className="text-[44px] font-extrabold text-white leading-tight">Smart Repairs.<br /><span style={{ background: "linear-gradient(90deg,#2f7bff,#a78bfa)", WebkitBackgroundClip: "text", color: "transparent" }}>Seamless Business.</span></h1>
          <p className="text-slate-400 mt-4 max-w-[420px]">Repair tracking, POS, inventory, warranty, accounting and AI — one platform for computer, mobile & electronics repair businesses.</p>
          <div className="grid grid-cols-3 gap-3 mt-8 max-w-[480px]">
            {[["18", "Active repairs"], ["Rs. 45.2K", "Today's revenue"], ["98%", "Customer satisfaction"]].map(([v, l]) => (
              <div key={l} className="card p-4"><div className="text-[18px] font-extrabold text-white">{v}</div><div className="text-[11px] text-slate-400">{l}</div></div>
            ))}
          </div>
        </div>
        <div className="text-[12px] text-slate-500">© 2026 FixFlow Technologies • Colombo, Sri Lanka</div>
        <div className="absolute -right-32 -top-32 w-[420px] h-[420px] rounded-full" style={{ background: "radial-gradient(circle,rgba(47,123,255,0.18),transparent)" }} />
        <div className="absolute -left-24 bottom-0 w-[360px] h-[360px] rounded-full" style={{ background: "radial-gradient(circle,rgba(139,92,246,0.14),transparent)" }} />
      </div>
      <div className="flex-1 flex items-center justify-center p-6" style={{ background: "#0a0f1e" }}>
        <div className="w-full max-w-[420px]">
          <div className="lg:hidden mb-6"><Logo /></div>
          {mode === "login" && (
            <>
              <h2 className="text-[26px] font-extrabold text-white">Welcome back 👋</h2>
              <p className="text-[14px] text-slate-400 mt-1 mb-6">Sign in to your repair shop workspace.</p>
              <div className="space-y-4">
                <div><div className="text-[12px] font-semibold text-slate-400 mb-1.5">Email</div><input className="input" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
                <div><div className="text-[12px] font-semibold text-slate-400 mb-1.5">Password</div><input className="input" type="password" value={pw} onChange={(e) => setPw(e.target.value)} /></div>
                <div className="flex items-center justify-between text-[13px]">
                  <label className="flex items-center gap-2 text-slate-400"><input type="checkbox" defaultChecked /> Remember me</label>
                  <button className="text-blue-400" onClick={() => setMode("forgot")}>Forgot password?</button>
                </div>
                <div>
                  <div className="text-[12px] font-semibold text-slate-400 mb-2">Continue as</div>
                  <div className="grid grid-cols-3 gap-2">
                    {(["Admin", "Technician", "Cashier"] as const).map((r) => (
                      <button key={r} onClick={() => setRole(r)} className="tab-btn text-center" style={role === r ? { background: "rgba(47,123,255,0.12)", color: "#7fb0ff", borderColor: "rgba(47,123,255,0.25)", border: "1px solid rgba(47,123,255,0.25)" } : { border: "1px solid rgba(148,163,184,0.15)" }}>{r}</button>
                    ))}
                  </div>
                </div>
                <button className="btn-primary w-full justify-center !py-3" onClick={() => login(role)}>Sign In →</button>
                <div className="text-center text-[12px] text-slate-500">Demo: any password works • Role determines landing screen</div>
              </div>
            </>
          )}
          {mode === "forgot" && (
            <>
              <h2 className="text-[24px] font-extrabold text-white">Reset password</h2>
              <p className="text-[14px] text-slate-400 mt-1 mb-6">Enter your email to receive a reset link.</p>
              <input className="input" placeholder="you@shop.lk" />
              <button className="btn-primary w-full justify-center mt-4" onClick={() => setMode("verify")}>Send reset link</button>
              <button className="btn-ghost w-full justify-center mt-2" onClick={() => setMode("login")}>Back to login</button>
            </>
          )}
          {mode === "verify" && (
            <>
              <h2 className="text-[24px] font-extrabold text-white">Check your email ✉️</h2>
              <p className="text-[14px] text-slate-400 mt-1 mb-6">We sent a 6-digit verification code.</p>
              <div className="flex gap-2">{[1, 2, 3, 4, 5, 6].map((i) => <input key={i} className="input text-center !px-0" maxLength={1} />)}</div>
              <button className="btn-primary w-full justify-center mt-4" onClick={() => login("Admin")}>Verify & Sign in</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
