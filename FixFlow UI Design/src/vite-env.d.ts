/// <reference types="vite/client" />

/**
 * Typed env access.
 *
 * `src/firebase/config.ts` reads these by key string, so the index signature
 * below is what keeps `import.meta.env[key]` type-safe. Each variable is also
 * declared explicitly so a typo in a literal access is a compile error.
 *
 * IMPORTANT: every VITE_ variable is bundled into the shipped JS and is
 * therefore PUBLIC. The Firebase web config is designed to be public — access
 * control comes from firestore.rules and storage.rules, not from hiding these
 * values. Never put a service account key or an API secret here.
 */
interface ImportMetaEnv {
  readonly VITE_FIREBASE_API_KEY: string
  readonly VITE_FIREBASE_AUTH_DOMAIN: string
  readonly VITE_FIREBASE_PROJECT_ID: string
  readonly VITE_FIREBASE_STORAGE_BUCKET: string
  readonly VITE_FIREBASE_MESSAGING_SENDER_ID: string
  readonly VITE_FIREBASE_APP_ID: string

  /** Optional: a measurement id, if Analytics is enabled for the project. */
  readonly VITE_FIREBASE_MEASUREMENT_ID?: string

  /**
   * Optional: base URL for the AI diagnosis backend wired through
   * `configureDiagnosisProvider()`. Absent means "no AI configured", and the
   * app stores the technician's own diagnosis rather than inventing one.
   */
  readonly VITE_DIAGNOSIS_API_URL?: string
  readonly VITE_DIAGNOSIS_API_KEY?: string

  /** Key-based access for the loop in firebase/config.ts. */
  readonly [key: string]: string | undefined
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
