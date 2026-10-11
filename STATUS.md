# FixFlow — Current Implementation Status

Inspection performed against the master specification. Every claim below was
produced by a command run on this checkout, not assumed.

**Branch** `arena/ccac4826-fixflow` · **HEAD** `ed45ca1` · app lives in
`FixFlow UI Design/` (note the space in the folder name).

---

## 1. Stack — matches the approved stack

| Requirement (§2) | Installed | |
| --- | --- | :-: |
| React 19 | 19.2.4 | ✅ |
| Vite 8 | 8.0.5 | ✅ |
| TypeScript | 5.9.3 | ✅ |
| Tailwind CSS v4 | 4.3.3 (declared) | ⚠️ see §4 |
| Hash-based routing | **none** | ❌ |
| `fixflow.demo.v1` persistence | **absent** | ❌ |

Also present from earlier work: `firebase@13.0.0`, `dexie@4.4.6`, `zod@4.6.5`,
`papaparse@5.7.0`, `vitest@5.0.3`.

## 2. Two hard violations of the approved demo stack

**Routing (§2).** Zero references to `hashchange`, `location.hash`,
`HashRouter` or `createHashRouter` anywhere in `src/`. Navigation is a single
`useState("Dashboard")` at `src/App.tsx:105` with a `setPage()` helper.
Consequence: the URL never changes, so reload always lands on the Dashboard and
no route can be shared or bookmarked.

**Persistence (§2).** The string `fixflow.demo.v1` does not appear in the
repository. Persistence is Dexie/IndexedDB created by `createDb()` in
`src/db/dexie.ts:24`, database name `'fixflow'` (`DB_NAME`, line 15).

## 3. Configuration defaults diverge from §3

| Setting | Spec | Actual |
| --- | --- | --- |
| Tax | **disabled** | `LK_STANDARD_VAT = 18` hardcoded in `src/db/seed.ts:13`, applied to every seeded product (line 54) |
| Branches | **two** seeded | **one** — `branchId: 'colombo'` only (`seed.ts:60`); no branch table or record type exists |
| Timezone | `Asia/Colombo` | not configured anywhere; dates use browser-local `toLocaleDateString` |
| Currency | LKR | ✅ LKR |

## 4. Tailwind is installed but essentially unused

`@import 'tailwindcss'` is present in `src/index.css`, but there are **0**
`@tailwind` or `@apply` directives, and only **17 of 249** `className`
attributes in `App.tsx` contain a Tailwind utility. The UI is hand-written CSS
(~560 lines) driven by CSS custom properties. Tailwind is a declared
dependency that does almost nothing.

## 5. Screen coverage — 12 real, 38 stubs

50 nav labels are defined. **12** have a render branch:

`Dashboard · Repairs · Repair Board · Repair Details · New Repair · My Repairs ·
My Repair Details · Diagnosis · AI Diagnosis · POS · Inventory/Products ·
Notifications`

**38 are stubs** — a nav item with no screen behind it:

> Audit Log, Branch Operations, Branches, Cash Register, Cashbook, Customer
> Portal, Customers, Estimates, Expenses, Finance, Integration Settings,
> Invoices, Paid Deliveries, Parts, Payables, Payment & warranty, Payments,
> Permissions, Profile, Purchase Orders, Receivables, Refunds, Repair History,
> Repair intake, Reports, Sales, Settings, Smart diagnosis, Stock Adjustments,
> Stock Transfers, Suppliers, Support, Team, Testing, User Management,
> Warranty, Warranty Claims, Workflow Settings

## 6. Modules present vs §7–§25

