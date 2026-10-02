"use client";
import React, { createContext, useContext, useEffect, useState, useCallback } from "react";

export type Role = "Admin" | "Manager" | "Technician" | "Cashier" | "Inventory Manager";

interface AppState {
  user: { name: string; role: Role; email: string } | null;
  login: (role: Role) => void;
  logout: () => void;
  route: string;
  go: (r: string, param?: string | number | null) => void;
  param: string | number | null;
  data: Record<string, any[]>;
  loading: boolean;
  refresh: (entity?: string) => Promise<void>;
  save: (entity: string, record: any) => Promise<any>;
  update: (entity: string, id: number, record: any) => Promise<any>;
  remove: (entity: string, id: number) => Promise<void>;
  dashboard: any | null;
  toasts: { id: number; msg: string; kind: string }[];
  toast: (msg: string, kind?: string) => void;
  search: string;
  setSearch: (s: string) => void;
}

const Ctx = createContext<AppState | null>(null);

const ENTITIES = ["users","customers","devices","repairs","repairParts","repairActivity","quotations","products","stockMovements","suppliers","purchases","invoices","payments","expenses","warranties","warrantyClaims","returns","messages","notifications","auditLogs"];

const ROLE_USERS: Record<string, { name: string; email: string }> = {
  Admin: { name: "Admin Fernando", email: "admin@fixflow.lk" },
  Manager: { name: "Manager Silva", email: "manager@fixflow.lk" },
  Technician: { name: "Nimal Perera", email: "nimal@fixflow.lk" },
  Cashier: { name: "Priya Jayawardena", email: "priya@fixflow.lk" },
  "Inventory Manager": { name: "Ruwan Mendis", email: "ruwan@fixflow.lk" },
};

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AppState["user"]>(null);
  const [route, setRoute] = useState("dashboard");
  const [param, setParam] = useState<string | number | null>(null);
  const [data, setData] = useState<Record<string, any[]>>({});
  const [loading, setLoading] = useState(true);
  const [dashboard, setDashboard] = useState<any | null>(null);
  const [toasts, setToasts] = useState<AppState["toasts"]>([]);
  const [search, setSearch] = useState("");

  const toast = useCallback((msg: string, kind = "ok") => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, msg, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3200);
  }, []);

  const fetchEntity = useCallback(async (entity: string) => {
    try {
      const r = await fetch(`/api/data?entity=${entity}`);
      const j = await r.json();
      if (j.data) setData((d) => ({ ...d, [entity]: j.data }));
    } catch { /* offline */ }
  }, []);

  const refresh = useCallback(async (entity?: string) => {
    if (entity) { await fetchEntity(entity); return; }
    setLoading(true);
    try {
      await fetch("/api/seed", { method: "POST" }).catch(() => null);
      await Promise.all(ENTITIES.map((e) => fetchEntity(e)));
      const d = await fetch("/api/dashboard").then((r) => r.json()).catch(() => null);
      if (d && !d.error) setDashboard(d);
    } catch { /* ignore */ }
    setLoading(false);
  }, [fetchEntity]);

  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    const saved = typeof window !== "undefined" ? localStorage.getItem("fixflow-user") : null;
    if (saved) { try { setUser(JSON.parse(saved)); } catch {} }
  }, []);

  const login = (role: Role) => {
    const u = { name: ROLE_USERS[role].name, role, email: ROLE_USERS[role].email };
    setUser(u);
    localStorage.setItem("fixflow-user", JSON.stringify(u));
    setRoute(role === "Technician" ? "tech" : role === "Cashier" ? "pos" : "dashboard");
  };
  const logout = () => { setUser(null); localStorage.removeItem("fixflow-user"); };

  const go = (r: string, p: string | number | null = null) => { setRoute(r); setParam(p); window.scrollTo({ top: 0 }); };

  const save = async (entity: string, record: any) => {
    const r = await fetch("/api/data", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ entity, record }) });
    const j = await r.json();
    if (j.data) { setData((d) => ({ ...d, [entity]: [j.data, ...(d[entity] ?? [])] })); }
    return j.data;
  };
  const update = async (entity: string, id: number, record: any) => {
    const r = await fetch("/api/data", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ entity, id, record }) });
    const j = await r.json();
    if (j.data) setData((d) => ({ ...d, [entity]: (d[entity] ?? []).map((x) => (x.id === id ? { ...x, ...j.data } : x)) }));
    fetch("/api/dashboard").then((x) => x.json()).then((dd) => { if (!dd.error) setDashboard(dd); }).catch(() => null);
    return j.data;
  };
  const remove = async (entity: string, id: number) => {
    await fetch(`/api/data?entity=${entity}&id=${id}`, { method: "DELETE" });
    setData((d) => ({ ...d, [entity]: (d[entity] ?? []).filter((x) => x.id !== id) }));
  };

  return <Ctx.Provider value={{ user, login, logout, route, go, param, data, loading, refresh, save, update, remove, dashboard, toasts, toast, search, setSearch }}>{children}</Ctx.Provider>;
}

export const useApp = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error("no provider");
  return c;
};
