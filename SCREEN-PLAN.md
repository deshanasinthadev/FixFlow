# FixFlow — Sidebar එකේ හැම button එකකටම "හොඳ screen එකක්" ලබා දීම

**ප්‍රශ්නය:** Sidebar එකේ button එකක් click කරාම 80%ක් එකම generic `ModulePreview` card එකට වැටෙනවා.
**ඉලක්කය:** හැම button එකක්ම ඇත්ත, පේන විදිහට සම්පූර්ණ, එකිනෙකට අනුරූප screen එකකට යන්න ඕනේ.

---

## 1. මුලින්ම ප්‍රශ්නය මැනගමු

මම `roleNav` එක parse කරලා නිශ්චිතවම ගණන් කරා:

```
unique nav labels total:          47
ඇත්ත screen එකක් තියෙන ඒවා:        9
ඇත්ත screen එකක් නැති ඒවා:        38   ← මේක තමයි ප්‍රශ්නය
```

දැන් `ModulePreview` එකෙන් ලැබෙන්නේ: hero එකක් + generic insight cards 3ක් ("Total records 248", "Needs attention 8", "This month +12.4%") + "This module is connected and ready for your team" කියන empty card එකක්. හැම page එකකටම **එකම** එක. Technician/Customer roles වලට insight cards ඒවාත් නෑ.

### වැදගත්ම සොයාගැනීම: 38ක් නෙවෙයි — shapes 6යි

38 pages වර්ග කරලා බැලුවාම:

| Shape | ගණන | Pages |
|---|---|---|
| **A. List/Table page** | **22** | Customers, Sales, Invoices, Payments, Refunds, Estimates, Purchase Orders, Suppliers, Stock Adjustments, Stock Transfers, Expenses, Receivables, Payables, Warranty, Warranty Claims, Audit Log, Paid Deliveries, Repair History, Products, Team, User Management, Branches |
| **B. Settings/form page** | **6** | Settings, Workflow Settings, Integration Settings, Permissions, Profile, Branch Operations |
| **C. Analytics page** | **4** | Finance, Reports, Cashbook, Cash Register |
| **D. Chat page** | **1** | AI Assistant |
| **E. දැනටමත් අඩක් හදලා** | **2** | Notifications (ModulePreview එකේ special case එකක් තියෙනවා), Support |
| **F. Technician queue** | **2** | Parts, Testing |
| (වර්ග නොකළ) | 1 | Customer Portal |

**මෙතන තමයි idea එකේ හදවත තියෙන්නේ.** ඔයාට screens 38ක් හදන්න ඕනේ නෑ. **Page shapes 6ක්** හදලා, pages 38ක් ඒවාට config කරන්න ඕනේ. 22ක් (58%) එකම shape එක.

---

## 2. Idea එක — "Screens" නෙවෙයි, "Page Registry" එකක්

### දැන් තියෙන විදිය (ප්‍රශ්නය)

```tsx
// App.tsx — pages 12ක් hardcoded if-chain එකක
{page === "Dashboard" && (...)}
{page === "Repairs" && (...)}
{page === "POS" && <POS .../>}
{![...11 items...].includes(page) && <ModulePreview page={page} user={user}/>}
```

ප්‍රශ්න 4ක්:
1. අලුත් page එකක් එකතු කරන්න if-chain එක + `allowedPages` + `roleNav` + breadcrumb තැන් 4ක වෙනස් කරන්න ඕනේ
2. හැම page එකක්ම අතින් හැදුවොත් 38 screens = අතිවිශාල වැඩ
3. දැනටමත් මේ නිසා bugs: `roleNav` එකේ icon names type-safe නෑ, `allowedPages` එක `navPages` + `extraPages` දෙකෙන් අතින් හදනවා, URL slug එක වෙනම හදනවා
4. `ModulePreview` fallback එක නිසා වැරදි page එකක් **නිශ්ශබ්දව** stub එකකට වැටෙනවා

### යෝජනාව: එක තැනකින් define කරන registry එකක්

