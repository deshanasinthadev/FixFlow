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

const inventory = new Hono<{ Bindings: CloudflareEnv }>()

// Validation schemas
const createPartSchema = z.object({
  branchId: z.string().min(1),
  name: z.string().min(1),
  sku: z.string().min(1),
  category: z.string().min(1),
  unitPrice: z.number().min(0),
  costPrice: z.number().min(0).optional(),
  quantity: z.number().int().min(0).default(0),
  minStock: z.number().int().min(0).default(5),
  location: z.string().optional(),
  supplierId: z.string().optional(),
  compatibleDevices: z.array(z.string()).default([]),
})

const updatePartSchema = z.object({
  name: z.string().min(1).optional(),
  sku: z.string().min(1).optional(),
  category: z.string().min(1).optional(),
  unitPrice: z.number().min(0).optional(),
  costPrice: z.number().min(0).optional(),
  quantity: z.number().int().min(0).optional(),
  minStock: z.number().int().min(0).optional(),
  location: z.string().optional(),
  supplierId: z.string().optional(),
  compatibleDevices: z.array(z.string()).optional(),
})

const stockAdjustmentSchema = z.object({
  quantity: z.number().int(),
  reason: z.string().min(1),
  referenceId: z.string().optional(),
})

interface PartDoc {
  branchId: string
  name: string
  sku: string
  category: string
  unitPrice: number
  costPrice?: number
  quantity: number
  minStock: number
  location?: string
  supplierId?: string
  compatibleDevices: string[]
  createdAt: any
  updatedAt: any
}

// Create part
inventory.post('/parts', async (c) => {
  try {
    const body = await c.req.json()
    const data = createPartSchema.parse(body)

    const db = getDb()
    const partId = db.collection('inventory').doc().id
    const now = new Date()

    const part: PartDoc = {
      ...data,
      createdAt: now,
      updatedAt: now,
    }

    await db.collection('inventory').doc(partId).set(part)

    return c.json({ ok: true, part: { id: partId, ...part } })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ ok: false, error: 'Validation error', details: error.errors }, 400)
    }
    console.error('Create part error:', error)
    return c.json({ ok: false, error: 'Failed to create part' }, 500)
  }
})

// Get part by ID
inventory.get('/parts/:id', async (c) => {
  try {
    const { id } = c.req.param()
    const db = getDb()
    const doc = await db.collection('inventory').doc(id).get()

    if (!doc.exists) {
      return c.json({ ok: false, error: 'Part not found' }, 404)
    }

    const data = doc.data() as PartDoc
    return c.json({ ok: true, part: { id: doc.id, ...data } })
  } catch (error) {
    console.error('Get part error:', error)
    return c.json({ ok: false, error: 'Failed to get part' }, 500)
  }
})

// List parts with filters
inventory.get('/parts', async (c) => {
  try {
    const { branchId, category, lowStock, search, limit = '50', offset = '0' } = c.req.query()
    const db = getDb()

    let query: any = db.collection('inventory')

    if (branchId) query = query.where('branchId', '==', branchId)
    if (category) query = query.where('category', '==', category)

    query = query.orderBy('name').limit(parseInt(limit)).offset(parseInt(offset))

    const snapshot = await query.get()
    let parts = snapshot.docs.map(doc => {
      const data = doc.data() as PartDoc
      return { id: doc.id, ...data }
    })

    // Client-side filtering for low stock and search
    if (lowStock === 'true') {
      parts = parts.filter(p => p.quantity <= p.minStock)
    }
    if (search) {
      const s = search.toLowerCase()
      parts = parts.filter(p =>
        p.name.toLowerCase().includes(s) ||
        p.sku.toLowerCase().includes(s) ||
        p.category.toLowerCase().includes(s)
      )
    }

    return c.json({ ok: true, parts })
  } catch (error) {
    console.error('List parts error:', error)
    return c.json({ ok: false, error: 'Failed to list parts' }, 500)
  }
})

// Update part
inventory.patch('/parts/:id', async (c) => {
  try {
    const { id } = c.req.param()
    const body = await c.req.json()
    const data = updatePartSchema.parse(body)

    const db = getDb()
    const partRef = db.collection('inventory').doc(id)
    const doc = await partRef.get()

    if (!doc.exists) {
      return c.json({ ok: false, error: 'Part not found' }, 404)
    }

    await partRef.update({ ...data, updatedAt: new Date() })

    const updated = await partRef.get()
    const updatedData = updated.data() as PartDoc
    return c.json({ ok: true, part: { id: updated.id, ...updatedData } })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ ok: false, error: 'Validation error', details: error.errors }, 400)
    }
    console.error('Update part error:', error)
    return c.json({ ok: false, error: 'Failed to update part' }, 500)
  }
})

// Adjust stock
inventory.post('/parts/:id/adjust', async (c) => {
  try {
    const { id } = c.req.param()
    const body = await c.req.json()
    const data = stockAdjustmentSchema.parse(body)

    const db = getDb()
    const partRef = db.collection('inventory').doc(id)

    const newQuantity = await db.runTransaction(async (transaction) => {
      const doc = await transaction.get(partRef)
      if (!doc.exists) throw new Error('Part not found')

      const current = (doc.data() as PartDoc)?.quantity ?? 0
      const next = current + data.quantity

      if (next < 0) throw new Error('Insufficient stock')

      transaction.update(partRef, { quantity: next, updatedAt: new Date() })

      // Log stock movement
      const movementRef = db.collection('stockMovements').doc()
      transaction.set(movementRef, {
        partId: id,
        quantity: data.quantity,
        reason: data.reason,
        referenceId: data.referenceId,
        previousQuantity: current,
        newQuantity: next,
        createdAt: new Date(),
      })

      return next
    })

    return c.json({ ok: true, quantity: newQuantity })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ ok: false, error: 'Validation error', details: error.errors }, 400)
    }
    console.error('Adjust stock error:', error)
    return c.json({ ok: false, error: error instanceof Error ? error.message : 'Failed to adjust stock' }, 500)
  }
})

// Get stock movements
inventory.get('/parts/:id/movements', async (c) => {
  try {
    const { id } = c.req.param()
    const { limit = '50' } = c.req.query()
    const db = getDb()

    const snapshot = await db.collection('stockMovements')
      .where('partId', '==', id)
      .orderBy('createdAt', 'desc')
      .limit(parseInt(limit))
      .get()

    const movements = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
    return c.json({ ok: true, movements })
  } catch (error) {
    console.error('Get movements error:', error)
    return c.json({ ok: false, error: 'Failed to get movements' }, 500)
  }
})

// Get low stock alerts
inventory.get('/alerts/low-stock', async (c) => {
  try {
    const { branchId } = c.req.query()
    const db = getDb()

    let query: any = db.collection('inventory')
    if (branchId) query = query.where('branchId', '==', branchId)

    const snapshot = await query.get()
    const parts = snapshot.docs
      .map(doc => {
        const data = doc.data() as PartDoc
        return { id: doc.id, ...data }
      })
      .filter(p => p.quantity <= p.minStock)
      .sort((a, b) => a.quantity - b.quantity)

    return c.json({ ok: true, parts })
  } catch (error) {
    console.error('Get low stock error:', error)
    return c.json({ ok: false, error: 'Failed to get low stock alerts' }, 500)
  }
})

export { inventory }