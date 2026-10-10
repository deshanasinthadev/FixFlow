import { deleteObject, getDownloadURL, ref, uploadBytesResumable, type UploadTask } from 'firebase/storage'
import { getFirebaseStorage } from './config'
import { toAppError } from './errors'

/**
 * Firebase Storage.
 *
 * Rule: Firestore stores ONLY the download URL, never bytes and never a
 * base64 blob. These helpers return the URL so services can write it straight
 * into a document.
 */

export type UploadFolder =
  | 'profile-images'
  | 'device-images'
  | 'issue-images'
  | 'technician-documents'
  | 'repair-files'
  | 'invoice-files'

/** Max 10 MB per file; storage.rules enforces the same ceiling. */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024

export const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
export const ALLOWED_DOC_TYPES = ['application/pdf']

export class UploadValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'UploadValidationError'
  }
}

export interface UploadOptions {
  folder: UploadFolder
  file: File
  /** Sub-path inside the folder, usually the owning document id. */
  ownerId: string
  /** Restrict to images (photos) or allow PDFs (documents/invoices). */
  allowDocuments?: boolean
}

/**
 * Builds a deterministic, collision-free path.
 * `{folder}/{ownerId}/{timestamp}-{sanitisedName}` — the owner id in the path
 * is what lets storage.rules check ownership, so it must never be guessed.
 */
export const buildPath = ({ folder, ownerId, file }: UploadOptions): string => {
  const safeName = file.name.replace(/[^\w.\-]+/g, '_').slice(0, 80) || 'file'
  const safeOwner = String(ownerId).replace(/[^\w\-]+/g, '_').slice(0, 80) || 'anon'
  return `${folder}/${safeOwner}/${Date.now()}-${safeName}`
}

export const validateUpload = ({ file, allowDocuments }: UploadOptions): void => {
  if (file.size === 0) throw new UploadValidationError('That file is empty.')
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new UploadValidationError(`File is too large. Maximum size is ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} MB.`)
  }
  const allowed = allowDocuments ? [...ALLOWED_IMAGE_TYPES, ...ALLOWED_DOC_TYPES] : ALLOWED_IMAGE_TYPES
  // An empty type happens with some camera apps; accept it only for images
  // when the extension looks right.
  if (file.type && !allowed.includes(file.type)) {
    throw new UploadValidationError(
      allowDocuments ? 'Only JPG, PNG, WEBP, GIF or PDF files are allowed.' : 'Only JPG, PNG, WEBP or GIF images are allowed.',
    )
  }
}

export interface UploadProgress {
  /** 0-100 */
  percent: number
  url?: string
}

/**
 * Uploads and resolves with the download URL.
 *
 * `uploadBytesResumable` is used rather than `uploadBytes` so the caller can
 * show a progress bar on large repair photos over a slow connection.
 */
export const uploadFile = (opts: UploadOptions, onProgress?: (p: UploadProgress) => void): Promise<string> => {
  validateUpload(opts)
  const storageRef = ref(getFirebaseStorage(), buildPath(opts))
  const task: UploadTask = uploadBytesResumable(storageRef, opts.file)

  return new Promise<string>((resolve, reject) => {
    task.on(
      'state_changed',
      (snap) => {
        const percent = snap.totalBytes ? Math.round((snap.bytesTransferred / snap.totalBytes) * 100) : 0
        onProgress?.({ percent })
      },
      (err) => reject(toAppError(err)),
      async () => {
        try {
          const url = await getDownloadURL(task.snapshot.ref)
          onProgress?.({ percent: 100, url })
          resolve(url)
        } catch (err) {
          reject(toAppError(err))
        }
      },
    )
  })
}

/**
 * Best-effort cleanup. Deleting an orphaned file must never fail the caller's
 * write, so errors are logged and swallowed.
 */
export const deleteFileByUrl = async (url: string): Promise<void> => {
  if (!url) return
  try {
    await deleteObject(ref(getFirebaseStorage(), url))
  } catch (err) {
    console.warn('[storage] could not delete', url, toAppError(err).message)
  }
}

/** Reads a File into a data URL, for small inline previews only. */
export const fileToDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('Could not read that file.'))
    reader.readAsDataURL(file)
  })
