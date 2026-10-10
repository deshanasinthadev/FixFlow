import { computeTotals } from "../domain/calculations";
import { cents as toCents } from "../domain/money";
import type {
  Branch,
  BusinessSettings,
  Customer,
  Database,
  Device,
  Estimate,
  Expense,
  InventoryBalance,
  Invoice,
  Payment,
  Product,
  ProductCategory,
  RepairEvent,
  RepairJob,
  RepairPart,
  Sale,
  Supplier,
  TestingChecklistItem,
  User,
  Warranty,
  WarrantyClaim,
} from "../domain/types";

/**
 * Seeded demonstration data.
 *
 * This is DEMO CONTENT, not a live database — every figure below is invented
 * for the prototype. The dashboard, reports and stock figures are all computed
 * from these records at runtime, so changing a sale here changes the numbers
 * on screen; nothing in the UI is hardcoded.
 *
 * Stock note: seeded inventory balances are the *current* on-hand figures. One
 * "opening count" movement per product/branch is written at seed time, so the
 * movement ledger reconciles from that point forward. Transactions dated before
 * the seed deliberately have no movements — they pre-date the opening count.
 */

const DEMO_PASSWORD = "Demo@123";

const NOW = new Date();

function at(daysOffset: number, hour = 10, minute = 0): string {
  const date = new Date(NOW);
  date.setDate(date.getDate() + daysOffset);
  date.setHours(hour, minute, 0, 0);
  return date.toISOString();
}

function day(daysOffset: number): string {
  return at(daysOffset).slice(0, 10);
}

function inDays(days: number): string {
  return day(days);
}

function monthsFromNow(months: number): string {
  const date = new Date(NOW);
  date.setMonth(date.getMonth() + months);
  return date.toISOString().slice(0, 10);
}

let sequence = 0;
function id(prefix: string): string {
  sequence += 1;
  return `${prefix}-${String(sequence).padStart(4, "0")}`;
}

/* ------------------------------------------------------------------ */
/* Business and branches                                               */
/* ------------------------------------------------------------------ */

const business: BusinessSettings = {
  name: "FixFlow",
  tagline: "Smart repair management",
  address: "No. 42, Galle Road, Colombo 03",
  phone: "+94 11 234 5678",
  email: "hello@fixflow.lk",
  registrationNo: "PV 00218456",
  currency: "LKR",
  currencySymbol: "Rs.",
  locale: "en-LK",
  timezone: "Asia/Colombo",
  taxEnabled: false,
  taxLabel: "VAT",
  taxRatePercent: 0,
  receiptFooter: "Thank you for choosing FixFlow. Service warranty applies as stated on your invoice.",
  defaultWarranty: { repairMonths: 3, productMonths: 12, partMonths: 6 },
  numbering: {
    repair: "FX",
    estimate: "EST",
    invoice: "INV",
    sale: "POS",
    payment: "PAY",
    purchaseOrder: "PO",
    warranty: "WRN",
    claim: "CLM",
  },
  paymentMethods: [
    { id: "cash", label: "Cash", enabled: true },
    { id: "card", label: "Card", enabled: true },
    { id: "bank", label: "Bank transfer", enabled: true },
    { id: "other", label: "Other", enabled: false },
  ],
};

const branches: Branch[] = [
  {
    id: "br-colombo",
    name: "Colombo 03",
    code: "CBO-03",
    address: "No. 42, Galle Road, Colombo 03",
    phone: "+94 11 234 5678",
    email: "colombo@fixflow.lk",
    managerId: "usr-manager",
    isActive: true,
    createdAt: at(-720),
  },
  {
    id: "br-kandy",
    name: "Kandy",
    code: "KDY-01",
    address: "No. 18, Peradeniya Road, Kandy",
    phone: "+94 81 223 4455",
    email: "kandy@fixflow.lk",
    managerId: "usr-manager-kandy",
    isActive: true,
    createdAt: at(-540),
  },
];

/* ------------------------------------------------------------------ */
/* Users                                                               */
/* ------------------------------------------------------------------ */

function user(
  key: string,
  name: string,
  email: string,
  role: User["role"],
  branchId: string,
  phone?: string,
): User {
  return {
    id: `usr-${key}`,
    name,
    email,
    phone,
    role,
    branchId,
    isActive: true,
    demoPassword: DEMO_PASSWORD,
    createdAt: at(-700),
  };
}

const users: User[] = [
  user("admin", "Admin Perera", "admin@fixflow.com", "admin", "all", "+94 71 200 1001"),
  user("manager", "Kaveesha Gehan", "manager@fixflow.com", "manager", "br-colombo", "+94 71 200 1002"),
  user("manager-kandy", "Nilanka Rajapakse", "manager.kandy@fixflow.com", "manager", "br-kandy", "+94 71 200 1003"),
  user("tech1", "John Silva", "technician@fixflow.com", "technician", "br-colombo", "+94 71 200 1004"),
  user("tech2", "Kasun Fernando", "technician2@fixflow.com", "technician", "br-colombo", "+94 71 200 1005"),
  user("tech-kandy", "Anushka Perera", "technician.kandy@fixflow.com", "technician", "br-kandy", "+94 71 200 1006"),
  user("cashier", "Dinithi Perera", "cashier@fixflow.com", "cashier", "br-colombo", "+94 71 200 1007"),
];

/* ------------------------------------------------------------------ */
/* Customers and devices                                               */
/* ------------------------------------------------------------------ */

type CustomerSeed = [string, string, string, string, string?];

const customerSeeds: CustomerSeed[] = [
  ["Nimal Perera", "+94 77 456 8291", "nimal@email.lk", "Colombo 03", "br-colombo"],
  ["Amaya Fernando", "+94 71 882 3410", "amaya.f@gmail.com", "Dehiwala", "br-colombo"],
  ["Kasun Silva", "+94 76 331 2277", "kasun.s@outlook.com", "Nugegoda", "br-colombo"],
  ["Tharindu Jayasinghe", "+94 70 118 4492", undefined, "Colombo 05", "br-colombo"],
  ["Ruwani Dias", "+94 77 990 1234", "ruwani.d@email.lk", "Kandy", "br-kandy"],
  ["Chaminda Wickramasinghe", "+94 72 445 8890", undefined, "Gampola", "br-kandy"],
  ["Sanduni Abeysekara", "+94 78 224 5567", "sanduni.a@gmail.com", "Kandy", "br-kandy"],
  ["Dinesh Kumara", "+94 75 667 3321", "dinesh.k@email.lk", "Maharagama", "br-colombo"],
  ["Fathima Rizwan", "+94 76 112 8899", undefined, "Colombo 12", "br-colombo"],
  ["Priyankara Senanayake", "+94 71 556 7741", "p.senanayake@biz.lk", "Peradeniya", "br-kandy"],
  ["Ishara Madushani", "+94 70 889 2214", "ishara.m@gmail.com", "Kelaniya", "br-colombo"],
  ["Roshan Gunawardana", "+94 77 334 9912", undefined, "Katugastota", "br-kandy"],
];

