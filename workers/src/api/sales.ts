// @ts-nocheck
import { Hono } from 'hono'
import { z } from 'zod'
import { getDb } from '../lib/firebase-admin.js'

interface CloudflareEnv {
  FIREBASE_PROJECT_ID: string
  FIREBASE_CLIENT_EMAIL: string
  FIREBASE_PRIVATE_KEY: string
  OPENAI_API_KEY?: string
  ANTHROPIC_API_KEY?: string
}

const sales = new Hono<{ Bindings: CloudflareEnv }>()

// Validation schemas
const saleItemSchema = z.object({
  type: z.enum(['part', 'service', 'repair']),
  itemId: z.string(),
  name: z.string(),
  quantity: z.number().int().min(1),
  unitPrice: z.number().min(0),
  taxRate: z.number().min(0).max(1).default(0),
})

const createSaleSchema = z.object({
  branchId: z.string().min(1),
  customerId: z.string().optional(),
  customerName: z.string().optional(),
  items: z.array(saleItemSchema).min(1),
  paymentMethod: z.enum(['cash', 'card', 'transfer', 'other']),
  discount: z.number().min(0).default(0),
  taxRate: z.number().min(0).max(1).default(0),
  notes: z.string().optional(),
})

interface SaleDoc {
  saleNumber: string
  branchId: string
  customerId: string | null
  customerName: string
  items: any[]
  subtotal: number
  discount: number
  discountAmount: number
  taxRate: number
  taxAmount: number
  total: number
  paymentMethod: string
  paymentStatus: string
  notes: string
  createdAt: any
  updatedAt: any
}

interface PartDoc {
  id: string
  quantity: number
}

// Create sale
sales.post('/', async (c) => {
  try {
    const body = await c.req.json()
    const data = createSaleSchema.parse(body)

    const db = getDb()

    // Calculate totals
    const subtotal = data.items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0)
    const discountAmount = subtotal * (data.discount / 100)
    const taxableAmount = subtotal - discountAmount
    const taxAmount = taxableAmount * data.taxRate
    const total = taxableAmount + taxAmount

    // Get next sale number
    const counterRef = db.collection('counters').doc(`${data.branchId}_sales`)
    const saleNumber = await db.runTransaction(async (transaction) => {
      const doc = await transaction.get(counterRef)
      const current = doc.exists ? (doc.data()?.count ?? 0) : 0
      const next = current + 1
      transaction.set(counterRef, { count: next, updatedAt: new Date() }, { merge: true })
      return next
    })

    const saleId = db.collection('sales').doc().id
    const now = new Date()

    // Prepare sale record
    const sale: SaleDoc = {
      saleNumber: `SAL-${String(saleNumber).padStart(6, '0')}`,
      branchId: data.branchId,
      customerId: data.customerId ?? null,
      customerName: data.customerName ?? 'Walk-in Customer',
      items: data.items.map(item => ({
        ...item,
        totalPrice: item.quantity * item.unitPrice,
        taxAmount: (item.quantity * item.unitPrice) * item.taxRate,
      })),
      subtotal,
      discount: data.discount,
      discountAmount,
      taxRate: data.taxRate,
      taxAmount,
      total,
      paymentMethod: data.paymentMethod,
      paymentStatus: 'paid',
      notes: data.notes ?? '',
      createdAt: now,
      updatedAt: now,
    }

    await db.collection('sales').doc(saleId).set(sale)

    // Update inventory for parts
    for (const item of data.items) {
      if (item.type === 'part') {
        const partRef = db.collection('inventory').doc(item.itemId)
        await db.runTransaction(async (transaction) => {
          const doc = await transaction.get(partRef)
          if (!doc.exists) throw new Error(`Part ${item.itemId} not found`)

          const current = (doc.data() as PartDoc)?.quantity ?? 0
          const next = current - item.quantity

          if (next < 0) throw new Error(`Insufficient stock for ${item.name}`)

          transaction.update(partRef, { quantity: next, updatedAt: new Date() })

          // Log stock movement
          const movementRef = db.collection('stockMovements').doc()
          transaction.set(movementRef, {
            partId: item.itemId,
            quantity: -item.quantity,
            reason: 'sale',
            referenceId: saleId,
            previousQuantity: current,
            newQuantity: next,
            createdAt: new Date(),
          })
        })
      }
    }

    return c.json({ ok: true, sale: { id: saleId, ...sale } })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ ok: false, error: 'Validation error', details: error.errors }, 400)
    }
    console.error('Create sale error:', error)
    return c.json({ ok: false, error: error instanceof Error ? error.message : 'Failed to create sale' }, 500)
  }
})

// Get sale by ID
sales.get('/:id', async (c) => {
  try {
    const { id } = c.req.param()
    const db = getDb()
    const doc = await db.collection('sales').doc(id).get()

    if (!doc.exists) {
      return c.json({ ok: false, error: 'Sale not found' }, 404)
    }

    const data = doc.data() as SaleDoc
    return c.json({ ok: true, sale: { id: doc.id, ...data } })
  } catch (error) {
    console.error('Get sale error:', error)
    return c.json({ ok: false, error: 'Failed to get sale' }, 500)
  }
})

// List sales
sales.get('/', async (c) => {
  try {
    const { branchId, customerId, startDate, endDate, limit = '50', offset = '0' } = c.req.query()
    const db = getDb()

    let query: any = db.collection('sales')

    if (branchId) query = query.where('branchId', '==', branchId)
    if (customerId) query = query.where('customerId', '==', customerId)
    if (startDate) query = query.where('createdAt', '>=', new Date(startDate))
    if (endDate) query = query.where('createdAt', '<=', new Date(endDate))

    query = query.orderBy('createdAt', 'desc').limit(parseInt(limit)).offset(parseInt(offset))

    const snapshot = await query.get()
    const salesList = snapshot.docs.map(doc => {
      const data = doc.data() as SaleDoc
      return { id: doc.id, ...data }
    })

    return c.json({ ok: true, sales: salesList })
  } catch (error) {
    console.error('List sales error:', error)
    return c.json({ ok: false, error: 'Failed to list sales' }, 500)
  }
})

export { sales }