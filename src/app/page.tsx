"use client";
import React, { useState } from "react";
import { AppProvider, useApp } from "@/lib/store";
import { Sidebar, Topbar, AuthScreen } from "@/components/shell";
import { Dashboard } from "@/components/mod-dashboard";
import { Repairs, RepairNew, RepairDetail, Quotations, Customers, CustomerDetail, TechBoard } from "@/components/mod-ops";
import { POS, Invoices, Payments, Returns } from "@/components/mod-sales";
import { Products, Movements, Purchases, Suppliers, BarcodeQR } from "@/components/mod-inventory";
import { Expenses, PnL, FinanceReports, Warranty, Claims } from "@/components/mod-finance";
import { AIDiagnosis, AIAssistant, Forecast, Messages, Notifications } from "@/components/mod-ai";
import { Staff, Settings, Audit, Portal } from "@/components/mod-system";

function Router() {
  const { route, param } = useApp();
  switch (route) {
    case "dashboard": return <Dashboard />;
    case "repairs": return <Repairs />;
    case "repair-new": return <RepairNew />;
    case "repair-detail": return <RepairDetail id={Number(param) || 1} />;
    case "quotations": return <Quotations />;
    case "customers": return <Customers />;
    case "customer-detail": return <CustomerDetail id={Number(param) || 1} />;
    case "tech": return <TechBoard />;
    case "pos": return <POS />;
    case "invoices": return <Invoices />;
    case "payments": return <Payments />;
    case "returns": return <Returns />;
    case "products": return <Products />;
    case "movements": return <Movements />;
    case "purchases": return <Purchases />;
    case "suppliers": return <Suppliers />;
    case "barcode": return <BarcodeQR />;
    case "expenses": return <Expenses />;
    case "pnl": return <PnL />;
    case "reports": return <FinanceReports />;
    case "sales-reports": return <FinanceReports />;
    case "warranty": return <Warranty />;
    case "claims": return <Claims />;
    case "ai-diagnosis": return <AIDiagnosis />;
    case "ai-assistant": return <AIAssistant />;
    case "forecast": return <Forecast />;
    case "messages": return <Messages />;
    case "notifications": return <Notifications />;
    case "staff": return <Staff />;
    case "settings": return <Settings />;
    case "audit": return <Audit />;
    case "portal": return <Portal />;
    default: return <Dashboard />;
  }
}

function Toasts() {
  const { toasts } = useApp();
  return (
    <div className="fixed bottom-4 right-4 z-[100] space-y-2 no-print">
      {toasts.map((t) => (
        <div key={t.id} className="toast px-4 py-3 rounded-xl text-[13px] font-semibold text-white shadow-2xl" style={{ background: t.kind === "err" ? "rgba(239,68,68,0.92)" : "rgba(20,30,60,0.95)", border: `1px solid ${t.kind === "err" ? "rgba(239,68,68,0.5)" : "rgba(47,123,255,0.4)"}` }}>
          {t.kind === "err" ? "⚠️ " : "✅ "}{t.msg}
        </div>
      ))}
    </div>
  );
}

function MobileNav() {
  const { route, go } = useApp();
  const items = [["dashboard", "🏠", "Home"], ["repairs", "🔧", "Repairs"], ["pos", "🛒", "POS"], ["products", "📦", "Stock"], ["ai-assistant", "✨", "AI"]] as const;
  return (
    <nav className="lg:hidden fixed bottom-0 inset-x-0 z-40 glass border-t no-print" style={{ borderColor: "rgba(148,163,184,0.12)" }}>
      <div className="grid grid-cols-5">
        {items.map(([id, icon, label]) => (
          <button key={id} onClick={() => go(id)} className="py-2.5 flex flex-col items-center gap-0.5" style={{ color: route === id ? "#7fb0ff" : "#64748b" }}>
            <span className="text-[18px]">{icon}</span><span className="text-[10px] font-semibold">{label}</span>
          </button>
        ))}
      </div>
    </nav>
  );
}

function Shell() {
  const { user, loading } = useApp();
  const [menu, setMenu] = useState(false);
  if (!user) return <AuthScreen />;
  return (
    <div className="min-h-screen flex" style={{ background: "#0a0f1e" }}>
      <Sidebar />
      {menu && <><div className="fixed inset-0 z-40 bg-black/60 lg:hidden" onClick={() => setMenu(false)} /><Sidebar mobile close={() => setMenu(false)} /></>}
      <div className="flex-1 min-w-0 flex flex-col">
        <Topbar onMenu={() => setMenu(true)} />
        <main className="flex-1 p-4 md:p-6 pb-20 lg:pb-6 max-w-[1400px] w-full mx-auto">
          {loading ? (
            <div className="space-y-3">
              <div className="h-8 w-64 rounded-xl animate-pulse" style={{ background: "rgba(148,163,184,0.1)" }} />
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">{[1, 2, 3, 4, 5, 6].map((i) => <div key={i} className="h-[110px] rounded-2xl animate-pulse" style={{ background: "rgba(148,163,184,0.06)" }} />)}</div>
            </div>
          ) : <Router />}
        </main>
      </div>
      <MobileNav />
      <Toasts />
    </div>
  );
}

export default function Page() {
  return <AppProvider><Shell /></AppProvider>;
}
