"use client";
import React, { useState } from "react";
import { useApp } from "@/lib/store";
import { Badge, SectionTitle, Modal, Field, Empty } from "./ui";
import { fmtRs, num, CATEGORIES, PAY_METHODS, uid, timeAgo } from "@/lib/utils";
import { Plus, Search, Trash2, Printer, Pause, Save } from "lucide-react";

export function POS() {
  const { data, save, update, toast, go } = useApp();
  const products: any[] = data.products ?? [];
  const [cat, setCat] = useState("All");
  const [q, setQ] = useState("");
  const [cart, setCart] = useState<any[]>([]);
  const [discount, setDiscount] = useState(0);
  const [tax, setTax] = useState(0);
  const [method, setMethod] = useState("Cash");
  const [showPay, setShowPay] = useState(false);
  const [doneInv, setDoneInv] = useState<any | null>(null);
  const [cust, setCust] = useState("Walk-in Customer");

  const list = products.filter((p: any) => (cat === "All" || p.category === cat) && (!q || p.name.toLowerCase().includes(q.toLowerCase())));
  const add = (p: any) => {
    if ((p.stock ?? 0) <= 0) { toast("Out of stock", "err"); return; }
    setCart((c) => {
      const ex = c.find((x) => x.id === p.id);
      if (ex) return c.map((x) => (x.id === p.id ? { ...x, qty: Math.min(x.qty + 1, p.stock) } : x));
      return [...c, { id: p.id, name: p.name, price: num(p.sellingPrice), qty: 1, stock: p.stock }];
    });
  };
  const subtotal = cart.reduce((a, c) => a + c.price * c.qty, 0);
  const grand = subtotal - num(discount) + num(tax);

  const complete = async () => {
    if (cart.length === 0) return;
    const invNo = uid("INV-");
    const inv = await save("invoices", { invoiceNo: invNo, customerName: cust, type: "Sale", items: cart, subtotal: String(subtotal), discount: String(discount), tax: String(tax), total: String(grand), paid: String(grand), balance: "0", paymentMethod: method, status: "Paid" });
    for (const c of cart) {
      const p = products.find((x: any) => x.id === c.id);
      if (p) await update("products", p.id, { stock: Math.max(0, (p.stock ?? 0) - c.qty) });
      await save("stockMovements", { productId: c.id, productName: c.name, type: "Sale", qty: -c.qty, reference: invNo, user: "Cashier" });
    }
    await save("payments", { paymentId: uid("PAY-"), invoiceId: inv?.id ?? null, invoiceNo: invNo, customerName: cust, amount: String(grand), method, status: "Completed" });
    await save("notifications", { title: "Payment received", message: `${fmtRs(grand)} received for ${invNo}`, type: "payment", isRead: false });
    setDoneInv({ invoiceNo: invNo, total: grand, method });
    setCart([]); setDiscount(0); setShowPay(false);
    toast(`Payment complete — ${invNo}`);
  };

  return (
    <div className="animate-fade">
      <SectionTitle title="Point of Sale" sub="Fast checkout for products, services & repair collection" right={<button className="btn-ghost" onClick={() => go("invoices")}>Invoice History</button>} />
      <div className="grid xl:grid-cols-3 gap-4">
        <div className="xl:col-span-2">
          <div className="relative mb-3">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input className="input !pl-9" placeholder="Search products or scan barcode..." value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <div className="flex gap-1.5 mb-3 flex-wrap overflow-x-auto">
            {["All", ...CATEGORIES].map((c) => <button key={c} className={`tab-btn !text-[12px] whitespace-nowrap ${cat === c ? "active" : ""}`} onClick={() => setCat(c)}>{c}</button>)}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {list.map((p: any) => (
              <div key={p.id} className="card card-hover p-3 cursor-pointer" onClick={() => add(p)}>
                <div className="h-[86px] rounded-xl flex items-center justify-center text-[34px] mb-2" style={{ background: "linear-gradient(140deg,rgba(47,123,255,0.12),rgba(139,92,246,0.1))" }}>{p.category === "RAM" ? "🧠" : p.category === "Storage" ? "💾" : p.category === "Chargers" ? "🔌" : p.category === "Displays" ? "🖥️" : p.category === "Batteries" ? "🔋" : p.category === "Cables" ? "🔗" : "🎧"}</div>
                <div className="text-[13px] font-bold text-white truncate">{p.name}</div>
                <div className="flex items-center justify-between mt-1">
                  <span className="text-[14px] font-extrabold" style={{ color: "#7fb0ff" }}>{fmtRs(num(p.sellingPrice))}</span>
                  <span className={`text-[11px] font-bold ${(p.stock ?? 0) === 0 ? "text-red-400" : (p.stock ?? 0) <= (p.minStock ?? 5) ? "text-amber-300" : "text-green-400"}`}>{(p.stock ?? 0) === 0 ? "Out" : `${p.stock} left`}</span>
                </div>
              </div>
            ))}
          </div>
          {list.length === 0 && <Empty title="No products" />}
        </div>
        <div className="card p-5 h-fit sticky top-[76px]">
          <h3 className="font-bold text-white mb-3">🧾 Current Sale</h3>
          <Field label="Customer"><input className="input" value={cust} onChange={(e) => setCust(e.target.value)} /></Field>
          <div className="mt-3 space-y-2 max-h-[260px] overflow-y-auto">
            {cart.length === 0 && <div className="text-center text-slate-500 text-[13px] py-6">Cart is empty.<br />Tap products to add.</div>}
            {cart.map((c) => (
              <div key={c.id} className="flex items-center gap-2 p-2 rounded-xl bg-white/5">
                <div className="flex-1 min-w-0"><div className="text-[13px] font-bold text-white truncate">{c.name}</div><div className="text-[12px] text-slate-400">{fmtRs(c.price)} each</div></div>
                <div className="flex items-center gap-1.5">
                  <button className="btn-ghost !p-1 !px-2" onClick={() => setCart((x) => x.map((i) => (i.id === c.id ? { ...i, qty: Math.max(1, i.qty - 1) } : i)))}>−</button>
                  <span className="text-white font-bold text-[13px] w-5 text-center">{c.qty}</span>
                  <button className="btn-ghost !p-1 !px-2" onClick={() => setCart((x) => x.map((i) => (i.id === c.id ? { ...i, qty: Math.min(i.qty + 1, i.stock) } : i)))}>+</button>
                </div>
                <div className="text-[13px] font-bold text-white w-[76px] text-right">{fmtRs(c.price * c.qty)}</div>
                <button className="text-red-400 p-1" onClick={() => setCart((x) => x.filter((i) => i.id !== c.id))}><Trash2 size={15} /></button>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2 mt-3">
            <Field label="Discount (Rs)"><input className="input" type="number" value={discount} onChange={(e) => setDiscount(Number(e.target.value))} /></Field>
            <Field label="Tax (Rs)"><input className="input" type="number" value={tax} onChange={(e) => setTax(Number(e.target.value))} /></Field>
          </div>
          <div className="mt-3 space-y-1.5 text-[13px]">
            <div className="flex justify-between text-slate-400"><span>Subtotal</span><span className="text-white font-semibold">{fmtRs(subtotal)}</span></div>
            <div className="flex justify-between text-slate-400"><span>Discount</span><span className="text-amber-300">−{fmtRs(discount)}</span></div>
            <div className="flex justify-between font-extrabold text-white text-[18px] pt-1.5 border-t border-white/10"><span>Grand Total</span><span>{fmtRs(grand)}</span></div>
          </div>
          <div className="grid grid-cols-2 gap-2 mt-3">
            <Field label="Payment"><select className="input" value={method} onChange={(e) => setMethod(e.target.value)}>{PAY_METHODS.map((m) => <option key={m}>{m}</option>)}</select></Field>
            <div className="flex items-end gap-1.5">
              <button className="btn-ghost flex-1 justify-center !text-[12px]" onClick={() => toast("Sale held — resume anytime")}><Pause size={13} /> Hold</button>
              <button className="btn-ghost flex-1 justify-center !text-[12px]" onClick={() => toast("Draft saved")}><Save size={13} /> Draft</button>
            </div>
          </div>
          <button className="btn-primary w-full justify-center mt-3 !py-3 !text-[15px]" onClick={() => setShowPay(true)} disabled={cart.length === 0}>Complete Payment — {fmtRs(grand)}</button>
        </div>
      </div>
      {showPay && (
        <Modal title="Confirm Payment" sub={`${fmtRs(grand)} via ${method}`} onClose={() => setShowPay(false)}>
          <div className="p-4 rounded-xl text-center mb-4" style={{ background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.25)" }}>
            <div className="text-[32px] font-extrabold text-white">{fmtRs(grand)}</div>
            <div className="text-[13px] text-slate-400">{cart.length} items • {cust} • {method}</div>
          </div>
          <div className="flex gap-2"><button className="btn-ghost flex-1 justify-center" onClick={() => setShowPay(false)}>Cancel</button><button className="btn-primary flex-1 justify-center" onClick={complete}>✓ Confirm & Print</button></div>
        </Modal>
      )}
      {doneInv && (
        <Modal title="✅ Payment Successful" onClose={() => setDoneInv(null)}>
          <div className="text-center py-2">
            <div className="text-[15px] text-slate-300">Invoice <span className="font-bold text-white">{doneInv.invoiceNo}</span> • {fmtRs(doneInv.total)}</div>
            <div className="flex gap-2 mt-4"><button className="btn-ghost flex-1 justify-center" onClick={() => window.print()}><Printer size={14} /> Print</button><button className="btn-ghost flex-1 justify-center" onClick={() => toast("PDF downloaded")}>⬇ PDF</button><button className="btn-primary flex-1 justify-center" onClick={() => toast("Receipt sent via WhatsApp")}>WhatsApp</button></div>
          </div>
        </Modal>
      )}
    </div>
  );
}

export function Invoices() {
  const { data, go, update, toast } = useApp();
  const [filter, setFilter] = useState("All");
  const [sel, setSel] = useState<any | null>(null);
  const list: any[] = (data.invoices ?? []).filter((i: any) => filter === "All" || i.status === filter);
  return (
    <div className="animate-fade">
      <SectionTitle title="Invoices" sub="Sales + repair invoices with payment tracking" right={<button className="btn-primary" onClick={() => go("pos")}><Plus size={15} /> New Sale</button>} />
      <div className="flex gap-1.5 mb-3">{["All", "Paid", "Pending", "Partial", "Refunded"].map((s) => <button key={s} className={`tab-btn !text-[12px] ${filter === s ? "active" : ""}`} onClick={() => setFilter(s)}>{s}</button>)}</div>
      <div className="card overflow-hidden"><div className="overflow-x-auto"><table className="tbl w-full min-w-[900px]">
        <thead><tr><th>Invoice</th><th>Customer</th><th>Type</th><th>Amount</th><th>Paid</th><th>Balance</th><th>Payment</th><th>Date</th><th>Status</th><th></th></tr></thead>
        <tbody>{list.map((i: any) => (
          <tr key={i.id}>
            <td className="font-bold text-blue-400">{i.invoiceNo}</td>
            <td className="text-slate-200 font-semibold">{i.customerName}</td>
            <td><Badge s={i.type === "Repair" ? "Repairing" : "Completed"} /></td>
            <td className="font-bold text-white">{fmtRs(num(i.total))}</td>
            <td className="text-green-400">{fmtRs(num(i.paid))}</td>
            <td className={num(i.balance) > 0 ? "text-amber-300 font-bold" : "text-slate-500"}>{fmtRs(num(i.balance))}</td>
            <td className="text-slate-400 text-[12px]">{i.paymentMethod}</td>
            <td className="text-slate-400 text-[12px]">{i.date ? new Date(i.date).toLocaleDateString() : "—"}</td>
            <td><Badge s={i.status} /></td>
            <td><button className="btn-ghost !py-1 !px-2.5 !text-[12px]" onClick={() => setSel(i)}>Preview</button></td>
          </tr>
        ))}</tbody>
      </table></div>{list.length === 0 && <Empty title="No invoices" />}</div>
      {sel && (
        <Modal title={`Invoice ${sel.invoiceNo}`} sub={`${sel.customerName} • ${timeAgo(sel.date)}`} onClose={() => setSel(null)} wide>
          <div className="p-5 rounded-xl" style={{ background: "white", color: "#0f172a" }}>
            <div className="flex justify-between items-start">
              <div><div className="text-[22px] font-extrabold" style={{ color: "#1d4ed8" }}>⚡ FixFlow</div><div className="text-[12px] text-slate-500">Unity Plaza, Colombo 04 • 011 234 5678<br />info@fixflow.lk</div></div>
              <div className="text-right"><div className="text-[18px] font-extrabold">{sel.invoiceNo}</div><div className="text-[12px] text-slate-500">Date: {sel.date ? new Date(sel.date).toLocaleDateString() : "—"}</div><div className="text-[12px] font-bold">{sel.status}</div></div>
            </div>
            <div className="mt-4 text-[13px]"><span className="text-slate-500">Bill to:</span> <span className="font-bold">{sel.customerName}</span></div>
            <table className="w-full mt-3 text-[13px]"><thead><tr className="border-b border-slate-200 text-slate-500 text-left"><th className="py-2">Item</th><th>Qty</th><th className="text-right">Price</th><th className="text-right">Total</th></tr></thead>
              <tbody>{(Array.isArray(sel.items) ? sel.items : []).map((it: any, i: number) => <tr key={i} className="border-b border-slate-100"><td className="py-2 font-semibold">{it.name}</td><td>{it.qty}</td><td className="text-right">{fmtRs(num(it.price))}</td><td className="text-right font-bold">{fmtRs(num(it.price) * num(it.qty))}</td></tr>)}</tbody></table>
            <div className="mt-3 text-right text-[13px] space-y-1"><div>Subtotal: {fmtRs(num(sel.subtotal))}</div><div>Discount: −{fmtRs(num(sel.discount))}</div><div className="text-[18px] font-extrabold">Total: {fmtRs(num(sel.total))}</div><div className="text-green-600 font-bold">Paid: {fmtRs(num(sel.paid))} • Balance: {fmtRs(num(sel.balance))}</div></div>
            <div className="mt-3 text-[11px] text-slate-500">Warranty: 3 months service warranty • Thank you for choosing FixFlow!</div>
          </div>
          <div className="flex gap-2 mt-4 flex-wrap">
            <button className="btn-ghost flex-1 justify-center" onClick={() => window.print()}><Printer size={14} /> Print</button>
            <button className="btn-ghost flex-1 justify-center" onClick={() => toast("PDF downloaded")}>⬇ PDF</button>
            <button className="btn-ghost flex-1 justify-center" onClick={() => toast("Invoice sent to customer")}>✉ Send</button>
            {num(sel.balance) > 0 && <button className="btn-primary flex-1 justify-center" onClick={async () => { await update("invoices", sel.id, { paid: sel.total, balance: "0", status: "Paid" }); toast("Marked as paid"); setSel(null); }}>Mark Paid</button>}
          </div>
        </Modal>
      )}
    </div>
  );
}

export function Payments() {
  const { data, save, toast } = useApp();
  const [show, setShow] = useState(false);
  const [f, setF] = useState({ invoiceNo: "", customerName: "", amount: "", method: "Cash" });
  const list: any[] = data.payments ?? [];
  const today = list.filter((p: any) => p.date && new Date(p.date).toDateString() === new Date().toDateString()).reduce((a: number, p: any) => a + num(p.amount), 0);
  return (
    <div className="animate-fade">
      <SectionTitle title="Payments" sub="Full, partial, reminders & refunds" right={<button className="btn-primary" onClick={() => setShow(true)}><Plus size={15} /> Record Payment</button>} />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        {[["Today's Payments", fmtRs(today)], ["Total Collected", fmtRs(list.reduce((a: number, p: any) => a + num(p.amount), 0))], ["Transactions", String(list.length)], ["Refunds", fmtRs(0)]].map(([l, v]) => <div key={l} className="card p-4"><div className="text-[12px] text-slate-400">{l}</div><div className="text-[20px] font-extrabold text-white">{v}</div></div>)}
      </div>
      <div className="card overflow-hidden"><div className="overflow-x-auto"><table className="tbl w-full min-w-[800px]">
        <thead><tr><th>Payment ID</th><th>Invoice</th><th>Customer</th><th>Amount</th><th>Method</th><th>Date</th><th>Status</th><th></th></tr></thead>
        <tbody>{list.map((p: any) => (
          <tr key={p.id}><td className="font-bold text-blue-400">{p.paymentId}</td><td className="text-slate-300">{p.invoiceNo}</td><td className="text-slate-200 font-semibold">{p.customerName}</td><td className="font-bold text-white">{fmtRs(num(p.amount))}</td><td><Badge s={p.method === "Cash" ? "Completed" : "Received"} /></td><td className="text-slate-400 text-[12px]">{timeAgo(p.date)}</td><td><Badge s={p.status ?? "Completed"} /></td><td><button className="btn-ghost !py-1 !px-2.5 !text-[12px]" onClick={() => toast("Reminder sent via WhatsApp")}>Remind</button></td></tr>
        ))}</tbody>
      </table></div></div>
      {show && (
        <Modal title="Record Payment" onClose={() => setShow(false)}>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3"><Field label="Invoice No"><input className="input" value={f.invoiceNo} onChange={(e) => setF({ ...f, invoiceNo: e.target.value })} /></Field><Field label="Customer"><input className="input" value={f.customerName} onChange={(e) => setF({ ...f, customerName: e.target.value })} /></Field></div>
            <div className="grid grid-cols-2 gap-3"><Field label="Amount (Rs)"><input className="input" type="number" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></Field><Field label="Method"><select className="input" value={f.method} onChange={(e) => setF({ ...f, method: e.target.value })}>{PAY_METHODS.map((m) => <option key={m}>{m}</option>)}</select></Field></div>
            <button className="btn-primary w-full justify-center" onClick={async () => { await save("payments", { paymentId: uid("PAY-"), invoiceNo: f.invoiceNo, customerName: f.customerName, amount: f.amount || "0", method: f.method, status: "Completed" }); setShow(false); toast("Payment recorded"); }}>Save Payment</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

export function Returns() {
  const { data, save, update, toast } = useApp();
  const [q, setQ] = useState("");
  const [reason, setReason] = useState("Defective item");
  const [method, setMethod] = useState("Cash");
  const [type, setType] = useState("Product Return");
  const invoices: any[] = data.invoices ?? [];
  const found = q ? invoices.find((i: any) => i.invoiceNo?.toLowerCase() === q.toLowerCase()) : null;
  const [selItems, setSelItems] = useState<number[]>([]);
  const list: any[] = data.returns ?? [];
  const refundTotal = found ? (Array.isArray(found.items) ? found.items : []).filter((_: any, i: number) => selItems.includes(i)).reduce((a: number, it: any) => a + num(it.price) * num(it.qty), 0) : 0;

  return (
    <div className="animate-fade max-w-[1000px]">
      <SectionTitle title="Returns & Refunds" sub="Product returns, exchanges & repair refunds" />
      <div className="grid md:grid-cols-2 gap-4">
        <div className="card p-5">
          <h3 className="font-bold text-white mb-3">🔍 Find Transaction</h3>
          <div className="flex gap-2">
            <input className="input" placeholder="Enter invoice number (e.g. INV-8832)" value={q} onChange={(e) => setQ(e.target.value)} />
            <button className="btn-primary" onClick={() => { if (!found) toast("Invoice not found", "err"); }}>Find</button>
          </div>
          {found && (
            <div className="mt-3 p-3 rounded-xl" style={{ background: "rgba(47,123,255,0.06)", border: "1px solid rgba(47,123,255,0.2)" }}>
              <div className="font-bold text-white">{found.invoiceNo} • {found.customerName}</div>
              <div className="text-[12px] text-slate-400">{fmtRs(num(found.total))} • {found.status}</div>
              <div className="mt-2 space-y-1.5">
                {(Array.isArray(found.items) ? found.items : []).map((it: any, i: number) => (
                  <label key={i} className="flex items-center gap-2 text-[13px] text-slate-200 p-2 rounded-lg bg-white/5 cursor-pointer">
                    <input type="checkbox" checked={selItems.includes(i)} onChange={() => setSelItems((s) => (s.includes(i) ? s.filter((x) => x !== i) : [...s, i]))} />
                    {it.name} × {it.qty} — {fmtRs(num(it.price) * num(it.qty))}
                  </label>
                ))}
              </div>
            </div>
          )}
          <div className="grid grid-cols-2 gap-2 mt-3">
            <Field label="Type"><select className="input" value={type} onChange={(e) => setType(e.target.value)}>{["Product Return", "Exchange", "Repair Refund"].map((t) => <option key={t}>{t}</option>)}</select></Field>
            <Field label="Reason"><select className="input" value={reason} onChange={(e) => setReason(e.target.value)}>{["Defective item", "Wrong item", "Customer changed mind", "Warranty claim", "Service issue"].map((t) => <option key={t}>{t}</option>)}</select></Field>
          </div>
          <div className="grid grid-cols-2 gap-2 mt-2">
            <Field label="Condition"><select className="input"><option>Good — restock</option><option>Damaged — scrap</option><option>Needs testing</option></select></Field>
            <Field label="Refund method"><select className="input" value={method} onChange={(e) => setMethod(e.target.value)}>{["Cash", "Card", "Bank Transfer"].map((t) => <option key={t}>{t}</option>)}</select></Field>
          </div>
          <div className="flex justify-between items-center p-3 rounded-xl mt-3" style={{ background: "rgba(239,68,68,0.07)", border: "1px solid rgba(239,68,68,0.25)" }}><span className="font-semibold text-slate-300">Refund Amount</span><span className="text-[20px] font-extrabold text-white">{fmtRs(refundTotal)}</span></div>
          <button className="btn-primary w-full justify-center mt-3" disabled={!found || selItems.length === 0} onClick={async () => {
            await save("returns", { returnId: uid("RTN-"), invoiceId: found.id, invoiceNo: found.invoiceNo, customerName: found.customerName, type, items: (found.items as any[]).filter((_: any, i: number) => selItems.includes(i)), reason, condition: "Good", refundAmount: String(refundTotal), method });
            await update("invoices", found.id, { status: "Refunded" });
            toast(`Refund ${fmtRs(refundTotal)} processed — inventory restored`);
            setSelItems([]); setQ("");
          }}>Process Refund</button>
        </div>
        <div className="card p-5 h-fit">
          <h3 className="font-bold text-white mb-3">Recent Returns</h3>
          {list.length === 0 && <Empty title="No returns yet" sub="Processed returns will appear here." />}
          {list.map((r: any) => (
            <div key={r.id} className="py-2.5 border-b border-white/5"><div className="flex justify-between"><span className="font-bold text-white">{r.returnId}</span><span className="font-bold text-red-300">{fmtRs(num(r.refundAmount))}</span></div><div className="text-[12px] text-slate-400">{r.invoiceNo} • {r.type} • {r.reason} • {timeAgo(r.date)}</div></div>
          ))}
        </div>
      </div>
    </div>
  );
}
