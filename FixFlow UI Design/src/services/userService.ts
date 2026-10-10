import {
  collection,
  deleteDoc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  type QueryConstraint,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore'
import { getDb } from '../firebase/config'
import { PATHS, userDoc, usersCol } from '../firebase/firestore'
import { validateUser } from '../utils/validation'
import type { Role, UserDoc, UserStatus } from '../firebase/types'
import { ROLE_PERMISSIONS } from '../firebase/types'

/**
 * Users.
 *
 * Two rules hold across this file:
 *  1. `role` and `status` are never writable by the user themselves — every
 *     write that could change them takes an explicit `actorRole` and refuses.
 *     firestore.rules enforces the same thing; this is defence in depth.
 *  2. A customer can only ever read their own document. Staff reads are
 *     branch-scoped except for admins.
 */

export const fetchUser = async (uid: string): Promise<UserDoc | null> => {
  const snap = await getDoc(userDoc(uid))
  return snap.exists() ? (snap.data() as UserDoc) : null
}

export interface ListUsersOptions {
  role?: Role
  status?: UserStatus
  branchId?: string
  n?: number
}

export const listUsers = async ({ role, status, branchId, n = 200 }: ListUsersOptions = {}): Promise<(UserDoc & { id: string })[]> => {
  const constraints: QueryConstraint[] = [orderBy('createdAt', 'desc'), limit(n)]
  if (role) constraints.unshift(where('role', '==', role))
  else if (status) constraints.unshift(where('status', '==', status))
  else if (branchId) constraints.unshift(where('branchId', '==', branchId))

  const snap = await getDocs(query(usersCol(), ...constraints))
  return snap.docs.map((d) => ({ ...(d.data() as UserDoc), id: d.id }))
}

/** Live list for the admin dashboard. */
export const subscribeUsers = (
  opts: ListUsersOptions,
  onChange: (users: (UserDoc & { id: string })[]) => void,
  onError: (message: string) => void,
): (() => void) => {
  const constraints: QueryConstraint[] = [orderBy('createdAt', 'desc'), limit(opts.n ?? 200)]
  if (opts.role) constraints.unshift(where('role', '==', opts.role))
  return onSnapshot(
    query(usersCol(), ...constraints),
    (snap) => onChange(snap.docs.map((d) => ({ ...(d.data() as UserDoc), id: d.id }))),
    (err) => onError(err.message),
  )
}

/**
 * Self-service profile update.
 *
 * Deliberately accepts a narrow shape. Even if a caller passes extra keys,
 * `role`/`status`/`uid`/`email` are stripped before the write.
 */
export const updateProfile = async (
  uid: string,
  patch: Partial<Pick<UserDoc, 'fullName' | 'phone' | 'address' | 'profileImage'>>,
): Promise<void> => {
  const result = validateUser({
    fullName: patch.fullName ?? 'x'.repeat(2),
    email: 'user@example.com',
    phone: patch.phone ?? '0771234567',
    address: patch.address ?? 'address line',
    role: 'customer',
    status: 'active',
  })
  // Only fail on the fields actually being changed.
  const relevant = Object.keys(patch)
  const errors = Object.fromEntries(Object.entries(result.errors).filter(([k]) => relevant.includes(k)))
  if (Object.keys(errors).length) {
    const err = new Error(Object.values(errors).join(' '))
    ;(err as { errors?: Record<string, string> }).errors = errors
    throw err
  }

  const { fullName, phone, address, profileImage } = patch
  const safe: Record<string, unknown> = { updatedAt: serverTimestamp() }
  if (fullName !== undefined) safe.fullName = String(fullName).trim()
  if (phone !== undefined) safe.phone = String(phone).trim()
  if (address !== undefined) safe.address = String(address).trim()
  if (profileImage !== undefined) safe.profileImage = String(profileImage)

  await updateDoc(userDoc(uid), safe)
}

/**
 * Admin-only status change.
 * `actorRole` is checked here so the UI can never disable an account through
 * a leaked button; the rules are the real gate.
 */
export const setUserStatus = async (uid: string, status: UserStatus, actorRole: Role): Promise<void> => {
  if (!ROLE_PERMISSIONS[actorRole]?.canManageUsers) {
    throw new Error('Only an administrator can enable or disable accounts.')
  }
  await updateDoc(userDoc(uid), { status, updatedAt: serverTimestamp() })
}

/** Admin-only role change. */
export const setUserRole = async (uid: string, role: Role, actorRole: Role): Promise<void> => {
  if (!ROLE_PERMISSIONS[actorRole]?.canManageUsers) {
    throw new Error('Only an administrator can change roles.')
  }
  await updateDoc(userDoc(uid), { role, updatedAt: serverTimestamp() })
}

/** Admin-only delete. Prefer disabling; deleting loses audit history. */
export const deleteUser = async (uid: string, actorRole: Role): Promise<void> => {
  if (!ROLE_PERMISSIONS[actorRole]?.canManageUsers) {
    throw new Error('Only an administrator can delete accounts.')
  }
  await deleteDoc(userDoc(uid))
}

/** Counts by role, for the dashboard KPIs. Always a real query. */
export const countUsersByRole = async (role: Role): Promise<number> => {
  const snap = await getDocs(query(collection(getDb(), PATHS.users), where('role', '==', role)))
  return snap.size
}

export const countActiveStaff = async (): Promise<number> => {
  const snap = await getDocs(
    query(collection(getDb(), PATHS.users), where('status', '==', 'active'), where('role', 'in', ['technician', 'manager', 'admin', 'cashier'])),
  )
  return snap.size
}
