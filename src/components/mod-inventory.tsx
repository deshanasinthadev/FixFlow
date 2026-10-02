"use client";
import React, { useState } from "react";
import { useApp } from "@/lib/store";
import { Badge, SectionTitle, Modal, Field, Empty } from "./ui";
import { fmtRs, num, CATEGORIES, timeAgo, uid } from "@/lib/utils";
import { Plus, Search, QrCode, Printer, ArrowLeftRight } from "lucide-react";

export function Products() {
  const { data, save, update, toast, search } = useApp();
  const [cat, setCat] = useState("All");
  const [q, setQ] = useState("");
  const [show, setShow] = useState(false);
  const [adj, setAdj] = useState<any | null>(null);
  const [adjQty, setAdjQty] = useState(0);
  const [f, setF] = useState<any>({ name: "", sku: "", barcode: "", category: "Accessories", brand: "", costPrice: "", sellingPrice: "", stock: "", minStock: 5, warrantyPeriod: "6 Months", supplierName: "TechParts Lanka", description: "" });
  const all: any[] = data.products ?? [];
  const query = (q || search).toLowerCase();
  const list = all.filter((p) => (cat === "All" || p.category === cat) && (!query || `${p.name} ${p.sku} ${p.barcode}`.toLowerCase().includes(query)));
  const stockVal = all.reduce((a: number, p: any) => a + num(p.costPrice) * num(p.stock), 0);

  const stockStatus = (p: any) => ((p.stock ?? 0) === 0 ? "Out of Stock" : (p.stock ?? 0) <= (p.minStock ?? 5) ? "Low Stock" : "In Stock");

  return (
    <div className="animate-fade">
      <SectionTitle title="Inventory Management" sub="Products, stock levels and valuations" right={<><button className="btn-ghost" onClick={() => toast("Stock report exported")}>⬇ Export</button><button className="btn-primary" onClick={() => setShow(true)}><Plus size={15} /> Add Product</button></>} />
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-4">
        {[["Total Products", String(all.length)], ["Total Stock", String(all.reduce((a: number, p: any) => a + num(p.stock), 0))], ["Stock Value", fmtRs(stockVal)], ["Low Stock", String(all.filter((p: any) => (p.stock ?? 0) <= (p.minStock ?? 5) && (p.stock ?? 0) > 0).length)], ["Out of Stock", String(all.filter((p: any) => (p.stock ?? 0) === 0).length)]].map(([l, v]) => (
          <div key={l} className="card p-4"><div className="text-[12px] text-slate-400">{l}</div><div className="text-[20px] font-extrabold text-white">{v}</div></div>
        ))}
      </div>
      <div className="flex flex-wrap gap-1.5 mb-3">{["All", ...CATEGORIES].map((c) => <button key={c} className={`tab-btn !text-[12px] ${cat === c ? "active" : ""}`} onClick={() => setCat(c)}>{c}</button>)}</div>
      <div className="relative mb-3 max-w-[420px"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" /><input className="input !pl-9" placeholder="Search SKU, name, barcode..." value={q} onChange={(e) => setQ(e.target.value)} /></div>
      <div className="card overflow-hidden"><div className="overflow-x-auto"><table className="tbl w-full min-w-[1020px]">
        <thead><tr><th>SKU</th><th>Product</th><th>Category</th><th>Cost</th><th>Price</th><th>Stock</th><th>Min</th><th>Warranty</th><th>Status</th><th>Actions</th></tr></thead>
        <tbody>{list.map((p: any) => (
          <tr key={p.id}>
            <td className="text-slate-400 font-mono text-[12px]">{p.sku}</td>
            <td><div className="font-bold text-white">{p.name}</div><div className="text-[11px] text-slate-500">{p.brand} • {p.barcode}</div></td>
            <td className="text-slate-300">{p.category}</td>
            <td className="text-slate-300">{fmtRs(num(p.costPrice))}</td>
            <td className="font-bold text-white">{fmtRs(num(p.sellingPrice))}</td>
            <td className={`font-extrabold ${(p.stock ?? 0) === 0 ? "text-red-400" : (p.stock ?? 0) <= (p.minStock ?? 5) ? "text-amber-300" : "text-green-400"}`}>{p.stock}</td>
            <td className="text-slate-400">{p.minStock}</td>
            <td className="text-slate-400 text-[12px]">{p.warrantyPeriod}</td>
            <td><Badge s={stockStatus(p)} /></td>
            <td><div className="flex gap-1.5"><button className="btn-ghost !py-1 !px-2.5 !text-[12px]" onClick={() => { setAdj(p); setAdjQty(0); }}>Adjust</button><button className="btn-ghost !py-1 !px-2.5 !text-[12px]" onClick={() => toast(`History: ${p.name} — 5 movements`)}>History</button></div></td>
          </tr>
        ))}</tbody>
      </table></div>{list.length === 0 && <Empty title="No products" />}</div>

      {show && (
        <Modal title="Add Product" sub="Full product master with pricing & stock" onClose={() => setShow(false)} wide>
          <div className="grid md:grid-cols-2 gap-3">
            <Field label="Product Name *"><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="RAM 8GB DDR4" /></Field>
            <div className="grid grid-cols-2 gap-3"><Field label="SKU"><input className="input" value={f.sku} onChange={(e) => setF({ ...f, sku: e.target.value })} placeholder="RAM-8G-D4" /></Field><Field label="Barcode"><input className="input" value={f.barcode} onChange={(e) => setF({ ...f, barcode: e.target.value })} placeholder="47900..." /></Field></div>
            <div className="grid grid-cols-3 gap-3"><Field label="Category"><select className="input" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></Field><Field label="Brand"><input className="input" value={f.brand} onChange={(e) => setF({ ...f, brand: e.target.value })} /></Field><Field label="Supplier"><input className="input" value={f.supplierName} onChange={(e) => setF({ ...f, supplierName: e.target.value })} /></Field></div>
            <div className="grid grid-cols-2 gap-3"><Field label="Cost Price (Rs)"><input className="input" type="number" value={f.costPrice} onChange={(e) => setF({ ...f, costPrice: e.target.value })} /></Field><Field label="Selling Price (Rs)"><input className="input" type="number" value={f.sellingPrice} onChange={(e) => setF({ ...f, sellingPrice: e.target.value })} /></Field></div>
            <div className="grid grid-cols-3 gap-3"><Field label="Opening Stock"><input className="input" type="number" value={f.stock} onChange={(e) => setF({ ...f, stock: e.target.value })} /></Field><Field label="Min Stock"><input className="input" type="number" value={f.minStock} onChange={(e) => setF({ ...f, minStock: e.target.value })} /></Field><Field label="Warranty"><select className="input" value={f.warrantyPeriod} onChange={(e) => setF({ ...f, warrantyPeriod: e.target.value })}>{["None", "3 Months", "6 Months", "1 Year", "3 Years"].map((w) => <option key={w}>{w}</option>)}</select></Field></div>
            <div className="md:col-span-2"><Field label="Description"><input className="input" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field></div>
          </div>
          <div className="flex gap-2 mt-4"><button className="btn-ghost flex-1 justify-center" onClick={() => setShow(false)}>Cancel</button><button className="btn-primary flex-1 justify-center" onClick={async () => { if (!f.name) { toast("Name required", "err"); return; } await save("products", { ...f, costPrice: String(f.costPrice || 0), sellingPrice: String(f.sellingPrice || 0), stock: Number(f.stock || 0), minStock: Number(f.minStock || 5), sku: f.sku || uid("SKU-"), barcode: f.barcode || `47900${Math.floor(Math.random() * 900000)}` }); setShow(false); toast("Product saved"); }}>Save Product</button></div>
        </Modal>
      )}
      {adj && (
        <Modal title={`Adjust Stock — ${adj.name}`} sub={`Current: ${adj.stock}`} onClose={() => setAdj(null)}>
          <Field label="Adjustment (+/- quantity)"><input className="input" type="number" value={adjQty} onChange={(e) => setAdjQty(Number(e.target.value))} /></Field>
          <Field label="Reason"><select className="input"><option>Stock count correction</option><option>Damaged</option><option>Found stock</option><option>Transfer</option></select></Field>
          <button className="btn-primary w-full justify-center mt-3" onClick={async () => { await update("products", adj.id, { stock: Math.max(0, num(adj.stock) + adjQty) }); await save("stockMovements", { productId: adj.id, productName: adj.name, type: "Adjustment", qty: adjQty, reference: "Manual", user: "Admin" }); setAdj(null); toast("Stock adjusted"); }}>Apply Adjustment</button>
        </Modal>
      )}
    </div>
  );
}

