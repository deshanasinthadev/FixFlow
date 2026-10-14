// @ts-nocheck
import { Hono } from 'hono'
import { z } from 'zod'
import { getDb, getAuthAdmin } from '../lib/firebase-admin.js'

interface CloudflareEnv {
  FIREBASE_PROJECT_ID: string
  FIREBASE_CLIENT_EMAIL: string
  FIREBASE_PRIVATE_KEY: string
  OPENAI_API_KEY?: string
  ANTHROPIC_API_KEY?: string
}

const repairs = new Hono<{ Bindings: CloudflareEnv }>()

// Validation schemas
const createRepairSchema = z.object({
  branchId: z.string().min(1),
  customerId: z.string().min(1),
  customerName: z.string().min(1),
  deviceType: z.string().min(1),
  deviceBrand: z.string().min(1),
  deviceModel: z.string().min(1),
  serialNumber: z.string().optional(),
  complaint: z.string().min(1),
  assignedTechnicianId: z.string().optional(),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).default('medium'),
  estimatedCost: z.number().optional(),
})

const updateRepairSchema = z.object({
  status: z.enum(['received', 'diagnosing', 'awaiting_approval', 'in_progress', 'awaiting_parts', 'ready', 'delivered', 'cancelled']).optional(),
  diagnosis: z.string().optional(),
  estimatedCost: z.number().optional(),
  assignedTechnicianId: z.string().optional(),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
  notes: z.string().optional(),
})

interface RepairDoc {
  repairNumber: string
  branchId: string
  customerId: string
  customerName: string
  deviceType: string
  deviceBrand: string
  deviceModel: string
  serialNumber: string
  complaint: string
  status: string
  priority: string
  assignedTechnicianId: string | null
  estimatedCost: number
  actualCost: number
  partsUsed: any[]
  laborCharges: any[]
  notes: any[]
  createdBy: string
  createdAt: any
  updatedAt: any
}

// Create repair
repairs.post('/', async (c) => {
  try {
    const authHeader = c.req.header('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return c.json({ ok: false, error: 'Unauthorized' }, 401)
    }

    const token = authHeader.slice(7)
    const decoded = await getAuthAdmin().verifyIdToken(token)
    const db = getDb()

    const body = await c.req.json()
    const data = createRepairSchema.parse(body)

    // Get next repair number
    const counterRef = db.collection('counters').doc(`${data.branchId}_repairs`)
    const repairNumber = await db.runTransaction(async (transaction) => {
      const doc = await transaction.get(counterRef)
      const current = doc.exists ? (doc.data()?.count ?? 0) : 0
      const next = current + 1
      transaction.set(counterRef, { count: next, updatedAt: new Date() }, { merge: true })
      return next
    })

    const repairId = db.collection('repairs').doc().id
    const now = new Date()

    const repair: RepairDoc = {
      repairNumber: `RPR-${String(repairNumber).padStart(6, '0')}`,
      branchId: data.branchId,
      customerId: data.customerId,
      customerName: data.customerName,
      deviceType: data.deviceType,
      deviceBrand: data.deviceBrand,
      deviceModel: data.deviceModel,
      serialNumber: data.serialNumber ?? '',
      complaint: data.complaint,
      status: 'received',
      priority: data.priority,
      assignedTechnicianId: data.assignedTechnicianId ?? null,
      estimatedCost: data.estimatedCost ?? 0,
      actualCost: 0,
      partsUsed: [],
      laborCharges: [],
      notes: [],
      createdBy: decoded.uid,
      createdAt: now,
      updatedAt: now,
    }

    await db.collection('repairs').doc(repairId).set(repair)

    return c.json({ ok: true, repair: { id: repairId, ...repair } })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ ok: false, error: 'Validation error', details: error.errors }, 400)
    }
    console.error('Create repair error:', error)
    return c.json({ ok: false, error: 'Failed to create repair' }, 500)
  }
})

// Get repair by ID
repairs.get('/:id', async (c) => {
  try {
    const authHeader = c.req.header('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return c.json({ ok: false, error: 'Unauthorized' }, 401)
    }

    const { id } = c.req.param()
    const db = getDb()
    const doc = await db.collection('repairs').doc(id).get()

    if (!doc.exists) {
      return c.json({ ok: false, error: 'Repair not found' }, 404)
    }

    const data = doc.data() as RepairDoc
    return c.json({ ok: true, repair: { id: doc.id, ...data } })
  } catch (error) {
    console.error('Get repair error:', error)
    return c.json({ ok: false, error: 'Failed to get repair' }, 500)
  }
})

// List repairs with filters
repairs.get('/', async (c) => {
  try {
    const authHeader = c.req.header('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return c.json({ ok: false, error: 'Unauthorized' }, 401)
    }

    const { branchId, status, technicianId, customerId, limit = '50', offset = '0' } = c.req.query()
    const db = getDb()

    let query: any = db.collection('repairs')

    if (branchId) query = query.where('branchId', '==', branchId)
    if (status) query = query.where('status', '==', status)
    if (technicianId) query = query.where('assignedTechnicianId', '==', technicianId)
    if (customerId) query = query.where('customerId', '==', customerId)

    query = query.orderBy('createdAt', 'desc').limit(parseInt(limit)).offset(parseInt(offset))

    const snapshot = await query.get()
    const repairsList = snapshot.docs.map(doc => {
      const data = doc.data() as RepairDoc
      return { id: doc.id, ...data }
    })

    return c.json({ ok: true, repairs: repairsList })
  } catch (error) {
    console.error('List repairs error:', error)
    return c.json({ ok: false, error: 'Failed to list repairs' }, 500)
  }
})