const customers: Customer[] = customerSeeds.map(([name, phone, email, address, branchId], index) => {
  const idValue = `cus-${String(index + 1).padStart(4, "0")}`;
  return {
    id: idValue,
    name,
    phone,
    email,
    address,
    homeBranchId: branchId ?? "br-colombo",
    status: "active",
    // Every seeded customer gets portal access so the customer portal is testable.
    portalUserId: `usr-${idValue}`,
    emailNotifications: true,
    smsNotifications: true,
    registeredAt: at(-30 * (index + 1), 9, 30),
  };
});

// Portal identities, so "customer@fixflow.com" style sign-in works per customer.
const portalUsers: User[] = customers.map((customer, index) => ({
  id: `usr-${customer.id}`,
  name: customer.name,
  email: `customer${index + 1}@fixflow.com`,
  phone: customer.phone,
  role: "customer",
  branchId: customer.homeBranchId,
  isActive: true,
  demoPassword: DEMO_PASSWORD,
  createdAt: customer.registeredAt,
}));

type DeviceSeed = [number, Device["category"], string, string, string];
const deviceSeeds: DeviceSeed[] = [
  [1, "laptop", "Dell", "Latitude 5420", "DL5420-78X2"],
  [1, "mobile", "Apple", "iPhone 13", "IP13-DX9K2L"],
  [2, "mobile", "Samsung", "Galaxy S23", "SGS23-R4T88"],
  [3, "laptop", "HP", "Victus 15", "HPV15-4B77Q"],
  [3, "desktop", "Custom", "Ryzen 5 Workstation", undefined],
  [4, "laptop", "Lenovo", "ThinkPad T14", "LTT14-91M0P"],
  [5, "laptop", "Lenovo", "IdeaPad Slim 3", "LIP3-22K09"],
  [5, "mobile", "Xiaomi", "Redmi Note 12", "RN12-88T4Q"],
  [6, "printer", "Canon", "PIXMA G3010", "CNG3-5512A"],
  [7, "laptop", "Asus", "Vivobook 15", "ASV15-4D771"],
  [8, "mobile", "Apple", "iPhone 11", "IP11-KL0P2"],
  [9, "tablet", "Samsung", "Galaxy Tab A8", "STA8-9931M"],
  [10, "desktop", "Dell", "OptiPlex 7090", "DOP7-4412B"],
  [11, "laptop", "Acer", "Aspire 5", "ACA5-7712K"],
  [12, "mobile", "Huawei", "P50 Lite", "HWP5-2214C"],
];

const devices: Device[] = deviceSeeds.map(([customerIndex, category, brand, model, serial], index) => ({
  id: `dev-${String(index + 1).padStart(4, "0")}`,
  customerId: `cus-${String(customerIndex).padStart(4, "0")}`,
  category,
  brand,
  model,
  serial,
  createdAt: at(-120 + index, 11),
}));

/* ------------------------------------------------------------------ */
/* Products and inventory                                              */
/* ------------------------------------------------------------------ */

const categories: ProductCategory[] = [
  { id: "cat-chargers", name: "Chargers" },
  { id: "cat-cables", name: "Cables" },
  { id: "cat-parts", name: "Spare Parts" },
  { id: "cat-services", name: "Services" },
  { id: "cat-accessories", name: "Accessories" },
];

// name, sku, categoryId, cost, price, stockColombo, stockKandy, minStock
type ProductSeedRow = [string, string, string, number, number, number, number, number];
const productSeeds: ProductSeedRow[] = [
  ["65W Laptop Charger", "CHR-65W-001", "cat-chargers", 4200, 6500, 14, 6, 6],
  ["90W Laptop Charger", "CHR-90W-002", "cat-chargers", 5800, 8900, 9, 4, 5],
  ["USB-C Fast Cable", "CBL-USC-014", "cat-cables", 900, 1850, 32, 18, 12],
  ["HDMI 2.0 Cable 2m", "CBL-HDM-020", "cat-cables", 1200, 2400, 21, 11, 8],
  ["DDR4 8GB RAM Module", "RAM-D4-8GB", "cat-parts", 7100, 9200, 8, 5, 6],
  ["512GB NVMe SSD", "SSD-NV-512", "cat-parts", 11800, 14500, 11, 6, 5],
  ["1TB SATA SSD", "SSD-ST-1TB", "cat-parts", 16800, 21500, 6, 3, 4],
  ["iPhone 13 Display", "DSP-IP13-O", "cat-parts", 29500, 38500, 3, 2, 5],
  ["Samsung S23 Display", "DSP-SS23-O", "cat-parts", 26400, 34200, 4, 2, 5],
  ["Laptop Battery 45Wh", "BAT-LP-45W", "cat-parts", 8400, 11800, 7, 4, 5],
  ["Cooling Fan (Universal)", "FAN-UNV-001", "cat-parts", 2600, 4200, 12, 7, 6],
  ["Premium Thermal Paste", "SRV-THM-005", "cat-services", 900, 2200, 24, 14, 10],
  ["Full Service & Cleaning", "SRV-FSC-001", "cat-services", 0, 5500, 999, 999, 0],
  ["Data Recovery (Software)", "SRV-DRS-002", "cat-services", 0, 12500, 999, 999, 0],
  ["Laptop Sleeve 14\"", "ACC-SLV-014", "cat-accessories", 1100, 2600, 18, 9, 8],
  ["Wireless Mouse", "ACC-MSE-001", "cat-accessories", 1400, 3100, 15, 8, 6],
];

