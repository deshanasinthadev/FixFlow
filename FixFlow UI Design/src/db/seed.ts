import { Product, type Product as ProductT } from './schema'

/**
 * The demo's opening data, converted from the old hard-coded `products` array in
 * App.tsx into the real schema: money as integer cents, ISO timestamps, and a
 * tax rate instead of the hard-coded "Rs. 0" the POS used to show.
 *
 * This is seed data, not mock data — it goes through the same repository and the
 * same validation as anything a user types or imports.
 */

/** Sri Lanka standard VAT since 2024-01-01. Configurable per product. */
export const LK_STANDARD_VAT = 18

type SeedRow = {
  sku: string
  name: string
  category: string
  price: number
  stock: number
  minStock: number
  /** Services carry no stock. */
  isService?: boolean
}

const rows: SeedRow[] = [
  { sku: 'CHR-65W-001', name: '65W Laptop Charger', category: 'Chargers', price: 6500, stock: 14, minStock: 5 },
  { sku: 'CBL-USC-014', name: 'USB-C Fast Cable', category: 'Cables', price: 1850, stock: 32, minStock: 10 },
  { sku: 'RAM-D4-8GB', name: 'DDR4 8GB RAM', category: 'Spare Parts', price: 9200, stock: 8, minStock: 4 },
  { sku: 'SSD-NV-512', name: '512GB NVMe SSD', category: 'Spare Parts', price: 14500, stock: 11, minStock: 3 },
  { sku: 'DSP-IP13-O', name: 'iPhone 13 Display', category: 'Spare Parts', price: 38500, stock: 3, minStock: 2 },
  { sku: 'FAN-HPV-15', name: 'HP Victus 15 Cooling Fan', category: 'Spare Parts', price: 7400, stock: 6, minStock: 2 },
  { sku: 'BAT-DELL-5420', name: 'Dell Latitude 5420 Battery', category: 'Spare Parts', price: 12800, stock: 4, minStock: 2 },
  { sku: 'SRV-THM-005', name: 'Thermal Compound Replacement', category: 'Services', price: 2200, stock: 0, minStock: 0, isService: true },
  { sku: 'SRV-CLEAN-01', name: 'Full Cooling Service', category: 'Services', price: 4500, stock: 0, minStock: 0, isService: true },
  { sku: 'ACC-SLEEVE-14', name: '14" Laptop Sleeve', category: 'Accessories', price: 3200, stock: 21, minStock: 6 },
  { sku: 'KB-US-GEN', name: 'USB Keyboard', category: 'Accessories', price: 2750, stock: 17, minStock: 5 },
  { sku: 'HUB-USC-7P', name: 'USB-C 7-in-1 Hub', category: 'Accessories', price: 6900, stock: 9, minStock: 4 },
]

/** The old Inventory table derived cost as `price * 0.64`; keep that relationship. */
const costOf = (price: number) => Math.round(price * 0.64)

const seededAt = new Date('2026-03-01T09:00:00+05:30').toISOString()

export const seedProducts: ProductT[] = rows.map((r) =>
  Product.parse({
    id: `prd_${r.sku.toLowerCase().replace(/[^a-z0-9]/g, '_')}`,
    sku: r.sku,
    name: r.name,
    category: r.category,
    costCents: costOf(r.price) * 100,
    priceCents: r.price * 100,
    taxRate: LK_STANDARD_VAT,
    stockOnHand: r.stock,
    reserved: 0,
    minStock: r.minStock,
    barcode: r.isService ? '' : `89${r.sku.replace(/[^0-9]/g, '').padEnd(6, '0')}`.slice(0, 12),
    isService: r.isService ?? false,
    branchId: 'colombo',
    createdAt: seededAt,
    updatedAt: seededAt,
  }),
)