| Module | Status |
| --- | --- |
| Repair management (§7) | **Partial** — list/board/details/new-repair screens exist over hardcoded arrays in `App.tsx`; no persistence, no status-transition validation |
| Inventory (§11) | **Built and tested** — `src/db/`, `src/csv/`, `src/modules/products/`; CSV import/export with undo; 18 repository tests + 30 CSV tests |
| POS (§10) | Screen exists; totals were hardcoded (`Tax Rs. 0`); no cart persistence, no stock decrement, no receipt numbering |
| Customers / Devices (§13–14) | ❌ no entity, no screen |
| Estimates & approvals (§9) | ❌ absent |
| Suppliers & purchasing (§12) | ❌ absent |
| Invoices & documents (§15) | ❌ absent |
| Payments (§16) | ❌ absent (see §7 note) |
| Warranties (§17) | ❌ absent |
| Finance & expenses (§18) | ❌ absent |
| Reports (§19) | ❌ absent |
| Customer portal (§20) | ❌ absent |
| Notifications (§21) | Screen exists, static data |
| Multi-branch (§22) | ❌ one branch, no branch entity |
| Users / audit logs (§23) | ❌ absent |
| Global search (§24) | ⚠️ input exists, opens on Cmd+K, searches nothing |
| Settings (§25) | ❌ absent |
| AI diagnosis (§8) | Screen exists; no provider, no rule-based engine |

## 7. Two layers of backend work already exist

`src/firebase/` (6 files) + `src/services/` (8 files) implement a complete
Firestore/Auth/Storage layer with security rules, and `src/utils/` holds
framework-free validation plus `computeInvoice()`. Verified: `tsc --noEmit`
exit 0, 106 tests passing, `vite build` exit 0.

**Important:** this is the *production* path (§2). It has never run against a
real backend — this workspace cannot reach Firebase — and **it is not the
approved demo persistence**. The demo must run browser-local.

## 8. Structure vs §26

Present: `components/ csv/ db/ firebase/ lib/ modules/ services/ styles/ utils/`
Missing: `app/ domain/ persistence/ hooks/` and the `components/` subdivisions
(`ui/ layout/ forms/ tables/ dialogs/ feedback/`). `src/App.tsx` is **559 lines
in one component**, against §26's "avoid oversized monolithic components".

## 9. Tests

106 passing: 18 repository (`src/db/dexie.test.ts`), 30 CSV
(`src/csv/pipeline.test.ts`), 58 domain/finance logic
(`src/utils/firebase-logic.test.ts`). No component or integration tests. No
test covers any user journey in §30.

## 10. Known defects still open

- `RepairDetails` always renders `FX-2026-004821 / Nimal Perera` regardless of
  which repair is selected.
- `RepairBoard` duplicates rows via `data[i % len]`.
- Dashboard figures come from hardcoded arrays, not saved transactions
  (§6 violation).
- `.badge.in-progress`, `.badge.awaiting-parts`, `.badge.received` and
  `.priority.low` are rendered but have no CSS rule.
- `prefers-reduced-motion` has 0 matches (§29).

---

## Architectural decisions taken

The spec asks that assumptions be stated before major decisions (§32.15). These
are mine, and each is reversible:

1. **IndexedDB stays as the demo store; the database is renamed
   `fixflow.demo.v1`.** Dexie already provides versioned migrations, which is
   the substance of the requirement (local, versioned, migratable, no
   backend, never silently discarding user data) — and 18 passing tests
   exercise it. Rewriting onto `localStorage` would discard that for a store
   that is synchronous and capped near 5 MB. The literal key in the spec is
   honoured as the database name.
2. **Tailwind will not be retrofitted onto the existing UI.** The design is
   built and working; converting ~560 lines of CSS and 249 class attributes is
   a high-risk visual rewrite with no functional gain. Tailwind stays available
   for new components.
3. **Hash routing will be added**, since it is cheap, spec-mandated and fixes
   reload/deep-link behaviour.
4. **Tax becomes configurable and defaults to disabled**, per §3. The existing
   18% VAT constant moves behind that setting.
5. **The Firebase layer is retained as the production path**, clearly separated
   from demo persistence, and will not be presented as working.
