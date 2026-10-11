import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { createDb } from './dexie'
import type { Db } from './repository'

/**
 * Warranty (§17).
 *
 * The rule that matters most is that issued cover is immutable: changing a
 * product's warranty policy must not reach back and shorten or extend cover
 * somebody has already been given. Everything else — claims, decisions,
 * searches — hangs off a row that cannot move underneath the customer.
 */
let db: Db
let uid = 0

beforeEach(async () => {
  db = createDb(`fixflow-warranty-test-${++uid}`)
  await db.ready()
})

async function customer() {
  return db.customers.create({
    fullName: 'Warranty Holder', phone: `+947700${String(4400 + ++uid)}`, email: '', address: '', notes: '', status: 'active',
  })
}

async function product(over: Record<string, unknown> = {}) {
  return db.products.create({
    sku: `SKU-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
    name: '65W charger', category: 'Chargers',
    costCents: 900_00, priceCents: 1800_00, taxRate: 0,
    stockOnHand: 10, minStock: 2, barcode: '', isService: false,
    branchId: 'br_colombo',
    ...over,
  } as never)
}

async function policy(months = 12, appliesTo: 'product' | 'repair_service' = 'product') {
  return db.warranty.addPolicy({
    name: appliesTo === 'product' ? 'Product cover' : 'Repair service cover',
    durationMonths: months,
    terms: 'Manufacturing defects only.',
    exclusions: 'Physical and liquid damage.',
    appliesTo,
  })
}

describe('warranty.addPolicy', () => {
  it('accepts a named policy with a duration', async () => {
    const made = await policy(12)
    expect(made.durationMonths).toBe(12)
    expect(made.appliesTo).toBe('product')
  })

  it('keeps product and repair-service cover separate', async () => {
    await policy(12, 'product')
    await policy(3, 'repair_service')
    const all = await db.warranty.policies()
    expect(all).toHaveLength(2)
    expect(all.map((p) => p.appliesTo).sort()).toEqual(['product', 'repair_service'])
  })

  it('refuses a fractional duration', async () => {
    await expect(db.warranty.addPolicy({
      name: 'Broken', durationMonths: 1.5, terms: '', exclusions: '', appliesTo: 'product',
    })).rejects.toThrow(/whole number of months/)
  })

  it('refuses a policy with no name', async () => {
    await expect(db.warranty.addPolicy({
      name: '   ', durationMonths: 12, terms: '', exclusions: '', appliesTo: 'product',
    })).rejects.toThrow(/give the cover terms a name/i)
  })
})

describe('warranty.issue', () => {
  it('computes and stores the expiry from the policy', async () => {
    const cover = await policy(12)
    const buyer = await customer()
    const item = await product()

    const issued = await db.warranty.issue({
      policyId: cover.id, customerId: buyer.id, productId: item.id,
      startsAt: '2026-01-15T00:00:00.000Z',
    })

    expect(issued.expiresAt).toBe('2027-01-15T00:00:00.000Z')
    expect(issued.status).toBe('active')
    expect(issued.warrantyNumber).toMatch(/^WP-2026-0001$/)
  })

  it('numbers repair-service cover separately from product cover', async () => {
    const productCover = await policy(12, 'product')
    const serviceCover = await policy(3, 'repair_service')
    const buyer = await customer()

    const a = await db.warranty.issue({ policyId: productCover.id, customerId: buyer.id })
    const b = await db.warranty.issue({ policyId: serviceCover.id, customerId: buyer.id })

    expect(a.warrantyNumber).toMatch(/^WP-/)
    expect(b.warrantyNumber).toMatch(/^WR-/)
  })

  it('refuses to issue a policy that provides no cover', async () => {
    const none = await policy(0)
    const buyer = await customer()
    // A warranty that expires the instant it starts is not cover, and printing
    // one would mislead the customer into thinking they have it.
    await expect(db.warranty.issue({ policyId: none.id, customerId: buyer.id }))
      .rejects.toThrow(/provides no cover/)
  })

  it('rejects an unknown customer or product', async () => {
    const cover = await policy(12)
    const buyer = await customer()
    await expect(db.warranty.issue({ policyId: cover.id, customerId: 'cus_nope' }))
      .rejects.toThrow(/No customer/)
    await expect(db.warranty.issue({ policyId: cover.id, customerId: buyer.id, productId: 'prd_nope' }))
      .rejects.toThrow(/No product/)
  })
})

describe('warranty.updatePolicy', () => {
  it('§17 — leaves cover already issued completely alone', async () => {
    const cover = await policy(12)
    const buyer = await customer()
    const item = await product()
    const issued = await db.warranty.issue({
      policyId: cover.id, customerId: buyer.id, productId: item.id,
      startsAt: '2026-01-15T00:00:00.000Z',
    })
    expect(issued.expiresAt).toBe('2027-01-15T00:00:00.000Z')

    // The shop halves its warranty to 6 months.
    const changed = await db.warranty.updatePolicy(cover.id, {
      name: 'Product cover', durationMonths: 6, terms: '', exclusions: '', appliesTo: 'product',
    })
    expect(changed.durationMonths).toBe(6)

    // The customer's cover is still what they were sold.
    const still = await db.warranty.get(issued.id)
    expect(still!.expiresAt).toBe('2027-01-15T00:00:00.000Z')

    // And a new issue uses the new terms.
    const fresh = await db.warranty.issue({
      policyId: cover.id, customerId: buyer.id, productId: item.id,
      startsAt: '2026-01-15T00:00:00.000Z',
    })
    expect(fresh.expiresAt).toBe('2026-07-15T00:00:00.000Z')
  })

  it('refuses an unknown policy', async () => {
    await expect(db.warranty.updatePolicy('wtp_nope', {
      name: 'x', durationMonths: 1, terms: '', exclusions: '', appliesTo: 'product',
    })).rejects.toThrow(/No cover terms/)
  })
})

describe('warranty.list and status', () => {
  it('shows live cover as active', async () => {
    const cover = await policy(12)
    const buyer = await customer()
    await db.warranty.issue({ policyId: cover.id, customerId: buyer.id })
    const rows = await db.warranty.list()
    expect(rows[0].status).toBe('active')
  })

  it('shows lapsed cover as expired without anything having written to it', async () => {
    // Cover issued in the past, already out of date. Nothing marks it expired;
    // the read works it out, because no job runs at midnight to update rows.
    const cover = await policy(1)
    const buyer = await customer()
    const old = new Date()
    old.setMonth(old.getMonth() - 13)
    await db.warranty.issue({
      policyId: cover.id, customerId: buyer.id, startsAt: old.toISOString(),
    })
    const rows = await db.warranty.list()
    expect(rows[0].status).toBe('expired')
  })

  it('leaves withdrawn cover withdrawn rather than recomputing it to expired', async () => {
    const cover = await policy(12)
    const buyer = await customer()
    const issued = await db.warranty.issue({ policyId: cover.id, customerId: buyer.id })
    await db.warranty.void(issued.id, 'Device was returned for a refund.')
    const rows = await db.warranty.list()
    expect(rows[0].status).toBe('void')
  })
})

describe('warranty.search', () => {
  it('finds cover by warranty number', async () => {
    const cover = await policy(12)
    const buyer = await customer()
    const issued = await db.warranty.issue({ policyId: cover.id, customerId: buyer.id })
    const found = await db.warranty.search(issued.warrantyNumber)
    expect(found).toHaveLength(1)
  })

  it('finds cover by the customer phone number', async () => {
    const cover = await policy(12)
    const buyer = await customer()
    await db.warranty.issue({ policyId: cover.id, customerId: buyer.id })
    expect(await db.warranty.search(buyer.phone)).toHaveLength(1)
  })

  it('finds cover by product name', async () => {
    const cover = await policy(12)
    const buyer = await customer()
    const item = await product({ name: 'USB-C hub' })
    await db.warranty.issue({ policyId: cover.id, customerId: buyer.id, productId: item.id })
    expect(await db.warranty.search('usb-c hub')).toHaveLength(1)
  })

  it('finds cover by the repair job number', async () => {
    const cover = await policy(3, 'repair_service')
    const buyer = await customer()
    const device = await db.devices.create({
      customerId: buyer.id, category: 'laptop', brand: 'Lenovo', model: 'ThinkPad',
      serialNumber: 'LN-TP-9', purchaseDate: '', notes: '',
    })
    const job = await db.repairs.create({
      branchId: 'br_colombo', customerId: buyer.id, deviceId: device.id,
      customerName: buyer.fullName, phone: buyer.phone, email: '',
      deviceSummary: 'Lenovo ThinkPad', serialNumber: 'LN-TP-9',
      reportedIssue: 'Screen flicker.', deviceCondition: 'Good',
      accessoriesReceived: [], intakePhotoUrls: [], completionPhotoUrls: [],
      priority: 'normal', status: 'received', technicianId: '',
      receivedAt: new Date().toISOString(), expectedCompletion: '',
      internalNotes: '', customerVisibleNotes: [], labourCost: 0,
    })
    await db.warranty.issue({ policyId: cover.id, customerId: buyer.id, repairId: job.id })
    expect(await db.warranty.search(job.jobNumber)).toHaveLength(1)
  })

  it('returns nothing for an empty search', async () => {
    expect(await db.warranty.search('   ')).toHaveLength(0)
  })

  it('does not match cover belonging to somebody else', async () => {
    const cover = await policy(12)
    const buyer = await customer()
    const stranger = await customer()
    await db.warranty.issue({ policyId: cover.id, customerId: buyer.id })
    expect(await db.warranty.search(stranger.phone)).toHaveLength(0)
  })
})

describe('warranty.expiringSoon', () => {
  it('lists cover ending inside the window', async () => {
    const cover = await policy(12)
    const buyer = await customer()
    const soon = new Date()
    soon.setDate(soon.getDate() - 360) // issued a year ago, 12-month cover
    await db.warranty.issue({ policyId: cover.id, customerId: buyer.id, startsAt: soon.toISOString() })
    expect(await db.warranty.expiringSoon(30)).toHaveLength(1)
  })

  it('does not list cover that has already lapsed', async () => {
    const cover = await policy(1)
    const buyer = await customer()
    const old = new Date()
    old.setMonth(old.getMonth() - 13)
    await db.warranty.issue({ policyId: cover.id, customerId: buyer.id, startsAt: old.toISOString() })
    // Expired is a different state from expiring soon; mixing them would make
    // the "ending soon" list a list of dead cover.
    expect(await db.warranty.expiringSoon(30)).toHaveLength(0)
  })
})

describe('warranty.void', () => {
  it('requires a reason', async () => {
    const cover = await policy(12)
    const buyer = await customer()
    const issued = await db.warranty.issue({ policyId: cover.id, customerId: buyer.id })
    await expect(db.warranty.void(issued.id, '  ')).rejects.toThrow(/record why/i)
  })

  it('refuses to withdraw cover twice', async () => {
    const cover = await policy(12)
    const buyer = await customer()
    const issued = await db.warranty.issue({ policyId: cover.id, customerId: buyer.id })
    await db.warranty.void(issued.id, 'Refunded.')
    await expect(db.warranty.void(issued.id, 'Again.')).rejects.toThrow(/already withdrawn/i)
  })
})

describe('warranty claims', () => {
  async function liveWarranty() {
    const cover = await policy(12)
    const buyer = await customer()
    return db.warranty.issue({ policyId: cover.id, customerId: buyer.id })
  }

  it('records a claim against live cover', async () => {
    const issued = await liveWarranty()
    const claim = await db.warranty.submitClaim({
      warrantyId: issued.id, reportedIssue: 'Charger stopped working after a month.',
    })
    expect(claim.status).toBe('submitted')
    expect(claim.claimNumber).toMatch(/^WCL-2026-0001$/)
    expect(claim.customerId).toBe(issued.customerId)
  })

  it('refuses a claim against lapsed cover', async () => {
    const cover = await policy(1)
    const buyer = await customer()
    const old = new Date()
    old.setMonth(old.getMonth() - 13)
    const issued = await db.warranty.issue({
      policyId: cover.id, customerId: buyer.id, startsAt: old.toISOString(),
    })
    await expect(db.warranty.submitClaim({ warrantyId: issued.id, reportedIssue: 'Broken.' }))
      .rejects.toThrow(/expired on/)
  })

  it('refuses a claim against withdrawn cover', async () => {
    const issued = await liveWarranty()
    await db.warranty.void(issued.id, 'Refunded.')
    await expect(db.warranty.submitClaim({ warrantyId: issued.id, reportedIssue: 'Broken.' }))
      .rejects.toThrow(/withdrawn/)
  })

  it('requires a description', async () => {
    const issued = await liveWarranty()
    await expect(db.warranty.submitClaim({ warrantyId: issued.id, reportedIssue: '  ' }))
      .rejects.toThrow(/describe what has gone wrong/i)
  })

  it('walks the claim through inspection to a decision', async () => {
    const issued = await liveWarranty()
    const claim = await db.warranty.submitClaim({ warrantyId: issued.id, reportedIssue: 'Dead on arrival.' })

    const inspected = await db.warranty.inspect(claim.id, 'Internal fuse blown, no external damage.')
    expect(inspected.status).toBe('under_inspection')
    expect(inspected.findings).toContain('fuse')

    const decided = await db.warranty.decideClaim(claim.id, 'approved', {
      findings: 'Internal fuse blown, no external damage.',
    }, 'usr_manager')
    expect(decided.status).toBe('approved')
    // §17 — who decided is part of the record.
    expect(decided.decidedBy).toBe('usr_manager')
    expect(decided.decidedAt).not.toBe('')

    const started = await db.warranty.startClaimWork(claim.id)
    expect(started.status).toBe('in_progress')

    const resolved = await db.warranty.resolveClaim(claim.id, 'Fuse and board replaced.')
    expect(resolved.status).toBe('resolved')
    expect(resolved.resolution).toContain('replaced')

    const closed = await db.warranty.closeClaim(claim.id)
    expect(closed.status).toBe('closed')
  })

  it('marks the cover claimed once a claim is approved', async () => {
    const issued = await liveWarranty()
    const claim = await db.warranty.submitClaim({ warrantyId: issued.id, reportedIssue: 'Dead.' })
    await db.warranty.inspect(claim.id, 'Confirmed fault.')
    await db.warranty.decideClaim(claim.id, 'approved', { findings: 'Confirmed fault.' }, 'usr_manager')
    expect((await db.warranty.get(issued.id))!.status).toBe('claimed')
  })

  it('§17 — refuses to decide before findings are recorded', async () => {
    const issued = await liveWarranty()
    const claim = await db.warranty.submitClaim({ warrantyId: issued.id, reportedIssue: 'Dead.' })
    // Never inspected, so there is nothing to decide on.
    await expect(db.warranty.decideClaim(claim.id, 'approved', { findings: '   ' }, 'usr_manager'))
      .rejects.toThrow(/before deciding/i)
  })

  it('refuses to start work on a claim that was not approved', async () => {
    const issued = await liveWarranty()
    const claim = await db.warranty.submitClaim({ warrantyId: issued.id, reportedIssue: 'Dead.' })
    await db.warranty.inspect(claim.id, 'Confirmed.')
    await db.warranty.decideClaim(claim.id, 'rejected', { findings: 'Confirmed.' }, 'usr_manager')
    await expect(db.warranty.startClaimWork(claim.id)).rejects.toThrow(/only an approved claim/i)
  })

  it('refuses to resolve a claim that has not started', async () => {
    const issued = await liveWarranty()
    const claim = await db.warranty.submitClaim({ warrantyId: issued.id, reportedIssue: 'Dead.' })
    await expect(db.warranty.resolveClaim(claim.id, 'Fixed.')).rejects.toThrow(/cannot be resolved yet/i)
  })

  it('lists claims for one warranty without mixing in another', async () => {
    const a = await liveWarranty()
    const b = await liveWarranty()
    await db.warranty.submitClaim({ warrantyId: a.id, reportedIssue: 'One.' })
    expect(await db.warranty.claimsFor(a.id)).toHaveLength(1)
    expect(await db.warranty.claimsFor(b.id)).toHaveLength(0)
  })

  it('rejects an unknown claim', async () => {
    await expect(db.warranty.inspect('wcl_nope', 'Findings.')).rejects.toThrow(/No claim/)
  })
})

describe('warranty numbering', () => {
  it('increments per prefix and year', async () => {
    const cover = await policy(12)
    const buyer = await customer()
    const first = await db.warranty.issue({ policyId: cover.id, customerId: buyer.id })
    const second = await db.warranty.issue({ policyId: cover.id, customerId: buyer.id })
    expect(first.warrantyNumber).toBe('WP-2026-0001')
    expect(second.warrantyNumber).toBe('WP-2026-0002')
  })

  it('does not let the repair-service prefix inherit the product counter', async () => {
    const productCover = await policy(12, 'product')
    const serviceCover = await policy(3, 'repair_service')
    const buyer = await customer()
    await db.warranty.issue({ policyId: productCover.id, customerId: buyer.id })
    await db.warranty.issue({ policyId: productCover.id, customerId: buyer.id })
    const service = await db.warranty.issue({ policyId: serviceCover.id, customerId: buyer.id })
    // Its own sequence, starting at one.
    expect(service.warrantyNumber).toBe('WR-2026-0001')
  })
})
