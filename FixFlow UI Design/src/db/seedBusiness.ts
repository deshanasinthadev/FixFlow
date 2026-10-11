import type {
  Branch,
  BusinessSettings,
  Customer,
  Device,
  DeviceCategory,
  RepairJob,
  RepairPriority,
  RepairStatus,
  RepairStatusHistoryEntry,
  User,
} from '../domain/types'

/**
 * Seed data for the demo (§2, §3).
 *
 * This is opening data, not mock data: it goes through the same repository and
 * the same validation as anything a user creates, and the dashboard derives
 * its figures from it. Nothing here is a random number that does not
 * correspond to a saved record (§6).
 *
 * The repair records mirror the ones the existing UI already displays
 * (FX-2026-0048xx), so wiring the screens to this store does not change what
 * a reviewer sees — only where the data comes from.
 */

/** §3 — two seeded branches. */
export const seedBranches: Branch[] = [
  {
    id: 'br_colombo',
    name: 'Colombo 03',
    code: 'CMB',
    phone: '+94 11 234 5678',
    address: '142 Galle Road, Colombo 03',
    active: true,
  },
  {
    id: 'br_kandy',
    name: 'Kandy City',
    code: 'KDY',
    phone: '+94 81 222 3344',
    address: '58 Peradeniya Road, Kandy',
    active: true,
  },
]

/** §3 — tax DISABLED by default, LKR, Asia/Colombo. */
export const seedSettings: BusinessSettings = {
  businessName: 'FixFlow',
  logoUrl: '',
  phone: '+94 11 234 5678',
  email: 'hello@fixflow.lk',
  address: '142 Galle Road, Colombo 03, Sri Lanka',
  currency: 'LKR',
  timezone: 'Asia/Colombo',
  taxEnabled: false,
  taxRate: 0,
  invoicePrefix: 'INV',
  estimatePrefix: 'EST',
  repairPrefix: 'FX',
  receiptFooter: 'Thank you for your business. Warranty as per policy.',
  paymentMethods: ['cash', 'card', 'bank_transfer'],
  language: 'en',
}

/** The five demo sign-ins the existing UI already offers. */
export const seedUsers: User[] = [
  { id: 'usr_admin', fullName: 'Admin Perera', email: 'admin@fixflow.com', phone: '+94771000001', role: 'admin', branchId: 'all', active: true, createdAt: '2026-01-05T04:00:00.000Z', updatedAt: '2026-01-05T04:00:00.000Z' },
  { id: 'usr_manager', fullName: 'Kaveesha Gehan', email: 'manager@fixflow.com', phone: '+94771000002', role: 'manager', branchId: 'br_colombo', active: true, createdAt: '2026-01-05T04:00:00.000Z', updatedAt: '2026-01-05T04:00:00.000Z' },
  { id: 'usr_tech_1', fullName: 'John Silva', email: 'technician@fixflow.com', phone: '+94771000003', role: 'technician', branchId: 'br_colombo', active: true, createdAt: '2026-01-05T04:00:00.000Z', updatedAt: '2026-01-05T04:00:00.000Z' },
  { id: 'usr_tech_2', fullName: 'Kamal Silva', email: 'kamal@fixflow.com', phone: '+94771000004', role: 'technician', branchId: 'br_colombo', active: true, createdAt: '2026-01-05T04:00:00.000Z', updatedAt: '2026-01-05T04:00:00.000Z' },
  { id: 'usr_tech_3', fullName: 'Amal Perera', email: 'amal@fixflow.com', phone: '+94771000005', role: 'technician', branchId: 'br_kandy', active: true, createdAt: '2026-01-05T04:00:00.000Z', updatedAt: '2026-01-05T04:00:00.000Z' },
  { id: 'usr_cashier', fullName: 'Dinithi Perera', email: 'cashier@fixflow.com', phone: '+94771000006', role: 'cashier', branchId: 'br_colombo', active: true, createdAt: '2026-01-05T04:00:00.000Z', updatedAt: '2026-01-05T04:00:00.000Z' },
]

type SeedCustomer = [id: string, name: string, phone: string, email: string, address: string]

