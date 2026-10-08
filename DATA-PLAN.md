# FixFlow — Fake data අයින් කරලා ඇත්ත data + CSV/Excel Import/Export

**ඔයා ඉල්ලපු දේ:** mock data අයින් කරලා ඇත්ත data ඇතුළත් කරන්න පුළුවන් වෙන්න, products වගේ ඒවා Excel/CSV වලින් import කරන්න, export කරන්න, සහ **තව මොනවද ඕනේ** කියන එක.

---

## 1. මුලින්ම — ප්‍රශ්නය "fake data" විතරක් නෙවෙයි

මම `App.tsx` එක පරීක්ෂා කරා. දත්ත fake වීමට වඩා ලොකු ප්‍රශ්නයක් තියෙනවා: **ඒවා වැරදි data type වලින් තියෙන්නේ.** CSV එකක් import කරන්න කලින් මේක හදාගන්න ඕනේ, නැත්නම් import වෙන දේ තියාගන්න තැනක් නෑ.

```js
// දැන් තියෙන විදිය
{ id: "FX-2026-004821",
  customerId: "cust-1",  customer: "Nimal Perera",     // ← name එක row එකේ duplicate
  amount: "Rs. 18,500",                                 // ← මුදල් STRING එකක්
  eta: "Today, 4:30 PM" }                               // ← දිනය STRING එකක්
```

මම grep කරලා ගණන් කරා:

| ප්‍රශ්නය | ගණන | ඇයි ප්‍රශ්නයක් |
|---|---|---|
| `"Rs. …"` string literals | **19** | `"Rs. 18,500" + "Rs. 2,000"` කරන්න බෑ. Sort කරන්න බෑ. Sum කරන්න බෑ. |
| `amount: "…"` | 5 | ඉහළ |
| `eta: "…"` (`"Today, 4:30 PM"`, `"Tomorrow"`, `"Mar 22"`, `"Ready now"`) | 5 | Date math කරන්න බෑ. "Overdue" කියලා ගණන් කරන්න බෑ. |
| `customer: "Nimal Perera"` + `customerId` | හැම row එකකම | Customer නම වෙනස් කළොත් repairs 5ම වැරදියි |
| Backend | **0** | `fetch`/`axios`/`supabase`/`api.` traces **ශුන්‍යයි** — data කොහෙවත් යන්නේ නෑ |
| POS එකේ Tax | `Rs. 0` hardcoded | LK එකේ VAT **18%** — real business එකකට මේක වැරදියි |

`products` එකේ `price: 6500`, `stock: 14` numbers ✅ — නමුත් `repairs` එකේ strings. **එකම app එකේ විදි දෙකක්.**

---

## 2. 🔴 ප්‍රධාන තීරණය: data කොහේ තියෙනවද?

මේක තමයි හැම දෙයක්ම තීරණය කරන එක. විකල්ප 3යි:

### A. IndexedDB (browser එකේ විතරයි) — `dexie` 4.4.6
- ✅ Server එකක් නෑ, cost එකක් නෑ, offline වැඩ කරනවා
- ❌ **Multi-user බෑ.** Cashier කෙනෙක් කරන sale එක Manager ට පේන්නේ නෑ. Branch 2ක් sync වෙන්නේ නෑ.
- ❌ Roles 5ක් + branches කියන ඔයාගේ මුළු product කතාවම බිඳ වැටෙනවා
- **තීරණය:** තනි device එකක demo එකකට විතරයි. FixFlow වගේ multi-branch SaaS එකකට **නෙවෙයි.**

