(globalThis["TURBOPACK"] || (globalThis["TURBOPACK"] = [])).push([typeof document === "object" ? document.currentScript : undefined,
"[project]/src/lib/store.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "AppProvider",
    ()=>AppProvider,
    "useApp",
    ()=>useApp
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
;
var _s = __turbopack_context__.k.signature(), _s1 = __turbopack_context__.k.signature();
"use client";
;
const Ctx = /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["createContext"])(null);
const ENTITIES = [
    "users",
    "customers",
    "devices",
    "repairs",
    "repairParts",
    "repairActivity",
    "quotations",
    "products",
    "stockMovements",
    "suppliers",
    "purchases",
    "invoices",
    "payments",
    "expenses",
    "warranties",
    "warrantyClaims",
    "returns",
    "messages",
    "notifications",
    "auditLogs"
];
const ROLE_USERS = {
    Admin: {
        name: "Admin Fernando",
        email: "admin@fixflow.lk"
    },
    Manager: {
        name: "Manager Silva",
        email: "manager@fixflow.lk"
    },
    Technician: {
        name: "Nimal Perera",
        email: "nimal@fixflow.lk"
    },
    Cashier: {
        name: "Priya Jayawardena",
        email: "priya@fixflow.lk"
    },
    "Inventory Manager": {
        name: "Ruwan Mendis",
        email: "ruwan@fixflow.lk"
    }
};
function AppProvider({ children }) {
    _s();
    const [user, setUser] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(null);
    const [route, setRoute] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])("dashboard");
    const [param, setParam] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(null);
    const [data, setData] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])({});
    const [loading, setLoading] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(true);
    const [dashboard, setDashboard] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(null);
    const [toasts, setToasts] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])([]);
    const [search, setSearch] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])("");
    const toast = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useCallback"])({
        "AppProvider.useCallback[toast]": (msg, kind = "ok")=>{
            const id = Date.now() + Math.random();
            setToasts({
                "AppProvider.useCallback[toast]": (t)=>[
                        ...t,
                        {
                            id,
                            msg,
                            kind
                        }
                    ]
            }["AppProvider.useCallback[toast]"]);
            setTimeout({
                "AppProvider.useCallback[toast]": ()=>setToasts({
                        "AppProvider.useCallback[toast]": (t)=>t.filter({
                                "AppProvider.useCallback[toast]": (x)=>x.id !== id
                            }["AppProvider.useCallback[toast]"])
                    }["AppProvider.useCallback[toast]"])
            }["AppProvider.useCallback[toast]"], 3200);
        }
    }["AppProvider.useCallback[toast]"], []);
    const fetchEntity = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useCallback"])({
        "AppProvider.useCallback[fetchEntity]": async (entity)=>{
            try {
                const r = await fetch(`/api/data?entity=${entity}`);
                const j = await r.json();
                if (j.data) setData({
                    "AppProvider.useCallback[fetchEntity]": (d)=>({
                            ...d,
                            [entity]: j.data
                        })
                }["AppProvider.useCallback[fetchEntity]"]);
            } catch  {}
        }
    }["AppProvider.useCallback[fetchEntity]"], []);
    const refresh = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useCallback"])({
        "AppProvider.useCallback[refresh]": async (entity)=>{
            if (entity) {
                await fetchEntity(entity);
                return;
            }
            setLoading(true);
            try {
                await fetch("/api/seed", {
                    method: "POST"
                }).catch({
                    "AppProvider.useCallback[refresh]": ()=>null
                }["AppProvider.useCallback[refresh]"]);
                await Promise.all(ENTITIES.map({
                    "AppProvider.useCallback[refresh]": (e)=>fetchEntity(e)
                }["AppProvider.useCallback[refresh]"]));
                const d = await fetch("/api/dashboard").then({
                    "AppProvider.useCallback[refresh]": (r)=>r.json()
                }["AppProvider.useCallback[refresh]"]).catch({
                    "AppProvider.useCallback[refresh]": ()=>null
                }["AppProvider.useCallback[refresh]"]);
                if (d && !d.error) setDashboard(d);
            } catch  {}
            setLoading(false);
        }
    }["AppProvider.useCallback[refresh]"], [
        fetchEntity
    ]);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "AppProvider.useEffect": ()=>{
            refresh();
        }
    }["AppProvider.useEffect"], [
        refresh
    ]);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "AppProvider.useEffect": ()=>{
            const saved = ("TURBOPACK compile-time truthy", 1) ? localStorage.getItem("fixflow-user") : "TURBOPACK unreachable";
            if (saved) {
                try {
                    setUser(JSON.parse(saved));
                } catch  {}
            }
        }
    }["AppProvider.useEffect"], []);
    const login = (role)=>{
        const u = {
            name: ROLE_USERS[role].name,
            role,
            email: ROLE_USERS[role].email
        };
        setUser(u);
        localStorage.setItem("fixflow-user", JSON.stringify(u));
        setRoute(role === "Technician" ? "tech" : role === "Cashier" ? "pos" : "dashboard");
    };
    const logout = ()=>{
        setUser(null);
        localStorage.removeItem("fixflow-user");
    };
    const go = (r, p = null)=>{
        setRoute(r);
        setParam(p);
        window.scrollTo({
            top: 0
        });
    };
    const save = async (entity, record)=>{
        const r = await fetch("/api/data", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                entity,
                record
            })
        });
        const j = await r.json();
        if (j.data) {
            setData((d)=>({
                    ...d,
                    [entity]: [
                        j.data,
                        ...d[entity] ?? []
                    ]
                }));
        }
        return j.data;
    };
    const update = async (entity, id, record)=>{
        const r = await fetch("/api/data", {
            method: "PUT",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                entity,
                id,
                record
            })
        });
        const j = await r.json();
        if (j.data) setData((d)=>({
                ...d,
                [entity]: (d[entity] ?? []).map((x)=>x.id === id ? {
                        ...x,
                        ...j.data
                    } : x)
            }));
        fetch("/api/dashboard").then((x)=>x.json()).then((dd)=>{
            if (!dd.error) setDashboard(dd);
        }).catch(()=>null);
        return j.data;
    };
    const remove = async (entity, id)=>{
        await fetch(`/api/data?entity=${entity}&id=${id}`, {
            method: "DELETE"
        });
        setData((d)=>({
                ...d,
                [entity]: (d[entity] ?? []).filter((x)=>x.id !== id)
            }));
    };
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(Ctx.Provider, {
        value: {
            user,
            login,
            logout,
            route,
            go,
            param,
            data,
            loading,
            refresh,
            save,
            update,
            remove,
            dashboard,
            toasts,
            toast,
            search,
            setSearch
        },
        children: children
    }, void 0, false, {
        fileName: "[project]/src/lib/store.tsx",
        lineNumber: 109,
        columnNumber: 10
    }, this);
}
_s(AppProvider, "0Fcs6U+8A4atejrHu9wUP/zQRqA=");
_c = AppProvider;
const useApp = ()=>{
    _s1();
    const c = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useContext"])(Ctx);
    if (!c) throw new Error("no provider");
    return c;
};
_s1(useApp, "rCFJOMMDYLWM7qBzTJAGkiO6eRA=");
var _c;
__turbopack_context__.k.register(_c, "AppProvider");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/src/lib/utils.ts [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "CATEGORIES",
    ()=>CATEGORIES,
    "EXPENSE_CATS",
    ()=>EXPENSE_CATS,
    "PAY_METHODS",
    ()=>PAY_METHODS,
    "PRIORITIES",
    ()=>PRIORITIES,
    "REPAIR_STATUSES",
    ()=>REPAIR_STATUSES,
    "fmtRs",
    ()=>fmtRs,
    "num",
    ()=>num,
    "statusColor",
    ()=>statusColor,
    "timeAgo",
    ()=>timeAgo,
    "uid",
    ()=>uid
]);
const fmtRs = (n)=>{
    const v = Number(n ?? 0);
    return "Rs. " + v.toLocaleString("en-LK", {
        maximumFractionDigits: 0
    });
};
const num = (n)=>{
    const v = Number(n ?? 0);
    return isNaN(v) ? 0 : v;
};
const statusColor = (s)=>{
    const map = {
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
        Low: "background:rgba(148,163,184,0.1);color:#94a3b8;border:1px solid rgba(148,163,184,0.25)"
    };
    return map[s] ?? "background:rgba(148,163,184,0.1);color:#cbd5e1;border:1px solid rgba(148,163,184,0.2)";
};
const uid = (p)=>`${p}${Math.floor(1000 + Math.random() * 9000)}`;
function timeAgo(d) {
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
const REPAIR_STATUSES = [
    "Received",
    "Diagnosing",
    "Quoted",
    "Approved",
    "Repairing",
    "Testing",
    "Ready",
    "Delivered"
];
const PRIORITIES = [
    "Low",
    "Medium",
    "High",
    "Urgent"
];
const CATEGORIES = [
    "Accessories",
    "Spare Parts",
    "RAM",
    "Storage",
    "Chargers",
    "Displays",
    "Batteries",
    "Cables",
    "Services"
];
const EXPENSE_CATS = [
    "Rent",
    "Electricity",
    "Internet",
    "Transport",
    "Parts",
    "Salaries",
    "Maintenance",
    "Marketing",
    "Other"
];
const PAY_METHODS = [
    "Cash",
    "Card",
    "Bank Transfer",
    "Online Payment"
];
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/src/app/page.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>Page
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$store$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/store.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$shell$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/components/shell.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$mod$2d$dashboard$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/components/mod-dashboard.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$mod$2d$ops$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/components/mod-ops.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$mod$2d$sales$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/components/mod-sales.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$mod$2d$inventory$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/components/mod-inventory.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$mod$2d$finance$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/components/mod-finance.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$mod$2d$ai$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/components/mod-ai.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$mod$2d$system$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/components/mod-system.tsx [app-client] (ecmascript)");
;
var _s = __turbopack_context__.k.signature(), _s1 = __turbopack_context__.k.signature(), _s2 = __turbopack_context__.k.signature(), _s3 = __turbopack_context__.k.signature();
"use client";
;
;
;
;
;
;
;
;
;
;
function Router() {
    _s();
    const { route, param } = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$store$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useApp"])();
    switch(route){
        case "dashboard":
            return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$mod$2d$dashboard$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Dashboard"], {}, void 0, false, {
                fileName: "[project]/src/app/page.tsx",
                lineNumber: 16,
                columnNumber: 30
            }, this);
        case "repairs":
            return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$mod$2d$ops$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Repairs"], {}, void 0, false, {
                fileName: "[project]/src/app/page.tsx",
                lineNumber: 17,
                columnNumber: 28
            }, this);
        case "repair-new":
            return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$mod$2d$ops$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["RepairNew"], {}, void 0, false, {
                fileName: "[project]/src/app/page.tsx",
                lineNumber: 18,
                columnNumber: 31
            }, this);
        case "repair-detail":
            return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$mod$2d$ops$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["RepairDetail"], {
                id: Number(param) || 1
            }, void 0, false, {
                fileName: "[project]/src/app/page.tsx",
                lineNumber: 19,
                columnNumber: 34
            }, this);
        case "quotations":
            return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$mod$2d$ops$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Quotations"], {}, void 0, false, {
                fileName: "[project]/src/app/page.tsx",
                lineNumber: 20,
                columnNumber: 31
            }, this);
        case "customers":
            return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$mod$2d$ops$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Customers"], {}, void 0, false, {
                fileName: "[project]/src/app/page.tsx",
                lineNumber: 21,
                columnNumber: 30
            }, this);
        case "customer-detail":
            return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$mod$2d$ops$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["CustomerDetail"], {
                id: Number(param) || 1
            }, void 0, false, {
                fileName: "[project]/src/app/page.tsx",
                lineNumber: 22,
                columnNumber: 36
            }, this);
        case "tech":
            return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$mod$2d$ops$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["TechBoard"], {}, void 0, false, {
                fileName: "[project]/src/app/page.tsx",
                lineNumber: 23,
                columnNumber: 25
            }, this);
        case "pos":
            return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$mod$2d$sales$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["POS"], {}, void 0, false, {
                fileName: "[project]/src/app/page.tsx",
                lineNumber: 24,
                columnNumber: 24
            }, this);
        case "invoices":
            return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$mod$2d$sales$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Invoices"], {}, void 0, false, {
                fileName: "[project]/src/app/page.tsx",
                lineNumber: 25,
                columnNumber: 29
            }, this);
        case "payments":
            return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$mod$2d$sales$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Payments"], {}, void 0, false, {
                fileName: "[project]/src/app/page.tsx",
                lineNumber: 26,
                columnNumber: 29
            }, this);
        case "returns":
            return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$mod$2d$sales$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Returns"], {}, void 0, false, {
                fileName: "[project]/src/app/page.tsx",
                lineNumber: 27,
                columnNumber: 28
            }, this);
        case "products":
            return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$mod$2d$inventory$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Products"], {}, void 0, false, {
                fileName: "[project]/src/app/page.tsx",
                lineNumber: 28,
                columnNumber: 29
            }, this);
        case "movements":
            return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$mod$2d$inventory$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Movements"], {}, void 0, false, {
                fileName: "[project]/src/app/page.tsx",
                lineNumber: 29,
                columnNumber: 30
            }, this);
        case "purchases":
            return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$mod$2d$inventory$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Purchases"], {}, void 0, false, {
                fileName: "[project]/src/app/page.tsx",
                lineNumber: 30,
                columnNumber: 30
            }, this);
        case "suppliers":
            return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$mod$2d$inventory$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Suppliers"], {}, void 0, false, {
                fileName: "[project]/src/app/page.tsx",
                lineNumber: 31,
                columnNumber: 30
            }, this);
        case "barcode":
            return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$mod$2d$inventory$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["BarcodeQR"], {}, void 0, false, {
                fileName: "[project]/src/app/page.tsx",
                lineNumber: 32,
                columnNumber: 28
            }, this);
        case "expenses":
            return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$mod$2d$finance$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Expenses"], {}, void 0, false, {
                fileName: "[project]/src/app/page.tsx",
                lineNumber: 33,
                columnNumber: 29
            }, this);
        case "pnl":
            return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$mod$2d$finance$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["PnL"], {}, void 0, false, {
                fileName: "[project]/src/app/page.tsx",
                lineNumber: 34,
                columnNumber: 24
            }, this);
        case "reports":
            return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$mod$2d$finance$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["FinanceReports"], {}, void 0, false, {
                fileName: "[project]/src/app/page.tsx",
                lineNumber: 35,
                columnNumber: 28
            }, this);
        case "sales-reports":
            return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$mod$2d$finance$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["FinanceReports"], {}, void 0, false, {
                fileName: "[project]/src/app/page.tsx",
                lineNumber: 36,
                columnNumber: 34
            }, this);
        case "warranty":
            return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$mod$2d$finance$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Warranty"], {}, void 0, false, {
                fileName: "[project]/src/app/page.tsx",
                lineNumber: 37,
                columnNumber: 29
            }, this);
        case "claims":
            return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$mod$2d$finance$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Claims"], {}, void 0, false, {
                fileName: "[project]/src/app/page.tsx",
                lineNumber: 38,
                columnNumber: 27
            }, this);
        case "ai-diagnosis":
            return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$mod$2d$ai$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["AIDiagnosis"], {}, void 0, false, {
                fileName: "[project]/src/app/page.tsx",
                lineNumber: 39,
                columnNumber: 33
            }, this);
        case "ai-assistant":
            return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$mod$2d$ai$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["AIAssistant"], {}, void 0, false, {
                fileName: "[project]/src/app/page.tsx",
                lineNumber: 40,
                columnNumber: 33
            }, this);
        case "forecast":
            return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$mod$2d$ai$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Forecast"], {}, void 0, false, {
                fileName: "[project]/src/app/page.tsx",
                lineNumber: 41,
                columnNumber: 29
            }, this);
        case "messages":
            return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$mod$2d$ai$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Messages"], {}, void 0, false, {
                fileName: "[project]/src/app/page.tsx",
                lineNumber: 42,
                columnNumber: 29
            }, this);
        case "notifications":
            return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$mod$2d$ai$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Notifications"], {}, void 0, false, {
                fileName: "[project]/src/app/page.tsx",
                lineNumber: 43,
                columnNumber: 34
            }, this);
        case "staff":
            return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$mod$2d$system$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Staff"], {}, void 0, false, {
                fileName: "[project]/src/app/page.tsx",
                lineNumber: 44,
                columnNumber: 26
            }, this);
        case "settings":
            return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$mod$2d$system$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Settings"], {}, void 0, false, {
                fileName: "[project]/src/app/page.tsx",
                lineNumber: 45,
                columnNumber: 29
            }, this);
        case "audit":
            return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$mod$2d$system$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Audit"], {}, void 0, false, {
                fileName: "[project]/src/app/page.tsx",
                lineNumber: 46,
                columnNumber: 26
            }, this);
        case "portal":
            return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$mod$2d$system$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Portal"], {}, void 0, false, {
                fileName: "[project]/src/app/page.tsx",
                lineNumber: 47,
                columnNumber: 27
            }, this);
        default:
            return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$mod$2d$dashboard$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Dashboard"], {}, void 0, false, {
                fileName: "[project]/src/app/page.tsx",
                lineNumber: 48,
                columnNumber: 21
            }, this);
    }
}
_s(Router, "pykVDCZj9OHTILxQQwju5BdLD/0=", false, function() {
    return [
        __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$store$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useApp"]
    ];
});
_c = Router;
function Toasts() {
    _s1();
    const { toasts } = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$store$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useApp"])();
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "fixed bottom-4 right-4 z-[100] space-y-2 no-print",
        children: toasts.map((t)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "toast px-4 py-3 rounded-xl text-[13px] font-semibold text-white shadow-2xl",
                style: {
                    background: t.kind === "err" ? "rgba(239,68,68,0.92)" : "rgba(20,30,60,0.95)",
                    border: `1px solid ${t.kind === "err" ? "rgba(239,68,68,0.5)" : "rgba(47,123,255,0.4)"}`
                },
                children: [
                    t.kind === "err" ? "⚠️ " : "✅ ",
                    t.msg
                ]
            }, t.id, true, {
                fileName: "[project]/src/app/page.tsx",
                lineNumber: 57,
                columnNumber: 9
            }, this))
    }, void 0, false, {
        fileName: "[project]/src/app/page.tsx",
        lineNumber: 55,
        columnNumber: 5
    }, this);
}
_s1(Toasts, "Ve9jrQ9jRkUhW1Hvf3SL4YMZ7Ck=", false, function() {
    return [
        __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$store$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useApp"]
    ];
});
_c1 = Toasts;
function MobileNav() {
    _s2();
    const { route, go } = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$store$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useApp"])();
    const items = [
        [
            "dashboard",
            "🏠",
            "Home"
        ],
        [
            "repairs",
            "🔧",
            "Repairs"
        ],
        [
            "pos",
            "🛒",
            "POS"
        ],
        [
            "products",
            "📦",
            "Stock"
        ],
        [
            "ai-assistant",
            "✨",
            "AI"
        ]
    ];
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("nav", {
        className: "lg:hidden fixed bottom-0 inset-x-0 z-40 glass border-t no-print",
        style: {
            borderColor: "rgba(148,163,184,0.12)"
        },
        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
            className: "grid grid-cols-5",
            children: items.map(([id, icon, label])=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                    onClick: ()=>go(id),
                    className: "py-2.5 flex flex-col items-center gap-0.5",
                    style: {
                        color: route === id ? "#7fb0ff" : "#64748b"
                    },
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                            className: "text-[18px]",
                            children: icon
                        }, void 0, false, {
                            fileName: "[project]/src/app/page.tsx",
                            lineNumber: 73,
                            columnNumber: 13
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                            className: "text-[10px] font-semibold",
                            children: label
                        }, void 0, false, {
                            fileName: "[project]/src/app/page.tsx",
                            lineNumber: 73,
                            columnNumber: 56
                        }, this)
                    ]
                }, id, true, {
                    fileName: "[project]/src/app/page.tsx",
                    lineNumber: 72,
                    columnNumber: 11
                }, this))
        }, void 0, false, {
            fileName: "[project]/src/app/page.tsx",
            lineNumber: 70,
            columnNumber: 7
        }, this)
    }, void 0, false, {
        fileName: "[project]/src/app/page.tsx",
        lineNumber: 69,
        columnNumber: 5
    }, this);
}
_s2(MobileNav, "yakAXnlvzT6TdVkjhsUS47CVdNc=", false, function() {
    return [
        __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$store$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useApp"]
    ];
});
_c2 = MobileNav;
function Shell() {
    _s3();
    const { user, loading } = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$store$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useApp"])();
    const [menu, setMenu] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(false);
    if (!user) return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$shell$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["AuthScreen"], {}, void 0, false, {
        fileName: "[project]/src/app/page.tsx",
        lineNumber: 84,
        columnNumber: 21
    }, this);
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "min-h-screen flex",
        style: {
            background: "#0a0f1e"
        },
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$shell$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Sidebar"], {}, void 0, false, {
                fileName: "[project]/src/app/page.tsx",
                lineNumber: 87,
                columnNumber: 7
            }, this),
            menu && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Fragment"], {
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "fixed inset-0 z-40 bg-black/60 lg:hidden",
                        onClick: ()=>setMenu(false)
                    }, void 0, false, {
                        fileName: "[project]/src/app/page.tsx",
                        lineNumber: 88,
                        columnNumber: 18
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$shell$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Sidebar"], {
                        mobile: true,
                        close: ()=>setMenu(false)
                    }, void 0, false, {
                        fileName: "[project]/src/app/page.tsx",
                        lineNumber: 88,
                        columnNumber: 109
                    }, this)
                ]
            }, void 0, true),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "flex-1 min-w-0 flex flex-col",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$shell$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Topbar"], {
                        onMenu: ()=>setMenu(true)
                    }, void 0, false, {
                        fileName: "[project]/src/app/page.tsx",
                        lineNumber: 90,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("main", {
                        className: "flex-1 p-4 md:p-6 pb-20 lg:pb-6 max-w-[1400px] w-full mx-auto",
                        children: loading ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "space-y-3",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "h-8 w-64 rounded-xl animate-pulse",
                                    style: {
                                        background: "rgba(148,163,184,0.1)"
                                    }
                                }, void 0, false, {
                                    fileName: "[project]/src/app/page.tsx",
                                    lineNumber: 94,
                                    columnNumber: 15
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "grid grid-cols-2 lg:grid-cols-3 gap-3",
                                    children: [
                                        1,
                                        2,
                                        3,
                                        4,
                                        5,
                                        6
                                    ].map((i)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: "h-[110px] rounded-2xl animate-pulse",
                                            style: {
                                                background: "rgba(148,163,184,0.06)"
                                            }
                                        }, i, false, {
                                            fileName: "[project]/src/app/page.tsx",
                                            lineNumber: 95,
                                            columnNumber: 101
                                        }, this))
                                }, void 0, false, {
                                    fileName: "[project]/src/app/page.tsx",
                                    lineNumber: 95,
                                    columnNumber: 15
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/src/app/page.tsx",
                            lineNumber: 93,
                            columnNumber: 13
                        }, this) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(Router, {}, void 0, false, {
                            fileName: "[project]/src/app/page.tsx",
                            lineNumber: 97,
                            columnNumber: 15
                        }, this)
                    }, void 0, false, {
                        fileName: "[project]/src/app/page.tsx",
                        lineNumber: 91,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/src/app/page.tsx",
                lineNumber: 89,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(MobileNav, {}, void 0, false, {
                fileName: "[project]/src/app/page.tsx",
                lineNumber: 100,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(Toasts, {}, void 0, false, {
                fileName: "[project]/src/app/page.tsx",
                lineNumber: 101,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/src/app/page.tsx",
        lineNumber: 86,
        columnNumber: 5
    }, this);
}
_s3(Shell, "CwrpCedJGa/WHrDw74j1MYB8Few=", false, function() {
    return [
        __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$store$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useApp"]
    ];
});
_c3 = Shell;
function Page() {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$store$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["AppProvider"], {
        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(Shell, {}, void 0, false, {
            fileName: "[project]/src/app/page.tsx",
            lineNumber: 107,
            columnNumber: 23
        }, this)
    }, void 0, false, {
        fileName: "[project]/src/app/page.tsx",
        lineNumber: 107,
        columnNumber: 10
    }, this);
}
_c4 = Page;
var _c, _c1, _c2, _c3, _c4;
__turbopack_context__.k.register(_c, "Router");
__turbopack_context__.k.register(_c1, "Toasts");
__turbopack_context__.k.register(_c2, "MobileNav");
__turbopack_context__.k.register(_c3, "Shell");
__turbopack_context__.k.register(_c4, "Page");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
]);

//# sourceMappingURL=src_0loqsfg._.js.map