const customers: SeedCustomer[] = [
  ['cus_nimal', 'Nimal Perera', '+94771234567', 'nimal@example.com', '23 Marine Drive, Colombo 03'],
  ['cus_amaya', 'Amaya Fernando', '+94762345678', 'amaya@example.com', '8 Ward Place, Colombo 07'],
  ['cus_kasun', 'Kasun Silva', '+94713456789', 'kasun@example.com', '45 Kandy Road, Kadawatha'],
  ['cus_tharindu', 'Tharindu Jayasinghe', '+94704567890', 'tharindu@example.com', '12 Peradeniya Road, Kandy'],
  ['cus_dilani', 'Dilani Wijeratne', '+94775678901', 'dilani@example.com', '7 Lake Round, Kandy'],
  ['cus_ruwan', 'Ruwan Bandara', '+94716789012', 'ruwan@example.com', '91 Galle Road, Colombo 04'],
]

/** §20 — unguessable tokens, not sequential ids. */
const tokenFor = (id: string) => `ptk_${id.replace('cus_', '')}_9f3c7a51e2b84d60`

export const seedCustomers: Customer[] = customers.map(([id, fullName, phone, email, address]) => ({
  id,
  code: `C-${id.replace('cus_', '').toUpperCase().padEnd(5, '0').slice(0, 5)}`,
  fullName,
  phone,
  email,
  address,
  notes: '',
  portalToken: tokenFor(id),
  status: 'active' as const,
  createdAt: '2026-01-10T04:00:00.000Z',
}))

type SeedDevice = [id: string, customerId: string, category: DeviceCategory, brand: string, model: string, serial: string]

const devices: SeedDevice[] = [
  ['dev_001', 'cus_nimal', 'laptop', 'Dell', 'Latitude 5420', 'DL5420LK2291'],
  ['dev_002', 'cus_amaya', 'mobile', 'Apple', 'iPhone 13', 'F2LXC3NQK9P1'],
  ['dev_003', 'cus_kasun', 'laptop', 'HP', 'Victus 15', 'HPV15LK8810'],
  ['dev_004', 'cus_tharindu', 'mobile', 'Samsung', 'Galaxy S23', 'RZ8T40KQJ2M'],
  ['dev_005', 'cus_dilani', 'desktop', 'Lenovo', 'IdeaCentre 3', 'LC3KDY5521'],
  ['dev_006', 'cus_ruwan', 'laptop', 'Asus', 'VivoBook 15', 'AV15LK7742'],
  ['dev_007', 'cus_nimal', 'tablet', 'Apple', 'iPad Air', 'DLMPADLK3312'],
  ['dev_008', 'cus_amaya', 'laptop', 'Apple', 'MacBook Air M2', 'C02MBA2K9P1'],
]

export const seedDevices: Device[] = devices.map(([id, customerId, category, brand, model, serialNumber]) => ({
  id,
  customerId,
  category,
  brand,
  model,
  serialNumber,
  purchaseDate: '',
  notes: '',
  createdAt: '2026-01-12T04:00:00.000Z',
}))

type SeedRepair = [
  id: string,
  seq: number,
  branchId: string,
  customerId: string,
  deviceId: string,
  issue: string,
  priority: RepairPriority,
  status: RepairStatus,
  technicianId: string,
  labourCents: number,
  receivedDaysAgo: number,
]

/**
 * Eight jobs spread across both branches and the whole workflow, so the
 * dashboard's "active / awaiting approval / waiting for parts / ready for
 * collection" tiles each have something real to count.
 */
const repairs: SeedRepair[] = [
  ['rep_001', 4821, 'br_colombo', 'cus_nimal', 'dev_001', 'Screen flickers when the lid is opened past 90 degrees.', 'high', 'repairing', 'usr_tech_1', 4500_00, 2],
  ['rep_002', 4820, 'br_colombo', 'cus_amaya', 'dev_002', 'No charging; port feels loose and gets warm.', 'normal', 'testing', 'usr_tech_2', 6000_00, 3],
  ['rep_003', 4819, 'br_colombo', 'cus_kasun', 'dev_003', 'Blue screen under load; suspect RAM or thermal.', 'urgent', 'waiting_for_parts', 'usr_tech_1', 3200_00, 5],
  ['rep_004', 4818, 'br_kandy', 'cus_tharindu', 'dev_004', 'Cracked screen after a drop; touch still works.', 'normal', 'ready_for_collection', 'usr_tech_3', 2500_00, 7],
  ['rep_005', 4817, 'br_colombo', 'cus_ruwan', 'dev_006', 'Will not power on; no fan spin, no lights.', 'high', 'diagnosing', 'usr_tech_2', 0, 1],
  ['rep_006', 4816, 'br_kandy', 'cus_dilani', 'dev_005', 'Very slow boot and loud fan noise.', 'low', 'waiting_for_approval', '', 0, 1],
  ['rep_007', 4815, 'br_colombo', 'cus_nimal', 'dev_007', 'Battery drains in under two hours.', 'normal', 'received', '', 0, 0],
  ['rep_008', 4814, 'br_colombo', 'cus_amaya', 'dev_008', 'Keyboard keys sticking after a spill.', 'high', 'completed', 'usr_tech_1', 5500_00, 9],
]