### B. Supabase (Postgres + Auth + Row Level Security) ⭐ නිර්දේශය
- ✅ ඇත්ත Postgres DB එකක්, ඇත්ත auth එකක් (`Demo@123` අයින් කරන්න)
- ✅ **Row Level Security** = ඔයා දැනට UI එකෙන් විතරක් කරන role-based filtering එක **server එකෙන් enforce** වෙනවා. දැන් කවුරුත් DevTools එකෙන් role එක වෙනස් කරලා Admin වෙන්න පුළුවන් — මේකෙන් ඒක නවතිනවා
- ✅ Realtime subscriptions → Repair Board එක live update වෙනවා
- ✅ Backend code ලියන්න ඕනේ නෑ, free tier එකක් තියෙනවා
- ❌ Vendor lock-in, internet ඕනේ

### C. තමන්ගේම backend (Node + Drizzle + Postgres/SQLite)
- ✅ සම්පූර්ණ පාලනය, **on-premise/self-host** කරන්න පුළුවන්
- ✅ Internet නැති කඩේකට local server එකක් දාන්න පුළුවන්
- ❌ වැඩ වැඩියි: auth, API, deployment, backups, monitoring ඔක්කොම ඔයාගේ

### මගේ නිර්දේශය
**Supabase වලින් පටන් ගන්න** (B). හේතුව: ඔයාගේ product එකේ ප්‍රධාන selling point එක "role-based access control" — ඒක දැන් UI-level filter එකක් විතරයි. Supabase RLS එකෙන් ඒක ඇත්ත security එකක් වෙනවා, backend code එකක් නොලියා.

**නමුත්** — repair shop එකක internet යනවා නම්, POS එක අවුල්. ඒ නිසා: **local-first queue එකක්** තියන්න (offline විකුණුම් IndexedDB එකේ queue කරලා internet ආපු ගමන් sync). මේක Phase 4 එකේ.

---

## 3. Schema එක — ඇත්ත වැඩේ මෙතන

### Entities (මුල් වටයේ)

```
branches          id, name, code, address, phone, is_active
users             id, branch_id, name, email, role, password_hash, is_active
customers         id, branch_id, name, phone, email, address, nic, created_at
suppliers         id, name, contact, phone, email, payment_terms
products          id, sku (UNIQUE), name, category_id, cost, price, tax_rate,
                  stock_on_hand, reserved, min_stock, barcode, is_service
categories        id, name, parent_id
repairs           id, code (FX-2026-004821), branch_id, customer_id, technician_id,
                  device_type, brand, model, serial, complaint, condition,
                  accessories, priority, status, received_at, eta_at, completed_at
repair_parts      id, repair_id, product_id, qty, unit_price        ← parts used
repair_events     id, repair_id, from_status, to_status, note, actor_id, at
estimates         id, code, repair_id, lines[], total, status, approved_at
invoices          id, code, branch_id, customer_id, repair_id?, subtotal,
                  discount, tax, total, paid, status, issued_at, due_at
invoice_lines     id, invoice_id, product_id?, description, qty, unit_price
payments          id, invoice_id, method (cash/card/bank), amount, reference, at, cashier_id
refunds           id, payment_id, amount, reason, approved_by, at
warranty_claims   id, repair_id, product_id?, claimed_at, status, resolution
stock_movements   id, product_id, branch_id, type (in/out/adjust/transfer),
                  qty, before, after, reason, ref_id, actor_id, at   ← LEDGER
purchase_orders   id, code, supplier_id, branch_id, status, ordered_at, received_at
po_lines          id, po_id, product_id, qty, unit_cost, received_qty
expenses          id, branch_id, category, amount, note, at, actor_id
cash_registers    id, branch_id, cashier_id, opening_float, expected, counted, opened_at, closed_at
sequences         scope, year, next_value                ← FX-2026-004821 numbering
audit_log         id, actor_id, action, entity, entity_id, before, after, at, ip
import_batches    id, entity, filename, rows_total, rows_ok, rows_failed,
                  mapping, actor_id, at, undone_at       ← undo සඳහා
notifications     id, user_id, title, body, read_at, at
```

### Invariants (මේවා නැතුව data එක කැත වෙනවා)

