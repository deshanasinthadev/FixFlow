import { FirebaseError } from 'firebase/app'

/**
 * Firebase throws codes like `auth/invalid-credential`; users cannot act on
 * those. This maps every code the app can actually hit to a plain sentence and
 * tells the caller whether retrying is worthwhile.
 */
export interface AppError {
  code: string
  message: string
  /** 'auth' | 'permission' | 'network' | 'validation' | 'storage' | 'unknown' */
  kind: 'auth' | 'permission' | 'network' | 'validation' | 'storage' | 'not-found' | 'unknown'
  /** Show a Retry button. Only true for transient failures. */
  retryable: boolean
  /** The original error, for console logging. */
  cause: unknown
}

const AUTH_MESSAGES: Record<string, string> = {
  'auth/invalid-email': 'That email address is not valid.',
  'auth/user-disabled': 'This account has been disabled. Contact an administrator.',
  'auth/user-not-found': 'No account found with that email.',
  'auth/wrong-password': 'Incorrect password.',
  'auth/invalid-credential': 'Incorrect email or password.',
  'auth/email-already-in-use': 'An account with that email already exists.',
  'auth/weak-password': 'Password must be at least 6 characters.',
  'auth/too-many-requests': 'Too many attempts. Wait a moment and try again.',
  'auth/network-request-failed': 'No internet connection. Check your network and retry.',
  'auth/requires-recent-login': 'Please sign in again before changing your password.',
  'auth/popup-closed-by-user': 'Sign-in was cancelled.',
  'auth/operation-not-allowed': 'This sign-in method is not enabled for the project.',
}

const FIRESTORE_MESSAGES: Record<string, string> = {
  'permission-denied': 'You do not have permission to do that.',
  'unauthenticated': 'Your session expired. Please sign in again.',
  'not-found': 'That record no longer exists.',
  'already-exists': 'That record already exists.',
  'unavailable': 'Cannot reach the server. Check your connection.',
  'deadline-exceeded': 'The request timed out. Please retry.',
  'resource-exhausted': 'Quota exceeded. Please try again later.',
  'failed-precondition': 'The query needs an index that has not been created yet.',
  'invalid-argument': 'Some of the data sent was invalid.',
  'cancelled': 'The request was cancelled.',
  'aborted': 'The write conflicted with another change. Please retry.',
}

const STORAGE_MESSAGES: Record<string, string> = {
  'storage/unauthorized': 'You do not have permission to upload that file.',
  'storage/canceled': 'Upload cancelled.',
  'storage/unknown': 'Upload failed. Please retry.',
  'storage/object-not-found': 'That file no longer exists.',
  'storage/quota-exceeded': 'Storage quota exceeded.',
  'storage/retry-limit-exceeded': 'Upload failed after several attempts. Please retry.',
}

const NETWORKISH = new Set(['auth/network-request-failed', 'unavailable', 'deadline-exceeded', 'storage/retry-limit-exceeded'])

export const toAppError = (err: unknown): AppError => {
  const base = { cause: err }

  if (err instanceof FirebaseError) {
    const code = err.code
    if (code.startsWith('auth/')) {
      return {
        ...base,
        code,
        kind: 'auth',
        message: AUTH_MESSAGES[code] ?? 'Sign-in failed. Please try again.',
        retryable: NETWORKISH.has(code),
      }
    }
    if (code.startsWith('storage/')) {
      return {
        ...base,
        code,
        kind: 'storage',
        message: STORAGE_MESSAGES[code] ?? 'File upload failed.',
        retryable: NETWORKISH.has(code),
      }
    }
    return {
      ...base,
      code,
      kind: code === 'permission-denied' ? 'permission' : code === 'not-found' ? 'not-found' : 'unknown',
      message: FIRESTORE_MESSAGES[code] ?? 'Something went wrong. Please try again.',
      retryable: NETWORKISH.has(code),
    }
  }

  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return { ...base, code: 'offline', kind: 'network', message: 'You are offline. Reconnect and retry.', retryable: true }
  }

  if (err instanceof Error && err.message) {
    return { ...base, code: 'error', kind: 'unknown', message: err.message, retryable: false }
  }

  return { ...base, code: 'unknown', kind: 'unknown', message: 'Something went wrong. Please try again.', retryable: false }
}

/** Convenience for toast/error UI: just the sentence. */
export const errorMessage = (err: unknown): string => toAppError(err).message
