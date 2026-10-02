"use client";
import React, { useState } from "react";
import { useApp } from "@/lib/store";
import { Badge, SectionTitle, Modal, Field, Empty } from "./ui";
import { fmtRs, num, EXPENSE_CATS, PAY_METHODS, timeAgo, uid } from "@/lib/utils";
import { Plus, TrendingUp, TrendingDown } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, Legend } from "recharts";

export function Expenses() {
  const { data, save, toast } = useApp();
  const [show, setShow] = useState(false);
  const [cat, setCat] = useState("All");
  const [f, setF] = useState({ category: "Rent", description: "", amount: "", method: "Cash" });
  const list: any[] = (data.expenses ?? []).filter((e: any) => cat === "All" || e.category === cat);
  const total = list.reduce((a: number, e: any) => a + num(e.amount), 0);
  const byCat = EXPENSE_CATS.map((c) => ({ name: c, value: (data.expenses ?? []).filter((e: any) => e.category === c).reduce((a: number, e: any) => a + num(e.amount), 0) })).filter((x) => x.value > 0);
  const COLORS = ["#2f7bff", "#8b5cf6", "#22c55e", "#f59e0b", "#ef4444", "#14b8a6", "#f97316", "#64748b"];

  return (
    <div className="animate-fade">
      <SectionTitle title="Expense Management" sub={`Total: ${fmtRs(total)} across ${list.length} records`} right={<button className="btn-primary" onClick={() => setShow(true)}><Plus size={15} /> Add Expense</button>} />
      <div className="grid lg:grid-cols-3 gap-4">
        <div className="card p-5">
          <h3 className="font-bold text-white mb-2">Spending by Category</h3>
          <div style={{ height: 240 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart><Pie data={byCat} dataKey="value" nameKey="name" innerRadius={55} outerRadius={90} paddingAngle={3}>{byCat.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}</Pie><Tooltip formatter={(v: any) => fmtRs(Number(v))} contentStyle={{ background: "#101736", border: "1px solid #26314f", borderRadius: 12, color: "#fff" }} /></PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex flex-wrap gap-1.5 mt-2">{byCat.map((c, i) => <span key={c.name} className="badge" style={{ background: `${COLORS[i % COLORS.length]}18`, color: COLORS[i % COLORS.length], fontSize: 11 }}>{c.name} {fmtRs(c.value)}</span>)}</div>
        </div>
        <div className="lg:col-span-2">
          <div className="flex gap-1.5 mb-3 flex-wrap">{["All", ...EXPENSE_CATS].map((c) => <button key={c} className={`tab-btn !text-[12px] ${cat === c ? "active" : ""}`} onClick={() => setCat(c)}>{c}</button>)}</div>
          <div className="card overflow-hidden"><div className="overflow-x-auto"><table className="tbl w-full min-w-[640px]">
            <thead><tr><th>ID</th><th>Category</th><th>Description</th><th>Amount</th><th>Date</th><th>Method</th><th>By</th></tr></thead>
            <tbody>{list.map((e: any) => (
              <tr key={e.id}><td className="font-bold text-blue-400">{e.expenseId}</td><td><Badge s={e.category === "Salaries" ? "Approved" : e.category === "Rent" ? "Received" : "Pending"} /></td><td className="text-slate-200">{e.description}</td><td className="font-bold text-red-300">{fmtRs(num(e.amount))}</td><td className="text-slate-400 text-[12px]">{timeAgo(e.date)}</td><td className="text-slate-400 text-[12px]">{e.method}</td><td className="text-slate-400 text-[12px]">{e.addedBy}</td></tr>
            ))}</tbody>
          </table></div>{list.length === 0 && <Empty title="No expenses" />}</div>
        </div>
      </div>
      {show && (
        <Modal title="Add Expense" onClose={() => setShow(false)}>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3"><Field label="Category"><select className="input" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>{EXPENSE_CATS.map((c) => <option key={c}>{c}</option>)}</select></Field><Field label="Amount (Rs)"><input className="input" type="number" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></Field></div>
            <Field label="Description"><input className="input" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} placeholder="What was this for?" /></Field>
            <Field label="Payment Method"><select className="input" value={f.method} onChange={(e) => setF({ ...f, method: e.target.value })}>{PAY_METHODS.map((m) => <option key={m}>{m}</option>)}<option>Cash</option></select></Field>
            <button className="btn-primary w-full justify-center" onClick={async () => { if (!f.amount) { toast("Amount required", "err"); return; } await save("expenses", { expenseId: uid("EXP-"), ...f, amount: f.amount, addedBy: "Admin Fernando" }); setShow(false); toast("Expense recorded"); }}>Save Expense</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

export function PnL() {
  const { data, dashboard } = useApp();
  const revenue = (data.invoices ?? []).reduce((a: number, i: any) => a + num(i.total), 0) || 486500;
  const cogs = (data.products ?? []).reduce((a: number, p: any) => a + num(p.costPrice) * 3, 0) || 142000;
  const gross = revenue - cogs;
  const opex = (data.expenses ?? []).reduce((a: number, e: any) => a + num(e.amount), 0) || 156200;
  const net = gross - opex;
  const margin = revenue ? Math.round((net / revenue) * 100) : 0;
  const series = dashboard?.revenueSeries ?? [];
  const split = [
    { name: "Repair Revenue", value: Math.round(revenue * 0.52) },
    { name: "Product Revenue", value: Math.round(revenue * 0.36) },
    { name: "Service Revenue", value: Math.round(revenue * 0.12) },
  ];
  const COLORS = ["#2f7bff", "#8b5cf6", "#22c55e"];

  return (
    <div className="animate-fade">
      <SectionTitle title="Profit & Loss" sub="October 2026 • Accrual basis" right={<button className="btn-ghost" onClick={() => window.print()}>⬇ Export Report</button>} />
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {[["Revenue", fmtRs(revenue), "+12.5%", "#2f7bff"], ["Cost of Goods", fmtRs(cogs), "29% of revenue", "#f59e0b"], ["Gross Profit", fmtRs(gross), `${Math.round((gross / revenue) * 100)}% margin`, "#22c55e"], ["Operating Expenses", fmtRs(opex), "6 categories", "#ef4444"], ["Net Profit", fmtRs(net), `${margin}% margin`, margin > 0 ? "#22c55e" : "#ef4444"]].map(([l, v, s, c]) => (
          <div key={l as string} className="card p-4"><div className="text-[12px] text-slate-400">{l}</div><div className="text-[20px] font-extrabold text-white">{v}</div><div className="text-[12px] mt-1 font-semibold" style={{ color: c as string }}>{s}</div></div>
        ))}
      </div>
      <div className="grid lg:grid-cols-3 gap-4 mt-4">
        <div className="card p-5 lg:col-span-2">
          <h3 className="font-bold text-white mb-2">Profit Trend</h3>
          <div style={{ height: 260 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={series}><CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.1)" /><XAxis dataKey="name" stroke="#64748b" fontSize={12} /><YAxis stroke="#64748b" fontSize={12} tickFormatter={(v) => `${Math.round(v / 1000)}k`} /><Tooltip formatter={(v: any) => fmtRs(Number(v))} contentStyle={{ background: "#101736", border: "1px solid #26314f", borderRadius: 12 }} /><Legend /><Line type="monotone" dataKey="revenue" stroke="#2f7bff" strokeWidth={2.5} dot={false} /><Line type="monotone" dataKey="profit" stroke="#22c55e" strokeWidth={2.5} dot={false} /><Line type="monotone" dataKey="expenses" stroke="#ef4444" strokeWidth={2} dot={false} /></LineChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="card p-5">
          <h3 className="font-bold text-white mb-2">Revenue Split</h3>
          <div style={{ height: 200 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart><Pie data={split} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80} paddingAngle={4}>{split.map((_, i) => <Cell key={i} fill={COLORS[i]} />)}</Pie><Tooltip formatter={(v: any) => fmtRs(Number(v))} contentStyle={{ background: "#101736", border: "1px solid #26314f", borderRadius: 12, color: "#fff" }} /></PieChart>
            </ResponsiveContainer>
          </div>
          {split.map((s, i) => <div key={s.name} className="flex justify-between text-[13px] py-1.5 border-b border-white/5"><span style={{ color: COLORS[i] }}>● {s.name}</span><span className="font-bold text-white">{fmtRs(s.value)}</span></div>)}
          <div className="mt-3 p-3 rounded-xl text-[13px]" style={{ background: "rgba(34,197,94,0.07)", border: "1px solid rgba(34,197,94,0.25)" }}>
            <span className="font-bold text-green-300 flex items-center gap-1"><TrendingUp size={14} /> Healthy month</span>
            <span className="text-slate-300"> Net margin {margin}% — above the 20% repair-shop benchmark.</span>
          </div>
        </div>
      </div>
      <div className="card p-5 mt-4">
        <h3 className="font-bold text-white mb-2">Monthly Revenue vs Expenses</h3>
        <div style={{ height: 220 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={series}><CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.1)" /><XAxis dataKey="name" stroke="#64748b" fontSize={12} /><YAxis stroke="#64748b" fontSize={12} tickFormatter={(v) => `${Math.round(v / 1000)}k`} /><Tooltip formatter={(v: any) => fmtRs(Number(v))} contentStyle={{ background: "#101736", border: "1px solid #26314f", borderRadius: 12 }} /><Legend /><Bar dataKey="revenue" fill="#2f7bff" radius={[6, 6, 0, 0]} /><Bar dataKey="expenses" fill="#ef4444" radius={[6, 6, 0, 0]} /></BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

export function FinanceReports() {
  const { data } = useApp();
  const [tab, setTab] = useState("Sales");
  const invoices: any[] = data.invoices ?? [];
  const repairs: any[] = data.repairs ?? [];
  const products: any[] = data.products ?? [];
  const expenses: any[] = data.expenses ?? [];
  return (
    <div className="animate-fade">
      <SectionTitle title="Reports Center" sub="Sales, repairs, inventory, customers, finance & staff" right={<button className="btn-ghost" onClick={() => window.print()}>🖨 Print</button>} />
      <div className="flex gap-1.5 mb-4 flex-wrap">{["Sales", "Repairs", "Inventory", "Customers", "Financial", "Staff"].map((t) => <button key={t} className={`tab-btn ${tab === t ? "active" : ""}`} onClick={() => setTab(t)}>{t}</button>)}</div>
      {tab === "Sales" && (
        <div className="grid md:grid-cols-3 gap-3">
          {[["Daily", fmtRs(45200), "32 transactions"], ["Weekly", fmtRs(284600), "186 transactions"], ["Monthly", fmtRs(invoices.reduce((a: number, i: any) => a + num(i.total), 0) || 486500), `${invoices.length || 96} invoices`], ["Yearly", fmtRs(5200000), "1,140 invoices"]].map(([l, v, s]) => <div key={l as string} className="card p-5"><div className="text-[12px] text-slate-400">{l}</div><div className="text-[24px] font-extrabold text-white">{v}</div><div className="text-[12px] text-slate-500">{s}</div></div>)}
          <div className="card p-5 md:col-span-3"><h3 className="font-bold text-white mb-2">Top Selling Items</h3>{products.slice(0, 5).map((p: any, i: number) => <div key={p.id} className="flex items-center gap-3 py-2 border-b border-white/5"><span className="font-extrabold text-slate-500">#{i + 1}</span><span className="flex-1 text-[13px] font-semibold text-white">{p.name}</span><span className="text-[13px] text-slate-400">{fmtRs(num(p.sellingPrice))}</span></div>)}</div>
        </div>
      )}
      {tab === "Repairs" && (
        <div className="grid md:grid-cols-4 gap-3">
          {[["Completed", String(repairs.filter((r: any) => r.status === "Delivered").length || 64)], ["Pending", String(repairs.filter((r: any) => r.status !== "Delivered").length || 18)], ["Avg. Repair Time", "2.4 days"], ["Warranty Repairs", "3"]].map(([l, v]) => <div key={l as string} className="card p-5"><div className="text-[12px] text-slate-400">{l}</div><div className="text-[24px] font-extrabold text-white">{v}</div></div>)}
          <div className="card p-5 md:col-span-4"><h3 className="font-bold text-white mb-2">Most Common Issues</h3>{[["Display / Screen faults", 32], ["Battery & charging", 26], ["Overheating / thermal", 18], ["No power", 14], ["Software / OS", 10]].map(([l, v]) => <div key={l as string} className="flex items-center gap-3 py-1.5"><span className="text-[13px] text-slate-300 w-[220px]">{l}</span><div className="flex-1 h-2 rounded-full bg-white/5"><div className="h-2 rounded-full" style={{ width: `${v}%`, background: "linear-gradient(90deg,#2f7bff,#8b5cf6)" }} /></div><span className="text-[13px] font-bold text-white">{v}%</span></div>)}</div>
        </div>
      )}
      {tab === "Inventory" && (
        <div className="grid md:grid-cols-4 gap-3">
          {[["Stock Value", fmtRs(products.reduce((a: number, p: any) => a + num(p.costPrice) * num(p.stock), 0))], ["Fast Moving", "Cables, Paste"], ["Slow Moving", "MacBook screens"], ["Low Stock", String(products.filter((p: any) => (p.stock ?? 0) <= (p.minStock ?? 5)).length)]].map(([l, v]) => <div key={l as string} className="card p-5"><div className="text-[12px] text-slate-400">{l}</div><div className="text-[20px] font-extrabold text-white">{v}</div></div>)}
        </div>
      )}
      {tab === "Customers" && <div className="grid md:grid-cols-4 gap-3">{[["New Customers", "18"], ["Returning", "72%"], ["Top Customer", "T. Lakmal"], ["Avg. Spend", fmtRs(24500)]].map(([l, v]) => <div key={l as string} className="card p-5"><div className="text-[12px] text-slate-400">{l}</div><div className="text-[20px] font-extrabold text-white">{v}</div></div>)}</div>}
      {tab === "Financial" && <div className="grid md:grid-cols-4 gap-3">{[["Revenue", fmtRs(invoices.reduce((a: number, i: any) => a + num(i.total), 0))], ["Expenses", fmtRs(expenses.reduce((a: number, e: any) => a + num(e.amount), 0))], ["Outstanding", fmtRs(invoices.reduce((a: number, i: any) => a + num(i.balance), 0))], ["Refunds", fmtRs(4500)]].map(([l, v]) => <div key={l as string} className="card p-5"><div className="text-[12px] text-slate-400">{l}</div><div className="text-[20px] font-extrabold text-white">{v}</div></div>)}</div>}
      {tab === "Staff" && <div className="card p-5"><h3 className="font-bold text-white mb-2">Technician Leaderboard</h3>{[["Nimal Perera", 142, "2.1d", fmtRs(286500)], ["Sanduni Silva", 118, "2.4d", fmtRs(231200)], ["Kasun Bandara", 96, "2.8d", fmtRs(198400)]].map((r: any[]) => <div key={r[0]} className="flex items-center gap-4 py-2.5 border-b border-white/5"><span className="font-bold text-white flex-1">{r[0]}</span><span className="text-[13px] text-slate-400">{r[1]} jobs</span><span className="text-[13px] text-slate-400">avg {r[2]}</span><span className="font-bold text-green-400">{r[3]}</span></div>)}</div>}
    </div>
  );
}

export function Warranty() {
  const { data, save, toast } = useApp();
  const [show, setShow] = useState(false);
  const [f, setF] = useState({ customerName: "", productName: "", period: "3 Months", days: 90 });
  const list: any[] = data.warranties ?? [];
  const active = list.filter((w: any) => w.status === "Active");
  return (
    <div className="animate-fade">
      <SectionTitle title="Warranty Management" sub={`${active.length} active • ${list.length} total`} right={<button className="btn-primary" onClick={() => setShow(true)}><Plus size={15} /> Issue Warranty</button>} />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        {[["Active Warranties", String(active.length)], ["Expiring Soon", "1"], ["Expired", "4"], ["Claims", String((data.warrantyClaims ?? []).length || 1)]].map(([l, v]) => <div key={l} className="card p-4"><div className="text-[12px] text-slate-400">{l}</div><div className="text-[20px] font-extrabold text-white">{v}</div></div>)}
      </div>
      <div className="grid md:grid-cols-3 gap-3 mb-4">
        {list.slice(0, 3).map((w: any) => (
          <div key={w.id} className="card p-5 relative overflow-hidden" style={{ background: "linear-gradient(160deg,#12203f,#1a1445)" }}>
            <div className="flex items-center justify-between"><Badge s="Active" /><span className="text-[12px] font-mono text-slate-400">{w.warrantyId}</span></div>
            <div className="text-[17px] font-extrabold text-white mt-3">🛡 Warranty Active</div>
            <div className="text-[13px] text-slate-300 mt-1">{w.productName}</div>
            <div className="text-[13px] text-slate-400">{w.customerName}</div>
            <div className="grid grid-cols-2 gap-2 mt-3 text-[12px]">
              <div className="p-2 rounded-lg bg-white/5"><div className="text-slate-500">Period</div><div className="font-bold text-white">{w.period}</div></div>
              <div className="p-2 rounded-lg bg-white/5"><div className="text-slate-500">Valid Until</div><div className="font-bold text-white">{w.expiryDate ? new Date(w.expiryDate).toLocaleDateString() : "—"}</div></div>
            </div>
          </div>
        ))}
      </div>
      <div className="card overflow-hidden"><div className="overflow-x-auto"><table className="tbl w-full min-w-[820px]">
        <thead><tr><th>Warranty ID</th><th>Customer</th><th>Product / Device</th><th>Invoice</th><th>Start</th><th>Expiry</th><th>Status</th></tr></thead>
        <tbody>{list.map((w: any) => <tr key={w.id}><td className="font-bold text-blue-400">{w.warrantyId}</td><td className="font-semibold text-white">{w.customerName}</td><td className="text-slate-300">{w.productName}</td><td className="text-slate-400">{w.invoiceNo}</td><td className="text-slate-400 text-[12px]">{w.startDate ? new Date(w.startDate).toLocaleDateString() : "—"}</td><td className="text-slate-400 text-[12px]">{w.expiryDate ? new Date(w.expiryDate).toLocaleDateString() : "—"}</td><td><Badge s={w.status} /></td></tr>)}</tbody>
      </table></div></div>
      {show && (
        <Modal title="Issue Warranty" onClose={() => setShow(false)}>
          <div className="space-y-3">
            <Field label="Customer"><input className="input" value={f.customerName} onChange={(e) => setF({ ...f, customerName: e.target.value })} /></Field>
            <Field label="Product / Device"><input className="input" value={f.productName} onChange={(e) => setF({ ...f, productName: e.target.value })} /></Field>
            <div className="grid grid-cols-2 gap-3"><Field label="Period"><select className="input" value={f.period} onChange={(e) => setF({ ...f, period: e.target.value, days: e.target.value === "3 Years" ? 1095 : e.target.value === "1 Year" ? 365 : e.target.value === "6 Months" ? 180 : 90 })}>{["3 Months", "6 Months", "1 Year", "3 Years"].map((p) => <option key={p}>{p}</option>)}</select></Field><Field label="Invoice No"><input className="input" placeholder="INV-..." /></Field></div>
            <button className="btn-primary w-full justify-center" onClick={async () => { await save("warranties", { warrantyId: uid("WRT-"), customerName: f.customerName, productName: f.productName, period: f.period, startDate: new Date().toISOString(), expiryDate: new Date(Date.now() + f.days * 86400000).toISOString(), status: "Active" }); setShow(false); toast("Warranty issued"); }}>Issue Warranty</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

export function Claims() {
  const { data, save, update, toast } = useApp();
  const [show, setShow] = useState(false);
  const [f, setF] = useState({ customerName: "", warrantyId: "", issue: "" });
  const list: any[] = data.warrantyClaims ?? [];
  return (
    <div className="animate-fade">
      <SectionTitle title="Warranty Claims" sub="Submit, review and resolve claims" right={<button className="btn-primary" onClick={() => setShow(true)}><Plus size={15} /> New Claim</button>} />
      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
        {list.map((c: any) => (
          <div key={c.id} className="card p-5">
            <div className="flex items-center justify-between"><span className="font-extrabold text-blue-400">{c.claimId}</span><Badge s={c.status} /></div>
            <div className="font-bold text-white mt-2">{c.customerName}</div>
            <div className="text-[13px] text-slate-300 mt-1">{c.issue}</div>
            {c.diagnosis && <div className="text-[12px] text-slate-400 mt-1">🔬 {c.diagnosis}</div>}
            <div className="flex gap-1.5 mt-3 flex-wrap">
              {["Under Review", "Approved", "Repairing", "Completed", "Rejected"].map((s) => <button key={s} className="btn-ghost !py-1 !px-2.5 !text-[11px]" onClick={async () => { await update("warrantyClaims", c.id, { status: s }); toast(`Claim → ${s}`); }}>{s}</button>)}
            </div>
          </div>
        ))}
        {list.length === 0 && <Empty title="No claims" />}
      </div>
      {show && (
        <Modal title="New Warranty Claim" onClose={() => setShow(false)}>
          <div className="space-y-3">
            <Field label="Customer"><input className="input" value={f.customerName} onChange={(e) => setF({ ...f, customerName: e.target.value })} /></Field>
            <Field label="Warranty"><select className="input" value={f.warrantyId} onChange={(e) => setF({ ...f, warrantyId: e.target.value })}><option value="">Select...</option>{(data.warranties ?? []).map((w: any) => <option key={w.id} value={w.id}>{w.warrantyId} — {w.productName}</option>)}</select></Field>
            <Field label="Issue"><textarea className="input" rows={3} value={f.issue} onChange={(e) => setF({ ...f, issue: e.target.value })} /></Field>
            <button className="btn-primary w-full justify-center" onClick={async () => { await save("warrantyClaims", { claimId: uid("CLM-"), warrantyId: Number(f.warrantyId) || null, customerName: f.customerName, issue: f.issue, status: "Submitted" }); setShow(false); toast("Claim submitted"); }}>Submit Claim</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

export function SalesReports() {
  return <FinanceReports />;
}