const suppliers: Supplier[] = [
  {
    id: "sup-metro",
    name: "Metro Tech Distributors",
    contactPerson: "Mr. Rohan Jayawardena",
    phone: "+94 11 288 4412",
    email: "sales@metrotech.lk",
    address: "No. 5, Sea Street, Colombo 11",
    paymentTerms: "Net 30",
    isActive: true,
    createdAt: at(-500),
  },
  {
    id: "sup-island",
    name: "Island Components (Pvt) Ltd",
    contactPerson: "Ms. Shanika Abeygunawardena",
    phone: "+94 11 255 7788",
    email: "orders@islandcomponents.lk",
    address: "Level 2, Orion City, Colombo 09",
    paymentTerms: "Net 14",
    isActive: true,
    createdAt: at(-480),
  },
  {
    id: "sup-celtron",
    name: "Celtron Lanka",
    contactPerson: "Mr. Faizal Careem",
    phone: "+94 81 222 3311",
    email: "info@celtron.lk",
    address: "No. 22, Kotugodella Veediya, Kandy",
    paymentTerms: "Cash on delivery",
    isActive: true,
    createdAt: at(-300),
  },
];

const products: Product[] = productSeeds.map(
  ([name, sku, categoryId, cost, price, , , minStock], index) => ({
    id: `prd-${String(index + 1).padStart(4, "0")}`,
    sku,
    name,
    description: `${name} — stocked service part.`,
    categoryId,
    costPriceCents: toCents(cost),
    sellingPriceCents: toCents(price),
    minStock,
    supplierId: [suppliers[0].id, suppliers[1].id, suppliers[2].id][index % 3],
    warrantyMonths: categoryId === "cat-services" ? 0 : business.defaultWarranty.partMonths,
    isActive: true,
    createdAt: at(-300 + index),
    updatedAt: at(-30),
  }),
);

const inventory: InventoryBalance[] = [];
const openingMovements: Database["stockMovements"] = [];

productSeeds.forEach(([, , , , , colomboStock, kandyStock], index) => {
  const productId = `prd-${String(index + 1).padStart(4, "0")}`;
  (
    [
      ["br-colombo", colomboStock],
      ["br-kandy", kandyStock],
    ] as const
  ).forEach(([branch, onHand]) => {
    inventory.push({
      id: `inv-${productId}-${branch}`,
      productId,
      branchId: branch,
      onHand,
      reserved: 0,
      updatedAt: at(0, 8),
    });
    openingMovements.push({
      id: id("mov"),
      productId,
      branchId: branch,
      type: "count_correction",
      quantity: onHand,
      balanceAfter: onHand,
      reference: { type: "adjustment", id: "opening-balance" },
      reason: "Opening stock count for the demonstration dataset",
      userId: "usr-admin",
      createdAt: at(0, 8),
    });
  });
});

/* ------------------------------------------------------------------ */
/* Repairs                                                             */
/* ------------------------------------------------------------------ */

type RepairSeed = {
  number: string;
  customer: number;
  device: number;
  branch: string;
  tech?: string;
  status: RepairJob["status"];
  priority: RepairJob["priority"];
  complaint: string;
  expectedIn?: number;
  receivedDaysAgo: number;
  labour: number;
  parts?: Array<[number, number]>; // [productIndex, qty]
  diagnosis?: [string, string];
  estimate?: { items: Array<[number, number]>; status: Estimate["status"]; sentDaysAgo?: number; expiresIn?: number };
};

