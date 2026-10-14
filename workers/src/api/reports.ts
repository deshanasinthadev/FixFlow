// @ts-nocheck
import { Hono } from 'hono'
import { getDb } from '../lib/firebase-admin.js'

interface CloudflareEnv {
  FIREBASE_PROJECT_ID: string
  FIREBASE_CLIENT_EMAIL: string
  FIREBASE_PRIVATE_KEY: string
  OPENAI_API_KEY?: string
  ANTHROPIC_API_KEY?: string
}

const reports = new Hono<{ Bindings: CloudflareEnv }>()

interface SaleDoc {
  total: number
  taxAmount: number
  paymentMethod: string
  createdAt: any
  items: any[]
}

interface RepairDoc {
  status: string
  actualCost: number
  deviceType: string
  assignedTechnicianId: string | undefined
  createdAt: any
  updatedAt: any
}

interface PartDoc {
  quantity: number
  unitPrice: number
  minStock: number
  category: string
  name: string
}

// Sales report
reports.get('/sales', async (c) => {
  try {
    const { branchId, startDate, endDate } = c.req.query()
    const db = getDb()

    let query: any = db.collection('sales')

    if (branchId) query = query.where('branchId', '==', branchId)
    if (startDate) query = query.where('createdAt', '>=', new Date(startDate))
    if (endDate) query = query.where('createdAt', '<=', new Date(endDate))

    const snapshot = await query.get()
    const sales = snapshot.docs.map(doc => {
      const data = doc.data() as SaleDoc
      return { id: doc.id, ...data }
    })

    // Aggregate data
    const totalSales = sales.length
    const totalRevenue = sales.reduce((sum, s) => sum + (s.total ?? 0), 0)
    const totalTax = sales.reduce((sum, s) => sum + (s.taxAmount ?? 0), 0)
    const avgSale = totalSales > 0 ? totalRevenue / totalSales : 0

    // Group by payment method
    const byPaymentMethod = sales.reduce((acc, s) => {
      const method = s.paymentMethod ?? 'unknown'
      acc[method] = (acc[method] ?? 0) + (s.total ?? 0)
      return acc
    }, {} as Record<string, number>)

    // Group by day
    const byDay = sales.reduce((acc, s) => {
      const day = s.createdAt?.toDate?.()?.toISOString?.().split('T')[0] ?? 'unknown'
      acc[day] = (acc[day] ?? 0) + (s.total ?? 0)
      return acc
    }, {} as Record<string, number>)

    // Top selling items
    const itemSales: Record<string, { name: string; quantity: number; revenue: number }> = {}
    for (const sale of sales) {
      for (const item of sale.items ?? []) {
        const key = item.itemId ?? item.name
        if (!itemSales[key]) {
          itemSales[key] = { name: item.name, quantity: 0, revenue: 0 }
        }
        itemSales[key].quantity += item.quantity ?? 0
        itemSales[key].revenue += item.totalPrice ?? 0
      }
    }
    const topItems = Object.values(itemSales)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10)

    return c.json({
      ok: true,
      report: {
        period: { startDate, endDate },
        summary: { totalSales, totalRevenue, totalTax, avgSale },
        byPaymentMethod,
        byDay,
        topItems,
      },
    })
  } catch (error) {
    console.error('Sales report error:', error)
    return c.json({ ok: false, error: 'Failed to generate sales report' }, 500)
  }
})

