"use client";
import React, { useState } from "react";
import { useApp } from "@/lib/store";
import { SectionTitle, Field, Badge } from "./ui";
import { fmtRs } from "@/lib/utils";
import { Bot, Send, Sparkles } from "lucide-react";

export function AIDiagnosis() {
  const [f, setF] = useState({ deviceType: "Laptop", brand: "Dell", model: "Latitude 7490", problem: "Not powering on, no charging light", errorCode: "", symptoms: "Sudden shutdown, fan was loud before" });
  const [res, setRes] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);
  const analyze = async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/ai", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: "diagnose", ...f }) });
      setRes(await r.json());
    } catch { setRes(null); }
    setLoading(false);
  };
  return (
    <div className="animate-fade max-w-[1100px]">
      <SectionTitle title="🤖 AI Diagnosis Assistant" sub="Probabilistic fault suggestions for technicians" />
      <div className="grid lg:grid-cols-5 gap-4">
        <div className="card p-5 lg:col-span-2 h-fit">
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2">
              <Field label="Device"><select className="input" value={f.deviceType} onChange={(e) => setF({ ...f, deviceType: e.target.value })}>{["Laptop", "Phone", "Desktop", "Tablet", "MacBook"].map((t) => <option key={t}>{t}</option>)}</select></Field>
              <Field label="Brand"><input className="input" value={f.brand} onChange={(e) => setF({ ...f, brand: e.target.value })} /></Field>
              <Field label="Model"><input className="input" value={f.model} onChange={(e) => setF({ ...f, model: e.target.value })} /></Field>
            </div>
            <Field label="Problem Description"><textarea className="input" rows={3} value={f.problem} onChange={(e) => setF({ ...f, problem: e.target.value })} /></Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Error Code"><input className="input" value={f.errorCode} onChange={(e) => setF({ ...f, errorCode: e.target.value })} placeholder="e.g. 3 beeps" /></Field>
              <Field label="Symptoms"><input className="input" value={f.symptoms} onChange={(e) => setF({ ...f, symptoms: e.target.value })} /></Field>
            </div>
            <button className="btn-primary w-full justify-center !py-3" onClick={analyze} disabled={loading}>{loading ? "Analyzing..." : "⚡ Analyze Problem"}</button>
          </div>
        </div>
        <div className="lg:col-span-3">
          {!res && <div className="card p-10 text-center"><Bot size={40} className="mx-auto text-blue-500" /><div className="font-bold text-white mt-3">Describe the fault and hit Analyze</div><div className="text-[13px] text-slate-400">AI will suggest causes, tests, parts and steps.</div></div>}
          {res && (
            <div className="space-y-3">
              <div className="card p-5" style={{ background: "linear-gradient(160deg,#141b42,#1a1447)" }}><div className="font-bold text-white">✨ {res.summary}</div></div>
              <div className="card p-5"><h3 className="font-bold text-white mb-2">Possible Causes <span className="text-[11px] font-normal text-slate-400">(AI-generated suggestions)</span></h3>
                {res.causes?.map((c: any, i: number) => (
                  <div key={i} className="mb-2.5"><div className="flex justify-between text-[13px]"><span className="text-slate-200 font-semibold">{c.cause}</span><span className="font-bold" style={{ color: c.prob > 70 ? "#4ade80" : c.prob > 50 ? "#fcd34d" : "#94a3b8" }}>{c.prob}%</span></div><div className="h-2 rounded-full mt-1 bg-white/5"><div className="h-2 rounded-full" style={{ width: `${c.prob}%`, background: c.prob > 70 ? "#22c55e" : c.prob > 50 ? "#f59e0b" : "#64748b" }} /></div></div>
                ))}
              </div>
              <div className="grid md:grid-cols-2 gap-3">
                <div className="card p-5"><h3 className="font-bold text-white mb-2">🧪 Recommended Tests</h3>{res.tests?.map((t: string, i: number) => <div key={i} className="text-[13px] text-slate-300 py-1 border-b border-white/5">✓ {t}</div>)}</div>
                <div className="card p-5"><h3 className="font-bold text-white mb-2">🔩 Recommended Parts</h3>{res.parts?.map((t: string, i: number) => <div key={i} className="text-[13px] text-slate-300 py-1 border-b border-white/5">• {t}</div>)}
                  <h3 className="font-bold text-white mt-3 mb-2">📋 Similar Repairs</h3>{res.similar?.map((s: any, i: number) => <div key={i} className="text-[12px] text-slate-400 py-1">• {s.job} {s.device} — {s.outcome}</div>)}</div>
              </div>
              <div className="card p-5"><h3 className="font-bold text-white mb-2">🛠 Troubleshooting Steps</h3>{res.steps?.map((t: string, i: number) => <div key={i} className="text-[13px] text-slate-300 py-1">{t}</div>)}</div>
              <div className="p-3 rounded-xl text-[12px] text-amber-200" style={{ background: "rgba(251,191,36,0.07)", border: "1px solid rgba(251,191,36,0.25)" }}>⚠️ {res.disclaimer}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function AIAssistant() {
  const { toast } = useApp();
  const [msgs, setMsgs] = useState<any[]>([{ role: "ai", text: "👋 Hi! I'm FixFlow AI. Ask about sales, repairs, inventory, profit, technicians or unpaid invoices.", cards: [], table: null }]);
  const [inp, setInp] = useState("");
  const [loading, setLoading] = useState(false);
  const prompts = ["Which products sold the most this month?", "Which repairs are pending?", "How much profit did we make?", "Which items are low in stock?", "Which technician has the most jobs?", "Show unpaid invoices."];

  const ask = async (q: string) => {
    if (!q.trim()) return;
    setMsgs((m) => [...m, { role: "user", text: q }]);
    setInp(""); setLoading(true);
    try {
      const r = await fetch("/api/ai", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: "chat", message: q }) });
      const j = await r.json();
      setMsgs((m) => [...m, { role: "ai", text: j.answer, cards: j.cards ?? [], table: j.table ?? null }]);
    } catch { setMsgs((m) => [...m, { role: "ai", text: "Something went wrong. Try again." }]); }
    setLoading(false);
  };

  return (
    <div className="animate-fade max-w-[900px] mx-auto">
      <SectionTitle title="✨ AI Business Assistant" sub="Natural-language insights over your live shop data" />
      <div className="card p-5 min-h-[420px] flex flex-col">
        <div className="space-y-4 flex-1 max-h-[520px] overflow-y-auto pr-1">
          {msgs.map((m, i) => (
            <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
              <div className="max-w-[85%] p-3.5 rounded-2xl text-[13px] leading-relaxed" style={m.role === "user" ? { background: "linear-gradient(135deg,#2f7bff,#6d5cff)", color: "white", borderBottomRightRadius: 4 } : { background: "rgba(148,163,184,0.08)", color: "#e2e8f0", borderBottomLeftRadius: 4 }}>
                {m.role === "ai" && <div className="flex items-center gap-1.5 text-[11px] font-bold text-violet-300 mb-1"><Sparkles size={12} /> FixFlow AI</div>}
                {m.text}
                {m.cards?.length > 0 && <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-2">{m.cards.map((c: any, j: number) => <div key={j} className="p-2 rounded-xl bg-white/10 text-center"><div className="text-[11px] opacity-70">{c.label}</div><div className="font-extrabold">{c.value}</div></div>)}</div>}
                {m.table && <div className="mt-2 overflow-x-auto rounded-xl bg-black/20"><table className="tbl w-full"><thead><tr>{m.table.columns.map((c: string) => <th key={c}>{c}</th>)}</tr></thead><tbody>{m.table.rows.map((r: string[], j: number) => <tr key={j}>{r.map((c, k) => <td key={k}>{c}</td>)}</tr>)}</tbody></table></div>}
              </div>
            </div>
          ))}
          {loading && <div className="text-slate-400 text-[13px] animate-pulse">✨ Thinking...</div>}
        </div>
        <div className="flex flex-wrap gap-1.5 my-3">{prompts.map((p) => <button key={p} className="btn-ghost !text-[12px] !py-1.5" onClick={() => ask(p)}>{p}</button>)}</div>
        <div className="flex gap-2">
          <input className="input" placeholder="Ask anything about your business..." value={inp} onChange={(e) => setInp(e.target.value)} onKeyDown={(e) => e.key === "Enter" && ask(inp)} />
          <button className="btn-primary" onClick={() => ask(inp)}><Send size={16} /></button>
        </div>
      </div>
    </div>
  );
}

export function Forecast() {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  React.useEffect(() => {
    fetch("/api/ai", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: "forecast" }) })
      .then((r) => r.json()).then((j) => { setRows(j.rows ?? []); setLoading(false); }).catch(() => setLoading(false));
  }, []);
  return (
    <div className="animate-fade">
      <SectionTitle title="📊 Smart Stock Prediction" sub="AI demand forecast • reorder suggestions" />
      <div className="card overflow-hidden"><div className="overflow-x-auto"><table className="tbl w-full min-w-[820px]">
        <thead><tr><th>Product</th><th>Current Stock</th><th>Avg Monthly Sales</th><th>Est. Days Left</th><th>Suggested Reorder</th><th>Urgency</th></tr></thead>
        <tbody>{rows.map((r, i) => (
          <tr key={i}><td className="font-bold text-white">{r.product}</td><td className="text-slate-200">{r.stock}</td><td className="text-slate-300">{r.avgMonthly}/mo</td>
            <td><div className="flex items-center gap-2"><div className="w-24 h-2 rounded-full bg-white/10"><div className="h-2 rounded-full" style={{ width: `${Math.min(100, (r.daysLeft / 60) * 100)}%`, background: r.daysLeft < 10 ? "#ef4444" : r.daysLeft < 30 ? "#f59e0b" : "#22c55e" }} /></div><span className="text-[12px] text-slate-300">{r.daysLeft}d</span></div></td>
            <td className="font-extrabold text-blue-400">{r.reorder > 0 ? `${r.reorder} units` : "—"}</td><td><Badge s={r.urgency === "Critical" ? "Urgent" : r.urgency === "Watch" ? "Pending" : "Completed"} /></td></tr>
        ))}</tbody>
      </table></div>{loading && <div className="p-6 text-center text-slate-400 text-[13px]">Forecasting demand...</div>}</div>
      <div className="mt-3 p-4 rounded-xl text-[13px] text-slate-300" style={{ background: "rgba(47,123,255,0.06)", border: "1px solid rgba(47,123,255,0.2)" }}>💡 <span className="font-bold text-white">Example:</span> RAM 8GB — Stock 5, avg sales 18/mo, ~8 days left → suggested reorder <span className="font-bold text-blue-300">20 units</span>.</div>
    </div>
  );
}