// Update repair
repairs.patch('/:id', async (c) => {
  try {
    const authHeader = c.req.header('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return c.json({ ok: false, error: 'Unauthorized' }, 401)
    }

    const { id } = c.req.param()
    const body = await c.req.json()
    const data = updateRepairSchema.parse(body)

    const db = getDb()
    const repairRef = db.collection('repairs').doc(id)
    const doc = await repairRef.get()

    if (!doc.exists) {
      return c.json({ ok: false, error: 'Repair not found' }, 404)
    }

    const updates = { ...data, updatedAt: new Date() }
    await repairRef.update(updates)

    const updated = await repairRef.get()
    const updatedData = updated.data() as RepairDoc
    return c.json({ ok: true, repair: { id: updated.id, ...updatedData } })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ ok: false, error: 'Validation error', details: error.errors }, 400)
    }
    console.error('Update repair error:', error)
    return c.json({ ok: false, error: 'Failed to update repair' }, 500)
  }
})

// Add note to repair
repairs.post('/:id/notes', async (c) => {
  try {
    const authHeader = c.req.header('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return c.json({ ok: false, error: 'Unauthorized' }, 401)
    }

    const { id } = c.req.param()
    const body = await c.req.json()
    const { content, isInternal = false } = body as { content: string; isInternal?: boolean }

    if (!content?.trim()) {
      return c.json({ ok: false, error: 'Note content is required' }, 400)
    }

    const db = getDb()
    const repairRef = db.collection('repairs').doc(id)
    const doc = await repairRef.get()

    if (!doc.exists) {
      return c.json({ ok: false, error: 'Repair not found' }, 404)
    }

    const token = authHeader.slice(7)
    const decoded = await getAuthAdmin().verifyIdToken(token)

    const note = {
      id: crypto.randomUUID(),
      content,
      isInternal,
      authorId: decoded.uid,
      authorName: decoded.name ?? decoded.email ?? 'Unknown',
      createdAt: new Date(),
    }

    const existingNotes = doc.data()?.notes ?? []
    await repairRef.update({
      notes: [...existingNotes, note],
      updatedAt: new Date(),
    })

    return c.json({ ok: true, note })
  } catch (error) {
    console.error('Add note error:', error)
    return c.json({ ok: false, error: 'Failed to add note' }, 500)
  }
})

// Add part to repair
repairs.post('/:id/parts', async (c) => {
  try {
    const authHeader = c.req.header('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return c.json({ ok: false, error: 'Unauthorized' }, 401)
    }

    const { id } = c.req.param()
    const body = await c.req.json()
    const { partId, partName, quantity, unitPrice } = body as { partId: string; partName: string; quantity: number; unitPrice: number }

    if (!partId || !partName || !quantity || unitPrice === undefined) {
      return c.json({ ok: false, error: 'partId, partName, quantity, and unitPrice are required' }, 400)
    }

    const db = getDb()
    const repairRef = db.collection('repairs').doc(id)
    const doc = await repairRef.get()

    if (!doc.exists) {
      return c.json({ ok: false, error: 'Repair not found' }, 404)
    }

    const part = {
      id: crypto.randomUUID(),
      partId,
      partName,
      quantity,
      unitPrice,
      totalPrice: quantity * unitPrice,
      addedAt: new Date(),
    }

    const existingParts = doc.data()?.partsUsed ?? []
    await repairRef.update({
      partsUsed: [...existingParts, part],
      updatedAt: new Date(),
    })

    return c.json({ ok: true, part })
  } catch (error) {
    console.error('Add part error:', error)
    return c.json({ ok: false, error: 'Failed to add part' }, 500)
  }
})

// Add labor charge to repair
repairs.post('/:id/labor', async (c) => {
  try {
    const authHeader = c.req.header('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return c.json({ ok: false, error: 'Unauthorized' }, 401)
    }

    const { id } = c.req.param()
    const body = await c.req.json()
    const { description, hours, rate } = body as { description: string; hours: number; rate: number }

    if (!description || hours === undefined || rate === undefined) {
      return c.json({ ok: false, error: 'description, hours, and rate are required' }, 400)
    }

    const db = getDb()
    const repairRef = db.collection('repairs').doc(id)
    const doc = await repairRef.get()

    if (!doc.exists) {
      return c.json({ ok: false, error: 'Repair not found' }, 404)
    }

    const labor = {
      id: crypto.randomUUID(),
      description,
      hours,
      rate,
      totalPrice: hours * rate,
      addedAt: new Date(),
    }

    const existingLabor = doc.data()?.laborCharges ?? []
    await repairRef.update({
      laborCharges: [...existingLabor, labor],
      updatedAt: new Date(),
    })

    return c.json({ ok: true, labor })
  } catch (error) {
    console.error('Add labor error:', error)
    return c.json({ ok: false, error: 'Failed to add labor' }, 500)
  }
})

export { repairs }