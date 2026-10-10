import {
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  increment,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore'
import { getDb } from '../firebase/config'
import { partDoc, partsCol, repairPartDoc, repairPartsCol } from '../firebase/firestore'
import { computePartsCost, partStatusFor } from '../utils/formatters'
import { parseInteger, parseMoneyToCents, validateSparePart } from '../utils/validation'
import type { PartStatus, RepairPartDoc, Role, SparePartDoc } from '../firebase/types'
import { ROLE_PERMISSIONS } from '../firebase/types'

/**
 * Spare parts and the request <-> part join.
 *
 * Stock is only ever changed inside a Firestore TRANSACTION. That is the whole
 * point: two technicians using the last unit at the same time must not both
 * succeed. A read-then-write outside a transaction would allow exactly that.
 */

export class OutOfStockError extends Error {
  constructor(partName: string, requested: number, available: number) {
    super(`Not enough "${partName}" in stock: requested ${requested}, ${available} available.`)
    this.name = 'OutOfStockError'
  }
}

export interface CreatePartInput {
  partName: string
  category: string
  compatibleDevices?: string[]
  quantity: number | string
  minQuantity?: number | string
  unitPrice: number | string
  supplier?: string
}

export const createPart = async (input: CreatePartInput, actorRole: Role): Promise<string> => {
  if (!ROLE_PERMISSIONS[actorRole]?.canManageParts) {
    throw new Error('Only a manager or administrator can add spare parts.')
  }
  const result = validateSparePart({
    partName: input.partName,
    category: input.category,
    quantity: input.quantity,
    minQuantity: input.minQuantity ?? 0,
    unitPrice: input.unitPrice,
    supplier: input.supplier ?? '',
  })
  if (!result.ok) {
    const err = new Error(Object.values(result.errors).join(' '))
    ;(err as { errors?: Record<string, string> }).errors = result.errors
    throw err
  }

  const quantity = parseInteger(input.quantity) as number
  const minQuantity = parseInteger(input.minQuantity ?? 0) as number
  const unitPrice = parseMoneyToCents(input.unitPrice) as number

  const ref = doc(partsCol())
  const now = serverTimestamp()
  await setDoc(ref, {
    partId: ref.id,
    partName: input.partName.trim(),
    category: input.category.trim(),
    compatibleDevices: (input.compatibleDevices ?? []).map((d) => d.trim()).filter(Boolean),
    quantity,
    minQuantity,
    unitPrice,
    supplier: (input.supplier ?? '').trim(),
    status: partStatusFor(quantity, minQuantity),
    createdAt: now,
    updatedAt: now,
  })
  return ref.id
}

export const fetchPart = async (partId: string): Promise<SparePartDoc | null> => {
  const snap = await getDoc(partDoc(partId))
  return snap.exists() ? (snap.data() as SparePartDoc) : null
}

export const listParts = async (opts: { category?: string; status?: PartStatus; search?: string; n?: number } = {}): Promise<
  (SparePartDoc & { id: string })[]
> => {
  const constraints = []
  if (opts.category) constraints.push(where('category', '==', opts.category))
  if (opts.status) constraints.push(where('status', '==', opts.status))
  const snap = await getDocs(query(partsCol(), ...constraints, orderBy('partName', 'asc'), limit(opts.n ?? 500)))
  let rows = snap.docs.map((d) => ({ ...(d.data() as SparePartDoc), id: d.id }))
  if (opts.search) {
    const needle = opts.search.trim().toLowerCase()
    rows = rows.filter((p) => `${p.partName} ${p.category} ${p.supplier}`.toLowerCase().includes(needle))
  }
  return rows
}

export const subscribeParts = (
  onChange: (items: (SparePartDoc & { id: string })[]) => void,
  onError: (message: string) => void,
): (() => void) =>
  onSnapshot(
    query(partsCol(), orderBy('partName', 'asc'), limit(500)),
    (snap) => onChange(snap.docs.map((d) => ({ ...(d.data() as SparePartDoc), id: d.id }))),
    (err) => onError(err.message),
  )

export const updatePart = async (
  partId: string,
  patch: Partial<Pick<SparePartDoc, 'partName' | 'category' | 'compatibleDevices' | 'unitPrice' | 'supplier' | 'minQuantity'>>,
  actorRole: Role,
): Promise<void> => {
  if (!ROLE_PERMISSIONS[actorRole]?.canManageParts) {
    throw new Error('Only a manager or administrator can edit spare parts.')
  }
  await updateDoc(partDoc(partId), { ...patch, updatedAt: serverTimestamp() })
}

/**
 * Restocks (or writes off, for a negative delta) atomically.
 *
 * Runs in a transaction so the post-change quantity is rechecked against zero
 * using the CURRENT value, not a stale client copy.
 */
export const adjustStock = async (partId: string, delta: number): Promise<void> => {
  const d = Math.round(delta)
  if (!Number.isInteger(d) || d === 0) throw new Error('Stock adjustment must be a non-zero whole number.')

  await runTransaction(getDb(), async (tx) => {
    const ref = partDoc(partId)
    const snap = await tx.get(ref)
    if (!snap.exists()) throw new Error('That spare part no longer exists.')
    const part = snap.data() as SparePartDoc
    const next = part.quantity + d
    if (next < 0) throw new OutOfStockError(part.partName, -d, part.quantity)
    tx.update(ref, { quantity: next, status: partStatusFor(next, part.minQuantity), updatedAt: serverTimestamp() })
  })
}

/** Adds a part to a repair and decrements stock in the same transaction. */
export const addPartToRepair = async (
  requestId: string,
  partId: string,
  quantity: number,
  addedBy: string,
): Promise<string> => {
  const qty = Math.round(Number(quantity))
  if (!Number.isInteger(qty) || qty <= 0) throw new Error('Quantity must be a positive whole number.')

  const repairPartRef = doc(repairPartsCol(requestId))

  await runTransaction(getDb(), async (tx) => {
    const partRef = partDoc(partId)
    const partSnap = await tx.get(partRef)
    if (!partSnap.exists()) throw new Error('That spare part no longer exists.')
    const part = partSnap.data() as SparePartDoc
    if (part.quantity < qty) throw new OutOfStockError(part.partName, qty, part.quantity)

    const next = part.quantity - qty
    tx.update(partRef, { quantity: next, status: partStatusFor(next, part.minQuantity), updatedAt: serverTimestamp() })
    tx.set(repairPartRef, {
      requestId,
      repairPartId: repairPartRef.id,
      partId,
      partName: part.partName,
      quantity: qty,
      unitPrice: part.unitPrice,
      totalPrice: part.unitPrice * qty,
      addedBy,
      createdAt: serverTimestamp(),
    })
  })
  return repairPartRef.id
}

/**
 * Removes a part from a repair and returns the units to stock.
 * Both writes happen together, so stock can never drift from the parts list.
 */
export const removePartFromRepair = async (requestId: string, repairPartId: string): Promise<void> => {
  await runTransaction(getDb(), async (tx) => {
    const lineRef = repairPartDoc(requestId, repairPartId)
    const lineSnap = await tx.get(lineRef)
    if (!lineSnap.exists()) throw new Error('That part is not on this repair.')
    const line = lineSnap.data() as RepairPartDoc

    const partRef = partDoc(line.partId)
    const partSnap = await tx.get(partRef)
    if (partSnap.exists()) {
      const part = partSnap.data() as SparePartDoc
      const next = part.quantity + line.quantity
      tx.update(partRef, { quantity: next, status: partStatusFor(next, part.minQuantity), updatedAt: serverTimestamp() })
    }
    tx.delete(lineRef)
  })
}

/** Changes the quantity of a part already on a repair, adjusting stock by the difference. */
export const updateRepairPartQuantity = async (
  requestId: string,
  repairPartId: string,
  newQuantity: number,
): Promise<void> => {
  const qty = Math.round(Number(newQuantity))
  if (!Number.isInteger(qty) || qty <= 0) throw new Error('Quantity must be a positive whole number.')

  await runTransaction(getDb(), async (tx) => {
    const lineRef = repairPartDoc(requestId, repairPartId)
    const lineSnap = await tx.get(lineRef)
    if (!lineSnap.exists()) throw new Error('That part is not on this repair.')
    const line = lineSnap.data() as RepairPartDoc
    const diff = qty - line.quantity
    if (diff === 0) return

    const partRef = partDoc(line.partId)
    const partSnap = await tx.get(partRef)
    if (partSnap.exists()) {
      const part = partSnap.data() as SparePartDoc
      const next = part.quantity - diff
      if (next < 0) throw new OutOfStockError(part.partName, diff, part.quantity)
      tx.update(partRef, { quantity: next, status: partStatusFor(next, part.minQuantity), updatedAt: serverTimestamp() })
    }
    tx.update(lineRef, { quantity: qty, totalPrice: line.unitPrice * qty })
  })
}

export const listRepairParts = async (requestId: string): Promise<(RepairPartDoc & { id: string })[]> => {
  const snap = await getDocs(repairPartsCol(requestId))
  return snap.docs.map((d) => ({ ...(d.data() as RepairPartDoc), id: d.id }))
}

/** Live parts list for the technician's "add part" panel. */
export const subscribeRepairParts = (
  requestId: string,
  onChange: (items: (RepairPartDoc & { id: string })[]) => void,
  onError: (message: string) => void,
): (() => void) =>
  onSnapshot(
    repairPartsCol(requestId),
    (snap) => onChange(snap.docs.map((d) => ({ ...(d.data() as RepairPartDoc), id: d.id }))),
    (err) => onError(err.message),
  )

/** Total parts cost for a repair, recomputed from the live lines. */
export const computeRepairPartsCost = async (requestId: string): Promise<number> => {
  const lines = await listRepairParts(requestId)
  return computePartsCost(lines)
}

export const deletePart = async (partId: string, actorRole: Role): Promise<void> => {
  if (!ROLE_PERMISSIONS[actorRole]?.canManageParts) {
    throw new Error('Only a manager or administrator can delete spare parts.')
  }
  await deleteDoc(partDoc(partId))
}

/** Parts at or below their reorder point — the dashboard's low-stock KPI. */
export const subscribeLowStock = (
  onChange: (items: (SparePartDoc & { id: string })[]) => void,
  onError: (message: string) => void,
): (() => void) =>
  onSnapshot(
    query(partsCol(), where('status', 'in', ['low_stock', 'out_of_stock']), limit(200)),
    (snap) => onChange(snap.docs.map((d) => ({ ...(d.data() as SparePartDoc), id: d.id }))),
    (err) => onError(err.message),
  )

/** Kept exported so callers can batch multi-part writes if they need to. */
export const partsBatch = () => writeBatch(getDb())
export { increment }