export function Movements() {
  const { data } = useApp();
  const [filter, setFilter] = useState("All");
  const list: any[] = (data.stockMovements ?? []).filter((m: any) => filter === "All" || m.type === filter);
  return (
    <div className="animate-fade">
      <SectionTitle title="Stock Movements" sub="Full audit trail of every stock change" />
      <div className="flex gap-1.5 mb-3 flex-wrap">{["All", "Purchase", "Sale", "Repair Usage", "Return", "Adjustment", "Damaged", "Transferred"].map((t) => <button key={t} className={`tab-btn !text-[12px] ${filter === t ? "active" : ""}`} onClick={() => setFilter(t)}>{t}</button>)}</div>
      <div className="card overflow-hidden"><div className="overflow-x-auto"><table className="tbl w-full min-w-[780px]">
        <thead><tr><th>Date</th><th>Product</th><th>Type</th><th>Qty</th><th>Reference</th><th>User</th></tr></thead>
        <tbody>{list.map((m: any) => (
          <tr key={m.id}><td className="text-slate-400 text-[12px]">{timeAgo(m.createdAt)}</td><td className="font-semibold text-white">{m.productName}</td><td><Badge s={m.type === "Purchase" ? "Completed" : m.type === "Sale" ? "Received" : m.type === "Repair Usage" ? "Repairing" : "Pending"} /></td><td className={`font-extrabold ${num(m.qty) < 0 ? "text-red-400" : "text-green-400"}`}>{num(m.qty) > 0 ? "+" : ""}{m.qty}</td><td className="text-blue-400 text-[12px]">{m.reference}</td><td className="text-slate-400">{m.user}</td></tr>
        ))}</tbody>
      </table></div>{list.length === 0 && <Empty title="No movements" />}</div>
    </div>
  );
}

