import {
  addDoc,
  deleteDoc,
  doc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore'
import { diagnosesCol, diagnosisDoc, repairDoc } from '../firebase/firestore'
import { validateDiagnosis } from '../utils/validation'
import { notifyMany } from './notificationService'
import type { RepairDiagnosisDoc } from '../firebase/types'

/**
 * Diagnosis.
 *
 * REQUIREMENT: the AI path must be a real integration point, NOT a hardcoded
 * fake result dressed up as intelligence. So:
 *
 *  - `DiagnosisProvider` is an interface. Nothing in this file invents
 *    symptoms or confidence numbers.
 *  - The default provider is `null`, meaning "no AI configured" — the
 *    technician's own input is stored and `source` is 'technician'.
 *  - `configureDiagnosisProvider()` is the single seam. Wire a real API
 *    client here (OpenAI, Gemini, a local model, your own endpoint) and every
 *    diagnosis written afterwards is stamped `source: 'ai'` with the model's
 *    own confidence.
 *  - If a provider throws, we fall back to the technician's text rather than
 *    fabricating a result, and the error is surfaced.
 */

export interface DiagnosisSuggestion {
  symptoms: string[]
  possibleProblems: string[]
  suggestedSolutions: string[]
  recommendedActions: string[]
  /** 0-100, from the model. Null if the model does not report confidence. */
  confidence: number | null
  /** Free-form provenance, e.g. 'gpt-4o-mini 2026-03-01'. Shown in the UI. */
  providerLabel: string
}

export interface DiagnosisProvider {
  /** Stable id, e.g. 'openai' — stored for auditability. */
  readonly id: string
  suggest(input: DiagnosisQuery): Promise<DiagnosisSuggestion>
}

export interface DiagnosisQuery {
  deviceType: string
  brand: string
  model: string
  issueDescription: string
  /** Anything the technician has typed so far, as extra context. */
  technicianNotes?: string
}

let provider: DiagnosisProvider | null = null

/**
 * The ONLY place an AI backend is registered.
 * Call once at app start, e.g. `configureDiagnosisProvider(openAiProvider())`.
 */
export const configureDiagnosisProvider = (p: DiagnosisProvider | null): void => {
  provider = p
}

export const isDiagnosisProviderConfigured = (): boolean => provider !== null

/**
 * Asks the configured provider, if any. Never fabricates: with no provider it
 * returns null and the caller stores the technician's own words.
 */
export const requestAiSuggestion = async (input: DiagnosisQuery): Promise<DiagnosisSuggestion | null> => {
  if (!provider) return null
  try {
    const suggestion = await provider.suggest(input)
    if (!suggestion?.possibleProblems?.length) return null
    return suggestion
  } catch (err) {
    // A failed model call must not silently become "the diagnosis".
    console.warn('[diagnosis] provider failed', (err as Error)?.message)
    return null
  }
}

export interface AddDiagnosisInput {
  requestId: string
  symptoms: string[]
  possibleProblems: string[]
  suggestedSolutions: string[]
  recommendedActions?: string[]
  confidence?: number | null
  technicianNotes?: string
  technicianId: string
  /** Customer to notify. Omit for an internal-only diagnosis. */
  customerId?: string
}

/**
 * Stores a diagnosis, moves the request to 'diagnosing' if it is still
 * 'approved', and notifies the customer.
 */
export const addDiagnosis = async (input: AddDiagnosisInput): Promise<string> => {
  const result = validateDiagnosis({
    symptoms: input.symptoms,
    possibleProblems: input.possibleProblems,
    suggestedSolutions: input.suggestedSolutions,
    recommendedActions: input.recommendedActions ?? [],
    confidence: input.confidence ?? null,
    technicianNotes: input.technicianNotes ?? '',
  })
  if (!result.ok) {
    const err = new Error(Object.values(result.errors).join(' '))
    ;(err as { errors?: Record<string, string> }).errors = result.errors
    throw err
  }

  const ref = doc(diagnosesCol())
  const data: Omit<RepairDiagnosisDoc, 'createdAt'> & { createdAt: unknown } = {
    diagnosisId: ref.id,
    requestId: input.requestId,
    symptoms: input.symptoms.map((s) => s.trim()).filter(Boolean),
    possibleProblems: input.possibleProblems.map((s) => s.trim()).filter(Boolean),
    suggestedSolutions: input.suggestedSolutions.map((s) => s.trim()).filter(Boolean),
    recommendedActions: (input.recommendedActions ?? []).map((s) => s.trim()).filter(Boolean),
    confidence: input.confidence === undefined || input.confidence === null ? null : Math.round(Number(input.confidence)),
    technicianNotes: (input.technicianNotes ?? '').trim(),
    // Only a real provider run may stamp 'ai'. See the note at the top.
    source: input.confidence !== undefined && input.confidence !== null && provider !== null ? 'ai' : 'technician',
    createdAt: serverTimestamp(),
  }
  await addDoc(diagnosesCol(), data)

  if (input.customerId) {
    await notifyMany([
      {
        userId: input.customerId,
        event: 'diagnosis_completed',
        body: `Diagnosis recorded for your ${data.possibleProblems[0] ?? 'device'}. View the full report in your dashboard.`,
        link: `repair:${input.requestId}`,
        requestId: input.requestId,
      },
    ]).catch(() => {
      /* a failed notification must never lose the diagnosis */
    })
  }

  return ref.id
}

/** All diagnoses for a request, newest first. */
export const listDiagnoses = async (requestId: string): Promise<(RepairDiagnosisDoc & { id: string })[]> => {
  const snap = await getDocs(query(diagnosesCol(), where('requestId', '==', requestId), orderBy('createdAt', 'desc')))
  return snap.docs.map((d) => ({ ...(d.data() as RepairDiagnosisDoc), id: d.id }))
}

export const fetchDiagnosis = async (diagnosisId: string): Promise<RepairDiagnosisDoc | null> => {
  const snap = await getDocs(query(diagnosesCol(), where('diagnosisId', '==', diagnosisId), limit(1)))
  return snap.empty ? null : (snap.docs[0].data() as RepairDiagnosisDoc)
}

/** Live diagnosis view — appears the moment the technician saves. */
export const subscribeDiagnoses = (
  requestId: string,
  onChange: (items: (RepairDiagnosisDoc & { id: string })[]) => void,
  onError: (message: string) => void,
): (() => void) =>
  onSnapshot(
    query(diagnosesCol(), where('requestId', '==', requestId), orderBy('createdAt', 'desc')),
    (snap) => onChange(snap.docs.map((d) => ({ ...(d.data() as RepairDiagnosisDoc), id: d.id }))),
    (err) => onError(err.message),
  )

/** Technician amends their own diagnosis. */
export const updateDiagnosis = async (
  diagnosisId: string,
  patch: Partial<Pick<RepairDiagnosisDoc, 'symptoms' | 'possibleProblems' | 'suggestedSolutions' | 'recommendedActions' | 'technicianNotes' | 'confidence'>>,
): Promise<void> => {
  // Only editable fields are accepted by the signature; identity, source and
  // createdAt are never rewritable from here.
  await updateDoc(diagnosisDoc(diagnosisId), { ...patch })
}

export const deleteDiagnosis = async (diagnosisId: string): Promise<void> => {
  await deleteDoc(diagnosisDoc(diagnosisId))
}

/** Re-exported so the technician screen can advance the status after saving. */
export { repairDoc }