const repairSeeds: RepairSeed[] = [
  {
    number: "FX-2026-000118",
    customer: 1,
    device: 1,
    branch: "br-colombo",
    tech: "usr-tech1",
    status: "repairing",
    priority: "high",
    complaint: "Laptop gets very hot and powers off after 20-30 minutes of use. Fan is noticeably loud.",
    expectedIn: 0,
    receivedDaysAgo: 3,
    labour: 5500,
    parts: [[12, 1]],
    diagnosis: [
      "Dust obstruction in the heatsink fins and degraded thermal compound are restricting heat transfer. Fan bearing shows play under load.",
      "Clean heatsink assembly, replace thermal compound, re-test under load. Replace fan if RPM remains unstable.",
    ],
    estimate: { items: [[12, 1]], status: "approved", sentDaysAgo: 2, expiresIn: 7 },
  },
  {
    number: "FX-2026-000117",
    customer: 2,
    device: 2,
    branch: "br-colombo",
    tech: "usr-tech2",
    status: "waiting_approval",
    priority: "normal",
    complaint: "Display cracked after a drop. Touch is unresponsive in the lower half of the screen.",
    expectedIn: 2,
    receivedDaysAgo: 2,
    labour: 4500,
    diagnosis: [
      "Digitizer and LCD assembly damaged. Frame slightly bent but no board-level damage detected.",
      "Replace display assembly, re-seat frame, run touch calibration.",
    ],
    estimate: { items: [[8, 1]], status: "sent", sentDaysAgo: 1, expiresIn: 6 },
  },
  {
    number: "FX-2026-000116",
    customer: 3,
    device: 3,
    branch: "br-colombo",
    tech: "usr-tech1",
    status: "waiting_parts",
    priority: "urgent",
    complaint: "Cooling fan noisy, random shutdowns while gaming. Customer needs it for work on Monday.",
    expectedIn: 1,
    receivedDaysAgo: 4,
    labour: 4200,
    diagnosis: [
      "Cooling fan bearing failure confirmed. Thermal throttling triggers shutdown at 96°C.",
      "Replace cooling fan module, clean heatsink, stress test.",
    ],
    estimate: { items: [[11, 1]], status: "approved", sentDaysAgo: 3, expiresIn: 5 },
  },
  {
    number: "FX-2026-000115",
    customer: 4,
    device: 4,
    branch: "br-colombo",
    tech: "usr-tech2",
    status: "testing",
    priority: "normal",
    complaint: "Battery drains within three hours of light use. Charging LED flickers.",
    expectedIn: 1,
    receivedDaysAgo: 5,
    labour: 3800,
    parts: [[10, 1]],
    diagnosis: [
      "Battery pack at 61% health with two failing cells. Charging circuit within tolerance.",
      "Replace battery pack, calibrate, run discharge test.",
    ],
    estimate: { items: [[10, 1]], status: "approved", sentDaysAgo: 4, expiresIn: 4 },
  },
  {
    number: "FX-2026-000114",
    customer: 1,
    device: 1,
    branch: "br-colombo",
    tech: "usr-tech1",
    status: "ready_for_collection",
    priority: "normal",
    complaint: "Keyboard keys sticking and trackpad jumpy after a tea spill.",
    receivedDaysAgo: 8,
    labour: 6500,
    diagnosis: [
      "Residue under keycaps and on the trackpad flex cable. No board corrosion found.",
      "Ultrasonic clean keyboard assembly, replace trackpad flex, full function test.",
    ],
    estimate: { items: [], status: "approved", sentDaysAgo: 7, expiresIn: 1 },
  },
  {
    number: "FX-2026-000113",
    customer: 5,
    device: 6,
    branch: "br-kandy",
    tech: "usr-tech-kandy",
    status: "diagnosing",
    priority: "low",
    complaint: "Laptop will not power on. No LED when charger is connected.",
    expectedIn: 3,
    receivedDaysAgo: 1,
    labour: 4000,
  },
  {
    number: "FX-2026-000112",
    customer: 6,
    device: 9,
    branch: "br-kandy",
    tech: "usr-tech-kandy",
    status: "received",
    priority: "normal",
    complaint: "Printer not picking paper from the tray and shows a paper jam error.",
    expectedIn: 4,
    receivedDaysAgo: 0,
    labour: 3200,
  },
  {
    number: "FX-2026-000111",
    customer: 7,
    device: 10,
    branch: "br-kandy",
    tech: "usr-tech-kandy",
    status: "repairing",
    priority: "high",
    complaint: "Slow performance, takes five minutes to boot. Hard drive LED constantly on.",
    expectedIn: 1,
    receivedDaysAgo: 6,
    labour: 5000,
    parts: [[6, 1]],
    diagnosis: [
      "Mechanical HDD at 2100 reallocated sectors. RAM is sufficient for the workload.",
      "Clone to 512GB NVMe SSD, clean install, restore user data.",
    ],
    estimate: { items: [[6, 1]], status: "approved", sentDaysAgo: 5, expiresIn: 3 },
  },
  {
    number: "FX-2026-000110",
    customer: 8,
    device: 11,
    branch: "br-colombo",
    tech: "usr-tech2",
    status: "delivered",
    priority: "normal",
    complaint: "Screen flickers when the lid is moved past 90 degrees.",
    receivedDaysAgo: 14,
    labour: 4800,
    diagnosis: ["Failing eDP cable.", "Replace eDP cable, test lid articulation."],
    estimate: { items: [], status: "approved", sentDaysAgo: 13, expiresIn: -5 },
  },
  {
    number: "FX-2026-000109",
    customer: 9,
    device: 12,
    branch: "br-colombo",
    tech: "usr-tech1",
    status: "completed",
    priority: "urgent",
    complaint: "Device stuck in recovery mode after a failed software update.",
    expectedIn: 0,
    receivedDaysAgo: 2,
    labour: 6000,
    diagnosis: ["Corrupted system partition.", "Restore firmware via recovery, verify activation."],
    estimate: { items: [[14, 1]], status: "approved", sentDaysAgo: 2, expiresIn: 5 },
  },
  {
    number: "FX-2026-000108",
    customer: 10,
    device: 13,
    branch: "br-kandy",
    tech: "usr-tech-kandy",
    status: "delivered",
    priority: "normal",
    complaint: "Desktop randomly restarts under load. Suspect PSU.",
    receivedDaysAgo: 21,
    labour: 5500,
    diagnosis: ["PSU 12V rail drooping to 11.2V under load.", "Replace PSU, burn-in test."],
    estimate: { items: [], status: "approved", sentDaysAgo: 20, expiresIn: -12 },
  },
  {
    number: "FX-2026-000107",
    customer: 11,
    device: 14,
    branch: "br-colombo",
    tech: "usr-tech2",
    status: "cancelled",
    priority: "low",
    complaint: "Screen replacement quote requested, customer declined after quote.",
    receivedDaysAgo: 12,
    labour: 0,
    diagnosis: ["Display assembly replacement quoted; customer declined.", "No work performed."],
    estimate: { items: [], status: "rejected", sentDaysAgo: 11, expiresIn: -4 },
  },
  {
    number: "FX-2026-000106",
    customer: 12,
    device: 15,
    branch: "br-kandy",
    tech: "usr-tech-kandy",
    status: "delivered",
    priority: "normal",
    complaint: "Charging port loose, cable falls out.",
    receivedDaysAgo: 28,
    labour: 3500,
    diagnosis: ["Worn charging port solder joints.", "Reflow and reinforce charging port."],
    estimate: { items: [], status: "approved", sentDaysAgo: 27, expiresIn: -19 },
  },
  {
    number: "FX-2026-000105",
    customer: 2,
    device: 2,
    branch: "br-colombo",
    tech: "usr-tech1",
    status: "delivered",
    priority: "normal",
    complaint: "Battery health dropped to 74%, battery swelling slightly.",
    receivedDaysAgo: 35,
    labour: 4000,
    diagnosis: ["Swollen battery pack — safety risk.", "Replace battery, dispose of old cell safely."],
    estimate: { items: [], status: "approved", sentDaysAgo: 34, expiresIn: -26 },
  },
];

const repairs: RepairJob[] = [];
const repairEvents: RepairEvent[] = [];
const repairParts: RepairPart[] = [];
const estimates: Estimate[] = [];
const approvals: Database["approvals"] = [];
const repairMovements: Database["stockMovements"] = [];

function checklist(): TestingChecklistItem[] {
  return [
    { id: id("chk"), label: "Device powers on and boots to desktop", done: false },
    { id: id("chk"), label: "Thermal readings within tolerance under load", done: false },
    { id: id("chk"), label: "All ports and peripherals functional", done: false },
    { id: id("chk"), label: "Battery charges and discharges correctly", done: false },
    { id: id("chk"), label: "No unusual noise or vibration", done: false },
  ];
}

