# Fix Flow — Firebase backend

This is the Firestore/Storage/Auth layer behind the existing Fix Flow UI. It is
production-shaped, not a demo: every collection has a typed document model,
every write goes through a service that validates first, and money is integer
cents end to end.

---

## ⚠️ Read this first — what is and is not verified

**Verified in this environment**

| Check | Result |
| --- | --- |
| `pnpm run typecheck` (`tsc --noEmit`) | exit 0 — every Firebase call is checked against the real `firebase@13.0.0` types |
| `pnpm run test` | **106 passed** (58 new Firebase logic + 18 repository + 30 CSV) |
| `pnpm run build` | exit 0 |

**NOT verified, and why.** Outbound network from this workspace reaches only
`github.com`, `npmjs.org` and `pypi.org`. `firebase.google.com`,
`firestore.googleapis.com` and `identitytoolkit.googleapis.com` are all
unreachable, so:

- no Firebase project could be created or reached;
- **auth, Firestore CRUD, Storage uploads and the security rules have never
  been executed against a backend**;
- the rules files are structurally checked only (balanced braces/parens) —
  they have **not** been through `firebase deploy`, which is what actually
  compiles them;
- **the React screens are not yet wired to these services** (see
  [Remaining work](#remaining-work)).

Typechecking against the real SDK catches wrong function names, wrong argument
shapes and wrong imports — which is how 16 real errors were found and fixed
here, including a `CollectionReference.doc()` call that does not exist in the
modular API. It does **not** prove a query returns rows or that a rule allows a
write. Treat this layer as unexercised until the checklist below is run
against your project.

---

## Database structure

Nine collections. Money is always integer cents; timestamps are Firestore
`Timestamp`; document types live in `src/firebase/types.ts`.

```
users/{uid}                        identity + profile + role
  └── notifications/{id}           per-user feed (subcollection)

repair_requests/{requestId}
  └── parts/{repairPartId}         repair <-> spare part join (subcollection)

repair_diagnosis/{diagnosisId}     top-level, indexed by requestId
repair_updates/{updateId}          append-only timeline, indexed by requestId
technicians/{technicianId}         trade profile, linked to users/{uid}
spare_parts/{partId}
invoices/{invoiceId}
payments/{paymentId}
```

Two deliberate choices:

- **Notifications are a subcollection of `users`.** Ownership is then just the
  path segment, so `firestore.rules` can scope a customer's feed with
  `request.auth.uid == uid` and nothing else. A customer cannot read another
  customer's feed even with a hand-crafted query.
- **Used parts are a subcollection of the repair.** The join travels with its
  parent, so deleting a repair cannot orphan part lines, and a technician
  reads one document's subcollection instead of running a query.

### Field summary

**`users`** — `uid`, `fullName`, `email`, `phone`, `address`, `profileImage`
(Storage URL), `role`, `status` (`active|disabled`), `branchId`, `createdAt`,
`updatedAt`.

**`repair_requests`** — `requestId`, `customerId`, `customerName`,
`customerPhone`, `branchId`, `deviceType`, `brand`, `model`, `serialNumber`,
`issueDescription`, `issueImages[]` (Storage URLs), `preferredDate`,
`priority`, `status`, `assignedTechnicianId`, `createdAt`, `updatedAt`.

Statuses, in workflow order: `pending → approved → diagnosing → repairing →
waiting_for_parts → completed → delivered`, plus `cancelled` reachable from any
non-terminal state. `delivered` and `cancelled` are terminal. Transitions live
in `ALLOWED_TRANSITIONS` (`src/services/repairService.ts`) and are tested.

**`repair_diagnosis`** — `diagnosisId`, `requestId`, `symptoms[]`,
`possibleProblems[]`, `suggestedSolutions[]`, `recommendedActions[]`,
`confidence` (0–100 **or null**), `technicianNotes`, `source`
(`technician|ai`), `createdAt`.

**`repair_updates`** — `updateId`, `requestId`, `status`, `message`,
`updatedBy`, `updatedByName`, `createdAt`.

**`technicians`** — `technicianId`, `userId`, `fullName`, `specialization`,
`experience`, `availability`, `skills[]`, `documents[]` (Storage URLs),
`branchId`, `status`, `createdAt`, `updatedAt`.

**`spare_parts`** — `partId`, `partName`, `category`, `compatibleDevices[]`,
`quantity`, `minQuantity`, `unitPrice`, `supplier`, `status`, `createdAt`,
`updatedAt`.

**`invoices`** — `invoiceId`, `requestId`, `customerId`, `branchId`,
`laborCost`, `partsCost`, `discount`, `taxRate`, `tax`, `totalAmount`,
`amountPaid`, `invoiceStatus`, `documentUrl`, `createdAt`, `updatedAt`.

**`payments`** — `paymentId`, `invoiceId`, `requestId`, `customerId`, `amount`,
`paymentMethod`, `paymentStatus`, `transactionId`, `note`, `paidAt`,
`createdAt`.

---

## Invariants enforced in code

| Invariant | Where |
| --- | --- |
| `Total = Labor + Parts + Tax − Discount` | `computeInvoice()`, `src/utils/formatters.ts` — the only place the total is derived. Tax applies to the *discounted* base. |
| `totalAmount` is never accepted from a client | `createInvoice` / `updateInvoice` recompute it every write |
| `partsCost` comes from the live parts lines | `recalcPartsCost()` |
| `amountPaid` is the sum of `paid` payments | `syncInvoiceFromPayments()` |
| Stock never goes negative | `adjustStock` / `addPartToRepair` inside `runTransaction` |
| A repair cannot skip a workflow step | `canTransition()`, checked against a fresh read |
| A discount cannot exceed the subtotal | clamped in `computeInvoice`, rejected in `validateInvoice` |
| Dashboard numbers are always queried | `fetchRepairCounts()`, `fetchRevenueStats()` — there are no static figures |

`computeInvoice` has 11 unit tests covering the formula, rounding, clamping
and status derivation.

---

## Roles

The specification names three roles; the existing UI ships five and must not be
redesigned, so all five are modelled.

| Role | Staff | Assign techs | Manage parts | Manage users | Branch-scoped |
| --- | :-: | :-: | :-: | :-: | :-: |
| `customer` | – | – | – | – | – |
| `technician` | ✓ | – | – | – | ✓ |
| `cashier` | ✓ | – | – | – | ✓ |
| `manager` | ✓ | ✓ | ✓ | – | ✓ |
| `admin` | ✓ | ✓ | ✓ | ✓ | – |

`ROLE_PERMISSIONS` in `src/firebase/types.ts` drives the UI; `firestore.rules`
is the authority.

### The anti-self-promotion rule

**Role is read from a custom token claim, never from the user document.**
`users/{uid}.role` is a field the client can write — if the rules trusted it,
any signed-in customer could make themselves admin. So:

```
request.auth.token.role        ← authoritative, set only by the Admin SDK
users/{uid}.role               ← a mirror for display, NOT trusted by rules
```

You must issue the claim yourself (this needs a trusted backend; it cannot be
done from the browser):

```js
// Cloud Function or your own Admin-SDK script
await admin.auth().setCustomUserClaims(uid, { role: 'manager', branchId: 'colombo' })
// the user must sign out and back in for the new claim to take effect
```

On top of that, the rules block a customer from writing `role`, `status`,
`uid`, `email` or `createdAt` on their own document, and the service layer
strips those fields before the write.

---

## Security rules

`firestore.rules` — 11 match blocks, 38 allow rules, deny by default.
`storage.rules` — 6 folders, 10 MB ceiling, content-type gated.

| Path | Customer | Technician | Cashier | Manager | Admin |
| --- | :-: | :-: | :-: | :-: | :-: |
| `users/{self}` | read + edit own fields | ✓ | ✓ | ✓ | ✓ |
| `users/{other}` | – | read | read | read | read/write |
| `users/{uid}/notifications` | own only | own only | own only | own only | all |
| `repair_requests` | own only | assigned only | branch | all | all |
| `repair_requests/{id}/parts` | read own | write if assigned | – | ✓ | ✓ |
| `repair_diagnosis` | read own repair | write if assigned | read | ✓ | ✓ |
| `repair_updates` | read own | append | append | append | + delete |
| `spare_parts` | read | read + decrement | read | ✓ | ✓ |
| `invoices` | own only | read | ✓ | ✓ | ✓ |
| `payments` | own only | read | create | ✓ | + refund/delete |

Storage paths are `{folder}/{ownerId}/{name}`, and the `ownerId` segment is what
makes ownership checkable. Firestore stores **only the download URL**, never
bytes.

---

## Files

**New**

```
src/firebase/config.ts          env-driven init, clear error if unconfigured
src/firebase/types.ts           every document type + role permissions
src/firebase/auth.ts            sign-in, profiles, claims, password reset
src/firebase/firestore.ts       collection paths, refs, listener helper
src/firebase/storage.ts         validated uploads -> download URL
src/firebase/errors.ts          Firebase error codes -> plain sentences
src/services/userService.ts
src/services/repairService.ts
src/services/diagnosisService.ts
src/services/technicianService.ts
src/services/partsService.ts
src/services/invoiceService.ts
src/services/paymentService.ts
src/services/notificationService.ts
src/utils/validation.ts         framework-free, side-effect free
src/utils/formatters.ts         money, dates, labels, computeInvoice
src/utils/firebase-logic.test.ts   58 tests
firestore.rules
storage.rules
.env.example
```

**Modified** — `package.json` (+`firebase@13.0.0`), `pnpm-lock.yaml`,
`src/vite-env.d.ts` (typed env), `.gitignore` (`!.env.example`).

No existing component was removed and no layout was changed.

---

## Setup

```bash
cd "FixFlow UI Design"
cp .env.example .env        # fill in from Firebase console > Project settings
pnpm install

# deploy the rules — this is the step that actually enforces security
npm i -g firebase-tools
firebase login
firebase use --add          # pick your project; rules files are in this folder
firebase deploy --only firestore:rules,storage

# enable Email/Password in the console:
#   Authentication > Sign-in method > Email/Password > Enable
```

Then issue role claims for your staff (Admin SDK, see above) and sign each user
out and back in.

---

## Remaining work

**The React screens are not yet connected to these services.** The backend
layer is complete and compiles, but `App.tsx` still renders its existing data.
Wiring is the next task and needs decisions about the five-role UI. It also
cannot be runtime-tested from this workspace — there is no reachable Firebase
backend here.

Concretely still to do:

1. An `AuthProvider` + session context so screens can read the current role.
2. Replace the mock data behind the admin dashboard KPIs with
   `fetchRepairCounts()` / `fetchRevenueStats()`.
3. Build the customer request form against `createRepairRequest()`.
4. Build the technician queue against `subscribeAssignedRepairs()`.
5. Loading, empty and error states per screen (`errorMessage()` is ready).
6. Confirmation dialogs on destructive actions.
7. Run the 15-point test checklist against a real project.

One open question worth settling before wiring: the Technician and Customer
roles currently have **no nav route** to the products/inventory screens, and
their dashboards are not reachable from the existing navigation.
