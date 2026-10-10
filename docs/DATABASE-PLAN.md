# FixFlow — Database & Backend Plan (Firebase)

Status: **proposed**, not implemented. This is the design for moving FixFlow from hardcoded
mock data in `src/App.tsx` to a real, multi-branch, role-secured datastore.

## 1. Recommendation

| Decision | Choice | Why |
| --- | --- | --- |
| Database | **Cloud Firestore** (Native mode) | Chosen. Works with no server code from the browser. |
| Auth | **Firebase Auth** (email/password) + custom claims | Real auth; roles enforced server-side in Security Rules. |
| Server logic | **Cloud Functions for Firebase (2nd gen, TypeScript)** | Only for things a browser must not be trusted with. |
| Hosting | **Keep Figma Make for design iteration → deploy to Firebase Hosting** | Both are static builds; the Firebase Web SDK runs identically. |
| Client data layer | **TanStack Query + Firestore `onSnapshot`** | Caching, pagination, and realtime (the Repair Board can live-update). |

**The key point:** `.figma/make/deploy` runs `pnpm run build && figma make deploy --build-dir dist`
— it produces **static files only**, so there is nowhere to run a Node server. Firebase is the
right fit because Auth, Firestore and Security Rules are all reachable directly from the browser,
so FixFlow gets a real database *without* leaving the static deployment model.

### What still needs a server (Cloud Functions)

These are not optional — a browser cannot be trusted with them:

1. Assigning roles (custom claims).
2. Allocating sequential document numbers (`FX-2026-004821`, invoice numbers).
3. Stock ledger integrity (movement + balance must commit atomically).
4. Sale completion (sale + stock decrement + ledger + daily rollup in one transaction).
5. Recomputing derived fields (`available`, `isLowStock`, `daily_stats`, customer totals).
6. Calling the AI diagnosis provider (the API key must never ship to the browser).
7. Audit log and notification fan-out.

### Env / plan requirements

- **Local dev:** Firebase Local Emulator Suite — free, no billing account needed.
- **Deploy:** Cloud Functions require the **Blaze** plan. Blaze keeps the same no-cost
  allowances (50k reads/day, 20k writes/day, 2M function invocations/month) and only bills
  overages. Set a budget alert and a spend cap alert on day one.

---

## 2. Architecture

```
                       ┌──────────────────────────────┐
   Browser (static)    │  React 19 + Vite + Tailwind   │
   Figma Make /        │  ───────────────────────────  │
   Firebase Hosting ──►│  TanStack Query + onSnapshot  │
                       └───────┬──────────────┬────────┘
                               │              │
              reads/writes     │              │  callable functions
              (rule-checked)   │              │  (trusted)
                               ▼              ▼
                    ┌────────────────┐  ┌──────────────────────┐
                    │   Firestore    │  │  Cloud Functions v2  │
                    │  + Security    │◄─┤  (Admin SDK — bypass │
                    │    Rules       │  │   Security Rules)    │
                    └────────────────┘  └──────────┬───────────┘
                               ▲                   │
                               │                   ▼
                    ┌──────────┴─────────┐  ┌──────────────┐
                    │  Firebase Auth     │  │  AI provider │
                    │  + custom claims   │  │  (server key)│
                    └────────────────────┘  └──────────────┘
```

**Trust boundary:** the client may read and write *its own* business documents, but only within
the constraints of Security Rules. Every mutation that affects money, stock, identity or derived
totals goes through a callable function, which validates the caller's claims and commits
atomically with the Admin SDK.

---

## 3. Auth model

Firebase Auth holds the identity. Roles live in **custom claims** on the ID token, so Security
Rules can authorize without an extra document read.

```ts
// Custom claims (set server-side only, via Admin SDK)
type Claims = {
  role: "admin" | "manager" | "technician" | "cashier" | "customer";
  branchId: string;     // "all" for admin
  customerId?: string;  // customers only
  technicianId?: string;// technicians only
};
```

This maps 1:1 onto the existing `User` type in `src/App.tsx`, so `recordsFor()` — today a
client-side filter that anyone can bypass with DevTools — becomes a rule in Security Rules and a
`where()` clause in the query.

| Today (mock) | After |
| --- | --- |
| `localStorage["fixflow-session"]` | Firebase ID token, refreshed automatically |
| `password !== "Demo@123"` | Firebase Auth (hashed, salted; reset/password policies built in) |
| `recordsFor(user)` in the browser | `where('branchId','==',claims.branchId)` + Security Rules |
| `showFinancial={false}` for technicians | Financial fields in a separate doc the rules deny to technicians |