// Repair report
reports.get('/repairs', async (c) => {
  try {
    const { branchId, startDate, endDate, status } = c.req.query()
    const db = getDb()

    let query: any = db.collection('repairs')

    if (branchId) query = query.where('branchId', '==', branchId)
    if (status) query = query.where('status', '==', status)
    if (startDate) query = query.where('createdAt', '>=', new Date(startDate))
    if (endDate) query = query.where('createdAt', '<=', new Date(endDate))

    const snapshot = await query.get()
    const repairs = snapshot.docs.map(doc => {
      const data = doc.data() as RepairDoc
      return { id: doc.id, ...data }
    })

    // Aggregate data
    const totalRepairs = repairs.length
    const completedRepairs = repairs.filter(r => r.status === 'delivered').length
    const avgRepairTime = calculateAvgRepairTime(repairs)
    const totalRevenue = repairs.reduce((sum, r) => sum + (r.actualCost ?? 0), 0)

    // By status
    const byStatus = repairs.reduce((acc, r) => {
      acc[r.status] = (acc[r.status] ?? 0) + 1
      return acc
    }, {} as Record<string, number>)

    // By device type
    const byDeviceType = repairs.reduce((acc, r) => {
      acc[r.deviceType] = (acc[r.deviceType] ?? 0) + 1
      return acc
    }, {} as Record<string, number>)

    // By technician
    const byTechnician = repairs.reduce((acc, r) => {
      if (r.assignedTechnicianId) {
        acc[r.assignedTechnicianId] = (acc[r.assignedTechnicianId] ?? 0) + 1
      }
      return acc
    }, {} as Record<string, number>)

    return c.json({
      ok: true,
      report: {
        period: { startDate, endDate },
        summary: { totalRepairs, completedRepairs, avgRepairTime, totalRevenue },
        byStatus,
        byDeviceType,
        byTechnician,
      },
    })
  } catch (error) {
    console.error('Repair report error:', error)
    return c.json({ ok: false, error: 'Failed to generate repair report' }, 500)
  }
})

// Inventory report
reports.get('/inventory', async (c) => {
  try {
    const { branchId } = c.req.query()
    const db = getDb()

    let query: any = db.collection('inventory')
    if (branchId) query = query.where('branchId', '==', branchId)

    const snapshot = await query.get()
    const parts = snapshot.docs.map(doc => {
      const data = doc.data() as PartDoc
      return { id: doc.id, ...data }
    })

    const totalParts = parts.length
    const totalValue = parts.reduce((sum, p) => sum + (p.quantity * p.unitPrice), 0)
    const lowStock = parts.filter(p => p.quantity <= p.minStock)
    const outOfStock = parts.filter(p => p.quantity === 0)

    // By category
    const byCategory = parts.reduce((acc, p) => {
      acc[p.category] = (acc[p.category] ?? 0) + 1
      return acc
    }, {} as Record<string, number>)

    // Inventory value by category
    const valueByCategory = parts.reduce((acc, p) => {
      acc[p.category] = (acc[p.category] ?? 0) + (p.quantity * p.unitPrice)
      return acc
    }, {} as Record<string, number>)

    return c.json({
      ok: true,
      report: {
        summary: { totalParts, totalValue, lowStockCount: lowStock.length, outOfStockCount: outOfStock.length },
        lowStockItems: lowStock.slice(0, 20).map(p => ({ id: p.id, name: p.name, quantity: p.quantity, minStock: p.minStock })),
        outOfStockItems: outOfStock.slice(0, 20).map(p => ({ id: p.id, name: p.name })),
        byCategory,
        valueByCategory,
      },
    })
  } catch (error) {
    console.error('Inventory report error:', error)
    return c.json({ ok: false, error: 'Failed to generate inventory report' }, 500)
  }
})

