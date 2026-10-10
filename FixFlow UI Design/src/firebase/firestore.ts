import {
  collection,
  collectionGroup,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
  type CollectionReference,
  type DocumentData,
  type DocumentReference,
  type Query,
  type QueryConstraint,
  type Unsubscribe,
} from 'firebase/firestore'
import { getDb } from './config'

/**
 * Collection paths live here and nowhere else. If a path is wrong it is wrong
 * in exactly one place, and services never build paths by hand.
 */
export const PATHS = {
  users: 'users',
  repairRequests: 'repair_requests',
  diagnoses: 'repair_diagnosis',
  repairUpdates: 'repair_updates',
  technicians: 'technicians',
  spareParts: 'spare_parts',
  invoices: 'invoices',
  payments: 'payments',
} as const

export const usersCol = (): CollectionReference<DocumentData> => collection(getDb(), PATHS.users)
export const userDoc = (uid: string): DocumentReference => doc(getDb(), PATHS.users, uid)

export const repairsCol = (): CollectionReference<DocumentData> => collection(getDb(), PATHS.repairRequests)
export const repairDoc = (requestId: string): DocumentReference => doc(getDb(), PATHS.repairRequests, requestId)

/** Subcollection: repair_requests/{id}/parts */
export const repairPartsCol = (requestId: string): CollectionReference<DocumentData> =>
  collection(getDb(), PATHS.repairRequests, requestId, 'parts')
export const repairPartDoc = (requestId: string, repairPartId: string): DocumentReference =>
  doc(getDb(), PATHS.repairRequests, requestId, 'parts', repairPartId)

/** Subcollection: users/{uid}/notifications */
export const notificationsCol = (uid: string): CollectionReference<DocumentData> =>
  collection(getDb(), PATHS.users, uid, 'notifications')
export const notificationDoc = (uid: string, notificationId: string): DocumentReference =>
  doc(getDb(), PATHS.users, uid, 'notifications', notificationId)

export const diagnosesCol = (): CollectionReference<DocumentData> => collection(getDb(), PATHS.diagnoses)
export const diagnosisDoc = (diagnosisId: string): DocumentReference => doc(getDb(), PATHS.diagnoses, diagnosisId)

export const repairUpdatesCol = (): CollectionReference<DocumentData> => collection(getDb(), PATHS.repairUpdates)
export const repairUpdateDoc = (updateId: string): DocumentReference => doc(getDb(), PATHS.repairUpdates, updateId)

export const techniciansCol = (): CollectionReference<DocumentData> => collection(getDb(), PATHS.technicians)
export const technicianDoc = (technicianId: string): DocumentReference => doc(getDb(), PATHS.technicians, technicianId)

export const partsCol = (): CollectionReference<DocumentData> => collection(getDb(), PATHS.spareParts)
export const partDoc = (partId: string): DocumentReference => doc(getDb(), PATHS.spareParts, partId)

export const invoicesCol = (): CollectionReference<DocumentData> => collection(getDb(), PATHS.invoices)
export const invoiceDoc = (invoiceId: string): DocumentReference => doc(getDb(), PATHS.invoices, invoiceId)

export const paymentsCol = (): CollectionReference<DocumentData> => collection(getDb(), PATHS.payments)
export const paymentDoc = (paymentId: string): DocumentReference => doc(getDb(), PATHS.payments, paymentId)

/**
 * Notifications are stored per user, but an admin needs "everything".
 * `collectionGroup` reads across all users' subcollections; firestore.rules
 * allows it only for staff.
 */
export const allNotificationsGroup = () => collectionGroup(getDb(), 'notifications')

/** Small helper so services read consistently. */
export const q = <T = DocumentData>(
  col: CollectionReference<DocumentData>,
  ...constraints: QueryConstraint[]
): Query<T> => query(col, ...constraints) as Query<T>

/** Newest-first is the default ordering everywhere in this app. */
export const newestFirst = (field = 'createdAt') => orderBy(field, 'desc')

export const newest = (field = 'createdAt', n = 20) => [newestFirst(field), limit(n)]

/**
 * Subscribes and hands back both data and errors. Every screen needs the
 * error branch — a listener that fails silently leaves the UI showing stale
 * data with no indication anything is wrong.
 */
export interface SnapshotState<T> {
  data: T[]
  loading: boolean
  error: string | null
  unsubscribe: Unsubscribe
}

export const subscribe = <T>(
  ref: Query<T> | DocumentReference<T>,
  onNext: (value: T[]) => void,
  onError: (message: string) => void,
  onLoading?: (loading: boolean) => void,
): Unsubscribe => {
  onLoading?.(true)
  const handleError = (err: Error): void => {
    onLoading?.(false)
    onError(err.message)
  }

  // `Query.type` is 'query' | 'collection'; only a DocumentReference is
  // 'document'. Branching on it keeps both onSnapshot overloads type-safe.
  if ((ref as DocumentReference<T>).type === 'document') {
    const docRef = ref as DocumentReference<T>
    return onSnapshot(
      docRef,
      (snap) => {
        onLoading?.(false)
        const data = snap.data()
        onNext(data ? [data] : [])
      },
      handleError,
    )
  }

  const queryRef = ref as Query<T>
  return onSnapshot(
    queryRef,
    (snap) => {
      onLoading?.(false)
      onNext(snap.docs.map((d) => d.data() as T))
    },
    handleError,
  )
}

/** Composable filters used by the services. */
export const byField = (field: string, value: unknown) => where(field, '==', value)
export const byFieldIn = (field: string, values: unknown[]) => where(field, 'in', values)
export const newestN = (n: number, field = 'createdAt') => [orderBy(field, 'desc'), limit(n)]