1. **Stock කවදාවත් කෙලින්ම UPDATE කරන්න එපා.** හැම වෙනසක්ම `stock_movements` row එකක්. එතකොට Stock Adjustments, Stock Transfers, Audit Log පිටු 3ම **ඇත්තටම** වැඩ කරනවා, සහ stock එක වැරදි වුණොත් හොයාගන්න පුළුවන්.
2. `available = stock_on_hand − reserved` (දැන් Inventory එකේ `p.stock-i-1` කියලා index එකෙන් fake reserved එකක් හදනවා)
3. `stock_on_hand >= 0` (DB constraint එකක්)
4. `invoice.total = subtotal − discount + tax` · `paid <= total`
5. Repair status transitions workflow එකකට අනුව විතරයි (Received → Diagnosing → Awaiting Approval → In Progress → Testing → Ready → Delivered). Nav එකේ **"Workflow Settings"** කියන page එක තියෙනවා — මේක තමයි ඒක.
6. `code` (FX-2026-004821) `sequences` table එකෙන් — branch + year එකට. Race condition එකක් වෙන්න බෑ.

### Money සහ dates

```ts
// ❌ දැන්
amount: "Rs. 18,500"
eta: "Today, 4:30 PM"

// ✅ ඕනේ
amountCents: 1850000        // integer, කවදාවත් float නෑ
etaAt: "2026-03-18T16:30:00+05:30"   // ISO 8601 timestamptz
```

Display එකට විතරක් formatter එකක්: `formatLKR(1850000)` → `"Rs. 18,500"`. **ගණන් කරන්නේ integer වලින්, පේන්නේ විතරයි string එකක්.**

### Tax

POS එකේ දැන් `<span>Tax</span><strong>Rs. 0</strong>` කියලා hardcode කරලා. ශ්‍රී ලංකාවේ standard VAT **18%** (2024 ජනවාරි 1 සිට, 2025/26 වලත් වෙනස් වෙලා නෑ). ඒ නිසා:
- `products.tax_rate` — product එකට (සමහර ඒවා zero-rated)
- `branches` හෝ settings එකක default rate එකක්
- Invoice එකේ `subtotal / discount / tax / total` වෙනම — එක ගණනක් විදියට නෙවෙයි
- Rate එක **configurable** වෙන්න ඕනේ (රටේ බදු වෙනස් වෙනවා)

---

## 4. 📥 Import — ඇත්ත design එක

**Import කියන්නේ "CSV එකක් parse කරලා insert කරන එක" නෙවෙයි.** එහෙම් කළොත් පළවෙනි real customer ගාවම අසාර්ථක වෙනවා. මේක stages 5ක pipeline එකක්:

```
┌─ 1. UPLOAD ──────────────────────────────────────────────┐
│  [ Drop CSV / XLSX here ]  or  [ Browse ]                │
│  → encoding detect (Excel CSV = UTF-8 with BOM)          │
│  → delimiter detect (, ; tab)                            │
├─ 2. COLUMN MAPPING ──────────────────────────────────────┤
│  Their file            →  FixFlow field                  │
│  "Item Name"           →  [ name          ▾]  ✅ auto    │
│  "Unit Price (Rs.)"    →  [ price         ▾]  ✅ auto    │
│  "QTY"                 →  [ stock_on_hand ▾]  ✅ auto    │
│  "Code"                →  [ sku           ▾]  ✅ auto    │
│  "Notes"               →  [ — ignore —    ▾]             │
│  [ ] Save as template "My supplier format"               │
├─ 3. VALIDATE (හැම row එකක්ම, පළවෙනි error එක විතරක් නෙවෙයි) ─┤
│  Row 14: price "1,85O" — not a number                    │
│  Row 22: sku "CBL-USC-014" already exists                │
│  Row 31: name is required                                │
├─ 4. PREVIEW ─────────────────────────────────────────────┤
│  ✅ 180 valid    ❌ 20 invalid    ⚠️ 12 warnings          │
│  Duplicates:  ( ) Skip  (•) Update by SKU  ( ) Create    │
│  [ Download error rows CSV ]   [ Fix inline ]            │
├─ 5. COMMIT ──────────────────────────────────────────────┤
│  ████████████████░░░░  142/200                           │
│  ✅ Imported 180 products · batch #IMP-0042              │
│  [ Undo import ]   ← import_batches row එකෙන්            │
└──────────────────────────────────────────────────────────┘
```