repairSeeds.forEach((seed, index) => {
  const repairId = `rep-${String(index + 1).padStart(4, "0")}`;
  const customer = customers[seed.customer - 1];
  const device = devices[seed.device - 1];
  const receivedAt = at(-seed.receivedDaysAgo, 9, 15);
  const technician = seed.tech ? users.find((u) => u.id === seed.tech) : undefined;

  const parts: RepairPart[] = (seed.parts ?? []).map(([productIndex, quantity]) => {
    const product = products[productIndex - 1];
    return {
      id: id("rpt"),
      repairId,
      productId: product.id,
      sku: product.sku,
      name: product.name,
      quantity,
      unitPriceCents: product.sellingPriceCents,
      lineTotalCents: product.sellingPriceCents * quantity,
      addedByUserId: technician?.id ?? "usr-tech1",
      addedAt: at(-Math.max(0, seed.receivedDaysAgo - 1), 11),
    };
  });

  // Parts fitted to a repair are consumed from stock and leave a movement.
  parts.forEach((part) => {
    const balance = inventory.find((row) => row.productId === part.productId && row.branchId === seed.branch);
    if (balance) {
      balance.onHand = Math.max(0, balance.onHand - part.quantity);
      balance.updatedAt = part.addedAt;
      repairMovements.push({
        id: id("mov"),
        productId: part.productId,
        branchId: seed.branch,
        type: "repair_part",
        quantity: -part.quantity,
        balanceAfter: balance.onHand,
        unitCostCents: products.find((p) => p.id === part.productId)?.costPriceCents,
        reference: { type: "repair", id: repairId },
        reason: `Fitted to ${seed.number}`,
        userId: part.addedByUserId,
        createdAt: part.addedAt,
      });
    }
  });

  repairParts.push(...parts);

  const repair: RepairJob = {
    id: repairId,
    number: seed.number,
    branchId: seed.branch,
    customerId: customer.id,
    deviceId: device.id,
    device: {
      category: device.category,
      brand: device.brand,
      model: device.model,
      serial: device.serial,
      condition: "Good — minor wear",
      accessories: device.category === "laptop" || device.category === "desktop" ? "Charger" : "Device only",
    },
    customerName: customer.name,
    customerPhone: customer.phone,
    technicianId: technician?.id,
    technicianName: technician?.name,
    priority: seed.priority,
    status: seed.status,
    intake: {
      complaint: seed.complaint,
      notes: undefined,
      receivedAt,
      receivedByUserId: seed.branch === "br-colombo" ? "usr-manager" : "usr-manager-kandy",
    },
    expectedAt: seed.expectedIn === undefined ? undefined : at(seed.expectedIn, 16, 30),
    diagnosis: seed.diagnosis
      ? {
          findings: seed.diagnosis[0],
          recommended: seed.diagnosis[1],
          recordedByUserId: technician?.id ?? "usr-tech1",
          recordedAt: at(-Math.max(0, seed.receivedDaysAgo - 1), 10, 30),
          technicianConfirmed: true,
        }
      : undefined,
    labourCents: toCents(seed.labour),
    testingChecklist: checklist(),
    createdAt: receivedAt,
    updatedAt: at(-Math.max(0, seed.receivedDaysAgo - 1), 14),
  };

  // Timeline events.
  const actor = seed.branch === "br-colombo" ? "Kaveesha Gehan" : "Nilanka Rajapakse";
  repairEvents.push({
    id: id("rev"),
    repairId,
    type: "created",
    to: "received",
    message: `Repair ${seed.number} registered for ${customer.name}.`,
    visibility: "customer",
    actorUserId: repair.intake.receivedByUserId,
    actorName: actor,
    actorRole: "manager",
    createdAt: receivedAt,
  });

  if (seed.diagnosis) {
    repairEvents.push({
      id: id("rev"),
      repairId,
      type: "diagnosis",
      message: seed.diagnosis[0],
      visibility: "internal",
      actorUserId: technician?.id,
      actorName: technician?.name ?? "John Silva",
      actorRole: "technician",
      createdAt: repair.diagnosis!.recordedAt,
    });
  }

  parts.forEach((part) => {
    repairEvents.push({
      id: id("rev"),
      repairId,
      type: "part_added",
      message: `${part.quantity} × ${part.name} fitted.`,
      visibility: "internal",
      actorUserId: part.addedByUserId,
      actorName: technician?.name ?? "John Silva",
      actorRole: "technician",
      createdAt: part.addedAt,
    });
  });

  if (seed.estimate) {
    const estimateId = `est-${String(index + 1).padStart(4, "0")}`;
    const labourItem = {
      id: id("esi"),
      kind: "labour" as const,
      name: "Technician labour",
      quantity: 1,
      unitPriceCents: toCents(seed.labour),
      lineTotalCents: toCents(seed.labour),
    };
    const partItems = (seed.estimate.items ?? []).map(([productIndex, quantity]) => {
      const product = products[productIndex - 1];
      return {
        id: id("esi"),
        kind: "part" as const,
        productId: product.id,
        name: product.name,
        quantity,
        unitPriceCents: product.sellingPriceCents,
        lineTotalCents: product.sellingPriceCents * quantity,
      };
    });
    const totals = computeTotals({ lines: [labourItem, ...partItems], taxEnabled: business.taxEnabled });
    const sentAt = seed.estimate.sentDaysAgo === undefined ? undefined : at(-seed.estimate.sentDaysAgo, 12);

    const estimate: Estimate = {
      id: estimateId,
      number: `${business.numbering.estimate}-2026-${String(index + 101).padStart(4, "0")}`,
      repairId,
      customerId: customer.id,
      branchId: seed.branch,
      items: [labourItem, ...partItems],
      subtotalCents: totals.subtotalCents,
      discountCents: 0,
      taxCents: totals.taxCents,
      totalCents: totals.totalCents,
      notes: "Estimate valid for 7 days. Parts warranty 6 months.",
      status: seed.estimate.status,
      revision: 1,
      createdByUserId: repair.intake.receivedByUserId,
      createdAt: repair.diagnosis?.recordedAt ?? receivedAt,
      sentAt,
      expiresAt: seed.estimate.expiresIn === undefined ? undefined : inDays(seed.estimate.expiresIn),
    };

    if (seed.estimate.status === "approved") {
      estimate.decidedAt = sentAt ? at(-Math.max(0, seed.estimate.sentDaysAgo! - 1), 15) : undefined;
      const approvalId = `apr-${String(index + 1).padStart(4, "0")}`;
      approvals.push({
        id: approvalId,
        estimateId,
        repairId,
        customerId: customer.id,
        decision: "approved",
        method: seed.customer % 2 === 0 ? "portal" : "phone",
        note: "Approved by customer.",
        decidedAt: estimate.decidedAt ?? receivedAt,
      });
      repair.approvalId = approvalId;
      repairEvents.push({
        id: id("rev"),
        repairId,
        type: "approval",
        message: `Estimate ${estimate.number} approved by customer.`,
        visibility: "customer",
        actorName: customer.name,
        actorRole: "customer",
        createdAt: estimate.decidedAt ?? receivedAt,
      });
    }

    if (seed.estimate.status === "rejected") {
      estimate.decidedAt = sentAt;
      const approvalId = `apr-${String(index + 1).padStart(4, "0")}`;
      approvals.push({
        id: approvalId,
        estimateId,
        repairId,
        customerId: customer.id,
        decision: "rejected",
        method: "portal",
        note: "Customer declined the quoted amount.",
        decidedAt: estimate.decidedAt ?? receivedAt,
      });
      repair.cancelledReason = "Customer declined the estimate.";
    }

    if (sentAt) {
      repairEvents.push({
        id: id("rev"),
        repairId,
        type: "estimate_sent",
        message: `Estimate ${estimate.number} sent to the customer for approval.`,
        visibility: "customer",
        actorName: actor,
        actorRole: "manager",
        createdAt: sentAt,
      });
    }

    estimates.push(estimate);
    repair.estimateId = estimateId;
  }

  repairs.push(repair);
});

