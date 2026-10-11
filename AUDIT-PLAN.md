# FixFlow — Audit and Prioritised Implementation Plan

Audited at commit `35cfe1c` on branch `arena/ccac4826-fixflow`.

Every statement below was read out of the repository at that commit, not
recalled. Where something is a judgement rather than a fact, it says so.

---

## 1. What the codebase actually is

**Stack (verified from `package.json`):** React 19.2.4, Vite 8.0.5, TypeScript
5.9.3, Tailwind 4.3.3, Dexie 4.4.6, Zod 4.6.5, papaparse 5.7.0, Vitest 5.0.3,
firebase 13.0.0.

**Persistence:** IndexedDB via Dexie, database `fixflow.demo.v1`, schema at
**version 7** with 19 tables. Browser-local. There is no server. The Firebase
layer in `src/firebase/` is code that has never been able to run against a real
project from this sandbox — outbound network reaches only github.com and the
package registries, so `firestore.googleapis.com` and friends return `000`.

**Test suite:** 533 tests across 16 files, all passing. `tsc --noEmit` exits 0.
`vite build` succeeds.

**Screens:** 47 navigation items. **20 render a real screen. 27 render the
`ModulePreview` stub.** The 27:

```
AI Assistant        Audit Log           Branch Operations  Branches
Cashbook            Customer Portal     Expenses           Finance
Integration Settings Paid Deliveries    Parts              Payables
Permissions         Profile             Purchase Orders    Repair History
Reports             Settings            Stock Transfers    Suppliers
Support             Team                Testing            User Management
Warranty            Warranty Claims     Workflow Settings
```

**Types that exist but are never persisted** (read from `domain/types.ts`
against the Dexie table list):

```
BusinessSettings  TechnicianProfile  Diagnosis     RepairNote
TestResult        RepairPartUsage    Supplier      PurchaseOrderItem
PurchaseOrder     WarrantyPolicy     Warranty      WarrantyClaim
AppNotification   AuditLogEntry
```

This is the single most useful fact in this audit: a lot of the spec is
*designed* already and simply has no table behind it.

---

## 2. Section-by-section status

### 1. Smart Dashboard — **partial**

| Requested | State |
|---|---|
| Today's sales | ✅ `computeDashboardFigures().todaySales` — from real sales |
| Pending / completed repairs | ✅ `activeRepairs`, `readyForPickup`, `awaitingApproval` |
| Low-stock items | ✅ `lowStockItems`, `criticalStockItems`, using *available* (on hand − reserved) |
| Repair income | ❌ not computed |
| Expenses | ❌ persisted since `35cfe1c`, not surfaced |
| Profit | ❌ `operatingResult()` exists and is tested but nothing calls it |
| Weekly / monthly charts | ❌ the SVG at `App.tsx:438` says "Illustrative curve" in its own subtitle |
| Recent repairs / sales | ✅ |
| Overdue repairs | ❌ |
| Warranty expirations | ❌ no warranty data exists |
| **Clickable cards** | ❌ `Card` (`App.tsx:98`) takes `children` and `className` only — no `onClick` |

### 2. Repair Management — **mostly done**

- Job numbers, customer/device capture, technician assignment, status history
  with timestamps and actor: ✅. `repairHistory` has a monotonic `seq` per
  repair so ordering never depends on a tie-able timestamp.
- Statuses: the domain has **11** (`received, diagnosing, waiting_for_approval,
  waiting_for_parts, approved, repairing, testing, completed,
  ready_for_collection, delivered, cancelled`). The spec names 9; the domain is
  a superset. "Quality Checking" is `testing`, "In Repair" is `repairing`.
- Transition validation: ✅ `domain/workflows.ts REPAIR_TRANSITIONS`, enforced in
  Dexie.
- ❌ `Diagnosis`, `RepairNote`, `TestResult`, `RepairPartUsage` are type-only.
  **Parts used in a repair cannot be recorded, so they do not decrement stock.**
  This is the largest real gap in an otherwise complete module.
- ⚠️ **Two repair state machines still coexist**: legacy
  `repairService.ALLOWED_TRANSITIONS` (8 statuses, starts `pending`) and
  canonical `domain/workflows.ts` (11, starts `received`). Dexie enforces the
  new one. The legacy one is dead weight that will mislead whoever reads it.

### 3. Customer Management — **done** (`8a336f9`)

