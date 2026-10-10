import {
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore'
import { repairsCol, technicianDoc, techniciansCol } from '../firebase/firestore'
import { partStatusFor } from '../utils/formatters'
import type {
  RepairRequestDoc,
  Role,
  TechnicianAvailability,
  TechnicianDoc,
  UserStatus,
} from '../firebase/types'
import { ROLE_PERMISSIONS } from '../firebase/types'

/**
 * Technicians, and the technician's own view of their assigned work.
 *
 * A technician profile is a SEPARATE document from `users/{uid}`: the auth
 * account holds identity and role, this holds trade detail (skills,
 * experience, availability). They are linked by `userId`.
 */

export const AVAILABILITIES: TechnicianAvailability[] = ['available', 'busy', 'on_leave', 'inactive']

export interface CreateTechnicianInput {
  userId: string
  fullName: string
  specialization: string
  experience: number
  skills: string[]
  documents?: string[]
  branchId: string
  availability?: TechnicianAvailability
}

export const createTechnician = async (input: CreateTechnicianInput, actorRole: Role): Promise<string> => {
  if (!ROLE_PERMISSIONS[actorRole]?.canAssignTechnicians) {
    throw new Error('Only a manager or administrator can add technicians.')
  }
  if (!input.userId) throw new Error('A technician must be linked to a user account.')
  if (!input.fullName.trim()) throw new Error('Technician name is required.')
  if (!Number.isInteger(input.experience) || input.experience < 0 || input.experience > 60) {
    throw new Error('Experience must be a whole number of years between 0 and 60.')
  }

  const ref = doc(techniciansCol())
  const now = serverTimestamp()
  await setDoc(ref, {
      technicianId: ref.id,
      userId: input.userId,
      fullName: input.fullName.trim(),
      specialization: input.specialization.trim(),
      experience: input.experience,
      availability: input.availability ?? 'available',
      skills: input.skills.map((s) => s.trim()).filter(Boolean),
      documents: input.documents ?? [],
      branchId: input.branchId || 'all',
      status: 'active' as UserStatus,
      createdAt: now,
      updatedAt: now,
  })
  return ref.id
}

export const fetchTechnician = async (technicianId: string): Promise<TechnicianDoc | null> => {
  const snap = await getDoc(technicianDoc(technicianId))
  return snap.exists() ? (snap.data() as TechnicianDoc) : null
}

export const findTechnicianByUserId = async (userId: string): Promise<(TechnicianDoc & { id: string }) | null> => {
  const snap = await getDocs(query(techniciansCol(), where('userId', '==', userId), limit(1)))
  return snap.empty ? null : { ...(snap.docs[0].data() as TechnicianDoc), id: snap.docs[0].id }
}

export const listTechnicians = async (opts: { branchId?: string; onlyAvailable?: boolean; n?: number } = {}): Promise<
  (TechnicianDoc & { id: string })[]
> => {
  const constraints = []
  if (opts.branchId) constraints.push(where('branchId', '==', opts.branchId))
  const snap = await getDocs(
    query(techniciansCol(), ...constraints, orderBy('fullName', 'asc'), limit(opts.n ?? 200)),
  )
  let rows = snap.docs.map((d) => ({ ...(d.data() as TechnicianDoc), id: d.id }))
  if (opts.onlyAvailable) rows = rows.filter((t) => t.availability === 'available' && t.status === 'active')
  return rows
}

export const subscribeTechnicians = (
  opts: { branchId?: string } = {},
  onChange: (items: (TechnicianDoc & { id: string })[]) => void,
  onError: (message: string) => void,
): (() => void) => {
  const constraints = []
  if (opts.branchId) constraints.push(where('branchId', '==', opts.branchId))
  return onSnapshot(
    query(techniciansCol(), ...constraints, orderBy('fullName', 'asc'), limit(200)),
    (snap) => onChange(snap.docs.map((d) => ({ ...(d.data() as TechnicianDoc), id: d.id }))),
    (err) => onError(err.message),
  )
}

export const updateTechnician = async (
  technicianId: string,
  patch: Partial<Pick<TechnicianDoc, 'specialization' | 'experience' | 'availability' | 'skills' | 'documents' | 'status'>>,
  actorRole: Role,
): Promise<void> => {
  if (!ROLE_PERMISSIONS[actorRole]?.canAssignTechnicians) {
    throw new Error('Only a manager or administrator can edit technicians.')
  }
  await updateDoc(technicianDoc(technicianId), { ...patch, updatedAt: serverTimestamp() })
}

export const deleteTechnician = async (technicianId: string, actorRole: Role): Promise<void> => {
  if (!ROLE_PERMISSIONS[actorRole]?.canManageUsers) {
    throw new Error('Only an administrator can remove technicians.')
  }
  // Refuse if work is still assigned — reassign first, don't orphan repairs.
  const assigned = await getDocs(
    query(repairsCol(), where('assignedTechnicianId', '==', technicianId), where('status', 'in', ['approved', 'diagnosing', 'repairing', 'waiting_for_parts'])),
  )
  if (!assigned.empty) {
    throw new Error(`This technician still has ${assigned.size} active repair(s). Reassign them first.`)
  }
  await deleteDoc(technicianDoc(technicianId))
}

/**
 * The technician's own queue: repairs assigned to them that are not finished.
 * firestore.rules allows this read only when
 * `resource.data.assignedTechnicianId == request.auth.uid`.
 */
export const subscribeAssignedRepairs = (
  technicianId: string,
  onChange: (items: (RepairRequestDoc & { id: string })[]) => void,
  onError: (message: string) => void,
): (() => void) =>
  onSnapshot(
    query(
      repairsCol(),
      where('assignedTechnicianId', '==', technicianId),
      where('status', 'in', ['approved', 'diagnosing', 'repairing', 'waiting_for_parts', 'completed']),
      orderBy('priority', 'desc'),
      limit(100),
    ),
    (snap) => onChange(snap.docs.map((d) => ({ ...(d.data() as RepairRequestDoc), id: d.id }))),
    (err) => onError(err.message),
  )

/** Workload per technician, so assignment can be balanced. */
export const fetchWorkload = async (branchId?: string): Promise<Record<string, number>> => {
  const snap = await getDocs(
    query(
      repairsCol(),
      ...(branchId ? [where('branchId', '==', branchId)] : []),
      where('status', 'in', ['approved', 'diagnosing', 'repairing', 'waiting_for_parts']),
    ),
  )
  const load: Record<string, number> = {}
  snap.docs.forEach((d) => {
    const techId = (d.data() as RepairRequestDoc).assignedTechnicianId
    if (techId) load[techId] = (load[techId] ?? 0) + 1
  })
  return load
}

/** Derives stock status from quantity vs reorder point — reused by parts. */
export { partStatusFor }
