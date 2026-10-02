"use client";
import React from "react";
import { statusColor, fmtRs } from "@/lib/utils";

export const Badge = ({ s }: { s: string }) => (
  <span className="badge" style={{ ...parseStyle(statusColor(s)) }}>{s}</span>
);
function parseStyle(css: string): React.CSSProperties {
  const o: Record<string, string> = {};
  css.split(";").forEach((p) => { const [k, v] = p.split(":"); if (k && v) o[toCamel(k.trim())] = v.trim(); });
  return o as React.CSSProperties;
}
function toCamel(s: string) { return s.replace(/-([a-z])/g, (_, c) => c.toUpperCase()); }

export const KPI = ({ label, value, sub, icon, accent = "#2f7bff" }: { label: string; value: string; sub?: string; icon?: React.ReactNode; accent?: string }) => (
  <div className="card kpi-glow p-5">
    <div className="flex items-start justify-between">
      <div>
        <div className="text-[12px] text-slate-400 font-medium">{label}</div>
        <div className="text-[22px] font-extrabold mt-1 text-white">{value}</div>
        {sub && <div className="text-[12px] mt-1 text-slate-400">{sub}</div>}
      </div>
      {icon && <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: `${accent}1f`, color: accent }}>{icon}</div>}
    </div>
  </div>
);

export const SectionTitle = ({ title, sub, right }: { title: string; sub?: string; right?: React.ReactNode }) => (
  <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
    <div>
      <h2 className="text-[20px] font-extrabold text-white">{title}</h2>
      {sub && <p className="text-[13px] text-slate-400 mt-0.5">{sub}</p>}
    </div>
    <div className="flex items-center gap-2">{right}</div>
  </div>
);

export const Modal = ({ title, sub, onClose, children, wide }: { title: string; sub?: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) => (
  <div className="modal-back" onClick={onClose}>
    <div className="modal-box p-6" style={{ maxWidth: wide ? 860 : 560 }} onClick={(e) => e.stopPropagation()}>
      <div className="flex items-start justify-between mb-4">
        <div><h3 className="text-[17px] font-bold text-white">{title}</h3>{sub && <p className="text-[12px] text-slate-400">{sub}</p>}</div>
        <button className="btn-ghost" onClick={onClose}>✕</button>
      </div>
      {children}
    </div>
  </div>
);

export const Empty = ({ title, sub }: { title: string; sub?: string }) => (
  <div className="text-center py-12">
    <div className="w-12 h-12 mx-auto rounded-2xl flex items-center justify-center text-[22px]" style={{ background: "rgba(47,123,255,0.1)" }}>📦</div>
    <div className="font-bold text-white mt-3">{title}</div>
    {sub && <div className="text-[13px] text-slate-400 mt-1">{sub}</div>}
  </div>
);

export const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <label className="block">
    <div className="text-[12px] font-semibold text-slate-400 mb-1.5">{label}</div>
    {children}
  </label>
);

export const Money = ({ v }: { v: any }) => <span className="font-semibold text-slate-100">{fmtRs(Number(v ?? 0))}</span>;

export const Progress = ({ pct, color = "#2f7bff" }: { pct: number; color?: string }) => (
  <div className="h-2 rounded-full" style={{ background: "rgba(148,163,184,0.12)" }}>
    <div className="h-2 rounded-full transition-all" style={{ width: `${Math.min(100, Math.max(0, pct))}%`, background: color }} />
  </div>
);

export const Logo = ({ size = 34 }: { size?: number }) => (
  <div className="flex items-center gap-2.5">
    <div style={{ width: size, height: size, borderRadius: 11, background: "linear-gradient(135deg,#2f7bff,#8b5cf6)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, color: "white", fontSize: size * 0.5, boxShadow: "0 6px 18px rgba(47,123,255,.4)" }}>F</div>
    <div>
      <div className="font-extrabold text-white leading-none" style={{ fontSize: 16 }}>FixFlow</div>
      <div className="text-slate-500 leading-none mt-0.5" style={{ fontSize: 10 }}>Smart Repairs. Seamless Business.</div>
    </div>
  </div>
);
