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

const billing = new Hono<{ Bindings: CloudflareEnv }>()

// Validation schemas
const createInvoiceSchema = z.object({
  branchId: z.string().min(1),
  customerId: z.string().min(1),
  customerName: z.string().min(1),
  customerEmail: z.string().email().optional(),
  customerAddress: z.string().optional(),
  repairId: z.string().optional(),
  items: z.array(z.object({
    description: z.string().min(1),
    quantity: z.number().int().min(1),
    unitPrice: z.number().min(0),
    taxRate: z.number().min(0).max(1).default(0),
  })).min(1),
  dueDate: z.string().optional(), // ISO date string
  notes: z.string().optional(),
  terms: z.string().optional(),
})

const updateInvoiceSchema = z.object({
  status: z.enum(['draft', 'sent', 'paid', 'overdue', 'cancelled']).optional(),
  paymentDate: z.string().optional(),
  paymentMethod: z.string().optional(),
  paymentReference: z.string().optional(),
})

interface InvoiceDoc {
  invoiceNumber: string
  branchId: string
  customerId: string
  customerName: string
  customerEmail: string
  customerAddress: string
  repairId: string | null
  items: any[]
  subtotal: number
  taxAmount: number
  total: number
  status: string
  dueDate: any
  notes: string
  terms: string
  createdAt: any
  updatedAt: any
  paymentDate?: any
  paymentMethod?: string
  paymentReference?: string
}

// Create invoice
billing.post('/invoices', async (c) => {
  try {
    const body = await c.req.json()
    const data = createInvoiceSchema.parse(body)

    const db = getDb()

    // Calculate totals
    const subtotal = data.items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0)
    const taxAmount = data.items.reduce((sum, item) => sum + (item.quantity * item.unitPrice * item.taxRate), 0)
    const total = subtotal + taxAmount

    // Get next invoice number
    const counterRef = db.collection('counters').doc(`${data.branchId}_invoices`)
    const invoiceNumber = await db.runTransaction(async (transaction) => {
      const doc = await transaction.get(counterRef)
      const current = doc.exists ? (doc.data()?.count ?? 0) : 0
      const next = current + 1
      transaction.set(counterRef, { count: next, updatedAt: new Date() }, { merge: true })
      return next
    })

    const invoiceId = db.collection('invoices').doc().id
    const now = new Date()
    const dueDate = data.dueDate ? new Date(data.dueDate) : new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000) // 30 days default

    const invoice: InvoiceDoc = {
      invoiceNumber: `INV-${String(invoiceNumber).padStart(6, '0')}`,
      branchId: data.branchId,
      customerId: data.customerId,
      customerName: data.customerName,
      customerEmail: data.customerEmail ?? '',
      customerAddress: data.customerAddress ?? '',
      repairId: data.repairId ?? null,
      items: data.items.map(item => ({
        ...item,
        totalPrice: item.quantity * item.unitPrice,
        taxAmount: item.quantity * item.unitPrice * item.taxRate,
      })),
      subtotal,
      taxAmount,
      total,
      status: 'draft',
      dueDate,
      notes: data.notes ?? '',
      terms: data.terms ?? '',
      createdAt: now,
      updatedAt: now,
    }

    await db.collection('invoices').doc(invoiceId).set(invoice)

    return c.json({ ok: true, invoice: { id: invoiceId, ...invoice } })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ ok: false, error: 'Validation error', details: error.errors }, 400)
    }
    console.error('Create invoice error:', error)
    return c.json({ ok: false, error: 'Failed to create invoice' }, 500)
  }
})

// Get invoice by ID
billing.get('/invoices/:id', async (c) => {
  try {
    const { id } = c.req.param()
    const db = getDb()
    const doc = await db.collection('invoices').doc(id).get()

    if (!doc.exists) {
      return c.json({ ok: false, error: 'Invoice not found' }, 404)
    }

    const data = doc.data() as InvoiceDoc
    return c.json({ ok: true, invoice: { id: doc.id, ...data } })
  } catch (error) {
    console.error('Get invoice error:', error)
    return c.json({ ok: false, error: 'Failed to get invoice' }, 500)
  }
})

// List invoices
billing.get('/invoices', async (c) => {
  try {
    const { branchId, customerId, status, limit = '50', offset = '0' } = c.req.query()
    const db = getDb()

    let query: any = db.collection('invoices')

    if (branchId) query = query.where('branchId', '==', branchId)
    if (customerId) query = query.where('customerId', '==', customerId)
    if (status) query = query.where('status', '==', status)

    query = query.orderBy('createdAt', 'desc').limit(parseInt(limit)).offset(parseInt(offset))

    const snapshot = await query.get()
    const invoices = snapshot.docs.map((doc: any) => {
      const data = doc.data() as InvoiceDoc
      return { id: doc.id, ...data }
    })

    return c.json({ ok: true, invoices })
  } catch (error) {
    console.error('List invoices error:', error)
    return c.json({ ok: false, error: 'Failed to list invoices' }, 500)
  }
})

// Update invoice
billing.patch('/invoices/:id', async (c) => {
  try {
    const { id } = c.req.param()
    const body = await c.req.json()
    const data = updateInvoiceSchema.parse(body)

    const db = getDb()
    const invoiceRef = db.collection('invoices').doc(id)
    const doc = await invoiceRef.get()

    if (!doc.exists) {
      return c.json({ ok: false, error: 'Invoice not found' }, 404)
    }

    const updates: Record<string, any> = { ...data, updatedAt: new Date() }

    if (data.paymentDate) {
      updates.paymentDate = new Date(data.paymentDate)
    }

    if (data.status === 'paid' && !doc.data()?.paymentDate) {
      updates.paymentDate = new Date()
    }

    await invoiceRef.update(updates)

    const updated = await invoiceRef.get()
    const updatedData = updated.data() as InvoiceDoc
    return c.json({ ok: true, invoice: { id: updated.id, ...updatedData } })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ ok: false, error: 'Validation error', details: error.errors }, 400)
    }
    console.error('Update invoice error:', error)
    return c.json({ ok: false, error: 'Failed to update invoice' }, 500)
  }
})

// Get invoice PDF data (for generating PDF client-side)
billing.get('/invoices/:id/pdf-data', async (c) => {
  try {
    const { id } = c.req.param()
    const db = getDb()
    const doc = await db.collection('invoices').doc(id).get()

    if (!doc.exists) {
      return c.json({ ok: false, error: 'Invoice not found' }, 404)
    }

    const invoiceData = doc.data() as InvoiceDoc
    const invoice = { id: doc.id, ...invoiceData }

    // Get business settings for invoice header
    const settingsDoc = await db.collection('businessSettings').doc(invoice.branchId).get()
    const settings = settingsDoc.exists ? settingsDoc.data() : {}

    return c.json({ ok: true, invoice, settings })
  } catch (error) {
    console.error('Get invoice PDF data error:', error)
    return c.json({ ok: false, error: 'Failed to get invoice data' }, 500)
  }
})

export { billing }