/* ------------------------------------------------------------------ */
/* Sales, invoices, payments                                           */
/* ------------------------------------------------------------------ */

const sales: Sale[] = [];
const invoices: Invoice[] = [];
const payments: Payment[] = [];

type SaleSeed = { daysAgo: number; branch: string; cashier: string; items: Array<[number, number]>; method: Sale["payments"][number]["method"]; customerIndex?: number };

const saleSeeds: SaleSeed[] = [
  { daysAgo: 0, branch: "br-colombo", cashier: "usr-cashier", items: [[1, 1], [3, 2]], method: "cash" },
  { daysAgo: 0, branch: "br-colombo", cashier: "usr-cashier", items: [[12, 1]], method: "card", customerIndex: 3 },
  { daysAgo: 1, branch: "br-colombo", cashier: "usr-cashier", items: [[15, 1], [16, 1]], method: "cash" },
  { daysAgo: 1, branch: "br-kandy", cashier: "usr-manager-kandy", items: [[3, 3]], method: "bank", customerIndex: 5 },
  { daysAgo: 2, branch: "br-colombo", cashier: "usr-cashier", items: [[5, 1]], method: "card", customerIndex: 1 },
  { daysAgo: 3, branch: "br-kandy", cashier: "usr-manager-kandy", items: [[1, 1], [4, 1]], method: "cash" },
  { daysAgo: 4, branch: "br-colombo", cashier: "usr-cashier", items: [[16, 2]], method: "cash" },
  { daysAgo: 5, branch: "br-colombo", cashier: "usr-cashier", items: [[6, 1], [12, 1]], method: "bank", customerIndex: 8 },
  { daysAgo: 7, branch: "br-kandy", cashier: "usr-manager-kandy", items: [[15, 2]], method: "cash" },
  { daysAgo: 8, branch: "br-colombo", cashier: "usr-cashier", items: [[2, 1]], method: "card" },
  { daysAgo: 10, branch: "br-colombo", cashier: "usr-cashier", items: [[3, 4], [15, 1]], method: "cash", customerIndex: 11 },
  { daysAgo: 12, branch: "br-kandy", cashier: "usr-manager-kandy", items: [[4, 2]], method: "card" },
  { daysAgo: 15, branch: "br-colombo", cashier: "usr-cashier", items: [[10, 1]], method: "bank", customerIndex: 4 },
  { daysAgo: 18, branch: "br-colombo", cashier: "usr-cashier", items: [[1, 2], [3, 1]], method: "cash" },
  { daysAgo: 22, branch: "br-kandy", cashier: "usr-manager-kandy", items: [[12, 3]], method: "cash" },
  { daysAgo: 26, branch: "br-colombo", cashier: "usr-cashier", items: [[16, 1], [4, 1]], method: "card" },
];

saleSeeds.forEach((seed, index) => {
  const saleId = `sal-${String(index + 1).padStart(4, "0")}`;
  const createdAt = at(-seed.daysAgo, 10 + (index % 8), (index * 7) % 60);
  const items: Sale["items"] = seed.items.map(([productIndex, quantity]) => {
    const product = products[productIndex - 1];
    return {
      id: id("sli"),
      productId: product.id,
      sku: product.sku,
      name: product.name,
      quantity,
      unitPriceCents: product.sellingPriceCents,
      lineTotalCents: product.sellingPriceCents * quantity,
      costPriceCents: product.costPriceCents,
    };
  });
  const totals = computeTotals({ lines: items, taxEnabled: business.taxEnabled });
  const customer = seed.customerIndex ? customers[seed.customerIndex - 1] : undefined;

  sales.push({
    id: saleId,
    number: `${business.numbering.sale}-2026-${String(index + 8801).padStart(4, "0")}`,
    branchId: seed.branch,
    customerId: customer?.id,
    customerName: customer?.name,
    items,
    subtotalCents: totals.subtotalCents,
    discountCents: 0,
    taxCents: totals.taxCents,
    totalCents: totals.totalCents,
    payments: [{ method: seed.method, amountCents: totals.totalCents }],
    userId: seed.cashier,
    status: "completed",
    createdAt,
  });

  // Each completed sale also produces an invoice so receivables and sales agree.
  const invoiceId = `inv-${String(index + 1).padStart(4, "0")}`;
  invoices.push({
    id: invoiceId,
    number: `${business.numbering.invoice}-2026-${String(index + 1021).padStart(4, "0")}`,
    branchId: seed.branch,
    customerId: customer?.id ?? "cus-0001",
    customerName: customer?.name ?? "Walk-in customer",
    saleId,
    items: items.map((item) => ({
      id: id("ivi"),
      kind: "product" as const,
      productId: item.productId,
      name: item.name,
      quantity: item.quantity,
      unitPriceCents: item.unitPriceCents,
      lineTotalCents: item.lineTotalCents,
    })),
    subtotalCents: totals.subtotalCents,
    discountCents: 0,
    taxCents: totals.taxCents,
    totalCents: totals.totalCents,
    status: "paid",
    dueAt: day(-seed.daysAgo),
    createdByUserId: seed.cashier,
    createdAt,
  });

  payments.push({
    id: id("pay"),
    number: `${business.numbering.payment}-2026-${String(index + 3001).padStart(4, "0")}`,
    invoiceId,
    customerId: customer?.id ?? "cus-0001",
    branchId: seed.branch,
    amountCents: totals.totalCents,
    method: seed.method,
    receivedByUserId: seed.cashier,
    receivedAt: createdAt,
  });
});