```
src/
  pages/
    registry.ts        ← page 38ම මෙතන (config විතරයි, UI නෑ)
    types.ts           ← PageDef discriminated union
    ListPage.tsx       ← shape A  (22 pages මේකෙන්)
    SettingsPage.tsx   ← shape B  (6)
    AnalyticsPage.tsx  ← shape C  (4)
    ChatPage.tsx       ← shape D  (1)
    QueuePage.tsx      ← shape F  (2)
    Notifications.tsx  ← දැනට ModulePreview එකේ තියෙන එක මෙතනට
    SupportPage.tsx
    CustomerPortal.tsx
    PageRenderer.tsx   ← shape එක අනුව component එක තෝරනවා
  components/
    PageHead.tsx  KpiStrip.tsx  Toolbar.tsx  DataTable.tsx
    DetailPanel.tsx  EmptyState.tsx  Pagination.tsx
  data/
    invoices.ts  customers.ts  payments.ts  warranty.ts  expenses.ts …
```

### Registry එකේ type එක (discriminated union)

```ts
// src/pages/types.ts
type BasePage = {
  label: string          // nav label = page key (දැනට තියෙන එකම)
  icon: IconName         // ← දැන් type-safe, typo එකක් compile error එකක්
  title: string          // h1
  subtitle: string       // page-head එකේ විස්තරය
  group: string          // breadcrumb: "Home / Billing / Invoices"
  roles: Role[]          // මේ page එක කාටද පේන්නේ
}

export type ListPageDef = BasePage & {
  shape: 'list'
  kpis: KpiDef[]                        // 3–5 KPI cards
  columns: ColumnDef[]
  rows: (ctx: PageCtx) => Row[]         // ← role-scoped data
  filters?: FilterDef[]
  searchKeys?: string[]
  primaryAction?: { label: string; icon: IconName; opens?: string }
  detail?: (row: Row) => DetailDef      // row click → detail drawer/page
}

export type SettingsPageDef = BasePage & { shape: 'settings'; sections: SettingsSection[] }
export type AnalyticsPageDef = BasePage & { shape: 'analytics'; kpis: KpiDef[]; charts: ChartDef[] }
export type ChatPageDef      = BasePage & { shape: 'chat'; suggestions: string[] }
export type QueuePageDef     = BasePage & { shape: 'queue'; columns: KanbanColumnDef[] }
export type CustomPageDef    = BasePage & { shape: 'custom'; component: ComponentType<PageProps> }

export type PageDef = ListPageDef | SettingsPageDef | AnalyticsPageDef
                    | ChatPageDef | QueuePageDef | CustomPageDef
```

### Registry එකේ page එකක් (මෙච්චරයි)

```ts
// src/pages/registry.ts
export const Invoices: ListPageDef = {
  label: 'Invoices', icon: 'file', group: 'Billing',
  title: 'Invoices', subtitle: 'Every invoice raised across your branches.',
  roles: ['Admin', 'Manager', 'Cashier', 'Customer'],
  shape: 'list',
  kpis: [
    { label: 'Total billed',  value: ctx => money(sum(ctx.rows, 'total')),   icon: 'file',    tone: 'blue' },
    { label: 'Paid',          value: ctx => count(ctx.rows, r => r.paid),     icon: 'check',   tone: 'cyan' },
    { label: 'Overdue',       value: ctx => count(ctx.rows, r => r.overdue),  icon: 'alert',   tone: 'pink' },
    { label: 'Outstanding',   value: ctx => money(sum(ctx.rows, r => r.due)), icon: 'wallet',  tone: 'amber' },
  ],
  filters: [
    { key: 'status', label: 'Status', options: ['All','Draft','Sent','Paid','Overdue'] },
    { key: 'branch', label: 'Branch', options: branchOptions },
  ],
  searchKeys: ['id', 'customer'],
  columns: [
    { key: 'id',       header: 'Invoice',  render: r => <IdCell id={r.id} sub={r.date} /> },
    { key: 'customer', header: 'Customer', render: r => <NameCell name={r.customer} sub={r.email} /> },
    { key: 'repair',   header: 'Repair',   render: r => <Link to={`Repair:${r.repairId}`}>{r.repairId}</Link>, hideOnMobile: true },
    { key: 'total',    header: 'Total',    align: 'right', render: r => money(r.total) },
    { key: 'status',   header: 'Status',   render: r => <Badge>{r.status}</Badge> },
  ],
  rows: ctx => invoices.filter(scope(ctx.user)),   // ← role scoping මෙතන
  primaryAction: { label: 'New invoice', icon: 'plus' },
  detail: r => invoiceDetail(r),
}
```