export function Messages() {
  const { data, save, toast } = useApp();
  const [ch, setCh] = useState("WhatsApp");
  const [tpl, setTpl] = useState("Repair Completed");
  const [to, setTo] = useState("Kasun Rathnayake — 0771112233");
  const [body, setBody] = useState("Hello Kasun, great news! Your Dell Latitude 7490 (FF1024) is repaired and ready for collection. Total: Rs. 12,500. — FixFlow, Unity Plaza");
  const templates = ["Repair Received", "Quotation Ready", "Repair Approved", "Repair Completed", "Ready for Collection", "Payment Reminder", "Warranty Expiring"];
  const bodies: Record<string, string> = {
    "Repair Received": "FixFlow: Your device has been received. Job ID: FF1032. Track: fixflow.lk/track/FF1032",
    "Quotation Ready": "Hello, your quotation QT-2044 (Rs. 12,500) is ready. Reply APPROVE to proceed. Valid 7 days.",
    "Repair Approved": "Thanks! Your approval is recorded. Our technician has started the repair.",
    "Repair Completed": "Hello Kasun, great news! Your Dell Latitude 7490 (FF1024) is repaired and ready for collection. Total: Rs. 12,500.",
    "Ready for Collection": "Your device is ready! Collect from Unity Plaza, Colombo 04. Open Mon–Sat 9am–7pm.",
    "Payment Reminder": "Friendly reminder: Rs. 4,500 balance on INV-8831 is due. Pay via bank transfer or in-store.",
    "Warranty Expiring": "Your warranty WRT-903 expires in 10 days. Visit us for a free health check before expiry!",
  };
  const list: any[] = data.messages ?? [];
  return (
    <div className="animate-fade">
      <SectionTitle title="Customer Communication" sub="WhatsApp • SMS • Email with templates" />
      <div className="grid lg:grid-cols-2 gap-4">
        <div className="card p-5">
          <h3 className="font-bold text-white mb-3">✉ Compose Message</h3>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Channel"><div className="flex gap-1.5">{["WhatsApp", "SMS", "Email"].map((c) => <button key={c} className={`tab-btn flex-1 !text-[12px] ${ch === c ? "active" : ""}`} onClick={() => setCh(c)}>{c}</button>)}</div></Field>
              <Field label="To"><input className="input" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
            </div>
            <Field label="Template"><div className="flex flex-wrap gap-1.5">{templates.map((t) => <button key={t} className={`tab-btn !text-[12px] ${tpl === t ? "active" : ""}`} onClick={() => { setTpl(t); setBody(bodies[t]); }}>{t}</button>)}</div></Field>
            <Field label="Preview"><textarea className="input" rows={4} value={body} onChange={(e) => setBody(e.target.value)} /></Field>
            <div className="p-3 rounded-xl text-[13px]" style={{ background: ch === "WhatsApp" ? "rgba(34,197,94,0.06)" : "rgba(47,123,255,0.06)", border: "1px solid rgba(148,163,184,0.15)" }}>
              <div className="text-[11px] font-bold text-slate-400 mb-1">{ch.toUpperCase()} PREVIEW</div>
              <div className="text-slate-200">{body}</div>
            </div>
            <div className="flex gap-2"><button className="btn-ghost flex-1 justify-center" onClick={() => toast("Preview refreshed")}>Preview</button><button className="btn-primary flex-1 justify-center" onClick={async () => { await save("messages", { customerName: to, channel: ch, template: tpl, subject: tpl, body, status: "Sent" }); toast(`Sent via ${ch}`); }}><Send size={14} /> Send via {ch}</button></div>
          </div>
        </div>
        <div className="card p-5 h-fit">
          <h3 className="font-bold text-white mb-3">Sent Messages</h3>
          {list.map((m: any) => (
            <div key={m.id} className="py-2.5 border-b border-white/5"><div className="flex items-center gap-2"><Badge s={m.channel === "WhatsApp" ? "Completed" : m.channel === "SMS" ? "Received" : "Pending"} /><span className="text-[13px] font-bold text-white">{m.customerName}</span><span className="text-[11px] text-slate-500">• {m.template}</span></div><div className="text-[12px] text-slate-400 mt-1">{m.body}</div></div>
          ))}
          {list.length === 0 && <div className="text-slate-500 text-[13px]">No messages yet.</div>}
        </div>
      </div>
    </div>
  );
}