export function Purchases() {
  const { data, save, update, toast } = useApp();
  const [show, setShow] = useState(false);
  const [sup, setSup] = useState("TechParts Lanka");
  const [items, setItems] = useState([{ name: "RAM 8GB DDR4 3200MHz", qty: 20, price: 6800 }]);
  const list: any[] = data.purchases ?? [];
  const total = items.reduce((a, i) => a + num(i.qty) * num(i.price), 0);
  return (
    <div className="animate-fade">
      <SectionTitle title="Purchase Management" sub="Supplier orders with auto stock-in" right={<button className="btn-primary" onClick={() => setShow(true)}><Plus size={15} /> New Purchase</button>} />
      <div className="grid grid-cols-3 gap-3 mb-4 max-w-[800px]">
        {[["Total Purchases", fmtRs(list.reduce((a: number, p: any) => a + num(p.total), 0) || 277000)], ["Pending Payments", fmtRs(63500)], ["This Month", String(list.length || 2)]].map(([l, v]) => <div key={l} className="card p-4"><div className="text-[12px] text-slate-400">{l}</div><div className="text-[19px] font-extrabold text-white">{v}</div></div>)}
      </div>
      <div className="card overflow-hidden"><div className="overflow-x-auto"><table className="tbl w-full min-w-[820px]">
        <thead><tr><th>Purchase ID</th><th>Supplier</th><th>Items</th><th>Total</th><th>Payment</th><th>Date</th><th>Status</th><th></th></tr></thead>
        <tbody>{list.map((p: any) => (
          <tr key={p.id}><td className="font-bold text-blue-400">{p.purchaseId}</td><td className="font-semibold text-white">{p.supplierName}</td><td className="text-slate-400 text-[12px]">{Array.isArray(p.items) ? p.items.map((i: any) => `${i.name}×${i.qty}`).join(", ") : "—"}</td><td className="font-bold text-white">{fmtRs(num(p.total))}</td><td><Badge s={p.paymentStatus === "Paid" ? "Paid" : p.paymentStatus === "Partial" ? "Partial" : "Pending"} /></td><td className="text-slate-400 text-[12px]">{timeAgo(p.date)}</td><td><Badge s={p.status === "Received" ? "Completed" : "Pending"} /></td>
            <td>{p.status !== "Received" ? <button className="btn-primary !py-1 !px-3 !text-[12px]" onClick={async () => {
              await update("purchases", p.id, { status: "Received" });
              for (const it of (Array.isArray(p.items) ? p.items : [])) {
                const prod = (data.products ?? []).find((x: any) => x.name === it.name);
                if (prod) { await update("products", prod.id, { stock: num(prod.stock) + num(it.qty) }); await save("stockMovements", { productId: prod.id, productName: prod.name, type: "Purchase", qty: num(it.qty), reference: p.purchaseId, user: "Inventory" }); }
              }
              toast("Stock received — inventory increased");
            }}>Receive Stock</button> : <button className="btn-ghost !py-1 !px-3 !text-[12px]" onClick={() => window.print()}><Printer size={13} /> Invoice</button>}</td></tr>
        ))}</tbody>
      </table></div></div>
      {show && (
        <Modal title="New Purchase Order" onClose={() => setShow(false)} wide>
          <Field label="Supplier"><select className="input" value={sup} onChange={(e) => setSup(e.target.value)}>{((data.suppliers ?? []) as any[]).map((s: any) => <option key={s.id}>{s.name}</option>)}<option>TechParts Lanka</option></select></Field>
          {items.map((it, i) => (
            <div key={i} className="grid grid-cols-12 gap-2 mt-2">
              <select className="input col-span-6" value={it.name} onChange={(e) => setItems(items.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}>{((data.products ?? []) as any[]).map((p: any) => <option key={p.id}>{p.name}</option>)}</select>
              <input className="input col-span-3" type="number" value={it.qty} onChange={(e) => setItems(items.map((x, j) => (j === i ? { ...x, qty: Number(e.target.value) } : x)))} />
              <input className="input col-span-3" type="number" value={it.price} onChange={(e) => setItems(items.map((x, j) => (j === i ? { ...x, price: Number(e.target.value) } : x)))} />
            </div>
          ))}
          <button className="btn-ghost !text-[12px] mt-2" onClick={() => setItems([...items, { name: ((data.products ?? []) as any[])[0]?.name ?? "Item", qty: 1, price: 0 }])}>+ Add item</button>
          <div className="flex justify-between p-3 rounded-xl mt-3" style={{ background: "rgba(47,123,255,0.08)" }}><span className="font-semibold text-slate-300">Total</span><span className="text-[20px] font-extrabold text-white">{fmtRs(total)}</span></div>
          <div className="flex gap-2 mt-3"><button className="btn-ghost flex-1 justify-center" onClick={async () => { await save("purchases", { purchaseId: uid("PO-"), supplierName: sup, items, total: String(total), paymentStatus: "Pending", status: "Draft" }); setShow(false); toast("Purchase saved"); }}>Save Draft</button><button className="btn-primary flex-1 justify-center" onClick={async () => { await save("purchases", { purchaseId: uid("PO-"), supplierName: sup, items, total: String(total), paymentStatus: "Pending", status: "Ordered" }); setShow(false); toast("Order placed"); }}>Place Order</button></div>
        </Modal>
      )}
    </div>
  );
}

export function Suppliers() {
  const { data, save, toast } = useApp();
  const [show, setShow] = useState(false);
  const [sel, setSel] = useState<any | null>(null);
  const [f, setF] = useState({ name: "", contact: "", email: "", phone: "", address: "" });
  const list: any[] = data.suppliers ?? [];
  return (
    <div className="animate-fade">
      <SectionTitle title="Suppliers" sub="Vendor profiles, history & outstanding" right={<button className="btn-primary" onClick={() => setShow(true)}><Plus size={15} /> Add Supplier</button>} />
      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
        {list.map((s: any) => (
          <div key={s.id} className="card card-hover p-5 cursor-pointer" onClick={() => setSel(s)}>
            <div className="flex items-center gap-3"><div className="w-12 h-12 rounded-2xl flex items-center justify-center text-[20px]" style={{ background: "rgba(47,123,255,0.1)" }}>🏭</div><div><div className="font-bold text-white">{s.name}</div><div className="text-[12px] text-slate-400">{s.contact} • {s.phone}</div></div></div>
            <div className="grid grid-cols-2 gap-2 mt-3 text-[12px]">
              <div className="p-2.5 rounded-xl bg-white/5"><div className="text-slate-500">Total Purchases</div><div className="font-bold text-white">{fmtRs(num(s.totalPurchases))}</div></div>
              <div className="p-2.5 rounded-xl bg-white/5"><div className="text-slate-500">Outstanding</div><div className={`font-bold ${num(s.outstanding) > 0 ? "text-amber-300" : "text-green-400"}`}>{fmtRs(num(s.outstanding))}</div></div>
            </div>
            <div className="text-[12px] text-slate-500 mt-2">Last purchase: {s.lastPurchase ? timeAgo(s.lastPurchase) : "recently"}</div>
          </div>
        ))}
      </div>
      {show && (
        <Modal title="Add Supplier" onClose={() => setShow(false)}>
          <div className="space-y-3">
            <Field label="Supplier Name"><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
            <div className="grid grid-cols-2 gap-3"><Field label="Contact Person"><input className="input" value={f.contact} onChange={(e) => setF({ ...f, contact: e.target.value })} /></Field><Field label="Phone"><input className="input" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field></div>
            <Field label="Email"><input className="input" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
            <Field label="Address"><input className="input" value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} /></Field>
            <button className="btn-primary w-full justify-center" onClick={async () => { await save("suppliers", { ...f, outstanding: "0", totalPurchases: "0" }); setShow(false); toast("Supplier added"); }}>Save Supplier</button>
          </div>
        </Modal>
      )}
      {sel && (
        <Modal title={sel.name} sub={`${sel.contact} • ${sel.phone} • ${sel.email}`} onClose={() => setSel(null)} wide>
          <div className="grid md:grid-cols-3 gap-3">
            <div className="p-4 rounded-xl bg-white/5"><div className="text-[12px] text-slate-400">Outstanding Balance</div><div className="text-[22px] font-extrabold text-amber-300">{fmtRs(num(sel.outstanding))}</div><button className="btn-primary !text-[12px] mt-2" onClick={() => toast("Payment recorded")}>Pay Now</button></div>
            <div className="p-4 rounded-xl bg-white/5"><div className="text-[12px] text-slate-400">Total Purchased</div><div className="text-[22px] font-extrabold text-white">{fmtRs(num(sel.totalPurchases))}</div></div>
            <div className="p-4 rounded-xl bg-white/5"><div className="text-[12px] text-slate-400">Products Supplied</div><div className="text-[13px] text-slate-200 mt-1">RAM, SSD, Displays, Batteries</div></div>
          </div>
          <h4 className="font-bold text-white mt-4 mb-2">Purchase History</h4>
          {((data.purchases ?? []) as any[]).filter((p: any) => p.supplierName === sel.name).map((p: any) => <div key={p.id} className="flex justify-between py-2 border-b border-white/5 text-[13px]"><span className="text-blue-400 font-bold">{p.purchaseId}</span><span className="text-white font-bold">{fmtRs(num(p.total))}</span><Badge s={p.status === "Received" ? "Completed" : "Pending"} /></div>)}
        </Modal>
      )}
    </div>
  );
}

