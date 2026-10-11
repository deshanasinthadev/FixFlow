# FixFlow — Current Implementation Status

Inspection performed against the master specification. Every claim below was
produced by a command run on this checkout, not assumed.

**Branch** `arena/ccac4826-fixflow` · **HEAD** `b30cad2` · app lives in
`FixFlow UI Design/` (note the space in the folder name).

> Re-inspected after the repair, POS and routing work. Sections 1–3 below now
> record what is **fixed**; §5, §6, §9 and §10 were rewritten to match.
> Anything still missing is marked as such rather than quietly dropped.

---

## 1. Stack — matches the approved stack

| Requirement (§2) | Installed | |
| --- | --- | :-: |
| React 19 | 19.2.4 | ✅ |
| Vite 8 | 8.0.5 | ✅ |
| TypeScript | 5.9.3 | ✅ |
| Tailwind CSS v4 | 4.3.3 (declared) | ⚠️ see §4 |
| Hash-based routing | `src/app/routes.ts` + `hashchange` in `App.tsx` | ✅ |
| `fixflow.demo.v1` persistence | `DB_NAME` at `src/db/dexie.ts:56` | ✅ |

Also present from earlier work: `firebase@13.0.0`, `dexie@4.4.6`, `zod@4.6.5`,
`papaparse@5.7.0`, `vitest@5.0.3`.

## 2. The two hard violations of the approved demo stack — both resolved

**Routing (§2).** Was a bare `useState("Dashboard")`; the URL never changed, so
reload always landed on the Dashboard. Now `src/app/routes.ts` parses and
writes hash routes (`#/admin/repairs`, `#/admin/repair-details/FX-2026-004821`),
`App.tsx` listens to `hashchange`, and `parseHash` returns `null` rather than
guessing. The guard **redirects** a route the signed-in role is not allowed to
see instead of rendering it — hiding a nav item is not access control. 23 tests.

**Persistence (§2).** The database is now `fixflow.demo.v1` (`src/db/dexie.ts:56`),
created via Dexie `version(2)` so existing data migrates rather than being
silently discarded.

## 3. Configuration defaults diverge from §3

| Setting | Spec | Actual |
| --- | --- | --- |
| Tax | **disabled** | ⚠️ `taxEnabled: false` is seeded in settings (`seedBusiness.ts:56`) and the POS passes `taxEnabled: false`, but `LK_STANDARD_VAT = 18` is still hardcoded in `src/db/seed.ts:13` and applied to every seeded product (line 54). Not yet a single configurable source. |
| Branches | **two** seeded | ✅ `br_colombo` and `br_kandy` seeded in `src/db/seedBusiness.ts`, with a `branches` table and role scoping enforced on read |
| Timezone | `Asia/Colombo` | not configured anywhere; dates use browser-local `toLocaleDateString` |
| Currency | LKR | ✅ LKR |

## 4. Tailwind is installed but essentially unused

`@import 'tailwindcss'` is present in `src/index.css`, but there are **0**
`@tailwind` or `@apply` directives, and only **17 of 249** `className`
attributes in `App.tsx` contain a Tailwind utility. The UI is hand-written CSS
(~560 lines) driven by CSS custom properties. Tailwind is a declared
dependency that does almost nothing.

## 5. Screen coverage — 14 real, 36 stubs

50 nav labels are defined. **14** have a render branch (verified by grepping
`page === "..."` in `App.tsx`):

`Dashboard · Repairs · Repair Board · Repair Details · New Repair · My Repairs ·
My Repair Details · Diagnosis · AI Diagnosis · POS · Inventory · Products ·
Notifications · AI Assistant`

Of those, the ones that now read and write **saved records** rather than
hardcoded arrays are: Repairs, Repair Board, Repair Details, My Repairs, New
Repair and POS. Dashboard, Diagnosis, AI Diagnosis and Notifications are still
static.

**36 are stubs** — a nav item with no screen behind it:

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
| Repair management (§7) | **Substantially built** — persisted jobs with validated transitions (`assertRepairTransition` in one transaction with the history entry), role-scoped listing, intake wizard that creates customer + device + job, detail screen driven by a route parameter with role-gated transition buttons. 50 repository tests + 35 view tests. Still missing: estimates, parts-on-repair, photo capture. |
| Inventory (§11) | **Built and tested** — `src/db/`, `src/csv/`, `src/modules/products/`; CSV import/export with undo; 18 repository tests + 30 CSV tests |
| POS (§10) | **Substantially built** — checkout, cash register sessions, sales history, printable receipts, refunds/returns, and held (parked) carts. 136 tests across `pos`, `cashSessions` and `heldSales`. Still missing: barcode scanning as a real input, and per-item returns. |
| Customers / Devices (§13–14) | **Persistence built, screens absent** — `customers` and `devices` tables, seeded, with unguessable portal tokens (`ptk_<id>_<32hex>`); created through the intake wizard. No customer list or detail screen yet. |
| Estimates & approvals (§9) | **Persistence built and tested, no UI** — full draft → sent → approved/rejected → revised lifecycle, approvals recorded as their own record (§28.13), revisions supersede rather than overwrite. `changeStatus` now refuses to start work with no recorded approval. 31 tests. The Estimates nav item is still a stub. |
| Suppliers & purchasing (§12) | ❌ absent |
| Invoices & documents (§15) | ❌ absent |
| Payments (§16) | ❌ absent (see §7 note) |
| Warranties (§17) | ❌ absent |
| Finance & expenses (§18) | ❌ absent |
| Reports (§19) | ❌ absent |
| Customer portal (§20) | ❌ absent |
| Notifications (§21) | **Derived from live records** — low stock, estimates awaiting decision, unassigned work, parts holds, ready-for-collection, and a technician's own queue. Empty database produces an empty panel. 16 tests. |
| Multi-branch (§22) | **Partial** — two seeded branches, a `branches` table, and read-side scoping by role and branch. No branch transfers, no branch switcher screen. |
| Users / audit logs (§23) | **Partial** — a `users` table seeded with 6 users across both branches, and repair status history ordered by a monotonic `seq` so the audit trail cannot be reordered by equal timestamps. No user-management screen, no general audit log. |
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

