export const fmtRs = (n: number | string | null | undefined): string => {
  const v = Number(n ?? 0);
  return "Rs. " + v.toLocaleString("en-LK", { maximumFractionDigits: 0 });
};

export const num = (n: unknown): number => {
  const v = Number(n ?? 0);
  return isNaN(v) ? 0 : v;
};

export const statusColor = (s: string): string => {
  const map: Record<string, string> = {
    Received: "background:rgba(56,189,248,0.12);color:#7dd3fc;border:1px solid rgba(56,189,248,0.25)",
    Diagnosing: "background:rgba(139,92,246,0.12);color:#c4b5fd;border:1px solid rgba(139,92,246,0.3)",
    Quoted: "background:rgba(251,191,36,0.12);color:#fcd34d;border:1px solid rgba(251,191,36,0.3)",
    Approved: "background:rgba(34,197,94,0.12);color:#86efac;border:1px solid rgba(34,197,94,0.3)",
    Repairing: "background:rgba(47,123,255,0.14);color:#93c5fd;border:1px solid rgba(47,123,255,0.35)",
    Testing: "background:rgba(20,184,166,0.12);color:#5eead4;border:1px solid rgba(20,184,166,0.3)",
    Ready: "background:rgba(34,197,94,0.14);color:#4ade80;border:1px solid rgba(34,197,94,0.35)",
    Delivered: "background:rgba(148,163,184,0.12);color:#cbd5e1;border:1px solid rgba(148,163,184,0.25)",
    Completed: "background:rgba(34,197,94,0.14);color:#4ade80;border:1px solid rgba(34,197,94,0.35)",
    Paid: "background:rgba(34,197,94,0.14);color:#4ade80;border:1px solid rgba(34,197,94,0.35)",
    Pending: "background:rgba(251,191,36,0.12);color:#fcd34d;border:1px solid rgba(251,191,36,0.3)",
    Partial: "background:rgba(249,115,22,0.12);color:#fdba74;border:1px solid rgba(249,115,22,0.3)",
    Sent: "background:rgba(56,189,248,0.12);color:#7dd3fc;border:1px solid rgba(56,189,248,0.25)",
    Draft: "background:rgba(148,163,184,0.12);color:#cbd5e1;border:1px solid rgba(148,163,184,0.25)",
    Rejected: "background:rgba(239,68,68,0.12);color:#fca5a5;border:1px solid rgba(239,68,68,0.3)",
    Expired: "background:rgba(239,68,68,0.1);color:#f87171;border:1px solid rgba(239,68,68,0.25)",
    Cancelled: "background:rgba(239,68,68,0.1);color:#f87171;border:1px solid rgba(239,68,68,0.25)",
    Active: "background:rgba(34,197,94,0.14);color:#4ade80;border:1px solid rgba(34,197,94,0.35)",
    Refunded: "background:rgba(139,92,246,0.12);color:#c4b5fd;border:1px solid rgba(139,92,246,0.3)",
    "Out of Stock": "background:rgba(239,68,68,0.12);color:#fca5a5;border:1px solid rgba(239,68,68,0.3)",
    "Low Stock": "background:rgba(251,191,36,0.12);color:#fcd34d;border:1px solid rgba(251,191,36,0.3)",
    "In Stock": "background:rgba(34,197,94,0.12);color:#86efac;border:1px solid rgba(34,197,94,0.3)",
    Submitted: "background:rgba(56,189,248,0.12);color:#7dd3fc;border:1px solid rgba(56,189,248,0.25)",
    "Under Review": "background:rgba(251,191,36,0.12);color:#fcd34d;border:1px solid rgba(251,191,36,0.3)",
    High: "background:rgba(249,115,22,0.12);color:#fdba74;border:1px solid rgba(249,115,22,0.3)",
    Urgent: "background:rgba(239,68,68,0.14);color:#fca5a5;border:1px solid rgba(239,68,68,0.35)",
    Medium: "background:rgba(56,189,248,0.1);color:#7dd3fc;border:1px solid rgba(56,189,248,0.25)",
    Low: "background:rgba(148,163,184,0.1);color:#94a3b8;border:1px solid rgba(148,163,184,0.25)",
  };
  return map[s] ?? "background:rgba(148,163,184,0.1);color:#cbd5e1;border:1px solid rgba(148,163,184,0.2)";
};

export const uid = (p: string) => `${p}${Math.floor(1000 + Math.random() * 9000)}`;

export function timeAgo(d: string | Date | null | undefined): string {
  if (!d) return "—";
  const t = new Date(d).getTime();
  const diff = Date.now() - t;
  const m = Math.floor(diff / 60000);
  if (m < 1) return "Just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const dd = Math.floor(h / 24);
  if (dd < 30) return `${dd}d ago`;
  return new Date(d).toLocaleDateString();
}

export const REPAIR_STATUSES = ["Received","Diagnosing","Quoted","Approved","Repairing","Testing","Ready","Delivered"];
export const PRIORITIES = ["Low","Medium","High","Urgent"];
export const CATEGORIES = ["Accessories","Spare Parts","RAM","Storage","Chargers","Displays","Batteries","Cables","Services"];
export const EXPENSE_CATS = ["Rent","Electricity","Internet","Transport","Parts","Salaries","Maintenance","Marketing","Other"];
export const PAY_METHODS = ["Cash","Card","Bank Transfer","Online Payment"];