**Claim propagation:** claims are embedded in the ID token, so after changing a role the client
must call `user.getIdTokenResult(true)` to force a refresh before the new permissions apply.
Plan for that in the User Management screen.

**Customer portal:** customers are ordinary Firebase Auth users with `role: "customer"` and a
`customerId` claim — same sign-in screen, different claim.

---

## 4. Firestore schema

Notation: `?` optional, `⇢` denormalized copy (maintained by Cloud Functions), `🔒` client cannot
write (Cloud Functions only).

Common fields on almost every root collection: `branchId`, `createdAt` (Timestamp),
`updatedAt` (Timestamp), `createdBy` (uid), `searchText` (lowercased blob for prefix search).

### 4.1 Organisation

**`branches/{branchId}`**
`name`, `code` (`"colombo"`, `"kandy"`), `address`, `phone`, `managerId?`, `isActive`

**`users/{uid}`** — staff (doc id = Firebase Auth uid)
`email`, `displayName`, `role` (mirror of the claim, for admin listings), `branchId`, `phone?`,
`isActive`, `lastLoginAt`, `createdAt`

**`invites/{inviteId}`** — pending staff invitations (admin creates, function redeems)
`email`, `role`, `branchId`, `status`, `expiresAt`, `createdBy`

### 4.2 Customers

**`customers/{customerId}`**
`name`, `email?`, `phone`, `whatsapp?`, `address?`, `notes?`, `homeBranchId`,
`authUid?` (set when the customer has portal access),
`totals 🔒`: `{ lifetimeValue, repairCount, saleCount, outstandingBalance }`,
`searchName`, `searchPhone`

**`customers/{customerId}/devices/{deviceId}`** — device history for repeat customers
`type`, `brand`, `model`, `serial`, `imei?`, `firstSeenAt`, `lastRepairId`

### 4.3 Repairs (the core of the app)

**`repairs/{repairId}`** — `repairId` is the human-readable `FX-2026-004821`
`sequence` (number, for ordering), `repairId`, `branchId`,
`customerId`, `customerName ⇢`, `customerPhone ⇢`,
`device`: `{ type, brand, model, serial, imei?, condition, accessories }`,
`technicianId?`, `technicianName ⇢`,
`priority`: `"urgent" | "high" | "normal" | "low"`,
`status`: `"received" | "diagnosing" | "awaiting_approval" | "awaiting_parts" | "in_progress" | "testing" | "ready_for_pickup" | "delivered" | "cancelled"`,
`intake`: `{ complaint, observations?, receivedAt, receivedByUserId }`,
`eta` (Timestamp?), `completedAt?`, `deliveredAt?`,
`warranty`: `{ months, expiresAt? }`,
`estimateSummary ⇢`: `{ amount, status, approvedAt }`,
`searchText`

**`repairs/{repairId}/events/{eventId}`** — append-only timeline
`type`: `"status_change" | "note" | "part_added" | "estimate_sent" | "payment" | "customer_message"`,
`from?`, `to?`, `message`, `actorUserId`, `actorName ⇢`,
`visibility`: `"internal" | "customer"` ← drives what the customer portal shows,
`createdAt`

**`repairs/{repairId}/parts/{partId}`**
`productId`, `sku ⇢`, `name ⇢`, `qty`, `unitPrice`, `lineTotal`, `status`
(`"reserved" | "fitted" | "returned"`), `addedAt`, `addedByUserId`

**`repairs/{repairId}/financials/summary`** 🔒 — money, hidden from technicians
`labour`, `partsTotal`, `discount`, `tax`, `total`, `currency`, `balance`

> Splitting financials into their own document is what lets Security Rules deny the whole
> subcollection to technicians. Client-side `showFinancial={false}` alone is not a control.

### 4.4 Inventory

**`products/{productId}`**
`name`, `sku`, `category`, `brand?`, `unitCost`, `unitPrice`, `currency`,
`minStock` (reorder level), `isActive`,
`totals 🔒`: `{ onHand, reserved, available }` (all branches),
`stockStatus 🔒`: `"ok" | "low" | "critical"` — see §6,
`searchName`, `searchSku`

**`products/{productId}/stock/{branchId}`** 🔒
`branchId`, `onHand`, `reserved`, `available`, `updatedAt`