// Repair invoices: issued for completed/delivered repairs, some left outstanding
// so the receivables figure and the customer portal balance are meaningful.
const repairInvoiceSeeds: Array<{ repairNumber: string; status: Invoice["status"]; paidRatio: number }> = [
  { repairNumber: "FX-2026-000114", status: "issued", paidRatio: 0 },
  { repairNumber: "FX-2026-000109", status: "partially_paid", paidRatio: 0.5 },
  { repairNumber: "FX-2026-000110", status: "paid", paidRatio: 1 },
  { repairNumber: "FX-2026-000108", status: "paid", paidRatio: 1 },
  { repairNumber: "FX-2026-000106", status: "paid", paidRatio: 1 },
  { repairNumber: "FX-2026-000105", status: "paid", paidRatio: 1 },
];

repairInvoiceSeeds.forEach((seed, index) => {
  const repair = repairs.find((r) => r.number === seed.repairNumber);
  if (!repair) return;
  const estimate = estimates.find((e) => e.id === repair.estimateId);
  const total = estimate?.totalCents ?? (repair.labourCents + 0);
  const invoiceId = `inv-r${String(index + 1).padStart(3, "0")}`;
  const createdAt = repair.updatedAt;

  invoices.push({
    id: invoiceId,
    number: `${business.numbering.invoice}-2026-${String(index + 2001).padStart(4, "0")}`,
    branchId: repair.branchId,
    customerId: repair.customerId,
    customerName: repair.customerName,
    repairId: repair.id,
    items: [
      {
        id: id("ivi"),
        kind: "labour",
        name: `Repair labour — ${repair.number}`,
        quantity: 1,
        unitPriceCents: repair.labourCents,
        lineTotalCents: repair.labourCents,
      },
      ...repairParts
        .filter((part) => part.repairId === repair.id)
        .map((part) => ({
          id: id("ivi"),
          kind: "part" as const,
          productId: part.productId,
          name: part.name,
          quantity: part.quantity,
          unitPriceCents: part.unitPriceCents,
          lineTotalCents: part.lineTotalCents,
        })),
    ],
    subtotalCents: total,
    discountCents: 0,
    taxCents: 0,
    totalCents: total,
    status: seed.status,
    dueAt: repair.deliveredAt?.slice(0, 10) ?? day(7),
    createdByUserId: "usr-manager",
    createdAt,
  });

  repair.invoiceId = invoiceId;

  if (seed.paidRatio > 0) {
    const amount = Math.round(total * seed.paidRatio);
    payments.push({
      id: id("pay"),
      number: `${business.numbering.payment}-2026-${String(index + 4101).padStart(4, "0")}`,
      invoiceId,
      customerId: repair.customerId,
      branchId: repair.branchId,
      amountCents: amount,
      method: index % 2 === 0 ? "cash" : "card",
      receivedByUserId: "usr-cashier",
      receivedAt: createdAt,
    });
  }
});

/* ------------------------------------------------------------------ */
/* Expenses, warranties, claims, notifications                         */
/* ------------------------------------------------------------------ */

const expenseSeeds: Array<[Expense["category"], number, string, number, string]> = [
  ["rent", 185000, "Monthly rent — Colombo 03 workshop", 3, "br-colombo"],
  ["rent", 95000, "Monthly rent — Kandy workshop", 3, "br-kandy"],
  ["electricity", 42800, "CEB electricity bill", 5, "br-colombo"],
  ["electricity", 26400, "CEB electricity bill", 6, "br-kandy"],
  ["internet", 12500, "Fibre broadband subscription", 4, "br-colombo"],
  ["salaries", 480000, "Staff salaries — monthly payroll", 2, "br-colombo"],
  ["salaries", 265000, "Staff salaries — monthly payroll", 2, "br-kandy"],
  ["transport", 18400, "Parts collection and courier", 1, "br-colombo"],
  ["tools", 64500, "Precision screwdriver set and hot air station", 9, "br-colombo"],
  ["consumables", 22800, "Thermal paste, isopropyl, cleaning consumables", 8, "br-colombo"],
  ["maintenance", 31000, "Air-conditioner service", 12, "br-kandy"],
  ["other", 15600, "Stationery and printer consumables", 7, "br-colombo"],
];

const expenses: Expense[] = expenseSeeds.map(([category, amount, description, daysAgo, branchId]) => ({
  id: id("exp"),
  branchId,
  category,
  amountCents: toCents(amount),
  description,
  method: "bank",
  incurredAt: day(-daysAgo),
  status: "approved",
  createdByUserId: branchId === "br-colombo" ? "usr-manager" : "usr-manager-kandy",
  approvedByUserId: "usr-admin",
  createdAt: at(-daysAgo, 9),
}));

const warranties: Warranty[] = [
  {
    id: "wrn-0001",
    number: "WRN-2026-000101",
    kind: "repair",
    customerId: "cus-0001",
    customerName: "Nimal Perera",
    repairId: "rep-0005",
    branchId: "br-colombo",
    startDate: day(-2),
    expiryDate: monthsFromNow(3),
    durationMonths: 3,
    terms: "Covers the repair work performed and any parts fitted by FixFlow.",
    exclusions: "Physical damage, liquid ingress and third-party repairs are excluded.",
    status: "active",
    createdAt: at(-2),
  },
  {
    id: "wrn-0002",
    number: "WRN-2026-000102",
    kind: "repair",
    customerId: "cus-0004",
    customerName: "Tharindu Jayasinghe",
    repairId: "rep-0004",
    branchId: "br-colombo",
    startDate: day(-1),
    expiryDate: monthsFromNow(3),
    durationMonths: 3,
    terms: "Covers battery replacement and labour for 3 months.",
    exclusions: "Swelling caused by third-party chargers is excluded.",
    status: "active",
    createdAt: at(-1),
  },
  {
    id: "wrn-0003",
    number: "WRN-2026-000103",
    kind: "repair",
    customerId: "cus-0007",
    customerName: "Sanduni Abeysekara",
    repairId: "rep-0008",
    branchId: "br-kandy",
    startDate: day(-1),
    expiryDate: monthsFromNow(3),
    durationMonths: 3,
    terms: "Covers SSD replacement and data migration.",
    exclusions: "Data loss after handover is excluded.",
    status: "active",
    createdAt: at(-1),
  },
];

