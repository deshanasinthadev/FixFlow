"use client";
import React, { useState } from "react";
import { useApp } from "@/lib/store";
import { KPI, Badge, SectionTitle } from "./ui";
import { fmtRs, num, timeAgo } from "@/lib/utils";
import { Banknote, Wrench, ShoppingCart, AlertTriangle, Wallet, PiggyBank, Sparkles, ArrowRight } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";

export function Dashboard() {
  const { dashboard, data, go, toast } = useApp();
  const [range, setRange] = useState("This Month");
  const k = dashboard?.kpis ?? {};
  const repairs: any[] = dashboard?.activeRepairsList?.length ? dashboard.activeRepairsList : (data.repairs ?? []).slice(0, 8);
  const invoices: any[] = dashboard?.recentInvoices?.length ? dashboard.recentInvoices : (data.invoices ?? []).slice(0, 6);
  const low: any[] = dashboard?.lowStockList ?? (data.products ?? []).filter((p: any) => (p.stock ?? 0) <= (p.minStock ?? 5)).slice(0, 6);
  const series = dashboard?.revenueSeries ?? [];

  return (
    <div className="animate-fade">
      <div className="mb-5">
        <h1 className="text-[24px] font-extrabold text-white">Good morning, Admin 👋</h1>
        <p className="text-[13px] text-slate-400">Here&apos;s what&apos;s happening in your repair shop today.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <KPI label="Today's Revenue" value={fmtRs(k.todayRevenue ?? 45200)} sub="+12.5% vs yesterday" icon={<Banknote size={18} />} accent="#2f7bff" />
        <KPI label="Active Repairs" value={String(k.activeRepairs ?? 18)} sub={`${dashboard?.waitingDiagnosis ?? 5} waiting for diagnosis`} icon={<Wrench size={18} />} accent="#8b5cf6" />
        <KPI label="Today's Sales" value={String(k.todaySales ?? 32)} sub="+8.2% vs yesterday" icon={<ShoppingCart size={18} />} accent="#22c55e" />
        <KPI label="Low Stock" value={`${k.lowStockCount ?? 8} items`} sub="Requires attention" icon={<AlertTriangle size={18} />} accent="#f59e0b" />
        <KPI label="Outstanding" value={fmtRs(k.outstanding ?? 18500)} sub="Across unpaid invoices" icon={<Wallet size={18} />} accent="#f97316" />
        <KPI label="Today's Expenses" value={fmtRs(k.todayExpenses ?? 7800)} sub="6 transactions" icon={<PiggyBank size={18} />} accent="#ef4444" />
      </div>

      <div className="grid xl:grid-cols-3 gap-4 mt-4">
        <div className="card p-5 xl:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <div><h3 className="font-bold text-white">Revenue Analytics</h3><p className="text-[12px] text-slate-400">Revenue vs expenses vs profit</p></div>
            <div className="flex gap-1.5">
              {["Today", "This Week", "This Month", "This Year"].map((r) => (
                <button key={r} className={`tab-btn !py-1.5 !px-3 !text-[12px] ${range === r ? "active" : ""}`} onClick={() => setRange(r)}>{r}</button>
              ))}
            </div>
          </div>
          <div style={{ height: 280 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={series}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.1)" />
                <XAxis dataKey="name" stroke="#64748b" fontSize={12} />
                <YAxis stroke="#64748b" fontSize={12} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
                <Tooltip contentStyle={{ background: "#101736", border: "1px solid rgba(148,163,184,0.2)", borderRadius: 12, color: "#fff" }} formatter={(v: any) => fmtRs(Number(v))} />
                <Legend />
                <Area type="monotone" dataKey="revenue" stroke="#2f7bff" fill="rgba(47,123,255,0.18)" strokeWidth={2.5} name="Revenue" />
                <Area type="monotone" dataKey="expenses" stroke="#ef4444" fill="rgba(239,68,68,0.08)" strokeWidth={2} name="Expenses" />
                <Area type="monotone" dataKey="profit" stroke="#22c55e" fill="rgba(34,197,94,0.12)" strokeWidth={2} name="Profit" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card p-5 relative overflow-hidden" style={{ background: "linear-gradient(160deg,#141b42,#1c1447)" }}>
          <div className="flex items-center gap-2"><div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: "linear-gradient(135deg,#2f7bff,#8b5cf6)" }}><Sparkles size={18} className="text-white" /></div>
            <div><div className="font-extrabold text-white">FixFlow AI</div><div className="text-[11px] text-slate-400">Business Assistant</div></div></div>
          <p className="text-[13px] text-slate-300 mt-3">Ask about sales, repairs, inventory or business insights.</p>
          <div className="space-y-2 mt-3">
            {["Which products sold the most this month?", "Which repairs are taking too long?", "Which items need restocking?"].map((p) => (
              <button key={p} className="w-full text-left text-[12px] p-2.5 rounded-xl border border-white/10 text-slate-300 hover:border-blue-500/50 hover:text-white transition" onClick={() => go("ai-assistant")}>✨ {p}</button>
            ))}
          </div>
          <button className="btn-primary w-full justify-center mt-3" onClick={() => go("ai-assistant")}>Ask AI Assistant <ArrowRight size={15} /></button>
        </div>
      </div>

      <div className="grid xl:grid-cols-3 gap-4 mt-4">
        <div className="card p-0 xl:col-span-2 overflow-hidden">
          <div className="flex items-center justify-between p-5 pb-3">
            <h3 className="font-bold text-white">Active Repairs</h3>
            <button className="text-[13px] text-blue-400 font-semibold" onClick={() => go("repairs")}>View all →</button>
          </div>
          <div className="overflow-x-auto">
            <table className="tbl w-full min-w-[760px]">
              <thead><tr><th>Job ID</th><th>Customer</th><th>Device</th><th>Technician</th><th>Priority</th><th>Status</th><th>Due</th></tr></thead>
              <tbody>
                {repairs.map((r: any) => (
                  <tr key={r.id ?? r.jobId} className="cursor-pointer" onClick={() => go("repair-detail", r.id)}>
                    <td className="font-bold text-blue-400">{r.jobId}</td>
                    <td className="text-slate-200">{r.customerName}</td>
                    <td className="text-slate-400">{r.brand} {r.model}</td>
                    <td className="text-slate-400">{r.technicianName ?? "—"}</td>
                    <td><Badge s={r.priority ?? "Medium"} /></td>
                    <td><Badge s={r.status ?? "Received"} /></td>
                    <td className="text-slate-400 text-[12px]">{r.dueDate ? new Date(r.dueDate).toLocaleDateString() : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="card p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold text-white">Low Stock Alerts</h3>
            <button className="text-[13px] text-blue-400 font-semibold" onClick={() => go("products")}>View Inventory</button>
          </div>
          <div className="space-y-2.5">
            {low.map((p: any) => (
              <div key={p.id} className="flex items-center gap-3 p-3 rounded-xl border border-white/8" style={{ background: "rgba(148,163,184,0.05)" }}>
                <div className="w-10 h-10 rounded-xl flex items-center justify-center font-bold" style={{ background: (p.stock ?? 0) === 0 ? "rgba(239,68,68,0.12)" : "rgba(251,191,36,0.12)", color: (p.stock ?? 0) === 0 ? "#fca5a5" : "#fcd34d" }}>📦</div>
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-bold text-white truncate">{p.name}</div>
                  <div className="text-[12px] text-slate-400">{(p.stock ?? 0) === 0 ? "Out of stock" : `Only ${p.stock} remaining`}</div>
                </div>
                <button className="btn-ghost !py-1.5 !px-3 !text-[12px]" onClick={() => { go("purchases"); toast(`Reorder draft created for ${p.name}`); }}>Reorder</button>
              </div>
            ))}
            {low.length === 0 && <div className="text-slate-400 text-[13px]">All stocked up 🎉</div>}
          </div>
          <div className="mt-4">
            <h3 className="font-bold text-white mb-2">Recent Transactions</h3>
            {invoices.slice(0, 4).map((i: any) => (
              <div key={i.id} className="flex items-center justify-between py-2 border-b border-white/5 last:border-0">
                <div><div className="text-[13px] font-bold text-white">{i.invoiceNo}</div><div className="text-[11px] text-slate-400">{i.customerName} • {timeAgo(i.date)}</div></div>
                <div className="text-right"><div className="text-[13px] font-bold text-white">{fmtRs(num(i.total))}</div><Badge s={i.status ?? "Paid"} /></div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