Search, devices, repairs, invoices, lifetime value derived on read, duplicate
phone refused at `dexie.ts:568`, edit without touching history. Warranty and
payment history per customer are **not** shown — both blocked on §7 and on the
payments screen being reachable from here.

### 4. Inventory and Stock Control — **mostly done**

- Products with SKU/barcode/cost/price/min-stock: ✅
- Stock decrement on POS sale: ✅ one `sale_out` movement per line, `refId` =
  sale id, all inside one transaction.
- ❌ **Stock decrement on repair part usage: not implemented** (see §2).
- Adjustments: ✅ as of `94763c2`, with a mandatory reason and a ledger view.
- ❌ Branch transfers: `transfer_in`/`transfer_out` exist as movement *types*
  with no way to create one.
- Low/out-of-stock: ✅
- Movement history with before/after/reason/actor: ✅
- Negative stock: ✅ refused. **No manager override exists** — the spec asks for
  one.
- Barcode: ⚠️ the POS search field matches on barcode text (`App.tsx:886`), so a
  scanner acting as a keyboard works. There is no dedicated scan input, no
  enter-to-add, no beep/feedback.

### 5. POS and Invoicing — **mostly done**

Cart, discounts, partial payment (`amountPaid`), four payment methods, unique
receipt numbers, idempotency key preventing duplicate checkout, hold/park,
cash sessions with expected-vs-counted: ✅ and tested (39 + 26 + 16 tests).

- ❌ **Print:** exactly one `@media print` block exists. Invoices and estimates
  have no print layout.
- ❌ **PDF:** nothing. Any "download as PDF" would need `window.print()` to a
  print stylesheet — honest, but it is not PDF generation.
- ❌ The POS **hardcodes** `taxRate: 0` (`App.tsx:896`) and `taxEnabled: false`
  (`:965`) and never reads `settings.taxEnabled`, so the settings toggle is
  inert. No mischarge results, but the control is a lie.

### 6. Quotations and Customer Approval — **done** (`a77bb8f`, `c3a9615`)

Draft → send → decide, approval records method/who/when, revision supersedes
without editing the old row, repair only advances with a recorded approval.
31 tests. ❌ No printable quotation.

### 7. Warranty Management — **not started**

`WarrantyPolicy`, `Warranty`, `WarrantyClaim`, `WARRANTY_STATUSES`,
`WARRANTY_CLAIM_STATUSES` all exist in `domain/types.ts`.
**No table, no calculation, no screen.** `domain/calculations.ts` has no
warranty function at all. This is a full module.

### 8. Expenses and Profit Reports — **half done**

Expenses persisted and tested as of `35cfe1c` (15 tests): create, reverse by
appending a negative row, filter by branch/category/date range.
❌ No Expenses screen. ❌ Reports is a stub. `operatingResult()` is tested and
uncalled.

### 9. Supplier and Purchasing — **not started**

`Supplier`, `PurchaseOrderItem`, `PurchaseOrder` exist as types. No table, no
screen. The rule the spec cares about — *a PO must not increase stock, only
goods received does* — has no implementation to get wrong yet.

### 10. Users and Permissions — **partial**

- `domain/permissions.ts` has 40+ permissions, `permissionsFor`, `can`,
  `requirePermission`, `canAccessBranch`, `canCustomerAccess`: ✅ **tested**.
- ❌ **None of it gates the UI.** Navigation is filtered by role via `roleNav`,
  but no screen calls `can()` or `requirePermission()`.
- ❌ User Management, Permissions, Team: stubs.
- ❌ **Audit log: nothing.** `AuditLogEntry` is a type, `admin.view_audit_log`
  is a permission, and not one row has ever been written.
- ❌ Destructive actions: only `invoices.cancel` asks (via `window.prompt`).
  Deletes elsewhere have no confirmation.
- Passwords: N/A — login is a demo role picker with no credentials. Nothing is
  stored in plain text because nothing is stored.

### 11. Notifications and Customer Portal — **partial**

- `deriveNotifications` exists, is tested (16 tests) and is wired at
  `App.tsx:1057`: ✅
- ❌ **Customer portal: does not exist.** `db.customers.byPortalToken` is
  implemented and the token is unguessable (`ptk_<id>_<32hex>`), but no route
  consumes it. `Customer Portal` is a stub, and "signing in" as a customer is a
  hardcoded demo user (`cus_nimal`, `App.tsx:41`). **A real customer cannot
  currently look up their own repair.**
- ❌ WhatsApp: nothing, and no credentials. Sharing would have to be a
  `wa.me` link, which is honest and needs no integration.

