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

const counters = new Hono<{ Bindings: CloudflareEnv }>()

// Get next sequence number for a collection
counters.post('/next', async (c) => {
  try {
    const body = await c.req.json()
    const { collection, branchId, prefix } = body as { collection: string; branchId: string; prefix?: string }

    if (!collection || !branchId) {
      return c.json({ ok: false, error: 'collection and branchId are required' }, 400)
    }

    const db = getDb()
    const counterRef = db.collection('counters').doc(`${branchId}_${collection}`)

    const result = await db.runTransaction(async (transaction) => {
      const doc = await transaction.get(counterRef)
      const current = doc.exists ? (doc.data()?.count ?? 0) : 0
      const next = current + 1
      transaction.set(counterRef, { count: next, updatedAt: new Date() }, { merge: true })
      return next
    })

    const formatted = prefix ? `${prefix}${String(result).padStart(6, '0')}` : String(result)
    return c.json({ ok: true, number: result, formatted })
  } catch (error) {
    console.error('Counter error:', error)
    return c.json({ ok: false, error: 'Failed to generate next number' }, 500)
  }
})

// Get current counter value
counters.get('/:branchId/:collection', async (c) => {
  try {
    const { branchId, collection } = c.req.param()
    const db = getDb()
    const doc = await db.collection('counters').doc(`${branchId}_${collection}`).get()
    return c.json({ ok: true, count: doc.exists ? (doc.data()?.count ?? 0) : 0 })
  } catch (error) {
    console.error('Get counter error:', error)
    return c.json({ ok: false, error: 'Failed to get counter' }, 500)
  }
})

export { counters }