### මේකේ වැදගත්ම කොටස: **Template download**

`[⬇ Download CSV template]` — හරි headers + example rows 2ක් තියෙන file එකක්. **මේක තනි feature එකෙන් support වැඩ භාගයක් අඩු වෙනවා.** හැම කෙනෙක්ම තමන්ගේම column names වලින් එවනවා; template එකක් දුන්නම ඒක නවතිනවා.

### තාක්ෂණික කරුණු
- **Web Worker එකක parse කරන්න** — rows 10,000ක් main thread එකේ parse කළොත් UI එක freeze වෙනවා
- **Chunk කරන්න** — rows 500ක් බැගින් commit, progress bar එකක්
- **Errors ඔක්කොම එකතු කරන්න** — පළවෙනි error එකේ නවතින්න එපා
- **Dedupe strategy** — SKU එකෙන් match; skip / update / create තේරීමක්
- **Undo** — `import_batches` එකේ rows ටික තියාගන්න, එක click එකකින් ආපහු
- **Idempotency** — එකම file එක දෙපාරක් දැම්මොත් duplicates නැති වෙන්න ඕනේ

---

## 5. 📤 Export

| විදිය | මොකට | Dep |
|---|---|---|
| **CSV** | හැම list page එකකටම (Products, Invoices, Customers…) | `papaparse` (264 kB) |
| **XLSX** | ඔවුන් Excel වලින්ම ඉල්ලනවා නම් | `write-excel-file` (1.8 MB) — ඕනේම නම් |
| **PDF** | Invoices, Estimates, Receipts — **මේක වෙනම feature එකක්** | `react-pdf` / server-side |

**වැදගත්:** Export එක **දැන් තියෙන filters වලට ගරු කරන්න ඕනේ** — "මම filter කරපු ඒවා විතරක් export කරන්න" + "ඔක්කොම export කරන්න" කියන දෙකම. Column තෝරන්නත් පුළුවන් වෙන්න ඕනේ.

---

## 6. 📦 Dependencies — මම npm registry එකෙන් verify කරා

| Package | Version | Last publish | Unpacked | තීරණය |
|---|---|---|---|---|
| **papaparse** | 5.7.0 | 2026-08-24 | **264 kB** | ✅ **ගන්න** — CSV import + export දෙකම |
| **zod** | 4.6.5 | 2026-09-13 | — | ✅ **ගන්න** — validation |
| **@tanstack/react-table** | 9.2.6 | 2026-10-04 | — | ✅ **ගන්න** — sort/filter/pagination |
| **@supabase/supabase-js** | 2.117.3 | 2026-10-07 | — | ✅ (option B තෝරගත්තොත්) |
| **dexie** | 4.4.6 | 2026-09-10 | — | ⚠️ offline queue එකට විතරයි |
| read-excel-file | 9.3.12 | 2026-10-07 | 2.6 MB | ⚠️ XLSX **read** ඕනේම නම් |
| write-excel-file | 4.1.1 | 2026-06-08 | 1.8 MB | ⚠️ XLSX **write** ඕනේම නම් |
| **exceljs** | 4.4.0 | **2023-10-19** | **21.3 MB** | ❌ **එපා** — අවුරුදු 3ක් පරණ, 21 MB |
| **xlsx** (npm) | 0.18.5 | **2022-03-24** | — | ❌ **එපා** — npm එකේ අත්හැර දාපු එක (SheetJS දැන් තමන්ගේ CDN එකෙන්) |