**`stock_movements/{movementId}`** 🔒 — append-only ledger, source of truth for stock
`productId`, `sku ⇢`, `productName ⇢`, `branchId`,
`type`: `"purchase_receipt" | "sale" | "repair_part" | "adjustment" | "transfer_in" | "transfer_out" | "return" | "count_correction"`,
`qty` (signed), `balanceAfter`, `unitCost?`,
`ref`: `{ type: "sale" | "repair" | "purchase_order" | "transfer" | "adjustment", id }`,
`note?`, `userId`, `createdAt`

**`stock_transfers/{transferId}`**
`transferNumber`, `fromBranchId`, `toBranchId`,
`status`: `"draft" | "in_transit" | "received" | "cancelled"`,
`lines[]`: `{ productId, sku, name, qty }`, `createdBy`, `createdAt`, `receivedAt?`, `receivedBy?`

**`suppliers/{supplierId}`**
`name`, `contactName?`, `email?`, `phone?`, `address?`, `paymentTerms?`, `isActive`

**`purchase_orders/{poId}`**
`poNumber`, `supplierId`, `supplierName ⇢`, `branchId`,
`status`: `"draft" | "sent" | "partial" | "received" | "cancelled"`,
`lines[]`: `{ productId, sku, name, qtyOrdered, qtyReceived, unitCost, lineTotal }`,
`totals`: `{ subtotal, tax, total }`, `expectedAt?`, `receivedAt?`, `createdBy`, `createdAt`

### 4.5 Sales & POS

**`sales/{saleId}`**
`saleNumber`, `branchId`, `customerId?`, `customerName ⇢` (null = walk-in),
`lines[]`: `{ productId, sku, name, qty, unitPrice, lineTotal }`,
`totals`: `{ subtotal, discount, tax, total, currency }`,
`payments[]`: `{ method: "cash" | "card" | "bank", amount, reference? }`,
`cashRegisterId?`, `userId`, `status`: `"completed" | "held" | "refunded"`, `createdAt`

**`cash_registers/{registerId}`** — till sessions
`branchId`, `code` (`"CR-C03-04"`), `openingFloat`, `openedByUserId`, `openedAt`,
`expectedCash 🔒`, `actualCash?`, `variance?`, `closedByUserId?`, `closedAt?`,
`status`: `"open" | "closed"`

### 4.6 Billing & finance

**`estimates/{estimateId}`**
`estimateNumber`, `repairId?`, `customerId`, `customerName ⇢`, `branchId`,
`lines[]`, `totals`, `status`: `"draft" | "sent" | "approved" | "rejected" | "expired"`,
`sentAt?`, `approvedAt?`, `expiresAt?`, `createdBy`, `createdAt`

**`invoices/{invoiceId}`**
`invoiceNumber`, `repairId?`, `saleId?`, `customerId`, `customerName ⇢`, `branchId`,
`lines[]`, `totals`: `{ subtotal, discount, tax, total, paid 🔒, balance 🔒 }`,
`status`: `"draft" | "issued" | "partially_paid" | "paid" | "overdue" | "cancelled"`,
`issuedAt?`, `dueAt?`, `createdBy`, `createdAt`

**`payments/{paymentId}`**
`paymentNumber`, `invoiceId`, `customerId`, `customerName ⇢`, `branchId`, `amount`,
`method`, `reference?`, `cashRegisterId?`, `receivedByUserId`, `receivedAt`

**`refunds/{refundId}`**
`refundNumber`, `saleId?`, `invoiceId?`, `customerId`, `branchId`, `amount`, `reason`, `method`,
`status`: `"requested" | "approved" | "rejected" | "processed"`,
`requestedByUserId`, `approvedByUserId?`, `createdAt`, `processedAt?`

**`expenses/{expenseId}`**
`branchId`, `category`, `amount`, `currency`, `description`, `vendor?`, `receiptUrl?`,
`incurredAt`, `createdByUserId`, `approvedByUserId?`,
`status`: `"pending" | "approved" | "rejected"`

**`warranty_claims/{claimId}`**
`claimNumber`, `repairId`, `customerId`, `customerName ⇢`, `branchId`, `issue`,
`status`: `"open" | "assessing" | "approved" | "rejected" | "resolved"`,
`resolution?`, `openedAt`, `closedAt?`

### 4.7 System

**`notifications/{uid}/items/{notificationId}`** 🔒 — per-user inbox (fan-out by function)
`title`, `body`, `type`, `icon`, `linkPage?`, `linkId?`, `readAt?`, `createdAt`

