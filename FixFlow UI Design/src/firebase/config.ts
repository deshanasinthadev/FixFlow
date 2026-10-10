import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app'
import { getAuth, type Auth } from 'firebase/auth'
import { getFirestore, type Firestore } from 'firebase/firestore'
import { getStorage, type FirebaseStorage } from 'firebase/storage'

/**
 * Every value comes from Vite env vars. Nothing is hardcoded, so the same
 * build can point at a dev project and a prod project.
 *
 * These keys are PUBLIC by design — Firebase web config is not a secret.
 * Security comes entirely from `firestore.rules` and `storage.rules`, which is
 * why both files in this repo are complete and must be deployed.
 */
const read = (key: string): string => import.meta.env[key] ?? ''

export const firebaseConfig = {
  apiKey: read('VITE_FIREBASE_API_KEY'),
  authDomain: read('VITE_FIREBASE_AUTH_DOMAIN'),
  projectId: read('VITE_FIREBASE_PROJECT_ID'),
  storageBucket: read('VITE_FIREBASE_STORAGE_BUCKET'),
  messagingSenderId: read('VITE_FIREBASE_MESSAGING_SENDER_ID'),
  appId: read('VITE_FIREBASE_APP_ID'),
}

/** Missing keys are the single most common cause of a blank screen. */
export const missingFirebaseConfig = (Object.keys(firebaseConfig) as (keyof typeof firebaseConfig)[])
  .filter((k) => !firebaseConfig[k])

export const isFirebaseConfigured = missingFirebaseConfig.length === 0

export class FirebaseNotConfiguredError extends Error {
  readonly missing: string[]
  constructor(missing: string[]) {
    super(
      `Firebase is not configured. Missing: ${missing.join(', ')}. ` +
        'Copy .env.example to .env and fill in the values from your Firebase console.',
    )
    this.name = 'FirebaseNotConfiguredError'
    this.missing = missing
  }
}

/** Guards every init so the failure is a clear message, not a white screen. */
const requireConfig = (): void => {
  if (!isFirebaseConfigured) throw new FirebaseNotConfiguredError(missingFirebaseConfig)
}

let app: FirebaseApp | null = null

export const getFirebaseApp = (): FirebaseApp => {
  if (app) return app
  requireConfig()
  app = getApps().length ? getApp() : initializeApp(firebaseConfig)
  return app
}

let authInstance: Auth | null = null
export const getFirebaseAuth = (): Auth => {
  if (!authInstance) authInstance = getAuth(getFirebaseApp())
  return authInstance
}

let dbInstance: Firestore | null = null
export const getDb = (): Firestore => {
  if (!dbInstance) dbInstance = getFirestore(getFirebaseApp())
  return dbInstance
}

let storageInstance: FirebaseStorage | null = null
export const getFirebaseStorage = (): FirebaseStorage => {
  if (!storageInstance) storageInstance = getStorage(getFirebaseApp())
  return storageInstance
}
