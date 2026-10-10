import {
  addDoc,
  doc,
  deleteDoc,
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
import { notificationDoc, notificationsCol } from '../firebase/firestore'
import type { NotificationDoc, NotificationEvent } from '../firebase/types'
import { NOTIFICATION_LABEL } from '../utils/formatters'

/**
 * Notifications.
 *
 * Stored as a subcollection `users/{uid}/notifications` so the per-user feed
 * is a single indexed read and firestore.rules can scope it with
 * `resource.id == uid` alone — no join, no leak of other users' feeds.
 */

export interface NotifyInput {
  userId: string
  event: NotificationEvent
  /** Optional override; defaults to the standard label for the event. */
  title?: string
  body: string
  /** e.g. 'repair:abc123' — the app resolves it to a screen. */
  link?: string
  requestId?: string
}

/** Sends one notification. */
export const notify = async (input: NotifyInput): Promise<string> => {
  if (!input.userId) throw new Error('A notification needs a recipient.')
  const snap = await addDoc(notificationsCol(input.userId), {
    notificationId: '',
    userId: input.userId,
    event: input.event,
    title: input.title ?? NOTIFICATION_LABEL[input.event],
    body: input.body,
    link: input.link ?? '',
    requestId: input.requestId ?? '',
    read: false,
    createdAt: serverTimestamp(),
  })
  // Back-fill the id so the document carries its own key.
  await updateDoc(snap, { notificationId: snap.id }).catch(() => {
    /* cosmetic; the doc id is already the source of truth */
  })
  return snap.id
}

/**
 * Sends the same event to several recipients (e.g. a request going to the
 * customer AND the assigned technician) in one batched write.
 */
export const notifyMany = async (inputs: NotifyInput[]): Promise<void> => {
  const valid = inputs.filter((i) => i.userId)
  if (!valid.length) return
  const batch = writeBatch(getDb())
  valid.forEach((input) => {
    const ref = doc(notificationsCol(input.userId))
    batch.set(ref, {
      notificationId: ref.id,
      userId: input.userId,
      event: input.event,
      title: input.title ?? NOTIFICATION_LABEL[input.event],
      body: input.body,
      link: input.link ?? '',
      requestId: input.requestId ?? '',
      read: false,
      createdAt: serverTimestamp(),
    })
  })
  await batch.commit()
}

/** The user's newest notifications. */
export const fetchNotifications = async (uid: string, n = 30): Promise<(NotificationDoc & { id: string })[]> => {
  const snap = await getDocs(
    query(notificationsCol(uid), orderBy('createdAt', 'desc'), limit(n)),
  )
  return snap.docs.map((d) => ({ ...(d.data() as NotificationDoc), id: d.id }))
}

export const markRead = async (uid: string, notificationId: string): Promise<void> => {
  await updateDoc(notificationDoc(uid, notificationId), { read: true })
}

export const markAllRead = async (uid: string): Promise<void> => {
  const unread = await getDocs(query(notificationsCol(uid), where('read', '==', false)))
  if (unread.empty) return
  const batch = writeBatch(getDb())
  unread.docs.forEach((d) => batch.update(d.ref, { read: true }))
  await batch.commit()
}

export const deleteNotification = async (uid: string, notificationId: string): Promise<void> => {
  await deleteDoc(notificationDoc(uid, notificationId))
}

/** Live feed — the bell badge updates without a refresh. */
export const subscribeNotifications = (
  uid: string,
  onChange: (items: (NotificationDoc & { id: string })[]) => void,
  onError: (message: string) => void,
): (() => void) => {
  return onSnapshot(
    query(notificationsCol(uid), orderBy('createdAt', 'desc'), limit(50)),
    (snap) => onChange(snap.docs.map((d) => ({ ...(d.data() as NotificationDoc), id: d.id }))),
    (err) => onError(err.message),
  )
}
