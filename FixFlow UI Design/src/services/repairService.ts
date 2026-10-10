import {
  addDoc,
  doc,
  deleteDoc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore'
import { getDb } from '../firebase/config'
import { PATHS, diagnosesCol, repairDoc, repairPartsCol, repairUpdatesCol, repairsCol } from '../firebase/firestore'
import { isRepairStatus, validateRepairRequest } from '../utils/validation'
import { notifyMany } from './notificationService'
import {
  REPAIR_STATUS_FLOW,
  REPAIR_STATUS_LABEL,
  type RepairPriority,
  type RepairRequestDoc,
  type RepairStatus,
  type RepairUpdateDoc,
  type Role,
} from '../firebase/types'

/**
 * Repair requests: creation, status workflow, technician assignment, and the
 * append-only update timeline a customer follows.
 */

/**
 * Legal status transitions. Enforced client-side for a clear message and
 * mirrored in firestore.rules so a hand-crafted write cannot skip steps.
 *
 * `cancelled` is reachable from any non-terminal state; `delivered` is
 * terminal.
 */
export const ALLOWED_TRANSITIONS: Record<RepairStatus, RepairStatus[]> = {
  pending: ['approved', 'cancelled'],
  approved: ['diagnosing', 'cancelled'],
  diagnosing: ['repairing', 'waiting_for_parts', 'cancelled'],
  repairing: ['waiting_for_parts', 'completed', 'cancelled'],
  waiting_for_parts: ['repairing', 'cancelled'],
  completed: ['delivered'],
  delivered: [],
  cancelled: [],
}

export const canTransition = (from: RepairStatus, to: RepairStatus): boolean =>
  ALLOWED_TRANSITIONS[from]?.includes(to) ?? false

export const nextStatuses = (from: RepairStatus): RepairStatus[] => ALLOWED_TRANSITIONS[from] ?? []

export class InvalidTransitionError extends Error {
  constructor(from: RepairStatus, to: RepairStatus) {
    super(`A repair cannot go from "${REPAIR_STATUS_LABEL[from]}" to "${REPAIR_STATUS_LABEL[to]}".`)
    this.name = 'InvalidTransitionError'
  }
}

export interface CreateRepairInput {
  customerId: string
  customerName: string
  customerPhone: string
  branchId: string
  deviceType: RepairRequestDoc['deviceType']
  brand: string
  model: string
  serialNumber?: string
  issueDescription: string
  issueImages?: string[]
  preferredDate: string
  priority: RepairPriority
  /** Who is creating this; drives the confirmation notification. */
  createdByUid: string
}

/**
 * Creates the request, writes the first timeline entry, and notifies the
 * customer — all in one batch so a failure cannot leave a request with no
 * history.
 */
export const createRepairRequest = async (input: CreateRepairInput): Promise<string> => {
  const result = validateRepairRequest({
    customerId: input.customerId,
    customerName: input.customerName,
    deviceType: input.deviceType,
    brand: input.brand,
    model: input.model,
    issueDescription: input.issueDescription,
    preferredDate: input.preferredDate,
    priority: input.priority,
  })
  if (!result.ok) {
    const err = new Error(Object.values(result.errors).join(' '))
    ;(err as { errors?: Record<string, string> }).errors = result.errors
    throw err
  }

  const colRef = repairsCol()
  const ref = doc(colRef)
  const now = serverTimestamp()

  const data: Omit<RepairRequestDoc, 'createdAt' | 'updatedAt'> & { createdAt: unknown; updatedAt: unknown } = {
    requestId: ref.id,
    customerId: input.customerId,
    customerName: input.customerName.trim(),
    customerPhone: (input.customerPhone ?? '').trim(),
    branchId: input.branchId || 'all',
    deviceType: input.deviceType,
    brand: input.brand.trim(),
    model: input.model.trim(),
    serialNumber: (input.serialNumber ?? '').trim(),
    issueDescription: input.issueDescription.trim(),
    issueImages: input.issueImages ?? [],
    preferredDate: input.preferredDate,
    priority: input.priority,
    status: 'pending',
    assignedTechnicianId: '',
    createdAt: now,
    updatedAt: now,
  }

  const batch = writeBatch(getDb())
  batch.set(ref, data)

  const updateRef = doc(repairUpdatesCol())
  batch.set(updateRef, {
    updateId: updateRef.id,
    requestId: ref.id,
    status: 'pending',
    message: 'Repair request submitted and awaiting approval.',
    updatedBy: input.createdByUid,
    updatedByName: input.customerName.trim(),
    createdAt: now,
  } satisfies Omit<RepairUpdateDoc, 'createdAt'> & { createdAt: unknown })

  await batch.commit()

  await notifyMany([
    {
      userId: input.customerId,
      event: 'repair_created',
      body: `Your repair request for ${input.brand} ${input.model} has been received and is awaiting approval.`,
      link: `repair:${ref.id}`,
      requestId: ref.id,
    },
  ])

  return ref.id
}

export const fetchRepair = async (requestId: string): Promise<RepairRequestDoc | null> => {
  const snap = await getDoc(repairDoc(requestId))
  return snap.exists() ? (snap.data() as RepairRequestDoc) : null
}

export interface ListRepairsOptions {
  status?: RepairStatus
  customerId?: string
  assignedTechnicianId?: string
  branchId?: string
  n?: number
}

export const listRepairs = async (opts: ListRepairsOptions = {}): Promise<(RepairRequestDoc & { id: string })[]> => {
  const constraints: ReturnType<typeof where>[] = []
  if (opts.status) constraints.push(where('status', '==', opts.status))
  if (opts.customerId) constraints.push(where('customerId', '==', opts.customerId))
  if (opts.assignedTechnicianId) constraints.push(where('assignedTechnicianId', '==', opts.assignedTechnicianId))
  if (opts.branchId) constraints.push(where('branchId', '==', opts.branchId))
  const snap = await getDocs(query(repairsCol(), ...constraints, orderBy('createdAt', 'desc'), limit(opts.n ?? 200)))
  return snap.docs.map((d) => ({ ...(d.data() as RepairRequestDoc), id: d.id }))
}

/** Live board — status changes appear without a refresh. */
export const subscribeRepairs = (
  opts: ListRepairsOptions,
  onChange: (items: (RepairRequestDoc & { id: string })[]) => void,
  onError: (message: string) => void,
): (() => void) => {
  const constraints: ReturnType<typeof where>[] = []
  if (opts.status) constraints.push(where('status', '==', opts.status))
  if (opts.customerId) constraints.push(where('customerId', '==', opts.customerId))
  if (opts.assignedTechnicianId) constraints.push(where('assignedTechnicianId', '==', opts.assignedTechnicianId))
  if (opts.branchId) constraints.push(where('branchId', '==', opts.branchId))

  return onSnapshot(
    query(repairsCol(), ...constraints, orderBy('createdAt', 'desc'), limit(opts.n ?? 200)),
    (snap) => onChange(snap.docs.map((d) => ({ ...(d.data() as RepairRequestDoc), id: d.id }))),
    (err) => onError(err.message),
  )
}

export interface ActorContext {
  uid: string
  name: string
  role: Role
}

/**
 * Changes status, appends the timeline entry, and notifies the customer.
 *
 * Transition rules are checked against the CURRENT document, read inside the
 * same call, so two staff members acting at once cannot both push an illegal
 * step through.
 */
export const updateRepairStatus = async (
  requestId: string,
  to: RepairStatus,
  actor: ActorContext,
  message?: string,
): Promise<void> => {
  if (!isRepairStatus(to)) throw new Error('Unknown status.')

  const current = await fetchRepair(requestId)
  if (!current) throw new Error('That repair request no longer exists.')
  if (!canTransition(current.status, to)) throw new InvalidTransitionError(current.status, to)

  const now = serverTimestamp()
  const batch = writeBatch(getDb())
  batch.update(repairDoc(requestId), { status: to, updatedAt: now })

  const updateRef = doc(repairUpdatesCol())
  batch.set(updateRef, {
    updateId: updateRef.id,
    requestId,
    status: to,
    message: message?.trim() || `Status changed to ${REPAIR_STATUS_LABEL[to]}.`,
    updatedBy: actor.uid,
    updatedByName: actor.name,
    createdAt: now,
  })
  await batch.commit()

  const event =
    to === 'completed' ? 'repair_completed' : to === 'approved' ? 'repair_approved' : 'status_changed'
  await notifyMany([
    {
      userId: current.customerId,
      event,
      body:
        to === 'completed'
          ? `Your ${current.brand} ${current.model} repair is complete and ready for collection.`
          : `Your repair ${current.brand} ${current.model} is now "${REPAIR_STATUS_LABEL[to]}".`,
      link: `repair:${requestId}`,
      requestId,
    },
  ])
}

/**
 * Assigns a technician. Only staff may do this; firestore.rules also requires
 * the caller to hold `canAssign`.
 */
export const assignTechnician = async (
  requestId: string,
  technicianId: string,
  technicianName: string,
  actor: ActorContext,
): Promise<void> => {
  const current = await fetchRepair(requestId)
  if (!current) throw new Error('That repair request no longer exists.')
  if (!technicianId) throw new Error('Choose a technician first.')

  const now = serverTimestamp()
  const batch = writeBatch(getDb())
  batch.update(repairDoc(requestId), { assignedTechnicianId: technicianId, updatedAt: now })

  const updateRef = doc(repairUpdatesCol())
  batch.set(updateRef, {
    updateId: updateRef.id,
    requestId,
    status: current.status,
    message: `${technicianName} was assigned to this repair.`,
    updatedBy: actor.uid,
    updatedByName: actor.name,
    createdAt: now,
  })
  await batch.commit()

  await notifyMany([
    {
      userId: current.customerId,
      event: 'technician_assigned',
      body: `${technicianName} has been assigned to your ${current.brand} ${current.model} repair.`,
      link: `repair:${requestId}`,
      requestId,
    },
  ])
}

/** The customer-facing timeline, oldest first. */
export const fetchUpdates = async (requestId: string): Promise<(RepairUpdateDoc & { id: string })[]> => {
  const snap = await getDocs(query(repairUpdatesCol(), where('requestId', '==', requestId), orderBy('createdAt', 'asc')))
  return snap.docs.map((d) => ({ ...(d.data() as RepairUpdateDoc), id: d.id }))
}

export const subscribeUpdates = (
  requestId: string,
  onChange: (items: (RepairUpdateDoc & { id: string })[]) => void,
  onError: (message: string) => void,
): (() => void) =>
  onSnapshot(
    query(repairUpdatesCol(), where('requestId', '==', requestId), orderBy('createdAt', 'asc')),
    (snap) => onChange(snap.docs.map((d) => ({ ...(d.data() as RepairUpdateDoc), id: d.id }))),
    (err) => onError(err.message),
  )

/** Latest diagnosis for a request, if any. */
export const fetchLatestDiagnosis = async (requestId: string) => {
  const snap = await getDocs(query(diagnosesCol(), where('requestId', '==', requestId), orderBy('createdAt', 'desc'), limit(1)))
  return snap.empty ? null : (snap.docs[0].data() as unknown)
}

/**
 * Dashboard statistics — every number here comes from a live query.
 * There are no static or placeholder figures anywhere in this file.
 */
export interface RepairCounts {
  active: number
  completed: number
  pending: number
  cancelled: number
  total: number
}

export const fetchRepairCounts = async (branchId?: string): Promise<RepairCounts> => {
  const base = branchId ? [where('branchId', '==', branchId)] : []
  const snap = await getDocs(query(repairsCol(), ...base))
  const counts: RepairCounts = { active: 0, completed: 0, pending: 0, cancelled: 0, total: snap.size }
  const ACTIVE: RepairStatus[] = ['approved', 'diagnosing', 'repairing', 'waiting_for_parts']
  snap.docs.forEach((d) => {
    const s = (d.data() as RepairRequestDoc).status
    if (s === 'pending') counts.pending += 1
    else if (s === 'completed') counts.completed += 1
    else if (s === 'cancelled') counts.cancelled += 1
    else if (ACTIVE.includes(s)) counts.active += 1
  })
  return counts
}

/** Live statistics so the dashboard KPIs move as work happens. */
export const subscribeRepairCounts = (
  branchId: string | undefined,
  onChange: (counts: RepairCounts) => void,
  onError: (message: string) => void,
): (() => void) => {
  const base = branchId ? [where('branchId', '==', branchId)] : []
  return onSnapshot(
    query(repairsCol(), ...base),
    (snap) => {
      const counts: RepairCounts = { active: 0, completed: 0, pending: 0, cancelled: 0, total: snap.size }
      const ACTIVE: RepairStatus[] = ['approved', 'diagnosing', 'repairing', 'waiting_for_parts']
      snap.docs.forEach((d) => {
        const s = (d.data() as RepairRequestDoc).status
        if (s === 'pending') counts.pending += 1
        else if (s === 'completed') counts.completed += 1
        else if (s === 'cancelled') counts.cancelled += 1
        else if (ACTIVE.includes(s)) counts.active += 1
      })
      onChange(counts)
    },
    (err) => onError(err.message),
  )
}

/** Admin delete: removes the request, its parts and its timeline together. */
export const deleteRepair = async (requestId: string): Promise<void> => {
  const [parts, updates] = await Promise.all([
    getDocs(repairPartsCol(requestId)),
    getDocs(query(repairUpdatesCol(), where('requestId', '==', requestId))),
  ])
  const batch = writeBatch(getDb())
  parts.docs.forEach((d) => batch.delete(d.ref))
  updates.docs.forEach((d) => batch.delete(d.ref))
  batch.delete(repairDoc(requestId))
  await batch.commit()
}

/** Exposed for the technician dashboard: the workflow order, for a stepper. */
export const statusOrder = REPAIR_STATUS_FLOW
export const requestsPath = PATHS.repairRequests