**Page එකක් එකතු කරන එක = මේ object එක ලියන එක විතරයි.** Component එකක් නෑ, CSS එකක් නෑ, routing එකක් නෑ.

### App.tsx එකේ routing එක මෙච්චරට කෙටි වෙනවා

```tsx
const def = pageRegistry[page]

<main>
  <PageHead def={def} user={user} />
  {def
    ? <PageRenderer def={def} ctx={ctx} navigate={navigate} />
    : <NotFoundPage page={page} />}     {/* ← stub එකක් නෙවෙයි, ඇත්ත error එකක් */}
</main>
```

### මේකෙන් review එකේ P1 bugs 5ක් එකපාර විසඳෙනවා

| Bug | registry එකෙන් විසඳෙන විදිය |
|---|---|
| Nav icon names type-safe නෑ (`icon as IconName`) | `icon: IconName` — typo එකක් **compile error** එකක් |
| `allowedPages` = `navPages` + `extraPages` අතින් | `Object.values(registry).filter(p => p.roles.includes(user.role))` |
| `navigate()` වැරදි page එකක් නිශ්ශබ්දව Dashboard එකට යවනවා | registry එකේ නැති page එකක් → `<NotFoundPage>` (පේනවා) |
| Deep links වැඩ කරන්නෙ නෑ | `slug` registry එකෙන් → `parseRoute(pathname)` |
| `roleNav` + routing දෙතැන | එකම `registry` එකෙන් දෙකම generate වෙනවා |

---

## 3. "හොඳ screen එකක්" කියන්නේ මොකක්ද? — Anatomy එක

Stub එකක් වගේ නොපේන්න, හැම screen එකකම මේ කොටස් 6 තියෙන්න ඕනේ:

```
┌─ 1. Page head ────────────────────────────────────────────┐
│  BILLING / INVOICES              [Export] [+ New invoice] │
│  Invoices                                                 │
│  Every invoice raised across your branches.               │
├─ 2. KPI strip (role-scoped, ඇත්ත ගණන්) ────────────────────┤
│  [Total billed]  [Paid]  [Overdue]  [Outstanding]         │
├─ 3. Toolbar ──────────────────────────────────────────────┤
│  [🔍 search…]  [Status ▾] [Branch ▾] [Date ▾]  [Filters]  │
├─ 4. Data table ───────────────────────────────────────────┤
│  Invoice    Customer     Repair      Total     Status     │
│  INV-1024   Nimal P.     FX-…4821    18,500    [Paid]     │  ← click → detail
├─ 5. Pagination (ඇත්ත ගණන්) ───────────────────────────────┤
│  Showing 1–12 of 48          [‹] [1] [2] [3] [›]          │
└───────────────────────────────────────────────────────────┘
```

**+ තව 2ක් තියෙන්නම ඕනේ:**
- **6. Empty state** — filter එකකින් result නැති වුණොත් "No invoices match these filters" + [Clear filters]
- **7. Detail drill-down** — row එකක් click කරාම ඒ record එකේම විස්තර (දැන් `RepairDetails` එකේ තියෙන bug එක මෙතන නැති කරගන්න)

### "සම්පූර්ණයි" කියලා පේන්න තියෙන කුඩා දේවල්

මේවා තමයි stub එකකුයි real screen එකකුයි වෙනස:

