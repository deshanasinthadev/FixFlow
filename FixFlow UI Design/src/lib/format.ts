/**
 * Formatting happens at the edge only. Storage is integer cents and ISO
 * timestamps — see `db/schema.ts`. The old code stored "Rs. 18,500" and
 * "Today, 4:30 PM" as data, which cannot be summed, sorted or compared.
 */

const lkr = new Intl.NumberFormat('en-LK', { maximumFractionDigits: 2 })

export function formatLKR(cents: number): string {
  return `Rs. ${lkr.format(cents / 100)}`
}

export function formatLKRCompact(cents: number): string {
  const rupees = cents / 100
  if (Math.abs(rupees) >= 1_000_000) return `Rs. ${(rupees / 1_000_000).toFixed(2)}M`
  if (Math.abs(rupees) >= 1_000) return `Rs. ${Math.round(rupees / 1_000)}K`
  return formatLKR(cents)
}

export function formatDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function formatDateTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function relativeTime(iso: string, now: Date = new Date()): string {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return '—'
  const mins = Math.round((now.getTime() - then) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} min ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`
  const days = Math.round(hours / 24)
  if (days < 30) return `${days} day${days === 1 ? '' : 's'} ago`
  return formatDate(iso)
}

export const available = (p: { stockOnHand: number; reserved: number }) =>
  p.stockOnHand - p.reserved