**`audit_log/{logId}`** 🔒 — append-only, never readable/writable by clients
`actorUid`, `actorName ⇢`, `actorRole ⇢`, `action`, `entityType`, `entityId`, `branchId`,
`summary` (human-readable), `changedFields[]`, `ip?`, `userAgent?`, `createdAt`

**`ai_diagnoses/{diagnosisId}`** 🔒
`repairId?`, `device`: `{ type, brand, model }`, `complaint`, `observations?`,
`result`: `{ causes[], inspectionSteps[], confidence }`, `model`, `provider`,
`technicianId`, `addedToNotes`, `createdAt`

**`settings/{docId}`** — `global`, `workflow`, `integrations`, `tax`
`workflow`: `{ statuses[], priorities[], defaultWarrantyMonths, autoAssign }`,
`integrations 🔒`: `{ paymentGateway?, smsProvider?, emailProvider? }`

**`counters/{counterId}`** 🔒 — sequential numbers, e.g. `repair_2026`, `invoice_2026`
`seq` (number), `prefix`, `year`, `updatedAt`

**`daily_stats/{yyyy-mm-dd}`** 🔒 — precomputed dashboard/reporting rollups
`salesTotal`, `salesCount`, `paymentsTotal`, `paymentsCount`, `expensesTotal`,
`repairsOpened`, `repairsClosed`, `avgRepairValue`, `outstandingTotal`, `lowStockCount`
**`daily_stats/{date}/by_branch/{branchId}`** 🔒 — same fields, per branch

---

## 5. Composite indexes to create

Firestore auto-indexes single fields; composite indexes must be declared in
`firestore.indexes.json`.

| Collection | Fields |
| --- | --- |
| `repairs` | `branchId ASC, status ASC, updatedAt DESC` |
| `repairs` | `branchId ASC, updatedAt DESC` |
| `repairs` | `technicianId ASC, status ASC, updatedAt DESC` |
| `repairs` | `customerId ASC, updatedAt DESC` |
| `repairs` | `status ASC, updatedAt DESC` (admin board, all branches) |
| `sales` | `branchId ASC, createdAt DESC` |
| `stock_movements` | `branchId ASC, createdAt DESC` |
| `stock_movements` | `productId ASC, createdAt DESC` |
| `invoices` | `branchId ASC, status ASC, dueAt ASC` |
| `products` | `category ASC, name ASC` |
| `products` | `stockStatus ASC, name ASC` (low-stock screen) |
| `expenses` | `branchId ASC, incurredAt DESC` |

Collection-group index for `repairs/{id}/events`: `visibility ASC, createdAt DESC`.

---

## 6. Firestore limitations this schema works around

| Limitation | Consequence | Mitigation in this design |
| --- | --- | --- |
| **No joins** | Cannot `JOIN customers` to render a repair row | Denormalize `customerName`, `customerPhone`, `technicianName`, `productName` onto the documents that display them; Cloud Functions keep the copies in sync. |
| **Cannot compare two fields in a query** | `where('available','<=','minStock')` is illegal | Store a computed `stockStatus` (`"ok" \| "low" \| "critical"`) on every stock write, then query `where('stockStatus','in',['low','critical'])`. |
| **No server-side `GROUP BY`** | Dashboard/report totals | Precomputed `daily_stats` docs maintained by triggers, plus a scheduled idempotent nightly rollup as a safety net. Ad-hoc queries use `count()` / `sum()` / `average()` aggregation queries, which bill ~1/1000th of a full read. |
| **1 write/second sustained on a single doc** | Hot counters | Sharded counters for high-volume counters; `counters/{name}` with `increment()` is fine at FixFlow's volume (tens/day). |
| **No full-text search** | Search box | Prefix search on `searchText` (`>= q` and `<= q + '\uf8ff'`). Full-text later via the Algolia/Typesense extension if needed. |
| **Doc size limit 1 MiB, 20k field limit** | Embedded arrays | Line items are embedded (bounded, tens per doc); unbounded sets (events, movements, notifications, audit) are separate collections. |
| **Security Rules cannot do arithmetic on stock safely across docs** | Race conditions | Stock and money mutations run through callable functions using `runTransaction`. |

---

## 7. Security Rules (sketch)