export function BarcodeQR() {
  const { data, toast } = useApp();
  const [tab, setTab] = useState("Scan");
  const [code, setCode] = useState("4790011000011");
  const products: any[] = data.products ?? [];
  const found = products.find((p: any) => p.barcode === code);
  const fakeBars = [3, 1, 2, 1, 4, 1, 1, 3, 2, 2, 1, 4, 1, 2, 3, 1, 2, 1, 1, 3, 4, 1, 2, 2];
  return (
    <div className="animate-fade max-w-[1000px]">
      <SectionTitle title="Barcode & QR Center" sub="Scan, generate and print product & repair codes" />
      <div className="flex gap-1.5 mb-4 flex-wrap">{["Scan", "Generate Barcode", "Repair QR", "Customer QR"].map((t) => <button key={t} className={`tab-btn ${tab === t ? "active" : ""}`} onClick={() => setTab(t)}>{t}</button>)}</div>
      <div className="grid md:grid-cols-2 gap-4">
        <div className="card p-6">
          {tab === "Scan" && (<>
            <h3 className="font-bold text-white mb-3">📷 Scan Product Barcode</h3>
            <div className="h-[180px] rounded-xl flex items-center justify-center relative overflow-hidden" style={{ background: "#050914", border: "1px dashed rgba(47,123,255,0.4)" }}>
              <QrCode size={64} className="text-blue-500/40" />
              <div className="absolute inset-x-8 h-[2px]" style={{ background: "#2f7bff", boxShadow: "0 0 16px #2f7bff", animation: "fadeIn 1s infinite alternate" }} />
            </div>
            <Field label="Or enter barcode manually"><div className="flex gap-2 mt-1.5"><input className="input font-mono" value={code} onChange={(e) => setCode(e.target.value)} /><button className="btn-primary" onClick={() => toast(found ? `Found: ${found.name}` : "Not found")}>Lookup</button></div></Field>
            {found && <div className="mt-3 p-3 rounded-xl flex justify-between items-center" style={{ background: "rgba(34,197,94,0.07)", border: "1px solid rgba(34,197,94,0.25)" }}><div><div className="font-bold text-white">{found.name}</div><div className="text-[12px] text-slate-400">Stock: {found.stock} • {fmtRs(num(found.sellingPrice))}</div></div><Badge s="In Stock" /></div>}
          </>)}
          {tab === "Generate Barcode" && (<>
            <h3 className="font-bold text-white mb-3">Generate Barcode</h3>
            <Field label="Product"><select className="input" onChange={(e) => setCode(e.target.value)}>{products.map((p: any) => <option key={p.id} value={p.barcode}>{p.name}</option>)}</select></Field>
            <div className="mt-4 p-6 rounded-xl bg-white text-center">
              <div className="flex items-end justify-center gap-[2px] h-[64px]">{fakeBars.map((w, i) => <div key={i} style={{ width: w, height: 64, background: "#0f172a" }} />)}</div>
              <div className="font-mono text-[14px] tracking-[4px] mt-2 text-slate-900">{code}</div>
            </div>
            <div className="flex gap-2 mt-3"><button className="btn-primary flex-1 justify-center" onClick={() => window.print()}><Printer size={14} /> Print Barcode</button><button className="btn-ghost flex-1 justify-center" onClick={() => toast("Label sheet queued (24 labels)")}>Sheet ×24</button></div>
          </>)}
          {(tab === "Repair QR" || tab === "Customer QR") && (<>
            <h3 className="font-bold text-white mb-3">{tab === "Repair QR" ? "🔧 Repair Tracking QR" : "👤 Customer QR"}</h3>
            <p className="text-[13px] text-slate-400 mb-3">Customer scans to view live repair status — no login needed.</p>
            <div className="p-6 rounded-xl bg-white text-center">
              <div className="w-[150px] h-[150px] mx-auto grid grid-cols-9 gap-[2px] p-2" style={{ background: "white" }}>
                {Array.from({ length: 81 }).map((_, i) => <div key={i} style={{ background: (i * 7 + 3) % 3 === 0 ? "#0f172a" : "white", borderRadius: 1 }} />)}
              </div>
              <div className="font-mono text-[12px] mt-2 text-slate-900">fixflow.lk/track/FF1024</div>
            </div>
            <div className="flex gap-2 mt-3"><button className="btn-primary flex-1 justify-center" onClick={() => toast("QR sent via WhatsApp")}>Send WhatsApp</button><button className="btn-ghost flex-1 justify-center" onClick={() => window.print()}><Printer size={14} /> Print</button></div>
          </>)}
        </div>
        <div className="space-y-3">
          <div className="card p-5"><h3 className="font-bold text-white mb-2 flex items-center gap-2"><ArrowLeftRight size={16} /> How tracking works</h3><div className="text-[13px] text-slate-400 space-y-1.5"><div>1️⃣ Print repair QR on the job sheet</div><div>2️⃣ Customer scans with any phone camera</div><div>3️⃣ Live timeline: Received → Repairing → Ready</div><div>4️⃣ Auto WhatsApp on status change</div></div></div>
          <div className="card p-5"><h3 className="font-bold text-white mb-2">Recent scans</h3>{products.slice(0, 4).map((p: any) => <div key={p.id} className="flex justify-between py-1.5 border-b border-white/5 text-[13px]"><span className="text-slate-200">{p.name}</span><span className="font-mono text-slate-500 text-[12px]">{p.barcode}</span></div>)}</div>
        </div>
      </div>
    </div>
  );
}
