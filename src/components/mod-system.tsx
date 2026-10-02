"use client";
import React, { useState } from "react";
import { useApp } from "@/lib/store";
import { Badge, SectionTitle, Field, Progress, Empty } from "./ui";
import { fmtRs, num, timeAgo } from "@/lib/utils";
import { Check } from "lucide-react";

export function Staff() {
  const { data } = useApp();
  const techs: any[] = (data.users ?? []).filter((u: any) => u.role === "Technician");
  const rows = techs.length ? techs : [
    { name: "Nimal Perera", completedJobs: 142, activeJobs: 6, revenue: "286500", rating: "4.8" },
    { name: "Sanduni Silva", completedJobs: 118, activeJobs: 5, revenue: "231200", rating: "4.7" },
    { name: "Kasun Bandara", completedJobs: 96, activeJobs: 4, revenue: "198400", rating: "4.6" },
  ];
  return (
    <div className="animate-fade">
      <SectionTitle title="Staff Performance" sub="Completed jobs, speed, revenue & quality" />
      <div className="card overflow-hidden"><div className="overflow-x-auto"><table className="tbl w-full min-w-[820px]">
        <thead><tr><th>Technician</th><th>Active</th><th>Completed</th><th>Avg Repair Time</th><th>Revenue</th><th>Warranty Returns</th><th>Rating</th></tr></thead>
        <tbody>{rows.map((t: any, i: number) => (
          <tr key={i}><td><div className="flex items-center gap-2.5"><div className="w-9 h-9 rounded-full flex items-center justify-center font-bold text-white text-[13px]" style={{ background: "linear-gradient(135deg,#2f7bff,#8b5cf6)" }}>{t.name?.[0]}</div><span className="font-bold text-white">{t.name}</span></div></td>
            <td className="font-bold text-blue-400">{t.activeJobs ?? 5}</td><td className="font-bold text-green-400">{t.completedJobs ?? 100}</td><td className="text-slate-300">{["2.1 days", "2.4 days", "2.8 days"][i % 3]}</td><td className="font-bold text-white">{fmtRs(num(t.revenue))}</td><td className="text-slate-400">{[2, 1, 3][i % 3]}</td><td className="text-amber-300">⭐ {t.rating ?? 4.7}</td></tr>
        ))}</tbody>
      </table></div></div>
      <div className="grid md:grid-cols-3 gap-3 mt-4">
        {rows.map((t: any, i: number) => (
          <div key={i} className="card p-5">
            <div className="font-bold text-white">{t.name}</div>
            <div className="text-[12px] text-slate-400 mb-2">Completion rate</div>
            <Progress pct={85 + (i * 4)} color="#22c55e" />
            <div className="text-[12px] text-slate-400 mt-3 mb-2">Revenue contribution</div>
            <Progress pct={70 - i * 8} color="#2f7bff" />
          </div>
        ))}
      </div>
      <p className="text-[12px] text-slate-500 mt-3">Ratings are informational only and shown alongside workload and quality metrics.</p>
    </div>
  );
}