| දේ | දැන් | ඕනේ |
|---|---|---|
| Pagination count | `"Showing 5 authorized repairs"` | `"Showing 1–12 of 48"` (ඇත්ත ගණන) |
| Search box | type කරන්න පුළුවන්, filter වෙන්නෙ නෑ | ඇත්තටම filter වෙනවා |
| Filter dropdowns | button විතරයි | click කරාම menu එකක්, filter වෙනවා |
| Column headers | click කරන්න බෑ | sort වෙනවා (▲▼) |
| Row click | හැම එකම එකම record එකට | ඒ row එකේ record එකට |
| KPI numbers | hardcoded | දත්ත වලින් compute වෙනවා |

---

## 4. Data layer එක

දැන් `repairs` (5 records) + `products` (6) විතරයි තියෙන්නේ. Pages 38ක් පුරවන්න තව datasets ඕනේ:

```
src/data/
  invoices.ts      ~24 records   (id, date, customer, repairId, total, status, due, branchId)
  customers.ts     ~18
  payments.ts      ~20
  estimates.ts     ~12
  refunds.ts       ~6
  warranty.ts      ~10
  warrantyClaims.ts ~5
  expenses.ts      ~14
  suppliers.ts     ~8
  purchaseOrders.ts ~9
  stockMoves.ts    ~16  (adjustments + transfers)
  team.ts          ~7
  branches.ts      ~4
  auditLog.ts      ~20
  notifications.ts ~5 per role   (දැන් ModulePreview එකේ inline තියෙන එක මෙතනට)
```

**වැදගත්:** හැම record එකකම `branchId` + `customerId`/`technicianId` තියෙන්න ඕනේ — දැනට `recordsFor()` එකේ තියෙන role-scoping එකම මේවාටත් apply කරන්න. එතකොට Admin ට ඔක්කොම, Manager ට branch එක, Customer ට එයාගේ ඒවා විතරයි පේන්නේ. **Role-based access කියන product එකේ ප්‍රධාන selling point එක හැම page එකකම පේනවා.**

Data generate කරන්න helper එකක්:

```ts
// src/data/_make.ts
export const make = <T,>(n: number, fn: (i: number) => T): T[] =>
  Array.from({ length: n }, (_, i) => fn(i))
```

---

## 5. Phase plan එක

### Phase 0 — Foundation (මුලින්ම, එක page එකක්වත් නැතුව)
- `pages/types.ts`, `PageRenderer.tsx`
- `components/`: `PageHead`, `KpiStrip`, `Toolbar`, `DataTable`, `Pagination`, `EmptyState`, `DetailDrawer`
- `data/_make.ts` + `scope(user)` helper
- `registry.ts` (හිස්) + App.tsx routing එක registry එකට මාරු කරනවා
- `ModulePreview` එක **fallback එක විදියට තියාගන්නවා** — කිසිවක් regress වෙන්නේ නෑ
- **Deliverable:** දැනට තියෙන දේම පේනවා, නමුත් අලුත් page එකක් එකතු කරන්න පාරක් තියෙනවා

### Phase 1 — වැඩියෙන්ම roles වලට පේන pages 9 ⭐
Role count එක අනුව (මම ගණන් කරපු එක):

| Page | Roles | Shape |
|---|---|---|
| Invoices | **4** | list |
| Payments | **4** | list |
| Warranty | **4** | list |
| Customers | 3 | list |
| Sales | 3 | list |
| Estimates | 3 | list |
| Refunds | 3 | list |
| Warranty Claims | 3 | list |
| Profile | 3 | settings |

(Notifications එකට දැනටමත් 5 roles — ඒක මුලින්ම `ModulePreview` එකෙන් අයින් කරලා proper page එකක් කරන්න, ලාභයි.)

→ **Pages 9ක්, components 2ක්** (`ListPage`, `SettingsPage`). මේකෙන් Admin/Manager/Cashier/Customer හතරටම එකපාර වෙනස පේනවා.