export function Notifications() {
  const { data, update, toast } = useApp();
  const list: any[] = data.notifications ?? [];
  return (
    <div className="animate-fade max-w-[760px]">
      <SectionTitle title="Notifications" sub={`${list.filter((n: any) => !n.isRead).length} unread`} right={<button className="btn-ghost" onClick={async () => { for (const n of list.filter((x: any) => !x.isRead)) await update("notifications", n.id, { isRead: true }); toast("All marked read"); }}>Mark all read</button>} />
      <div className="space-y-2">
        {list.map((n: any) => (
          <div key={n.id} className="card p-4 flex items-start gap-3 cursor-pointer" onClick={() => update("notifications", n.id, { isRead: true })}>
            <div className="w-10 h-10 rounded-xl flex items-center justify-center text-[18px] shrink-0" style={{ background: n.isRead ? "rgba(148,163,184,0.08)" : "rgba(47,123,255,0.12)" }}>{n.type === "stock" ? "📦" : n.type === "payment" ? "💰" : n.type === "repair" ? "🔧" : n.type === "quote" ? "📄" : n.type === "warranty" ? "🛡" : "🔔"}</div>
            <div className="flex-1"><div className="flex items-center gap-2"><span className="font-bold text-white text-[14px]">{n.title}</span>{!n.isRead && <span className="w-2 h-2 rounded-full" style={{ background: "#2f7bff" }} />}</div><div className="text-[13px] text-slate-400">{n.message}</div></div>
          </div>
        ))}
      </div>
    </div>
  );
}