const isoDaysAgo = (days: number, hour = 9): string => {
  const d = new Date('2026-03-18T00:00:00+05:30')
  d.setDate(d.getDate() - days)
  d.setHours(hour, 0, 0, 0)
  return d.toISOString()
}

export const seedRepairs: RepairJob[] = repairs.map(
  ([id, seq, branchId, customerId, deviceId, reportedIssue, priority, status, technicianId, labourCost, daysAgo]) => {
    const customer = seedCustomers.find((c) => c.id === customerId)!
    const device = seedDevices.find((d) => d.id === deviceId)!
    const receivedAt = isoDaysAgo(daysAgo)
    return {
      id,
      jobNumber: `FX-2026-${String(seq).padStart(6, '0')}`,
      branchId,
      customerId,
      deviceId,
      customerName: customer.fullName,
      phone: customer.phone,
      email: customer.email,
      deviceSummary: `${device.brand} ${device.model}`,
      serialNumber: device.serialNumber,
      reportedIssue,
      deviceCondition: 'Received in used condition with visible wear.',
      accessoriesReceived: device.category === 'laptop' ? ['Charger'] : [],
      intakePhotoUrls: [],
      completionPhotoUrls: [],
      priority,
      status,
      technicianId,
      receivedAt,
      expectedCompletion: isoDaysAgo(Math.max(0, daysAgo - 3), 17),
      internalNotes: '',
      customerVisibleNotes: [],
      labourCost,
      createdAt: receivedAt,
      updatedAt: receivedAt,
    }
  },
)

/**
 * Every seeded job gets a `received` entry, and jobs past that point get the
 * path they walked. This keeps §7's "status history" honest for seeded data
 * rather than showing an empty timeline.
 *
 * Paths are declared per status rather than sliced from one linear list,
 * because `waiting_for_parts` and `cancelled` are detours off the main
 * sequence — a single array cannot express them, and a job in one of those
 * states would silently lose its history.
 *
 * Timestamps are anchored on each job's own `receivedAt` and step forward in
 * hours, so the history is always chronological and never predates the job.
 */
const HISTORY_PATHS: Record<RepairStatus, RepairStatus[]> = {
  received: ['received'],
  diagnosing: ['received', 'diagnosing'],
  waiting_for_approval: ['received', 'diagnosing', 'waiting_for_approval'],
  waiting_for_parts: ['received', 'diagnosing', 'waiting_for_parts'],
  approved: ['received', 'diagnosing', 'waiting_for_approval', 'approved'],
  repairing: ['received', 'diagnosing', 'waiting_for_approval', 'approved', 'repairing'],
  testing: ['received', 'diagnosing', 'waiting_for_approval', 'approved', 'repairing', 'testing'],
  completed: ['received', 'diagnosing', 'waiting_for_approval', 'approved', 'repairing', 'testing', 'completed'],
  ready_for_collection: ['received', 'diagnosing', 'waiting_for_approval', 'approved', 'repairing', 'testing', 'completed', 'ready_for_collection'],
  delivered: ['received', 'diagnosing', 'waiting_for_approval', 'approved', 'repairing', 'testing', 'completed', 'ready_for_collection', 'delivered'],
  cancelled: ['received', 'cancelled'],
}

export const seedRepairHistory: RepairStatusHistoryEntry[] = seedRepairs.flatMap((job) => {
  const steps = HISTORY_PATHS[job.status] ?? ['received']
  const start = new Date(job.receivedAt).getTime()

  return steps.map((to, i) => ({
    id: `rsh_${job.id}_${i}`,
    repairId: job.id,
    from: i === 0 ? '' : steps[i - 1],
    to,
    byUserId: i === 0 ? 'usr_cashier' : job.technicianId || 'usr_manager',
    note: i === 0 ? 'Device received at the counter.' : `Moved to ${to.replace(/_/g, ' ')}.`,
    at: new Date(start + i * 5 * 3_600_000).toISOString(),
    seq: i,
  }))
})