const warrantyClaims: WarrantyClaim[] = [
  {
    id: "clm-0001",
    number: "CLM-2026-000011",
    warrantyId: "wrn-0001",
    customerId: "cus-0001",
    customerName: "Nimal Perera",
    branchId: "br-colombo",
    repairId: "rep-0005",
    reportedIssue: "Keyboard sticking again on the left side after two weeks.",
    findings: "Residue reappeared on two keycaps; assembly cleaned again.",
    status: "under_inspection",
    submittedAt: at(-1, 14),
    updatedAt: at(-1, 16),
    history: [
      { status: "submitted", note: "Claim submitted from the customer portal.", actorName: "Nimal Perera", at: at(-1, 14) },
      { status: "under_inspection", note: "Device booked in for inspection.", actorName: "Kaveesha Gehan", actorUserId: "usr-manager", at: at(-1, 16) },
    ],
  },
  {
    id: "clm-0002",
    number: "CLM-2026-000012",
    warrantyId: "wrn-0002",
    customerId: "cus-0004",
    customerName: "Tharindu Jayasinghe",
    branchId: "br-colombo",
    repairId: "rep-0004",
    reportedIssue: "Battery percentage jumps from 40% to 8%.",
    status: "submitted",
    submittedAt: at(0, 9),
    updatedAt: at(0, 9),
    history: [{ status: "submitted", note: "Awaiting inspection.", actorName: "Tharindu Jayasinghe", at: at(0, 9) }],
  },
];

const notifications: Database["notifications"] = [
  {
    id: id("ntf"),
    type: "repair_status",
    title: "Estimate awaiting approval",
    body: "FX-2026-000117 is waiting for Amaya Fernando to approve the estimate.",
    audience: { role: "manager", branchId: "br-colombo" },
    link: { route: "/repairs", id: "rep-0002" },
    createdAt: at(-1, 12),
  },
  {
    id: id("ntf"),
    type: "repair_delayed",
    title: "Repair past expected completion",
    body: "FX-2026-000116 was due yesterday and is still waiting for parts.",
    audience: { role: "manager", branchId: "br-colombo" },
    link: { route: "/repairs", id: "rep-0003" },
    createdAt: at(0, 8),
  },
  {
    id: id("ntf"),
    type: "low_stock",
    title: "Low stock alert",
    body: "iPhone 13 Display is at 3 units in Colombo 03 (minimum 5).",
    audience: { role: "manager", branchId: "br-colombo" },
    link: { route: "/inventory" },
    createdAt: at(0, 8, 5),
  },
  {
    id: id("ntf"),
    type: "warranty_claim",
    title: "New warranty claim",
    body: "CLM-2026-000012 submitted by Tharindu Jayasinghe.",
    audience: { role: "manager", branchId: "br-colombo" },
    link: { route: "/warranties" },
    createdAt: at(0, 9),
  },
  {
    id: id("ntf"),
    type: "repair_status",
    title: "Your repair is progressing",
    body: "Your Dell Latitude 5420 is now being repaired.",
    audience: { userId: "usr-cus-0001" },
    link: { route: "/portal/repairs" },
    createdAt: at(-1, 11),
  },
  {
    id: id("ntf"),
    type: "estimate_request",
    title: "Estimate ready for review",
    body: "Your estimate for iPhone 13 is ready to review and approve.",
    audience: { userId: "usr-cus-0002" },
    link: { route: "/portal/estimates" },
    createdAt: at(-1, 12),
  },
];

/* ------------------------------------------------------------------ */
/* Assemble                                                            */
/* ------------------------------------------------------------------ */

export function createSeedDatabase(): Database {
  const lastRepairNumber = repairSeeds
    .map((seed) => Number(seed.number.split("-").pop() ?? "0"))
    .reduce((max, value) => Math.max(max, value), 0);

  return structuredClone({
    business,
    branches,
    users: [...users, ...portalUsers],
    customers,
    devices,
    repairs,
    repairEvents,
    repairParts,
    diagnoses: [],
    estimates,
    approvals,
    categories,
    products,
    inventory,
    stockMovements: [...openingMovements, ...repairMovements],
    stockReservations: [],
    suppliers,
    purchaseOrders: [],
    goodsReceipts: [],
    sales,
    invoices,
    payments,
    refunds: [],
    warranties,
    warrantyClaims,
    expenses,
    cashSessions: [
      {
        id: "cas-0001",
        branchId: "br-colombo",
        code: "CR-CBO03-04",
        openedByUserId: "usr-cashier",
        openedAt: at(0, 8, 45),
        openingFloatCents: toCents(15000),
        expectedCents: toCents(15000),
        status: "open",
      },
    ],
    notifications,
    attachments: [],
    auditLogs: [],
    sequences: {
      [`${business.numbering.repair}:2026`]: lastRepairNumber,
      [`${business.numbering.estimate}:2026`]: 100 + estimates.length,
      [`${business.numbering.invoice}:2026`]: 2026,
      [`${business.numbering.sale}:2026`]: 8800 + sales.length,
      [`${business.numbering.payment}:2026`]: 4200,
      [`${business.numbering.purchaseOrder}:2026`]: 100,
      [`${business.numbering.warranty}:2026`]: 103,
      [`${business.numbering.claim}:2026`]: 12,
    },
  });
}

/** Demo credentials shown on the sign-in screen. */
export const DEMO_ACCOUNTS = [
  { email: "admin@fixflow.com", role: "Admin", name: "Admin Perera", scope: "All branches" },
  { email: "manager@fixflow.com", role: "Manager", name: "Kaveesha Gehan", scope: "Colombo 03" },
  { email: "technician@fixflow.com", role: "Technician", name: "John Silva", scope: "Assigned jobs" },
  { email: "cashier@fixflow.com", role: "Cashier", name: "Dinithi Perera", scope: "Colombo 03" },
  { email: "customer1@fixflow.com", role: "Customer", name: "Nimal Perera", scope: "Own records" },
];

export { DEMO_PASSWORD };