export function Settings() {
  const { toast } = useApp();
  const [tab, setTab] = useState("Business");
  const roles = ["Admin", "Manager", "Technician", "Cashier", "Inventory Manager", "Customer"];
  const perms = ["View", "Create", "Edit", "Delete", "Export", "Approve", "Refund"];
  const matrix: Record<string, string[]> = {
    Admin: perms, Manager: ["View", "Create", "Edit", "Export", "Approve"],
    Technician: ["View", "Create", "Edit"], Cashier: ["View", "Create", "Export"],
    "Inventory Manager": ["View", "Create", "Edit", "Export"], Customer: ["View"],
  };
  const [m, setM] = useState(matrix);
  return (
    <div className="animate-fade">
      <SectionTitle title="Settings" sub="Business, invoices, users, security & data" />
      <div className="flex gap-1.5 mb-4 flex-wrap">{["Business", "Invoice & Tax", "Payments", "Warranty Rules", "Notifications", "Users & Roles", "Security", "Backup"].map((t) => <button key={t} className={`tab-btn ${tab === t ? "active" : ""}`} onClick={() => setTab(t)}>{t}</button>)}</div>
      {tab === "Business" && (
        <div className="grid md:grid-cols-2 gap-4 max-w-[900px]">
          <div className="card p-5 space-y-3"><h3 className="font-bold text-white">Business Profile</h3>
            <Field label="Shop Name"><input className="input" defaultValue="FixFlow Repair Center" /></Field>
            <Field label="Address"><input className="input" defaultValue="Unity Plaza, Colombo 04" /></Field>
            <div className="grid grid-cols-2 gap-3"><Field label="Phone"><input className="input" defaultValue="011 234 5678" /></Field><Field label="Email"><input className="input" defaultValue="info@fixflow.lk" /></Field></div>
            <button className="btn-primary" onClick={() => toast("Business profile saved")}>Save Changes</button></div>
          <div className="card p-5"><h3 className="font-bold text-white mb-2">Shop Logo</h3><div className="h-[120px] rounded-xl flex items-center justify-center text-[40px]" style={{ background: "rgba(47,123,255,0.06)", border: "1px dashed rgba(47,123,255,0.4)" }}>⚡</div><button className="btn-ghost w-full justify-center mt-3" onClick={() => toast("Logo uploaded")}>Upload Logo</button></div>
        </div>
      )}
      {tab === "Invoice & Tax" && <div className="card p-5 max-w-[600px] space-y-3"><Field label="Invoice Prefix"><input className="input" defaultValue="INV-" /></Field><Field label="Tax Rate %"><input className="input" defaultValue="0" /></Field><Field label="Invoice Footer"><input className="input" defaultValue="Thank you for choosing FixFlow! 3-month service warranty." /></Field><button className="btn-primary" onClick={() => toast("Invoice settings saved")}>Save</button></div>}
      {tab === "Payments" && <div className="card p-5 max-w-[600px]"><h3 className="font-bold text-white mb-3">Payment Methods</h3>{["Cash", "Card", "Bank Transfer", "Online Payment"].map((p) => <label key={p} className="flex items-center justify-between py-2.5 border-b border-white/5 text-[14px] text-slate-200"><span>{p}</span><input type="checkbox" defaultChecked className="w-4 h-4" /></label>)}<button className="btn-primary mt-3" onClick={() => toast("Payment methods saved")}>Save</button></div>}
      {tab === "Warranty Rules" && <div className="card p-5 max-w-[600px] space-y-3"><Field label="Default Service Warranty"><select className="input"><option>3 Months</option><option>6 Months</option><option>1 Year</option></select></Field><Field label="Parts Warranty"><select className="input"><option>As per supplier</option><option>3 Months</option><option>6 Months</option></select></Field><button className="btn-primary" onClick={() => toast("Warranty rules saved")}>Save</button></div>}
      {tab === "Notifications" && <div className="card p-5 max-w-[600px]">{["Repair completed alerts", "Low stock alerts", "Payment reminders", "Warranty expiry", "Daily summary email"].map((p) => <label key={p} className="flex items-center justify-between py-2.5 border-b border-white/5 text-[14px] text-slate-200"><span>{p}</span><input type="checkbox" defaultChecked className="w-4 h-4" /></label>)}</div>}
      {tab === "Users & Roles" && (
        <div className="card p-5 overflow-x-auto">
          <h3 className="font-bold text-white mb-3">Role Permissions Matrix</h3>
          <table className="tbl w-full min-w-[760px]"><thead><tr><th>Role</th>{perms.map((p) => <th key={p} className="text-center">{p}</th>)}<th></th></tr></thead>
            <tbody>{roles.map((r) => <tr key={r}><td className="font-bold text-white">{r}</td>{perms.map((p) => <td key={p} className="text-center"><button onClick={() => setM({ ...m, [r]: m[r].includes(p) ? m[r].filter((x) => x !== p) : [...m[r], p] })} className="w-7 h-7 rounded-lg inline-flex items-center justify-center" style={{ background: m[r]?.includes(p) ? "rgba(34,197,94,0.15)" : "rgba(148,163,184,0.08)", color: m[r]?.includes(p) ? "#4ade80" : "#475569" }}>{m[r]?.includes(p) ? <Check size={14} /> : "—"}</button></td>)}<td><button className="btn-ghost !py-1 !px-2.5 !text-[12px]" onClick={() => toast(`Invite sent for ${r}`)}>+ User</button></td></tr>)}</tbody></table>
          <button className="btn-primary mt-3" onClick={() => toast("Permissions saved")}>Save Permissions</button>
        </div>
      )}
      {tab === "Security" && <div className="card p-5 max-w-[600px] space-y-3"><Field label="Change Password"><input className="input" type="password" placeholder="New password" /></Field><label className="flex items-center justify-between text-[14px] text-slate-200">Two-factor authentication <input type="checkbox" className="w-4 h-4" /></label><button className="btn-primary" onClick={() => toast("Security updated")}>Update Security</button></div>}
      {tab === "Backup" && <Backup />}
    </div>
  );
}