```js
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    function signedIn()  { return request.auth != null; }
    function role()      { return request.auth.token.role; }
    function myBranch()  { return request.auth.token.branchId; }
    function isAdmin()   { return signedIn() && role() == 'admin'; }
    function isStaff()   { return signedIn() && role() in ['admin','manager','technician','cashier']; }
    function inMyBranch(doc) { return isAdmin() || doc.branchId == myBranch(); }
    function unchanged(fields) {
      return request.resource.data.diff(resource.data).affectedKeys().hasOnly(fields);
    }

    // Derived / system data: clients never write these.
    match /counters/{id}          { allow read: if isStaff(); allow write: if false; }
    match /audit_log/{id}         { allow read: if isAdmin(); allow write: if false; }
    match /stock_movements/{id}   { allow read: if isStaff(); allow write: if false; }
    match /daily_stats/{d}        { allow read: if isStaff(); allow write: if false; }
    match /ai_diagnoses/{id}      { allow read, write: if false; } // callable function only

    // Technician scoping + financial privacy.
    match /repairs/{repairId} {
      allow read: if isAdmin()
        || (isStaff() && resource.data.branchId == myBranch()
            && (role() != 'technician' || resource.data.technicianId == request.auth.uid))
        || (role() == 'customer' && resource.data.customerId == request.auth.token.customerId);
      allow create: if isStaff() && request.resource.data.branchId == myBranch();
      allow update: if isStaff() && inMyBranch(resource.data);
      allow delete: if false; // cancel via status change, never delete

      match /events/{eventId} {
        allow read: if isAdmin()
          || (isStaff() && inMyBranch(resource.data == null ? null : resource.data))
          || (role() == 'customer' && resource.data.visibility == 'customer');
        allow write: if isStaff();
      }

      match /financials/{doc} {
        allow read: if isAdmin() || role() in ['manager','cashier'];   // NOT technician
        allow write: if false;
      }
    }

    match /customers/{customerId} {
      allow read: if isAdmin()
        || (isStaff() && resource.data.homeBranchId == myBranch())
        || (role() == 'customer' && customerId == request.auth.token.customerId);
      allow create, update: if isStaff();
      allow delete: if isAdmin();
    }

    match /products/{productId} {
      allow read: if isStaff();
      allow create, update: if isAdmin() || role() == 'manager';
      allow delete: if isAdmin();
      match /stock/{branchId} {
        allow read: if isStaff();
        allow write: if false; // only the stock transaction function
      }
    }

    match /users/{uid} {
      allow read: if isAdmin() || request.auth.uid == uid
                  || (role() in ['manager'] && resource.data.branchId == myBranch());
      allow update: if isAdmin() || (request.auth.uid == uid && unchanged(['displayName','phone']));
      allow create, delete: if false; // via callable function
    }

    match /settings/{docId} {
      allow read: if isStaff();
      allow write: if isAdmin();
    }
  }
}
```

**Rules must be tested.** Add `firestore.rules` unit tests (`@firebase/rules-unit-testing`) run
against the emulator in CI — this is the real regression suite for the authorization model.

---

## 8. Cloud Functions (2nd gen, TypeScript)

Callable (validated against `request.auth.token`):

| Function | Transaction scope |
| --- | --- |
| `createStaffUser` (admin only) | Create Auth user → set custom claims → write `users/{uid}` → audit log |
| `setUserRole` (admin only) | Update claims + `users/{uid}.role` → force-refresh hint to client |
| `createRepair` | `counters/repair_YYYY` increment → repair doc → first event |
| `updateRepairStatus` | Validate transition → repair doc → event → notifications fan-out |
| `completeSale` | `sales/{id}` + `products/{id}/stock/{branch}` decrement + `stock_movements` + `daily_stats` + `customers/{id}.totals` |
| `adjustStock` / `transferStock` | `stock_movements` + both branch balances + `products.totals` + recompute `stockStatus` |
| `receivePurchaseOrder` | PO lines → stock increments → movements → supplier totals |
| `recordPayment` / `refundPayment` | `payments/{id}` + `invoices/{id}.totals.paid/balance` + `daily_stats` |
| `openRegister` / `closeRegister` | `cash_registers/{id}` + expected cash from payments |
| `runAiDiagnosis` | Call the AI provider with the server-side key → write `ai_diagnoses` |

Triggers and scheduled jobs:

| Trigger | Job |
| --- | --- |
| `onDocumentWritten('products/{id}/stock/{branch}')` | Recompute `available`, `stockStatus`, `products/{id}.totals` |
| `onDocumentCreated('sales/{id}')` | Update `daily_stats` (safety net for the callable) |
| `onDocumentWritten('repairs/{id}')` | Customer-facing notification fan-out |
| `scheduled('every day 00:30')` | Idempotent nightly rollup of `daily_stats` + `lowStockCount` |
| `onDocumentWritten('settings/*')` | Audit log entry |

---

## 9. Repo layout