**නිර්දේශය:** CSV first-class කරන්න (Excel වලින් "Save As CSV" කරන්න පුළුවන්). `papaparse` 264 kB විතරයි. XLSX ඇත්තටම ඕනේ නම් `read-excel-file` (actively maintained) — **exceljs නම් කවදාවත් එපා.**

---

## 7. 🔄 Mock → Real migration එක (demo එක කඩාගන්නේ නැතුව)

**එකපාර වෙනස් කරන්න එපා.** මේ පිළිවෙලින්:

```
Step 1  src/db/schema.ts        — zod types + DB schema (UI එකට බලපාන්නේ නෑ)
Step 2  src/db/repository.ts    — interface එකක්:
                                   listProducts(), createProduct(), importProducts()
        src/db/mock.ts          — දැනට තියෙන arrays මේ interface එකට පිටිපස්සෙන්
Step 3  UI එක repository එකෙන් කියවනවා (arrays වලින් කෙලින්ම නෙවෙයි)
        → මේ මොහොතේ demo එක ඒ වගේම වැඩ කරනවා, නමුත් data source එක වෙනස් කරන්න පුළුවන්
Step 4  src/db/supabase.ts      — එකම interface එකට real implementation එකක්
        env flag එකකින් තෝරනවා: VITE_DATA_SOURCE=mock | supabase
Step 5  seed script එකක්        — දැනට තියෙන repairs 5 + products 6 DB එකට දානවා
Step 6  Entity එක බැගින් real එකට මාරු කරනවා  (products මුලින්ම — ඔයා import කරන්න ඕනේ ඒක)
Step 7  mock arrays මකනවා (අන්තිමට)
```

**මේකේ වාසිය:** හැම මොහොතකම demo එක වැඩ කරනවා. Step 3 ඉවර වුණාම ඔයාට ඕනෑම වෙලාවක mock ↔ real මාරු කරන්න පුළුවන්.

**Entity පිළිවෙල:** `products` (සරලම + import ඕනේ) → `customers` → `invoices` → `repairs` (සංකීර්ණම) → ඉතුරු ඒවා.

---

## 8. ❓ "තව මොනවද ඕනේ" — ඔයා ඇහුවා

ඇත්ත data එකක් තියෙන ගමන් මේවා **අනිවාර්යයෙන්ම** ඕනේ වෙනවා:

| # | දේ | ඇයි | දැන් තියෙන තත්ත්වය |
|---|---|---|---|
| 1 | **ඇත්ත auth එකක්** | `Demo@123` client bundle එකේ plaintext | ❌ නෑ |
| 2 | **Server-side authorization** | දැන් role එක DevTools එකෙන් වෙනස් කරලා Admin වෙන්න පුළුවන් | ❌ UI-level filter එකක් විතරයි |
| 3 | **Audit log** | ඇත්ත data එකක් වෙනස් වෙනකොට "කවුද කලේ" කියලා ඕනේ | ❌ Nav එකේ page එක තියෙනවා, data නෑ |
| 4 | **Validation (zod)** | CSV එකකින් ඕනෑම දෙයක් එනවා | ❌ නෑ |
| 5 | **Numbering sequences** | `FX-2026-004821` — දෙදෙනෙක් එකපාර හැදුවොත් එකම id එක | ❌ hardcoded |
| 6 | **Stock ledger** | Adjustments/Transfers ඇත්ත වෙන්න | ❌ stock එක කෙලින්ම |
| 7 | **Tax engine** | LK VAT 18%, zero-rated items | ❌ `Rs. 0` hardcoded |
| 8 | **Invoice/receipt printing** | කඩේකට PDF + thermal printer (58/80mm) | ❌ නෑ |
| 9 | **Barcode scanning** | POS එකේ දැනටමත් `F2` / "scan barcode" placeholder එකක් තියෙනවා | ❌ placeholder විතරයි |
| 10 | **Offline queue** | කඩේක internet යනවා | ❌ නෑ |
| 11 | **Backups + full export** | ඔයාගේ data ඔයාට අයිතියි — data portability | ❌ නෑ |
| 12 | **Error/empty/loading states** | ඇත්ත data එකක් එක්ක network fail වෙනවා | ❌ නෑ |

