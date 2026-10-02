"use client";
import React, { useState } from "react";
import { useApp } from "@/lib/store";
import { Badge, SectionTitle, Modal, Field, Empty, Progress } from "./ui";
import { fmtRs, num, REPAIR_STATUSES, PRIORITIES, timeAgo, uid } from "@/lib/utils";
import { Plus, Search, Check, Clock, Printer } from "lucide-react";

/* ---------- REPAIRS LIST ---------- */
export function Repairs() {
  const { data, go, search, update, toast } = useApp();
  const [filter, setFilter] = useState("All");
  const [q, setQ] = useState("");
  const all: any[] = data.repairs ?? [];
  const query = (q || search).toLowerCase();
  const list = all.filter((r) => (filter === "All" || r.status === filter) && (!query || `${r.jobId} ${r.customerName} ${r.brand} ${r.model} ${r.issue}`.toLowerCase().includes(query)));
  const counts: Record<string, number> = { All: all.length };
  REPAIR_STATUSES.forEach((s) => (counts[s] = all.filter((r) => r.status === s).length));

  return (
    <div className="animate-fade">
      <SectionTitle title="Repair Jobs" sub={`${all.length} total jobs • ${all.filter((r) => r.status !== "Delivered").length} active`} right={<><button className="btn-ghost" onClick={() => go("ai-diagnosis")}>🤖 AI Diagnosis</button><button className="btn-primary" onClick={() => go("repair-new")}><Plus size={16} /> New Repair</button></>} />
      <div className="flex flex-wrap gap-1.5 mb-3">
        {["All", ...REPAIR_STATUSES, "Cancelled"].map((s) => (
          <button key={s} className={`tab-btn !text-[12px] ${filter === s ? "active" : ""}`} onClick={() => setFilter(s)}>{s} <span className="opacity-60">({counts[s] ?? 0})</span></button>
        ))}
      </div>
      <div className="relative mb-3 max-w-[420px]">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
        <input className="input !pl-9" placeholder="Search Job ID, customer, device..." value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="card overflow-hidden">
        <div className="overflow-x-auto"><table className="tbl w-full min-w-[980px]">
          <thead><tr><th>Job ID</th><th>Customer</th><th>Device</th><th>Issue</th><th>Technician</th><th>Priority</th><th>Est. Cost</th><th>Status</th><th>Due Date</th><th>Actions</th></tr></thead>
          <tbody>
            {list.map((r: any) => (
              <tr key={r.id}>
                <td className="font-bold text-blue-400 cursor-pointer" onClick={() => go("repair-detail", r.id)}>{r.jobId}</td>
                <td><div className="font-semibold text-slate-200">{r.customerName}</div><div className="text-[11px] text-slate-500">{r.customerPhone}</div></td>
                <td className="text-slate-300">{r.deviceType} • {r.brand} {r.model}</td>
                <td className="max-w-[220px] truncate text-slate-400" title={r.issue}>{r.issue}</td>
                <td className="text-slate-300">{r.technicianName ?? "—"}</td>
                <td><Badge s={r.priority} /></td>
                <td className="font-semibold text-slate-200">{fmtRs(num(r.estimatedTotal))}</td>
                <td><Badge s={r.status} /></td>
                <td className="text-slate-400 text-[12px]">{r.dueDate ? new Date(r.dueDate).toLocaleDateString() : "—"}</td>
                <td>
                  <div className="flex gap-1.5">
                    <button className="btn-ghost !py-1 !px-2.5 !text-[12px]" onClick={() => go("repair-detail", r.id)}>Open</button>
                    {r.status !== "Delivered" && <button className="btn-ghost !py-1 !px-2.5 !text-[12px]" title="Advance status" onClick={async () => {
                      const idx = REPAIR_STATUSES.indexOf(r.status);
                      const next = REPAIR_STATUSES[Math.min(idx + 1, REPAIR_STATUSES.length - 1)];
                      await update("repairs", r.id, { status: next });
                      toast(`${r.jobId} moved to ${next}`);
                    }}>→</button>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table></div>
        {list.length === 0 && <Empty title="No repair jobs found" sub="Try a different filter or create a new repair." />}
      </div>
    </div>
  );
}

/* ---------- NEW REPAIR ---------- */
export function RepairNew() {
  const { data, save, go, toast } = useApp();
  const [f, setF] = useState<any>({ customerName: "", customerPhone: "", customerEmail: "", deviceType: "Laptop", brand: "", model: "", serial: "", issue: "", condition: "Good", accessories: "", priority: "Medium", labourCost: 2500, partsCost: 0, discount: 0, technicianName: "Nimal Perera", dueDays: 3 });
  const customers: any[] = data.customers ?? [];
  const [custQ, setCustQ] = useState("");
  const total = num(f.labourCost) + num(f.partsCost) - num(f.discount);
  const set = (k: string, v: any) => setF((s: any) => ({ ...s, [k]: v }));
  const matches = custQ ? customers.filter((c: any) => `${c.name} ${c.phone}`.toLowerCase().includes(custQ.toLowerCase())).slice(0, 4) : [];

  const submit = async (assign: boolean) => {
    if (!f.customerName || !f.customerPhone || !f.issue) { toast("Customer name, phone and complaint are required", "err"); return; }
    const jobId = "FF" + (1032 + Math.floor(Math.random() * 60));
    const rec = await save("repairs", { jobId, customerName: f.customerName, customerPhone: f.customerPhone, deviceType: f.deviceType, brand: f.brand, model: f.model, serial: f.serial, issue: f.issue, condition: f.condition, accessories: f.accessories, priority: f.priority, status: "Received", technicianName: assign ? f.technicianName : "Unassigned", labourCost: String(f.labourCost), partsCost: String(f.partsCost), discount: String(f.discount), estimatedTotal: String(total), dueDate: new Date(Date.now() + f.dueDays * 86400000).toISOString() });
    await save("repairActivity", { repairId: rec?.id ?? 1, action: "Repair created", description: `Job ${jobId} intake completed`, user: "Cashier" });
    await save("notifications", { title: "New repair received", message: `${jobId} — ${f.customerName} (${f.brand} ${f.model})`, type: "repair", isRead: false });
    toast(`Repair ${jobId} created`);
    go("repair-detail", rec?.id);
  };

  return (
    <div className="animate-fade max-w-[980px]">
      <SectionTitle title="New Repair Intake" sub="Capture customer, device and complaint details" right={<button className="btn-ghost" onClick={() => go("repairs")}>← Back</button>} />
      <div className="grid md:grid-cols-2 gap-4">
        <div className="card p-5">
          <h3 className="font-bold text-white mb-3">👤 Customer</h3>
          <div className="space-y-3">
            <Field label="Search existing customer"><input className="input" placeholder="Type name or phone..." value={custQ} onChange={(e) => setCustQ(e.target.value)} /></Field>
            {matches.map((c: any) => (
              <div key={c.id} className="p-2.5 rounded-xl border border-white/10 cursor-pointer hover:border-blue-500/50 text-[13px]" onClick={() => { set("customerName", c.name); set("customerPhone", c.phone); set("customerEmail", c.email ?? ""); setCustQ(""); }}>
                <span className="font-bold text-white">{c.name}</span> <span className="text-slate-400">• {c.phone}</span>
              </div>
            ))}
            <div className="grid grid-cols-2 gap-3">
              <Field label="Name *"><input className="input" value={f.customerName} onChange={(e) => set("customerName", e.target.value)} placeholder="Kasun Rathnayake" /></Field>
              <Field label="Phone *"><input className="input" value={f.customerPhone} onChange={(e) => set("customerPhone", e.target.value)} placeholder="077..." /></Field>
            </div>
            <Field label="Email"><input className="input" value={f.customerEmail} onChange={(e) => set("customerEmail", e.target.value)} placeholder="email@gmail.com" /></Field>
          </div>
        </div>
        <div className="card p-5">
          <h3 className="font-bold text-white mb-3">💻 Device</h3>
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-3">
              <Field label="Type"><select className="input" value={f.deviceType} onChange={(e) => set("deviceType", e.target.value)}>{["Laptop", "Phone", "Desktop", "Tablet", "MacBook", "Printer", "TV", "Other"].map((t) => <option key={t}>{t}</option>)}</select></Field>
              <Field label="Brand"><input className="input" value={f.brand} onChange={(e) => set("brand", e.target.value)} placeholder="Dell" /></Field>
              <Field label="Model"><input className="input" value={f.model} onChange={(e) => set("model", e.target.value)} placeholder="Latitude 7490" /></Field>
            </div>
            <Field label="Serial Number"><input className="input" value={f.serial} onChange={(e) => set("serial", e.target.value)} placeholder="SN..." /></Field>
            <Field label="Customer Complaint *"><textarea className="input" rows={3} value={f.issue} onChange={(e) => set("issue", e.target.value)} placeholder="Describe the problem in detail..." /></Field>
          </div>
        </div>
        <div className="card p-5">
          <h3 className="font-bold text-white mb-3">🔍 Device Condition</h3>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Physical condition"><select className="input" value={f.condition} onChange={(e) => set("condition", e.target.value)}>{["Excellent", "Good", "Fair", "Damaged", "Cracked Screen", "Water Damage"].map((t) => <option key={t}>{t}</option>)}</select></Field>
              <Field label="Accessories received"><input className="input" value={f.accessories} onChange={(e) => set("accessories", e.target.value)} placeholder="Charger, Bag..." /></Field>
            </div>
            <Field label="Photos"><div className="border border-dashed border-slate-600 rounded-xl p-5 text-center text-slate-400 text-[13px]">📷 Drop photos or <span className="text-blue-400">browse</span> (multiple allowed)<div className="flex gap-2 justify-center mt-3">{["📱", "💻", "🔧"].map((e, i) => <div key={i} className="w-12 h-12 rounded-lg flex items-center justify-center text-[20px]" style={{ background: "rgba(148,163,184,0.08)" }}>{e}</div>)}</div></div></Field>
            <Field label="Priority"><div className="flex gap-2">{PRIORITIES.map((p) => <button key={p} className={`tab-btn flex-1 ${f.priority === p ? "active" : ""}`} onClick={() => set("priority", p)}>{p}</button>)}</div></Field>
          </div>
        </div>
        <div className="card p-5">
          <h3 className="font-bold text-white mb-3">💰 Estimated Cost</h3>
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-3">
              <Field label="Labour (Rs)"><input className="input" type="number" value={f.labourCost} onChange={(e) => set("labourCost", e.target.value)} /></Field>
              <Field label="Parts (Rs)"><input className="input" type="number" value={f.partsCost} onChange={(e) => set("partsCost", e.target.value)} /></Field>
              <Field label="Discount (Rs)"><input className="input" type="number" value={f.discount} onChange={(e) => set("discount", e.target.value)} /></Field>
            </div>
            <div className="flex items-center justify-between p-3 rounded-xl" style={{ background: "rgba(47,123,255,0.08)", border: "1px solid rgba(47,123,255,0.2)" }}>
              <span className="text-slate-300 text-[13px] font-semibold">Estimated Total</span><span className="text-[20px] font-extrabold text-white">{fmtRs(total)}</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Technician"><select className="input" value={f.technicianName} onChange={(e) => set("technicianName", e.target.value)}>{["Nimal Perera", "Sanduni Silva", "Kasun Bandara", "Unassigned"].map((t) => <option key={t}>{t}</option>)}</select></Field>
              <Field label="Due in (days)"><input className="input" type="number" value={f.dueDays} onChange={(e) => set("dueDays", e.target.value)} /></Field>
            </div>
            <div className="flex gap-2 pt-1">
              <button className="btn-ghost flex-1 justify-center" onClick={() => submit(false)}>Save Repair</button>
              <button className="btn-primary flex-1 justify-center" onClick={() => submit(true)}>Save & Assign Technician</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------- REPAIR DETAIL ---------- */
export function RepairDetail({ id }: { id: number }) {
  const { data, update, save, go, toast } = useApp();
  const r: any = (data.repairs ?? []).find((x: any) => x.id === Number(id)) ?? (data.repairs ?? [])[0];
  const [diag, setDiag] = useState("");
  const [partPid, setPartPid] = useState("");
  const [partQty, setPartQty] = useState(1);
  const [showQuote, setShowQuote] = useState(false);
  if (!r) return <Empty title="Repair not found" />;
  const idx = REPAIR_STATUSES.indexOf(r.status);
  const parts: any[] = (data.repairParts ?? []).filter((p: any) => p.repairId === r.id);
  const acts: any[] = (data.repairActivity ?? []).filter((a: any) => a.repairId === r.id);
  const products: any[] = data.products ?? [];

  const advance = async (s: string) => { await update("repairs", r.id, { status: s }); await save("repairActivity", { repairId: r.id, action: "Status changed", description: `Moved to ${s}`, user: "Technician" }); toast(`${r.jobId} → ${s}`); };
  const addDiag = async () => { if (!diag) return; await update("repairs", r.id, { diagnosis: diag }); await save("repairActivity", { repairId: r.id, action: "Diagnosis updated", description: diag.slice(0, 80), user: "Technician" }); toast("Diagnosis saved"); };
  const addPart = async () => {
    const p = products.find((x: any) => x.id === Number(partPid));
    if (!p) { toast("Select a product", "err"); return; }
    if ((p.stock ?? 0) < partQty) { toast("Insufficient stock", "err"); return; }
    await save("repairParts", { repairId: r.id, productId: p.id, productName: p.name, qty: partQty, cost: String(p.costPrice), price: String(p.sellingPrice), warranty: p.warrantyPeriod ?? "3 Months" });
    await save("repairActivity", { repairId: r.id, action: "Part added", description: `${p.name} × ${partQty}`, user: "Technician" });
    toast(`Part added — stock auto-reduced`);
  };

  return (
    <div className="animate-fade">
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <button className="btn-ghost" onClick={() => go("repairs")}>← Back</button>
        <h1 className="text-[22px] font-extrabold text-white">Repair #{r.jobId}</h1>
        <Badge s={r.status} /><Badge s={r.priority} />
        <div className="flex-1" />
        <button className="btn-ghost" onClick={() => window.print()}><Printer size={15} /> Print Job Sheet</button>
        <button className="btn-ghost" onClick={() => setShowQuote(true)}>📄 Create Quotation</button>
        <button className="btn-primary" onClick={() => go("ai-diagnosis")}>🤖 AI Diagnosis</button>
      </div>

      <div className="card p-5 mb-4 overflow-x-auto">
        <div className="flex items-center gap-1 min-w-[860px]">
          {REPAIR_STATUSES.map((s, i) => (
            <React.Fragment key={s}>
              <div className="flex flex-col items-center gap-1.5 cursor-pointer" onClick={() => advance(s)}>
                <div className="timeline-dot" style={i <= idx ? { background: "linear-gradient(135deg,#2f7bff,#8b5cf6)", color: "white" } : { background: "rgba(148,163,184,0.1)", color: "#64748b" }}>{i < idx ? <Check size={14} /> : i + 1}</div>
                <span className="text-[10px] font-semibold" style={{ color: i <= idx ? "#93c5fd" : "#64748b" }}>{s}</span>
              </div>
              {i < REPAIR_STATUSES.length - 1 && <div className="flex-1 h-[2px] rounded mb-5" style={{ background: i < idx ? "#2f7bff" : "rgba(148,163,184,0.15)" }} />}
            </React.Fragment>
          ))}
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <div className="space-y-4">
          <div className="card p-5">
            <h3 className="font-bold text-white mb-3">👤 Customer</h3>
            <div className="text-[14px] font-bold text-white">{r.customerName}</div>
            <div className="text-[13px] text-slate-400">{r.customerPhone}</div>
            <div className="grid grid-cols-2 gap-2 mt-3 text-[12px]">
              <div className="p-2.5 rounded-xl bg-white/5"><div className="text-slate-500">Device</div><div className="font-bold text-white">{r.deviceType} • {r.brand} {r.model}</div></div>
              <div className="p-2.5 rounded-xl bg-white/5"><div className="text-slate-500">Serial</div><div className="font-bold text-white">{r.serial || "—"}</div></div>
              <div className="p-2.5 rounded-xl bg-white/5"><div className="text-slate-500">Condition</div><div className="font-bold text-white">{r.condition}</div></div>
              <div className="p-2.5 rounded-xl bg-white/5"><div className="text-slate-500">Accessories</div><div className="font-bold text-white">{r.accessories || "None"}</div></div>
            </div>
            <div className="mt-3 p-3 rounded-xl text-[13px] text-slate-300" style={{ background: "rgba(251,191,36,0.06)", border: "1px solid rgba(251,191,36,0.2)" }}><span className="font-bold text-amber-300">Complaint: </span>{r.issue}</div>
          </div>
          <div className="card p-5">
            <h3 className="font-bold text-white mb-2">💰 Cost Summary</h3>
            {[["Labour", r.labourCost], ["Parts", r.partsCost], ["Discount", `-${fmtRs(num(r.discount))}`]].map(([l, v]: any) => (
              <div key={l} className="flex justify-between text-[13px] py-1.5 border-b border-white/5"><span className="text-slate-400">{l}</span><span className="font-semibold text-slate-200">{typeof v === "string" && v.startsWith("-") ? v : fmtRs(num(v))}</span></div>
            ))}
            <div className="flex justify-between pt-2"><span className="font-bold text-white">Total</span><span className="font-extrabold text-white text-[18px]">{fmtRs(num(r.estimatedTotal))}</span></div>
            <div className="text-[12px] text-slate-400 mt-2">👨‍🔧 {r.technicianName} • Due {r.dueDate ? new Date(r.dueDate).toLocaleDateString() : "—"}</div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="card p-5">
            <div className="flex items-center justify-between mb-2"><h3 className="font-bold text-white">🔬 Diagnosis</h3><button className="btn-ghost !text-[12px] !py-1.5" onClick={() => go("ai-diagnosis")}>✨ AI Assist</button></div>
            {r.diagnosis && <div className="p-3 rounded-xl text-[13px] text-slate-200 mb-3" style={{ background: "rgba(47,123,255,0.07)", border: "1px solid rgba(47,123,255,0.2)" }}>{r.diagnosis}</div>}
            <textarea className="input" rows={3} placeholder="Technician notes..." value={diag} onChange={(e) => setDiag(e.target.value)} />
            <button className="btn-primary w-full justify-center mt-2 !py-2.5" onClick={addDiag}>Save Diagnosis</button>
          </div>
          <div className="card p-5">
            <h3 className="font-bold text-white mb-3">🔩 Parts Used <span className="text-[11px] font-normal text-slate-400">(auto-reduces inventory)</span></h3>
            <div className="flex gap-2 mb-3">
              <select className="input" value={partPid} onChange={(e) => setPartPid(e.target.value)}><option value="">Select product...</option>{products.map((p: any) => <option key={p.id} value={p.id}>{p.name} (stk {p.stock})</option>)}</select>
              <input className="input !w-20" type="number" min={1} value={partQty} onChange={(e) => setPartQty(Number(e.target.value))} />
              <button className="btn-primary !px-3" onClick={addPart}><Plus size={16} /></button>
            </div>
            {parts.length === 0 && <div className="text-[13px] text-slate-500">No parts added yet.</div>}
            {parts.map((p: any) => (
              <div key={p.id} className="flex items-center justify-between py-2 border-b border-white/5 text-[13px]"><span className="text-slate-200">{p.productName} × {p.qty}</span><span className="font-semibold text-white">{fmtRs(num(p.price) * num(p.qty))}</span></div>
            ))}
          </div>
        </div>

        <div className="card p-5 h-fit">
          <h3 className="font-bold text-white mb-3">🕓 Activity Timeline</h3>
          <div className="space-y-3">
            {(acts.length ? acts : [{ action: "Repair created", description: `Job ${r.jobId} intake`, user: "System", createdAt: r.createdAt }]).map((a: any, i: number) => (
              <div key={i} className="flex gap-3">
                <div className="flex flex-col items-center"><div className="w-2.5 h-2.5 rounded-full mt-1.5" style={{ background: "#2f7bff" }} /><div className="w-[2px] flex-1" style={{ background: "rgba(148,163,184,0.12)" }} /></div>
                <div><div className="text-[13px] font-bold text-white">{a.action}</div><div className="text-[12px] text-slate-400">{a.description}</div><div className="text-[11px] text-slate-500">{a.user} • {timeAgo(a.createdAt)}</div></div>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2 mt-4">
            <button className="btn-ghost justify-center !text-[12px]" onClick={() => advance("Testing")}><Clock size={13} /> Move to Testing</button>
            <button className="btn-ghost justify-center !text-[12px]" onClick={() => advance("Ready")}><Check size={13} /> Mark Ready</button>
          </div>
        </div>
      </div>

      {showQuote && (
        <Modal title="Create Quotation" sub={`For ${r.jobId} — ${r.customerName}`} onClose={() => setShowQuote(false)}>
          <QuoteForm repair={r} onDone={() => { setShowQuote(false); toast("Quotation created"); go("quotations"); }} />
        </Modal>
      )}
    </div>
  );
}

export function QuoteForm({ repair, onDone }: { repair?: any; onDone: () => void }) {
  const { save } = useApp();
  const [f, setF] = useState({ labour: repair ? num(repair.labourCost) : 3000, charges: 0, discount: 0, parts: repair ? [{ name: `${repair.brand} ${repair.model} part`, qty: 1, price: num(repair.partsCost) || 5000 }] : [{ name: "", qty: 1, price: 0 }] });
  const partsTotal = f.parts.reduce((a: number, p: any) => a + num(p.qty) * num(p.price), 0);
  const total = partsTotal + num(f.labour) + num(f.charges) - num(f.discount);
  return (
    <div className="space-y-3">
      {f.parts.map((p: any, i: number) => (
        <div key={i} className="grid grid-cols-12 gap-2">
          <input className="input col-span-6" placeholder="Part name" value={p.name} onChange={(e) => setF({ ...f, parts: f.parts.map((x: any, j: number) => (j === i ? { ...x, name: e.target.value } : x)) })} />
          <input className="input col-span-2" type="number" value={p.qty} onChange={(e) => setF({ ...f, parts: f.parts.map((x: any, j: number) => (j === i ? { ...x, qty: e.target.value } : x)) })} />
          <input className="input col-span-4" type="number" placeholder="Price" value={p.price} onChange={(e) => setF({ ...f, parts: f.parts.map((x: any, j: number) => (j === i ? { ...x, price: e.target.value } : x)) })} />
        </div>
      ))}
      <button className="btn-ghost !text-[12px]" onClick={() => setF({ ...f, parts: [...f.parts, { name: "", qty: 1, price: 0 }] })}>+ Add part</button>
      <div className="grid grid-cols-3 gap-2">
        <Field label="Labour"><input className="input" type="number" value={f.labour} onChange={(e) => setF({ ...f, labour: Number(e.target.value) })} /></Field>
        <Field label="Charges"><input className="input" type="number" value={f.charges} onChange={(e) => setF({ ...f, charges: Number(e.target.value) })} /></Field>
        <Field label="Discount"><input className="input" type="number" value={f.discount} onChange={(e) => setF({ ...f, discount: Number(e.target.value) })} /></Field>
      </div>
      <div className="flex justify-between items-center p-3 rounded-xl" style={{ background: "rgba(47,123,255,0.08)" }}><span className="font-semibold text-slate-300">Estimated Total</span><span className="text-[20px] font-extrabold text-white">{fmtRs(total)}</span></div>
      <div className="flex gap-2">
        <button className="btn-ghost flex-1 justify-center" onClick={async () => {
          await save("quotations", { quoteId: uid("QT-"), customerName: repair?.customerName ?? "Walk-in", repairId: repair?.id ?? null, deviceInfo: repair ? `${repair.brand} ${repair.model}` : "", problem: repair?.issue ?? "", items: f.parts, labour: String(f.labour), charges: String(f.charges), discount: String(f.discount), total: String(total), status: "Draft", validUntil: new Date(Date.now() + 7 * 86400000).toISOString() });
          onDone();
        }}>Save Draft</button>
        <button className="btn-primary flex-1 justify-center" onClick={async () => {
          await save("quotations", { quoteId: uid("QT-"), customerName: repair?.customerName ?? "Walk-in", repairId: repair?.id ?? null, deviceInfo: repair ? `${repair.brand} ${repair.model}` : "", problem: repair?.issue ?? "", items: f.parts, labour: String(f.labour), charges: String(f.charges), discount: String(f.discount), total: String(total), status: "Sent", validUntil: new Date(Date.now() + 7 * 86400000).toISOString() });
          onDone();
        }}>Send to Customer</button>
      </div>
    </div>
  );
}

/* ---------- QUOTATIONS ---------- */
export function Quotations() {
  const { data, update, go, toast } = useApp();
  const [filter, setFilter] = useState("All");
  const [show, setShow] = useState(false);
  const list: any[] = (data.quotations ?? []).filter((q: any) => filter === "All" || q.status === filter);
  return (
    <div className="animate-fade">
      <SectionTitle title="Quotations" sub="Draft, send, approve and convert to repairs" right={<button className="btn-primary" onClick={() => setShow(true)}><Plus size={16} /> New Quotation</button>} />
      <div className="flex gap-1.5 mb-3 flex-wrap">{["All", "Draft", "Sent", "Approved", "Rejected", "Expired"].map((s) => <button key={s} className={`tab-btn !text-[12px] ${filter === s ? "active" : ""}`} onClick={() => setFilter(s)}>{s}</button>)}</div>
      <div className="card overflow-hidden"><div className="overflow-x-auto"><table className="tbl w-full min-w-[860px]">
        <thead><tr><th>Quotation ID</th><th>Customer</th><th>Repair / Device</th><th>Total</th><th>Created</th><th>Valid Until</th><th>Status</th><th>Actions</th></tr></thead>
        <tbody>{list.map((q: any) => (
          <tr key={q.id}>
            <td className="font-bold text-blue-400">{q.quoteId}</td>
            <td className="text-slate-200 font-semibold">{q.customerName}</td>
            <td className="text-slate-400">{q.deviceInfo || `Repair #${q.repairId}`}</td>
            <td className="font-bold text-white">{fmtRs(num(q.total))}</td>
            <td className="text-slate-400 text-[12px]">{q.createdAt ? new Date(q.createdAt).toLocaleDateString() : "—"}</td>
            <td className="text-slate-400 text-[12px]">{q.validUntil ? new Date(q.validUntil).toLocaleDateString() : "—"}</td>
            <td><Badge s={q.status} /></td>
            <td><div className="flex gap-1.5 flex-wrap">
              {q.status !== "Approved" && <button className="btn-ghost !py-1 !px-2.5 !text-[12px]" onClick={async () => { await update("quotations", q.id, { status: "Approved" }); toast(`${q.quoteId} approved`); }}>Approve</button>}
              {q.status !== "Rejected" && <button className="btn-ghost !py-1 !px-2.5 !text-[12px]" onClick={async () => { await update("quotations", q.id, { status: "Rejected" }); toast(`${q.quoteId} rejected`); }}>Reject</button>}
              <button className="btn-ghost !py-1 !px-2.5 !text-[12px]" onClick={() => window.print()}>PDF</button>
            </div></td>
          </tr>
        ))}</tbody>
      </table></div>{list.length === 0 && <Empty title="No quotations" />}</div>
      {show && <Modal title="New Quotation" onClose={() => setShow(false)} wide><QuoteForm onDone={() => { setShow(false); toast("Quotation saved"); }} /></Modal>}
    </div>
  );
}

/* ---------- CUSTOMERS ---------- */
export function Customers() {
  const { data, go, save, toast, search } = useApp();
  const [show, setShow] = useState(false);
  const [f, setF] = useState({ name: "", phone: "", email: "", address: "" });
  const list: any[] = (data.customers ?? []).filter((c: any) => !search || `${c.name} ${c.phone}`.toLowerCase().includes(search.toLowerCase()));
  return (
    <div className="animate-fade">
      <SectionTitle title="Customers" sub={`${list.length} total customers`} right={<button className="btn-primary" onClick={() => setShow(true)}><Plus size={16} /> New Customer</button>} />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        {[["Total Customers", String((data.customers ?? []).length || 248)], ["New This Month", "18"], ["Active", String(list.length)], ["Outstanding", fmtRs(list.reduce((a: number, c: any) => a + num(c.outstanding), 0) || 18500)]].map(([l, v]) => (
          <div key={l} className="card p-4"><div className="text-[12px] text-slate-400">{l}</div><div className="text-[20px] font-extrabold text-white">{v}</div></div>
        ))}
      </div>
      <div className="card overflow-hidden"><div className="overflow-x-auto"><table className="tbl w-full min-w-[860px]">
        <thead><tr><th>Customer</th><th>Phone</th><th>Repairs</th><th>Purchases</th><th>Total Spent</th><th>Outstanding</th><th>Last Visit</th><th></th></tr></thead>
        <tbody>{list.map((c: any) => (
          <tr key={c.id}>
            <td><div className="flex items-center gap-2.5"><div className="w-9 h-9 rounded-full flex items-center justify-center font-bold text-white text-[13px]" style={{ background: "linear-gradient(135deg,#2f7bff,#8b5cf6)" }}>{c.name?.[0]}</div><div><div className="font-bold text-white">{c.name}</div><div className="text-[11px] text-slate-500">{c.email}</div></div></div></td>
            <td className="text-slate-300">{c.phone}</td>
            <td className="text-slate-300">{c.repairsCount ?? 0}</td>
            <td className="text-slate-300">{c.purchasesCount ?? 0}</td>
            <td className="font-semibold text-white">{fmtRs(num(c.totalSpent))}</td>
            <td>{num(c.outstanding) > 0 ? <span className="font-bold text-amber-300">{fmtRs(num(c.outstanding))}</span> : <span className="text-slate-500">—</span>}</td>
            <td className="text-slate-400 text-[12px]">{timeAgo(c.lastVisit ?? c.createdAt)}</td>
            <td><button className="btn-ghost !py-1 !px-2.5 !text-[12px]" onClick={() => go("customer-detail", c.id)}>Profile →</button></td>
          </tr>
        ))}</tbody>
      </table></div></div>
      {show && (
        <Modal title="New Customer" onClose={() => setShow(false)}>
          <div className="space-y-3">
            <Field label="Name"><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
            <div className="grid grid-cols-2 gap-3"><Field label="Phone"><input className="input" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field><Field label="Email"><input className="input" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field></div>
            <Field label="Address"><input className="input" value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} /></Field>
            <button className="btn-primary w-full justify-center" onClick={async () => { if (!f.name || !f.phone) { toast("Name & phone required", "err"); return; } await save("customers", { ...f, totalSpent: "0", outstanding: "0" }); setShow(false); toast("Customer added"); }}>Save Customer</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

export function CustomerDetail({ id }: { id: number }) {
  const { data, go } = useApp();
  const c: any = (data.customers ?? []).find((x: any) => x.id === Number(id)) ?? (data.customers ?? [])[0];
  const [tab, setTab] = useState("Overview");
  if (!c) return <Empty title="Customer not found" />;
  const repairs = (data.repairs ?? []).filter((r: any) => r.customerName === c.name);
  const invoices = (data.invoices ?? []).filter((r: any) => r.customerName === c.name);
  const warranties = (data.warranties ?? []).filter((r: any) => r.customerName === c.name);
  return (
    <div className="animate-fade">
      <button className="btn-ghost mb-3" onClick={() => go("customers")}>← Back</button>
      <div className="card p-6 mb-4">
        <div className="flex flex-wrap items-center gap-4">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center font-extrabold text-white text-[24px]" style={{ background: "linear-gradient(135deg,#2f7bff,#8b5cf6)" }}>{c.name?.[0]}</div>
          <div className="flex-1">
            <h1 className="text-[22px] font-extrabold text-white">{c.name}</h1>
            <div className="text-[13px] text-slate-400">{c.phone} • {c.email} • {c.address}</div>
          </div>
          <div className="flex gap-6 text-center">
            <div><div className="text-[18px] font-extrabold text-white">{fmtRs(num(c.totalSpent))}</div><div className="text-[11px] text-slate-400">Total Spending</div></div>
            <div><div className="text-[18px] font-extrabold text-white">{repairs.length}</div><div className="text-[11px] text-slate-400">Repairs</div></div>
            <div><div className="text-[18px] font-extrabold text-amber-300">{fmtRs(num(c.outstanding))}</div><div className="text-[11px] text-slate-400">Outstanding</div></div>
          </div>
        </div>
        <div className="flex gap-1.5 mt-4 flex-wrap">{["Overview", "Repairs", "Invoices", "Warranty", "Messages"].map((t) => <button key={t} className={`tab-btn ${tab === t ? "active" : ""}`} onClick={() => setTab(t)}>{t}</button>)}</div>
      </div>
      {tab === "Overview" && (
        <div className="grid md:grid-cols-2 gap-4">
          <div className="card p-5"><h3 className="font-bold text-white mb-3">Repair History Timeline</h3>{repairs.length === 0 && <div className="text-slate-500 text-[13px]">No repairs yet.</div>}{repairs.map((r: any) => <div key={r.id} className="flex items-center justify-between py-2 border-b border-white/5"><span className="text-[13px] text-slate-200 font-semibold">{r.jobId} — {r.brand} {r.model}</span><Badge s={r.status} /></div>)}</div>
          <div className="card p-5"><h3 className="font-bold text-white mb-3">Recent Invoices</h3>{invoices.map((i: any) => <div key={i.id} className="flex items-center justify-between py-2 border-b border-white/5"><span className="text-[13px] text-slate-200 font-semibold">{i.invoiceNo}</span><span className="text-[13px] font-bold text-white">{fmtRs(num(i.total))}</span></div>)}{invoices.length === 0 && <div className="text-slate-500 text-[13px]">No invoices.</div>}</div>
        </div>
      )}
      {tab === "Repairs" && <div className="card p-5">{repairs.map((r: any) => <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 border-b border-white/5"><div><div className="font-bold text-blue-400">{r.jobId}</div><div className="text-[12px] text-slate-400">{r.issue}</div></div><div className="flex gap-2"><Badge s={r.priority} /><Badge s={r.status} /><button className="btn-ghost !py-1 !px-2.5 !text-[12px]" onClick={() => go("repair-detail", r.id)}>Open</button></div></div>)}</div>}
      {tab === "Invoices" && <div className="card p-5">{invoices.map((i: any) => <div key={i.id} className="flex items-center justify-between py-2 border-b border-white/5"><span className="font-bold text-white">{i.invoiceNo} • {fmtRs(num(i.total))}</span><Badge s={i.status} /></div>)}</div>}
      {tab === "Warranty" && <div className="card p-5">{warranties.map((w: any) => <div key={w.id} className="flex items-center justify-between py-2 border-b border-white/5"><span className="font-bold text-white">{w.warrantyId} — {w.productName}</span><Badge s={w.status} /></div>)}{warranties.length === 0 && <Empty title="No warranties" />}</div>}
      {tab === "Messages" && <div className="card p-5"><button className="btn-primary" onClick={() => go("messages")}>Open Message Center</button></div>}
    </div>
  );
}

/* ---------- TECHNICIAN DASHBOARD ---------- */
export function TechBoard() {
  const { data, go, update, toast, user } = useApp();
  const techs: any[] = (data.users ?? []).filter((u: any) => u.role === "Technician");
  const mine: any[] = (data.repairs ?? []).filter((r: any) => r.status !== "Delivered");
  const [col, setCol] = useState("All");
  const cols = ["All", "Received", "Diagnosing", "Repairing", "Testing", "Ready"];
  const list = mine.filter((r) => col === "All" || r.status === col);
  return (
    <div className="animate-fade">
      <SectionTitle title={user?.role === "Technician" ? `My Repairs — ${user.name}` : "Technicians"} sub="Workload, assignments and job queues" right={<button className="btn-primary" onClick={() => go("staff")}><Plus size={15} /> Performance</button>} />
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
        {(techs.length ? techs : [{ name: "Nimal Perera", role: "Technician", activeJobs: 6, completedJobs: 142, revenue: 286500, rating: 4.8 }]).map((t: any) => (
          <div key={t.id ?? t.name} className="card card-hover p-5">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center font-extrabold text-white" style={{ background: "linear-gradient(135deg,#2f7bff,#8b5cf6)" }}>{t.name?.[0]}</div>
              <div><div className="font-bold text-white">{t.name}</div><div className="text-[12px] text-slate-400">{t.role} • ⭐ {t.rating ?? 4.7}</div></div>
            </div>
            <div className="grid grid-cols-3 gap-2 mt-3 text-center">
              <div className="p-2 rounded-xl bg-white/5"><div className="font-extrabold text-blue-400">{t.activeJobs ?? 5}</div><div className="text-[10px] text-slate-400">Active</div></div>
              <div className="p-2 rounded-xl bg-white/5"><div className="font-extrabold text-green-400">{t.completedJobs ?? 100}</div><div className="text-[10px] text-slate-400">Done</div></div>
              <div className="p-2 rounded-xl bg-white/5"><div className="font-extrabold text-white text-[13px]">{fmtRs(num(t.revenue))}</div><div className="text-[10px] text-slate-400">Revenue</div></div>
            </div>
            <Progress pct={Math.min(100, ((t.completedJobs ?? 50) / 150) * 100)} color="#22c55e" />
          </div>
        ))}
      </div>
      <div className="flex gap-1.5 mb-3 flex-wrap">{cols.map((c) => <button key={c} className={`tab-btn !text-[12px] ${col === c ? "active" : ""}`} onClick={() => setCol(c)}>{c}</button>)}</div>
      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
        {list.map((r: any) => (
          <div key={r.id} className="card p-4">
            <div className="flex items-center justify-between"><span className="font-extrabold text-blue-400">{r.jobId}</span><div className="flex gap-1.5"><Badge s={r.priority} /><Badge s={r.status} /></div></div>
            <div className="font-bold text-white mt-1.5">{r.customerName}</div>
            <div className="text-[12px] text-slate-400">{r.deviceType} • {r.brand} {r.model}</div>
            <div className="text-[13px] text-slate-300 mt-2 line-clamp-2">{r.issue}</div>
            <div className="text-[12px] text-slate-500 mt-1">Due: {r.dueDate ? new Date(r.dueDate).toLocaleDateString() : "—"}</div>
            <div className="grid grid-cols-2 gap-1.5 mt-3">
              <button className="btn-ghost justify-center !text-[12px]" onClick={() => go("repair-detail", r.id)}>Update Repair</button>
              <button className="btn-ghost justify-center !text-[12px]" onClick={async () => { const i = REPAIR_STATUSES.indexOf(r.status); await update("repairs", r.id, { status: REPAIR_STATUSES[Math.min(i + 1, 7)] }); toast("Status advanced"); }}>Complete Step →</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