export function Backup() {
  const { toast } = useApp();
  return (
    <div className="grid md:grid-cols-2 gap-4 max-w-[900px]">
      <div className="card p-5"><h3 className="font-bold text-white">💾 Database Backup</h3><p className="text-[13px] text-slate-400 mt-1">Last backup: today 06:00 • Auto-backup: <span className="text-green-400 font-bold">Enabled (daily)</span></p>
        <div className="flex gap-2 mt-3"><button className="btn-primary" onClick={() => toast("Backup started — download ready soon")}>Backup Now</button><button className="btn-ghost" onClick={() => toast("Export queued (CSV + JSON)")}>Export Data</button><button className="btn-ghost" onClick={() => toast("Choose a .csv file to import")}>Import</button></div></div>
      <div className="card p-5"><h3 className="font-bold text-white mb-2">Backup History</h3>{["02 Oct 2026 — 06:00 — 4.2 MB ✓", "01 Oct 2026 — 06:00 — 4.1 MB ✓", "30 Sep 2026 — 06:00 — 4.0 MB ✓"].map((b) => <div key={b} className="text-[13px] text-slate-300 py-1.5 border-b border-white/5">{b}</div>)}
        <div className="mt-3 p-3 rounded-xl text-[12px] text-red-200" style={{ background: "rgba(239,68,68,0.07)", border: "1px solid rgba(239,68,68,0.25)" }}>⚠️ Destructive actions (purge / restore) require confirmation and Admin PIN.</div></div>
    </div>
  );
}

export function Audit() {
  const { data } = useApp();
  const list: any[] = data.auditLogs ?? [];
  return (
    <div className="animate-fade">
      <SectionTitle title="Audit Log" sub="Every action across every module" />
      <div className="card overflow-hidden"><div className="overflow-x-auto"><table className="tbl w-full min-w-[760px]">
        <thead><tr><th>Date</th><th>User</th><th>Action</th><th>Module</th><th>Description</th></tr></thead>
        <tbody>{list.map((a: any) => <tr key={a.id}><td className="text-slate-400 text-[12px]">{timeAgo(a.date)}</td><td className="font-bold text-white">{a.user}</td><td className="text-slate-200">{a.action}</td><td><Badge s="Received" /></td><td className="text-slate-400">{a.description}</td></tr>)}</tbody>
      </table></div>{list.length === 0 && <Empty title="No audit entries" />}</div>
    </div>
  );
}