---

## 9. Phase plan

### Phase A — Data foundation (import/export නැතුව)
- `src/db/schema.ts` — zod schemas, money = integer cents, dates = ISO
- `src/db/repository.ts` interface + `mock.ts` implementation
- UI එක repository එකෙන් කියවන විදියට වෙනස් කරනවා
- Seed script
- **Deliverable:** demo එක ඒ වගේම වැඩ කරනවා, නමුත් data layer එකක් තියෙනවා

### Phase B — Products: CRUD + CSV import/export ⭐ (ඔයා ඉල්ලපු එක)
- `papaparse` + `zod`
- Import wizard එක (stages 5ම) + template download + error CSV + undo
- Export CSV (filters වලට ගරු කරන)
- Products table එකට sort/filter/pagination (`@tanstack/react-table`)
- Stock ledger එක (`stock_movements`)
- **Deliverable:** සම්පූර්ණ products module එකක්, ඇත්ත data එකක් එක්ක

### Phase C — Customers + Invoices + Payments
- එකම pattern එක. Invoices වලට PDF export එකත්.

### Phase D — Real backend
- Supabase (හෝ තමන්ගේම) + real auth + RLS
- Mock → real switch එක
- Audit log

### Phase E — ඉතුරු ඒවා
- Repairs module (සංකීර්ණම — parts, workflow, events)
- Barcode, offline queue, printing, backups

---

## 10. ඔයාගෙන් තීරණ 2ක් ඕනේ

**1. Data කොහේ?**
- **(B) Supabase** ⭐ — වේගවත්ම, role-based access එක ඇත්තටම enforce වෙනවා, backend code නෑ
- **(C) තමන්ගේම backend** — on-premise ඕනේ නම්, වැඩ වැඩියි
- **(A) IndexedDB විතරයි** — තනි-device demo එකකට විතරයි (multi-user බෑ)

**2. ආරම්භය කොහෙන්ද?**
- **Phase A + B** ⭐ — data foundation + Products CRUD/CSV import-export (ඔයා ඉල්ලපු එක කෙලින්ම)
- **Phase B විතරයි** — foundation එක නැතුව කෙලින්ම products (වේගවත්, නමුත් පස්සේ refactor කරන්න වෙයි)

---

## 11. Risk

- **මේක ලොකු වෙනසක්.** දැන් app එකේ backend එකක් නෑ — data layer එකක් එකතු කරනවා කියන්නේ නව ආකෘතියක්. ඒ නිසා **Phase A එකේ repository interface එක වැදගත්ම**: ඒක හොඳට හැදුවොත් පස්සේ mock ↔ real මාරු කරන එක ලේසි.
- **Review එකේ P1 bugs මුලින්ම fix කරන්න** — විශේෂයෙන් money/dates string එකේ තියෙන එක. නැත්නම් import කරපු data එක UI එකේ පේන්නේ වැරදියට.
- **`SCREEN-PLAN.md` එක එක්ක සම්බන්ධයි** — page registry එක + repository එක එකට හොඳට fit වෙනවා (`rows: ctx => repo.list(entity, scope(ctx.user))`). Screens මුලින් හදනවද, data මුලින් හදනවද කියන එක තීරණය කරන්න — **මම නිර්දේශ කරන්නේ data මුලින්** (screens වලට පෙන්නන්න දෙයක් ඕනේ).

---

*සියලුම කරුණු verify කරගත්තා: `App.tsx` grep (Rs. strings ×19, eta strings ×5, backend traces 0), npm registry එකෙන් package versions/dates/sizes, සහ LK VAT 18% (2024-01-01 සිට, 2025/26 වෙනස් වෙලා නෑ).*