// Technician performance report
reports.get('/technicians', async (c) => {
  try {
    const { branchId, startDate, endDate } = c.req.query()
    const db = getDb()

    let query: any = db.collection('repairs')
    if (branchId) query = query.where('branchId', '==', branchId)
    if (startDate) query = query.where('createdAt', '>=', new Date(startDate))
    if (endDate) query = query.where('createdAt', '<=', new Date(endDate))

    const snapshot = await query.get()
    const repairs = snapshot.docs.map(doc => {
      const data = doc.data() as RepairDoc
      return { id: doc.id, ...data }
    })

    // Get all users for names
    const techIds = [...new Set(repairs.map(r => r.assignedTechnicianId).filter(Boolean))]
    const technicians = await Promise.all(
      techIds.map(async (id) => {
        const doc = await db.collection('users').doc(id).get()
        return { id, name: doc.exists ? (doc.data()?.name ?? doc.data()?.email ?? 'Unknown') : 'Unknown' }
      })
    )
    const techNames = Object.fromEntries(technicians.map(t => [t.id, t.name]))

    // Aggregate by technician
    const techStats: Record<string, { name: string; assigned: number; completed: number; totalRevenue: number; avgTime: number }> = {}

    for (const repair of repairs) {
      const techId = repair.assignedTechnicianId
      if (!techId) continue

      if (!techStats[techId]) {
        techStats[techId] = { name: techNames[techId] ?? techId, assigned: 0, completed: 0, totalRevenue: 0, avgTime: 0 }
      }

      techStats[techId].assigned++
      if (repair.status === 'delivered') {
        techStats[techId].completed++
        techStats[techId].totalRevenue += repair.actualCost ?? 0
      }
    }

    // Calculate avg time per tech
    for (const techId of Object.keys(techStats)) {
      const techRepairs = repairs.filter(r => r.assignedTechnicianId === techId && r.status === 'delivered')
      techStats[techId].avgTime = calculateAvgRepairTime(techRepairs)
    }

    return c.json({
      ok: true,
      report: {
        period: { startDate, endDate },
        technicians: Object.values(techStats),
      },
    })
  } catch (error) {
    console.error('Technician report error:', error)
    return c.json({ ok: false, error: 'Failed to generate technician report' }, 500)
  }
})

// Dashboard summary
reports.get('/dashboard', async (c) => {
  try {
    const { branchId } = c.req.query()
    const db = getDb()

    const now = new Date()
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    const startOfWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)

    // Get recent repairs
    let repairsQuery: any = db.collection('repairs')
    if (branchId) repairsQuery = repairsQuery.where('branchId', '==', branchId)
    repairsQuery = repairsQuery.where('createdAt', '>=', startOfMonth).orderBy('createdAt', 'desc').limit(10)
    const repairsSnap = await repairsQuery.get()
    const recentRepairs = repairsSnap.docs.map(doc => {
      const data = doc.data() as RepairDoc
      return { id: doc.id, ...data }
    })

    // Get recent sales
    let salesQuery: any = db.collection('sales')
    if (branchId) salesQuery = salesQuery.where('branchId', '==', branchId)
    salesQuery = salesQuery.where('createdAt', '>=', startOfWeek).orderBy('createdAt', 'desc').limit(10)
    const salesSnap = await salesQuery.get()
    const recentSales = salesSnap.docs.map(doc => {
      const data = doc.data() as SaleDoc
      return { id: doc.id, ...data }
    })

    // Get low stock count
    let invQuery: any = db.collection('inventory')
    if (branchId) invQuery = invQuery.where('branchId', '==', branchId)
    const invSnap = await invQuery.get()
    const parts = invSnap.docs.map(doc => {
      const data = doc.data() as PartDoc
      return { id: doc.id, ...data }
    })
    const lowStockCount = parts.filter(p => p.quantity <= p.minStock).length

    // Monthly stats
    const monthlyRepairs = repairsSnap.docs.length
    const monthlyRevenue = recentSales.reduce((sum, s) => sum + (s.total ?? 0), 0)

    return c.json({
      ok: true,
      dashboard: {
        monthlyRepairs,
        monthlyRevenue,
        lowStockCount,
        pendingRepairs: recentRepairs.filter(r => ['received', 'diagnosing', 'awaiting_approval', 'in_progress', 'awaiting_parts'].includes(r.status)).length,
        recentRepairs: recentRepairs.slice(0, 5),
        recentSales: recentSales.slice(0, 5),
      },
    })
  } catch (error) {
    console.error('Dashboard error:', error)
    return c.json({ ok: false, error: 'Failed to load dashboard' }, 500)
  }
})

function calculateAvgRepairTime(repairs: any[]): number {
  const completed = repairs.filter(r => r.status === 'delivered' && r.createdAt && r.updatedAt)
  if (completed.length === 0) return 0

  const totalHours = completed.reduce((sum, r) => {
    const created = r.createdAt?.toDate?.()?.getTime?.() ?? 0
    const updated = r.updatedAt?.toDate?.()?.getTime?.() ?? 0
    return sum + (updated - created) / (1000 * 60 * 60)
  }, 0)

  return Math.round(totalHours / completed.length * 10) / 10
}

export { reports }