Keep Cloud Functions **outside** `FixFlow UI Design/` — `.figma/make/install` runs
`pnpm install` there, and a nested Node package would break the Figma Make toolchain.

```
FixFlow/
├── FixFlow UI Design/            # existing app (unchanged ownership)
│   └── src/
│       ├── lib/firebase.ts       # initializeApp + emulator wiring
│       ├── lib/auth.tsx          # AuthProvider: claims -> User
│       ├── types/domain.ts       # TS types mirroring the collections above
│       ├── data/                 # repository functions (repairs.ts, sales.ts, ...)
│       └── hooks/                # useRepairs, useProducts, ... (TanStack Query)
├── backend/                      # NEW — Cloud Functions, own package.json
│   ├── functions/src/
│   ├── firestore.rules
│   ├── firestore.indexes.json
│   ├── firebase.json
│   └── storage.rules
├── docs/DATABASE-PLAN.md         # this file
└── README.md
```

---

## 10. Phased rollout

| Phase | Scope | Outcome |
| --- | --- | --- |
| **0** | Firebase project, emulators, `firebase.json`, `types/domain.ts`, seed script | Local Firestore running with the 5 demo users |
| **1** | Real auth: `AuthProvider`, sign-in/out, password reset, route guards on claims | `localStorage` role hack removed |
| **2** | Branches, users, customers, products + stock (read paths + Security Rules) | Inventory and Customers screens are live data |
| **3** | Repairs: list, board (realtime), create wizard, detail, events timeline | Core workflow persisted |
| **4** | POS: catalog, cart, `completeSale` function, stock ledger, cash register | Sales decrement real stock atomically |
| **5** | Billing: estimates, invoices, payments, refunds | Money moves through functions only |
| **6** | Purchasing: suppliers, POs, stock transfers, adjustments | Stock replenishment closed loop |
| **7** | Notifications + audit log + expenses | Operations visibility |
| **8** | `daily_stats` rollups, Reports screen, AI diagnosis function | Dashboard numbers become real |
| **9** | Hardening: App Check, rules unit tests, index deploy, backups, budget alerts | Production ready |

Phases 0–4 are the "it's a real product now" milestone; 5–9 are depth.

---

## 11. Cost estimate

Spark no-cost allowances (also the Blaze free tier): 50k reads/day, 20k writes/day,
20k deletes/day, 1 GiB stored, 10 GB hosting.

Rough shape for one branch, ~5 staff, ~50 repairs and ~30 sales/day:

| Activity | Reads/day |
| --- | --- |
| Dashboard loads (denormalized `daily_stats` + 2 lists of 25) | ~5,000 |
| Repair board realtime listeners | ~3,000 |
| POS catalog + sale writes | ~2,000 |
| Other screens, search, navigations | ~5,000 |
| **Total** | **~15,000 reads/day** — comfortably inside Spark |

Cost risks to watch:

- **Reading whole collections.** Every list must be `limit()`ed and paginated.
- **Realtime listeners on large collections.** Attach `onSnapshot` to filtered, limited queries
  only.
- **Denormalization fan-out.** Renaming a customer should not rewrite 500 repairs — only store
  copies that the UI actually renders, and let the trigger update lazily.
- **Cloud Functions triggered by their own writes.** Guard against infinite trigger loops.

Enable **App Check** (reCAPTCHA Enterprise) early so only the real FixFlow client can call the
API — otherwise anyone with the public config can burn your quota.

---

## 12. Risks and honest trade-offs

1. **Firestore is not relational.** Reports that need multi-table grouping (e.g. "margin by
   product category per branch per month") must be precomputed. If reporting becomes the core of
   the product, add a warehouse: export Firestore to BigQuery (official extension) and build
   reports there. Firebase also offers **Data Connect** (Postgres-backed) if you later want a
   relational model on the same platform.
2. **Vendor lock-in.** Firestore data modeling is Firebase-specific; migrating out later is real
   work. Mitigated by keeping domain logic in `src/data/*` repositories behind typed interfaces.
3. **Blaze is required** for Cloud Functions, so a card is on file even when usage is free. Set
   budget alerts.
4. **Rules are code and can be wrong.** They need tests, and a rule mistake is a data breach.
   Ship `rules-unit-testing` in CI from Phase 1, not Phase 9.
5. **Two sources of truth during migration.** The app currently renders mock data from
   `src/App.tsx`. Plan for a feature flag (`VITE_USE_FIREBASE`) so the mock-data build keeps
   working while collections come online one screen at a time.