### 12. Branch Management — **partial**

Two seeded branches. Stock, users and repairs are branch-scoped. Estimates,
invoices and payments scope by branch *or* by customer.
❌ No transfers. ⚠️ Branch filtering is per-screen and inconsistent — several
screens ignore it.

### 13. Data Storage and Reliability — **done**

Versioned Dexie migrations 1→7. Validation at the repository boundary.
`useQuery` surfaces `storeError` rather than spinning forever. Loading/empty/
error states on the newer screens. Nothing claims success on failure.

### 14. UI and UX — **mostly done**

Font tokens, reduced-motion handling, print block, dark mode, responsive
customer layout. ❌ 27 stubs are the visible cost of this.

### 15. Testing — **strong but uneven**

533 tests over the data and domain layers. **The 20 real screens have no test
coverage at all**, and nothing here is browser-verifiable — this sandbox has no
browser.

---

## 3. Prioritised plan

Ordered by *user-visible value per unit of risk*, with dependencies respected.
Each stage is independently shippable and testable.

**Stage 1 — Make the dashboard honest and clickable.** (§1)
Replace the illustrative SVG with weekly/monthly series computed from real
sales. Add repair income, expenses and profit via the already-tested
`operatingResult`. Give `Card` an `onClick` so each KPI navigates.
*Low risk: no schema change, reuses tested maths.*

**Stage 2 — Repair parts usage and stock deduction.** (§2, §4)
Persist `RepairPartUsage`; record parts against a repair and write `repair_use`
movements that decrement stock and honour reservations. This closes the largest
correctness gap: today a repair can consume a part and the shelf count never
moves.
*Medium risk: touches stock, which is the most-tested code in the repo.*

**Stage 3 — Reports and the Expenses screen.** (§8)
Daily/weekly/monthly/custom ranges, split sales revenue / repair revenue /
expenses / gross profit / operating result, filters by branch and category, CSV
export via the existing `toCsv` + `downloadText`.
*Low risk: read-only over data that now exists.*

**Stage 4 — Warranty.** (§7)
Tables for policy, warranty and claim; expiry maths in `domain/calculations.ts`
with tests first; search by invoice / job number / phone / serial; claims with
inspection and decision. Historical warranties must not move when a product's
policy is edited.
*High value, self-contained. Largest single new module.*

**Stage 5 — Customer portal.** (§11)
A real token-based lookup route consuming `byPortalToken`, mobile-first,
showing status, approved quotations, invoices and warranty. Scoped so one
customer can never read another.
*Medium risk: it is the only externally-reachable surface, so the scoping has
to be right.*

**Stage 6 — Purchase orders and suppliers.** (§9)
Tables plus the rule that matters: creating a PO changes nothing; only goods
received writes stock. Partial receiving and partial payment.

**Stage 7 — Enforce permissions and write the audit log.** (§10)
Gate screens on `can()`, add confirmations to destructive actions, persist
`AuditLogEntry` from the mutations that matter, build the Audit Log and User
Management screens.
*Deliberately late: it touches every screen, so it lands once the screens
exist.*

**Stage 8 — Branch transfers, settings, and the tax toggle.** (§4, §12, §5)
Transfers with history; a Settings screen that actually writes
`BusinessSettings`; make the POS read `taxEnabled` instead of hardcoding it.

**Stage 9 — Print and share.** (§5, §6, §11)
Print stylesheets for invoice, estimate and receipt; `wa.me` links. No PDF
library — `window.print()` to a stylesheet is what actually works offline, and
calling it PDF would be a false claim.

---

## 4. Known limitations that will not be fixed by this plan

- **No real backend.** Everything is browser-local. There is no cloud sync and
  no multi-user sharing, and none will be claimed.
- **No real authentication.** The login is a role picker. Storing password
  hashes would be theatre without a server to check them against.
- **No real AI.** `src/modules/diagnosis/engine.ts` is a rule-based demo and
  says so. Ollama and external API paths cannot be reached from this sandbox.
- **No email or WhatsApp delivery.** In-app notifications only.
- **No browser here.** Screens are verified by typecheck, build, module
  transform and the tests behind them — not by being looked at.
- **The 27 stubs** shrink as stages land but will not all disappear.

---

## 5. Running it

```bash
cd "FixFlow UI Design"
pnpm install
pnpm run dev        # http://localhost:8443
pnpm run typecheck
pnpm test
pnpm run build
```

The app folder name contains a space — quote it.