Present: `app/ components/ csv/ db/ domain/ firebase/ lib/ modules/ services/
styles/ utils/`. `domain/` holds the canonical types, calculations, workflows
and permissions; `app/routes.ts` holds the hash router.

Missing: `persistence/`, `hooks/`, and the `components/` subdivisions
(`ui/ layout/ forms/ tables/ dialogs/ feedback/`).

`src/App.tsx` has **grown to 869 lines**, against §26's "avoid oversized
monolithic components". Screens are being extracted into `modules/` as they are
made real (`modules/repairs/repairView.ts`); the remaining screens still live
in `App.tsx`.

## 9. Tests

**486 passing across 14 files** (verified with `pnpm vitest run`):

| File | Tests | Covers |
| --- | ---: | --- |
| `src/domain/domain.test.ts` | 96 | calculations, workflows, permissions, validation |
| `src/utils/firebase-logic.test.ts` | 58 | framework-free finance/validation logic |
| `src/db/business.test.ts` | 50 | branches, users, customers, devices, repairs, history |
| `src/db/estimates.test.ts` | 31 | estimates, approvals, revisions, the work-start gate |
| `src/db/cashSessions.test.ts` | 26 | register open/close, expected cash, variance |
| `src/db/heldSales.test.ts` | 16 | parked carts, and that holding reserves no stock |
| `src/modules/notifications/derive.test.ts` | 16 | notifications derived from real records |
| `src/db/pos.test.ts` | 39 | checkout, stock integrity, idempotency, refunds, reservations |
| `src/modules/repairs/repairView.test.ts` | 48 | record → row adapter, role scoping, board columns, customer progress |
| `src/modules/diagnosis/engine.test.ts` | 25 | rule-based diagnosis engine |
| `src/csv/pipeline.test.ts` | 30 | CSV import/export |
| `src/app/routes.test.ts` | 23 | hash routing, route parameters |
| `src/db/dexie.test.ts` | 18 | products and stock movements |
| `src/modules/dashboard/figures.test.ts` | 10 | dashboard figures derived from saved records |

**Still absent: component and integration tests.** No test renders a React
component, and no §30 user journey is covered end to end. The journeys are
covered at the repository layer — the same code paths the screens call — but
that is not the same as proving the screen calls them.

## 10. Known defects still open

**Fixed since the first inspection:**

- ~~`RepairDetails` always renders `FX-2026-004821 / Nimal Perera`~~ — now loads
  the record named by the route parameter.
- ~~Dashboard figures come from hardcoded arrays~~ — all KPI tiles, the role
  dashboards and the transaction list now derive from saved records. Invented
  figures were removed rather than kept: `Rs. 184,500`, `Rs. 326,400`,
  `Rs. 24,800`, `Rs. 142,800`, `Rs. 84,500`, `Rs. 86,400`, `Rs. 92,500`,
  `1.84M`, `1.52M`. Verified absent from the built bundle.
- ~~`RepairBoard` duplicates rows via `data[i % len]`~~ — it groups by real
  status now.
- ~~`CustomerRepairDetails` always showed `data[0]` with a hardcoded progress
  bar~~ — it resolves the job from the route parameter and maps the eleven
  internal statuses onto the five customer-facing steps.
- ~~Missing badge/priority CSS~~ — 14 `.badge.*` and 7 `.priority.*` rules now
  exist. `Badge` derives its class from the label text, so any *new* status
  label will still render unstyled until a rule is added.

**Still open:**

- The sales chart is an illustrative SVG curve; the card says so, and only the
  figures beside it are real.
- 34 sidebar labels still have no screen. They now say so plainly instead of
  inventing figures and claiming to be connected.
- There is no barcode scanner input; the POS search matches barcode text.
- Estimates, invoices, payments, suppliers, warranties, finance, reports and
  settings have no screens.
- `prefers-reduced-motion` has **0** matches in `index.css` (§29).
- Tax is seeded as disabled but `LK_STANDARD_VAT = 18` is still hardcoded per
  product in `seed.ts` (§3).
- Estimates have no screen. The rules and persistence are tested; a user cannot
  yet quote or approve from the UI.
- Two repair state machines coexist: the legacy `repairService.ALLOWED_TRANSITIONS`
  (8 statuses, Firebase layer) and the canonical `domain/workflows.ts
  REPAIR_TRANSITIONS` (11 statuses). Dexie enforces the canonical one. They
  are **not reconciled**.
- Both `pnpm-lock.yaml` and `package-lock.json` are committed.

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