export function Portal() {
  const { data, go } = useApp();
  const repairs: any[] = (data.repairs ?? []).filter((r: any) => r.customerName === "Kasun Rathnayake");
  const r = repairs[0] ?? { jobId: "FF1024", brand: "Dell", model: "Latitude 7490", status: "Repairing", estimatedTotal: 12500 };
  const steps = ["Received", "Diagnosing", "Repairing", "Testing", "Ready"];
  const idx = Math.max(0, steps.indexOf(r.status ?? "Repairing"));
  const invoices = (data.invoices ?? []).filter((i: any) => i.customerName === "Kasun Rathnayake");
  const warranties = (data.warranties ?? []).filter((w: any) => w.customerName === "Kasun Rathnayake");
  return (
    <div className="animate-fade max-w-[560px] mx-auto">
      <div className="card p-6 text-center" style={{ background: "linear-gradient(160deg,#141b42,#1c1447)" }}>
        <div className="text-[14px] text-slate-400">FixFlow Customer Portal</div>
        <h1 className="text-[24px] font-extrabold text-white mt-1">Welcome, Kasun 👋</h1>
      </div>
      <div className="card p-6 mt-3">
        <div className="text-[12px] font-bold text-slate-400 uppercase tracking-wider">Active Repair</div>
        <div className="text-[18px] font-extrabold text-white mt-1">{r.brand} {r.model}</div>
        <div className="text-[13px] text-blue-400 font-bold">Job #{r.jobId} • {r.status}</div>
        <div className="mt-4 space-y-0">
          {steps.map((s, i) => (
            <div key={s} className="flex gap-3">
              <div className="flex flex-col items-center"><div className="timeline-dot" style={i < idx ? { background: "#22c55e", color: "white" } : i === idx ? { background: "#2f7bff", color: "white" } : { background: "rgba(148,163,184,0.12)", color: "#64748b" }}>{i < idx ? "✓" : i === idx ? "●" : "○"}</div>{i < steps.length - 1 && <div className="w-[2px] h-6" style={{ background: i < idx ? "#22c55e" : "rgba(148,163,184,0.15)" }} />}</div>
              <div className={`text-[14px] font-semibold ${i <= idx ? "text-white" : "text-slate-500"}`}>{s}</div>
            </div>
          ))}
        </div>
        <div className="mt-3 p-3 rounded-xl text-[13px] text-slate-300" style={{ background: "rgba(47,123,255,0.07)" }}>📅 Estimated Completion: <span className="font-bold text-white">02 October 2026</span> • {fmtRs(num(r.estimatedTotal))}</div>
        <div className="flex gap-2 mt-3"><button className="btn-primary flex-1 justify-center" onClick={() => go("repair-detail", (r as any).id ?? 1)}>View Details</button><button className="btn-ghost flex-1 justify-center" onClick={() => go("messages")}>Contact Shop</button></div>
      </div>
      <div className="card p-5 mt-3"><h3 className="font-bold text-white mb-2">🧾 My Invoices</h3>{invoices.map((i: any) => <div key={i.id} className="flex justify-between py-2 border-b border-white/5 text-[13px]"><span className="font-bold text-white">{i.invoiceNo}</span><span className="text-slate-300">{fmtRs(num(i.total))}</span><Badge s={i.status} /></div>)}{invoices.length === 0 && <div className="text-slate-500 text-[13px]">No invoices.</div>}</div>
      <div className="card p-5 mt-3"><h3 className="font-bold text-white mb-2">🛡 My Warranties</h3>{warranties.map((w: any) => <div key={w.id} className="flex justify-between py-2 border-b border-white/5 text-[13px]"><span className="font-bold text-white">{w.productName}</span><Badge s={w.status} /></div>)}{warranties.length === 0 && <div className="text-slate-500 text-[13px]">No warranties.</div>}</div>
      <div className="card p-5 mt-3"><h3 className="font-bold text-white mb-2">📜 Repair History</h3>{repairs.map((x: any) => <div key={x.id} className="flex justify-between py-2 border-b border-white/5 text-[13px]"><span className="font-bold text-blue-400">{x.jobId}</span><span className="text-slate-400">{x.brand} {x.model}</span><Badge s={x.status} /></div>)}</div>
    </div>
  );
}
