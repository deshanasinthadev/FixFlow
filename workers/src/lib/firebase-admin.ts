import { initializeApp, getApps, cert, App } from 'firebase-admin/app'
import { getFirestore, Firestore } from 'firebase-admin/firestore'
import { getAuth, Auth } from 'firebase-admin/auth'

interface CloudflareEnv {
  FIREBASE_PROJECT_ID: string
  FIREBASE_CLIENT_EMAIL: string
  FIREBASE_PRIVATE_KEY: string
}

let app: App | null = null
let db: Firestore | null = null
let auth: Auth | null = null

export function firebaseAdmin(env: CloudflareEnv): { app: App; db: Firestore; auth: Auth } {
  if (getApps().length === 0) {
    const privateKey = env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
    app = initializeApp({
      credential: cert({
        projectId: env.FIREBASE_PROJECT_ID,
        clientEmail: env.FIREBASE_CLIENT_EMAIL,
        privateKey,
      }),
      projectId: env.FIREBASE_PROJECT_ID,
    })
  } else {
    const existingApp = getApps()[0]
    if (!existingApp) throw new Error('Firebase app not initialized')
    app = existingApp
  }

  if (!app) throw new Error('Failed to initialize Firebase app')

  db = getFirestore(app)
  auth = getAuth(app)

  // Configure Firestore settings
  db.settings({ ignoreUndefinedProperties: true })

  return { app, db, auth }
}

export function getDb(): Firestore {
  if (!db) throw new Error('Firestore not initialized. Call firebaseAdmin() first.')
  return db
}

export function getAuthAdmin(): Auth {
  if (!auth) throw new Error('Auth not initialized. Call firebaseAdmin() first.')
  return auth
}