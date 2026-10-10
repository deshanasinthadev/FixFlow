import type {
  AuditLog,
  Branch,
  CashSession,
  Customer,
  CustomerApproval,
  Device,
  Diagnosis,
  Estimate,
  Expense,
  FileAttachment,
  GoodsReceipt,
  InventoryBalance,
  Invoice,
  Notification,
  Payment,
  PersistedState,
  Product,
  ProductCategory,
  PurchaseOrder,
  Refund,
  RepairEvent,
  RepairJob,
  RepairPart,
  Sale,
  StockMovement,
  StockReservation,
  Supplier,
  User,
  Warranty,
  WarrantyClaim,
} from "../domain/types";
import { createSeedDatabase } from "./seedData";

/**
 * Browser-local persistence for the approved demo.
 *
 * Deliberately narrow surface — `load()` and `save()` are the only things the
 * app knows about storage, so replacing this file with an API client is the
 * entire migration to a production backend.
 */

export const STORAGE_KEY = "fixflow.demo.v1";
export const CORRUPT_BACKUP_KEY = "fixflow.demo.v1.corrupt";
export const SCHEMA_VERSION = 1;

/** Migrations run in order from the stored version to SCHEMA_VERSION. */
type Migration = (state: PersistedState) => PersistedState;

const MIGRATIONS: Record<number, Migration> = {
  // Example for the next schema change:
  // 1: (state) => ({ ...state, schemaVersion: 2, db: addField(state.db) }),
};

function emptyCollection<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

/**
 * Repairs structural damage rather than throwing the data away: any missing
 * collection is restored, and the object is always returned in a usable shape.
 */
function normalise(state: PersistedState): PersistedState {
  const db = state.db;
  const seeded = createSeedDatabase();
  const safe = {
    ...db,
    business: { ...seeded.business, ...db.business },
    branches: emptyCollection<Branch>(db.branches),
    users: emptyCollection<User>(db.users),
    customers: emptyCollection<Customer>(db.customers),
    devices: emptyCollection<Device>(db.devices),
    repairs: emptyCollection<RepairJob>(db.repairs),
    repairEvents: emptyCollection<RepairEvent>(db.repairEvents),
    repairParts: emptyCollection<RepairPart>(db.repairParts),
    diagnoses: emptyCollection<Diagnosis>(db.diagnoses),
    estimates: emptyCollection<Estimate>(db.estimates),
    approvals: emptyCollection<CustomerApproval>(db.approvals),
    categories: emptyCollection<ProductCategory>(db.categories),
    products: emptyCollection<Product>(db.products),
    inventory: emptyCollection<InventoryBalance>(db.inventory),
    stockMovements: emptyCollection<StockMovement>(db.stockMovements),
    stockReservations: emptyCollection<StockReservation>(db.stockReservations),
    suppliers: emptyCollection<Supplier>(db.suppliers),
    purchaseOrders: emptyCollection<PurchaseOrder>(db.purchaseOrders),
    goodsReceipts: emptyCollection<GoodsReceipt>(db.goodsReceipts),
    sales: emptyCollection<Sale>(db.sales),
    invoices: emptyCollection<Invoice>(db.invoices),
    payments: emptyCollection<Payment>(db.payments),
    refunds: emptyCollection<Refund>(db.refunds),
    warranties: emptyCollection<Warranty>(db.warranties),
    warrantyClaims: emptyCollection<WarrantyClaim>(db.warrantyClaims),
    expenses: emptyCollection<Expense>(db.expenses),
    cashSessions: emptyCollection<CashSession>(db.cashSessions),
    notifications: emptyCollection<Notification>(db.notifications),
    attachments: emptyCollection<FileAttachment>(db.attachments),
    auditLogs: emptyCollection<AuditLog>(db.auditLogs),
    sequences: db.sequences ?? {},
  };
  return { schemaVersion: SCHEMA_VERSION, db: safe, session: state.session ?? null };
}

export function createInitialState(): PersistedState {
  return { schemaVersion: SCHEMA_VERSION, db: createSeedDatabase(), session: null };
}

/**
 * Reads the saved state.
 *
 * Returns a seeded database when nothing is stored yet. If the stored JSON is
 * unreadable or structurally wrong, the raw value is preserved under
 * `fixflow.demo.v1.corrupt` so nothing is silently destroyed, and the app boots
 * from seed instead of crashing on a white screen.
 */
export function load(): PersistedState {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(STORAGE_KEY);
  } catch {
    // Storage can be blocked entirely (private mode, disabled cookies).
    return createInitialState();
  }
  if (!raw) return createInitialState();

  try {
    const parsed = JSON.parse(raw) as Partial<PersistedState>;
    if (!parsed || typeof parsed !== "object" || !parsed.db) {
      throw new Error("stored payload is not a FixFlow database");
    }
    let state = parsed as PersistedState;
    const storedVersion = typeof state.schemaVersion === "number" ? state.schemaVersion : 0;
    for (let version = storedVersion; version < SCHEMA_VERSION; version += 1) {
      const migrate = MIGRATIONS[version];
      if (migrate) state = migrate(state);
    }
    return normalise({ ...state, schemaVersion: SCHEMA_VERSION });
  } catch (error) {
    try {
      window.localStorage.setItem(CORRUPT_BACKUP_KEY, raw);
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* nothing more we can do */
    }
    console.warn("[FixFlow] Stored demo data was unreadable and has been reset.", error);
    return createInitialState();
  }
}

let saveTimer: number | undefined;

/** Persists state. Writes are debounced so rapid mutations coalesce. */
export function save(state: PersistedState): void {
  if (saveTimer !== undefined) window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ ...state, schemaVersion: SCHEMA_VERSION }),
      );
    } catch (error) {
      console.error("[FixFlow] Could not save demo data.", error);
    }
  }, 120);
}

/** Writes immediately — use before navigation that may unload the page. */
export function saveNow(state: PersistedState): void {
  if (saveTimer !== undefined) {
    window.clearTimeout(saveTimer);
    saveTimer = undefined;
  }
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...state, schemaVersion: SCHEMA_VERSION }));
  } catch (error) {
    console.error("[FixFlow] Could not save demo data.", error);
  }
}

/** Clears demo data and restores the seeded database. */
export function resetToSeed(): PersistedState {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
  return createInitialState();
}

export function hasCorruptBackup(): boolean {
  try {
    return window.localStorage.getItem(CORRUPT_BACKUP_KEY) !== null;
  } catch {
    return false;
  }
}