### Phase 2 — ඉතුරු list pages 13
Purchase Orders, Suppliers, Stock Adjustments, Stock Transfers, Expenses, Receivables, Payables, Audit Log, Products, Team, User Management, Branches, Paid Deliveries, Repair History

→ අලුත් component එකක් ඕනේ නෑ. **registry එකට config 13ක් විතරයි.**

### Phase 3 — ඉතුරු shapes
- `AnalyticsPage` → Finance, Reports, Cashbook, Cash Register
- `SettingsPage` වලට තව → Settings, Workflow Settings, Integration Settings, Permissions, Branch Operations
- `ChatPage` → AI Assistant
- `QueuePage` → Parts, Testing
- Support, Customer Portal

### Phase 4 — Detail pages + polish
- හැම list එකකටම row-click detail (invoices, customers, POs…)
- Sort, multi-filter, export (CSV)
- Loading skeletons
- `ModulePreview` එක සම්පූර්ණයෙන්ම අයින් කරනවා

---

## 6. ඔයාගෙන් තීරණ 3ක් ඕනේ

**A. කොච්චර ගැඹුරටද?**
1. **Visual demo විතරයි** — දත්ත mock, buttons වැඩ කරන්නේ නෑ (දැනට තියෙන මට්ටම, නමුත් හැම page එකක්ම සම්පූර්ණයි). ← *prototype එකකට මේක ඇති*
2. **Interactive demo** — search/filter/sort/detail drill-down වැඩ කරනවා, නමුත් save වෙන්නේ නෑ
3. **Stateful demo** — create/edit/save වෙනවා (localStorage හෝ in-memory store එකක)

**B. Data volume එක:** page එකකට records කීයක්? (12–24 පේන්න හොඳයි; 100+ නම් pagination ඇත්තටම ඕනේ)

**C. භාෂාව:** UI එක දැන් සම්පූර්ණයෙන්ම English. ඒ වගේම තියාගන්නවද, නැත්නම් Sinhala/English toggle එකක් ඕනේද?

---

## 7. මේකෙන් අලුතෙන් ලැබෙන දේ

- Sidebar එකේ **47ම** button එකක් ඇත්ත screen එකකට යනවා (stub 0)
- හැම screen එකක්ම එකම design language එකෙන් — අතින් හදපු 38 screens වල එන inconsistency නෑ
- අලුත් page එකක් = **config object එකක්** (~30 lines), component එකක් නෙවෙයි
- Review එකේ P1 bugs 5ක් (type-safe icons, allowedPages, silent fallback, deep links, routing duplication) එකපාර විසඳෙනවා
- Role-based scoping එක හැම page එකකම පේනවා — demo එකේ ප්‍රධාන කතාව ශක්තිමත් වෙනවා

---

## 8. Risk / සැලකිය යුතු දේවල්

- **Over-abstraction:** registry එක වැඩිය generic කළොත් හැම page එකක්ම එක වගේ පේනවා. ඒ නිසා `shape: 'custom'` escape hatch එක තියාගන්න — විශේෂ pages (POS, AI Diagnosis, Repair Board) දැනට තියෙන විදියටම තියෙන්න ඕනේ
- **App.tsx split එක මේකට කලින් කරන එක ලේසි** — දැන් 617-line file එකක page 9ක් තව එකතු කරනවා කියන්නේ තව ප්‍රශ්නයක්
- **`index.css` එකත් split කරන්න ඕනේ** — අලුත් components වලට CSS ඕනේ වෙනවා; දැන් 42 kB එකම එක line එකක තියෙන file එකට දානවා කියන්නේ කළමනාකරණය කළ නොහැකි වෙන එක
- **CSS variant gaps** (`.badge.in-progress` වගේ) මුලින්ම fix කරන්න — නැත්නම් අලුත් pages 22ම ඒ bug එකෙන් පීඩා විඳිනවා

---

*සියලුම ගණන් (47 nav labels, 38 stub pages, shape breakdown එක, per-role counts) `roleNav` + `adminNav` parse කරපු script එකකින් මැනගත්තා.*
