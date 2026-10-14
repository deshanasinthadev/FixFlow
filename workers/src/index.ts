import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { firebaseAdmin } from './lib/firebase-admin.js'
import { counters } from './api/counters.js'
import { repairs } from './api/repairs.js'
import { inventory } from './api/inventory.js'
import { sales } from './api/sales.js'
import { billing } from './api/billing.js'
import { ai } from './api/ai.js'
import { reports } from './api/reports.js'

// Cloudflare Workers environment bindings
interface CloudflareEnv {
  FIREBASE_PROJECT_ID: string
  FIREBASE_CLIENT_EMAIL: string
  FIREBASE_PRIVATE_KEY: string
  OPENAI_API_KEY?: string
  ANTHROPIC_API_KEY?: string
}

// Extended context with Firebase admin
interface Variables {
  firebaseAdmin: ReturnType<typeof firebaseAdmin>
}

const app = new Hono<{ Bindings: CloudflareEnv; Variables: Variables }>()

// CORS configuration
app.use('*', cors({
  origin: ['https://fixflow.pages.dev', 'http://localhost:8443', 'http://localhost:5173'],
  allowHeaders: ['Content-Type', 'Authorization'],
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  credentials: true,
}))

// Health check
app.get('/health', (c) => c.json({ ok: true, service: 'fixflow-api', timestamp: new Date().toISOString() }))

// Initialize Firebase Admin for each request
app.use('*', async (c, next) => {
  try {
    c.set('firebaseAdmin', firebaseAdmin(c.env))
    await next()
  } catch (error) {
    console.error('Firebase init error:', error)
    return c.json({ ok: false, error: 'Server configuration error' }, 500)
  }
})

// API Routes
app.route('/api/counters', counters)
app.route('/api/repairs', repairs)
app.route('/api/inventory', inventory)
app.route('/api/sales', sales)
app.route('/api/billing', billing)
app.route('/api/ai', ai)
app.route('/api/reports', reports)

// 404 handler
app.notFound((c) => c.json({ ok: false, error: 'Not found' }, 404))

// Error handler
app.onError((err, c) => {
  console.error('Worker error:', err)
  return c.json({ ok: false, error: 'Internal server error' }, 500)
})

export default app