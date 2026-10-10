import {
  EmailAuthProvider,
  createUserWithEmailAndPassword,
  getIdTokenResult,
  onAuthStateChanged,
  reauthenticateWithCredential,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  updatePassword,
  updateProfile,
  type User,
} from 'firebase/auth'
import { doc, getDoc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore'
import { getFirebaseAuth, getDb } from './config'
import { PATHS, userDoc } from './firestore'
import { toAppError } from './errors'
import type { Role, UserDoc } from './types'

/**
 * Auth + the `users` profile document are kept in step here.
 *
 * A Firebase Auth account and its Firestore profile are two writes that can
 * fail independently; `createUser` therefore creates the profile immediately
 * and, if that write fails, deletes nothing (the auth account is left so an
 * admin can retry the profile) but surfaces the error clearly.
 */

export interface Session {
  uid: string
  email: string
  profile: UserDoc | null
  /** The `role` claim from the custom token, if one was issued. */
  claimRole: string | null
}

/**
 * Reads the profile document for a signed-in user.
 *
 * Returns null when the profile is missing or the rules reject the read —
 * the caller decides whether that is fatal.
 */
export const fetchProfile = async (uid: string): Promise<UserDoc | null> => {
  try {
    const snap = await getDoc(userDoc(uid))
    return snap.exists() ? (snap.data() as UserDoc) : null
  } catch (err) {
    // permission-denied here means the account exists but has no readable
    // profile, or the user is disabled. Not thrown: the UI shows a message.
    console.warn('[auth] could not read profile', uid, toAppError(err).message)
    return null
  }
}

export interface CreateUserData {
  email: string
  password: string
  fullName: string
  phone: string
  address?: string
  /**
   * Only an admin may create a non-customer account. This value is echoed into
   * the Firestore document, but the AUTHORITATIVE role lives in the custom
   * token claim — firestore.rules checks `request.auth.token.role`, so a
   * client that lies here still cannot act above its real role.
   */
  role: Role
  branchId?: string
  profileImage?: string
}

export const createUser = async (data: CreateUserData): Promise<{ uid: string }> => {
  const cred = await createUserWithEmailAndPassword(getFirebaseAuth(), data.email.trim(), data.password)
  const uid = cred.user.uid

  await updateProfile(cred.user, { displayName: data.fullName }).catch(() => {
    /* display name is cosmetic; never block account creation on it */
  })

  const now = serverTimestamp()
  const profile: Omit<UserDoc, 'createdAt' | 'updatedAt'> & { createdAt: unknown; updatedAt: unknown } = {
    uid,
    fullName: data.fullName.trim(),
    email: data.email.trim().toLowerCase(),
    phone: data.phone.trim(),
    address: (data.address ?? '').trim(),
    profileImage: data.profileImage ?? '',
    role: data.role,
    status: 'active',
    branchId: data.branchId ?? 'all',
    createdAt: now,
    updatedAt: now,
  }
  await setDoc(userDoc(uid), profile)

  return { uid }
}

export const signIn = async (email: string, password: string): Promise<Session> => {
  const cred = await signInWithEmailAndPassword(getFirebaseAuth(), email.trim(), password)
  const uid = cred.user.uid

  const [profile, claims] = await Promise.all([fetchProfile(uid), readClaims(uid)])

  if (profile && profile.status === 'disabled') {
    // Do not let a disabled account keep a live session.
    await signOut(getFirebaseAuth())
    const err = new Error('This account has been disabled. Contact an administrator.')
    ;(err as { code?: string }).code = 'auth/user-disabled'
    throw err
  }

  return { uid, email: cred.user.email ?? email.trim(), profile, claimRole: claims.role ?? null }
}

/** Custom-token claims, used by the rules. Null when no claim was issued. */
export const readClaims = async (uid: string): Promise<{ role?: string }> => {
  const user = getFirebaseAuth().currentUser
  if (!user || user.uid !== uid) return {}
  try {
    const result = await getIdTokenResult(user, true)
    return (result.claims ?? {}) as { role?: string }
  } catch {
    return {}
  }
}

export const logOut = async (): Promise<void> => {
  await signOut(getFirebaseAuth())
}

/**
 * Subscribes to auth state. Resolves with the full session (including the
 * Firestore profile) rather than the bare Firebase user, so the app never has
 * to do a second round-trip before it knows the role.
 */
export const onSession = (cb: (session: Session | null) => void, onError?: (message: string) => void): (() => void) => {
  return onAuthStateChanged(
    getFirebaseAuth(),
    async (user: User | null) => {
      if (!user) {
        cb(null)
        return
      }
      try {
        const [profile, claims] = await Promise.all([fetchProfile(user.uid), readClaims(user.uid)])
        cb({ uid: user.uid, email: user.email ?? '', profile, claimRole: claims.role ?? null })
      } catch (err) {
        onError?.(toAppError(err).message)
        cb({ uid: user.uid, email: user.email ?? '', profile: null, claimRole: null })
      }
    },
    (err) => onError?.(toAppError(err).message),
  )
}

/** Updates only the fields a user owns. Role and status are never in scope. */
export const updateOwnProfile = async (
  uid: string,
  patch: Partial<Pick<UserDoc, 'fullName' | 'phone' | 'address' | 'profileImage'>>,
): Promise<void> => {
  // Explicitly drop role/status if a caller smuggles them in — the rules
  // reject the write, but failing early gives a better message.
  const safe = { ...patch } as Record<string, unknown>
  delete safe.role
  delete safe.status
  await updateDoc(userDoc(uid), { ...safe, updatedAt: serverTimestamp() })
}

export const resetPassword = async (email: string): Promise<void> => {
  await sendPasswordResetEmail(getFirebaseAuth(), email.trim())
}

/** Requires the current password — Firebase will not change a password blind. */
export const changePassword = async (currentPassword: string, newPassword: string): Promise<void> => {
  const user = getFirebaseAuth().currentUser
  if (!user?.email) throw new Error('You must be signed in to change your password.')
  if (newPassword.length < 6) throw new Error('Password must be at least 6 characters.')
  const cred = EmailAuthProvider.credential(user.email, currentPassword)
  await reauthenticateWithCredential(user, cred)
  await updatePassword(user, newPassword)
}

/**
 * Enables/disables a user. Note this flips the Firestore flag; actually
 * disabling the Firebase Auth account itself requires the Admin SDK from a
 * trusted backend. `signIn` refuses a disabled profile, and firestore.rules
 * blocks writes from a disabled user, so the client-facing effect is complete.
 */
export const setUserStatus = async (uid: string, status: 'active' | 'disabled'): Promise<void> => {
  await updateDoc(doc(getDb(), PATHS.users, uid), { status, updatedAt: serverTimestamp() })
}

/** Admin-only: changes a user's role. Mirrored into the document only. */
export const setUserRole = async (uid: string, role: Role): Promise<void> => {
  await updateDoc(doc(getDb(), PATHS.users, uid), { role, updatedAt: serverTimestamp() })
}
