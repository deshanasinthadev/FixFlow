import { useMemo, useRef, useState } from 'react'
import { Icon } from '../../components/Icon'
import {
  guessMapping,
  issuesToCsv,
  parseCsv,
  validateRows,
  type ColumnMap,
  type ParsedCsv,
  type RowIssue,
} from '../../csv/pipeline'
import { useDb } from '../../db/store'
import type { DuplicateStrategy } from '../../db/repository'
import { downloadText, readFileText, stamp } from '../../lib/download'
import { productImportFields, productTemplateCsv } from './productFields'

type Stage = 'pick' | 'map' | 'review' | 'done'

type Validated = {
  valid: Array<Record<string, unknown>>
  issues: RowIssue[]
}

/**
 * The five-stage import pipeline from DATA-PLAN.md:
 * upload -> map -> validate/preview -> commit -> (undo).
 *
 * Nothing is written until the user confirms on the review step, and the commit
 * is a single transaction, so a half-applied file is not possible.
 */
export function ImportWizard({ branchId, close }: { branchId: string; close: () => void }) {
  const { db, bump } = useDb()
  const fileInput = useRef<HTMLInputElement>(null)

  const [stage, setStage] = useState<Stage>('pick')
  const [filename, setFilename] = useState('')
  const [parsed, setParsed] = useState<ParsedCsv | null>(null)
  const [mapping, setMapping] = useState<ColumnMap>({})
  const [strategy, setStrategy] = useState<DuplicateStrategy>('update')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<{ batchId: string; created: number; updated: number; skipped: number } | null>(null)

  const validated: Validated | null = useMemo(() => {
    if (!parsed) return null
    return validateRows(parsed.rows, { fields: productImportFields, mapping })
  }, [parsed, mapping])

  const mappedCount = useMemo(
    () => productImportFields.filter((f) => Object.values(mapping).includes(f.key)).length,
    [mapping],
  )
  const missingRequired = productImportFields
    .filter((f) => f.required)
    .filter((f) => !Object.values(mapping).includes(f.key))

  async function onFile(file: File) {
    setError('')
    try {
      const text = await readFileText(file)
      const csv = parseCsv(text)
      if (csv.rows.length === 0) {
        setError('That file has a header but no data rows.')
        return
      }
      setFilename(file.name)
      setParsed(csv)
      setMapping(guessMapping(csv.headers, productImportFields))
      setStage('map')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not read that file.')
    }
  }

  async function commit() {
    if (!validated) return
    setBusy(true)
    setError('')
    try {
      const res = await db.imports.products(validated.valid, {
        branchId,
        strategy,
        filename,
      })
      setResult(res)
      setStage('done')
      bump()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The import failed. Nothing was written.')
    } finally {
      setBusy(false)
    }
  }

  async function undo() {
    if (!result) return
    setBusy(true)
    setError('')
    try {
      await db.imports.undo(result.batchId)
      bump()
      close()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Undo failed.')
      setBusy(false)
    }
  }

  const valid = validated?.valid.length ?? 0
  const failed = validated?.issues.length ?? 0

  return (
    <div className="modal-wrap" onMouseDown={close}>
      <div className="modal import-modal" onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Import products">
        <div className="modal-head">
          <div>
            <h2>Import products</h2>
            <p>{filename || 'CSV · UTF-8 · comma separated'}</p>
          </div>
          <button className="icon-btn" onClick={close} aria-label="Close"><Icon name="close" /></button>
        </div>

        <div className="wizard-steps">
          {(['pick', 'map', 'review', 'done'] as Stage[]).map((s, i) => {
            const order = ['pick', 'map', 'review', 'done']
            const state = order.indexOf(stage) > i ? 'done' : stage === s ? 'active' : ''
            return (
              <div className={state} key={s}>
                <span>{order.indexOf(stage) > i ? <Icon name="check" size={13} /> : i + 1}</span>
                <strong>{{ pick: 'File', map: 'Columns', review: 'Review', done: 'Imported' }[s]}</strong>
              </div>
            )
          })}
        </div>

        {error && <div className="login-error"><Icon name="alert" /><span><strong>Something went wrong</strong>{error}</span></div>}

        {stage === 'pick' && (
          <div className="wizard-body">
            <div className="dropzone" onClick={() => fileInput.current?.click()} role="button" tabIndex={0}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') fileInput.current?.click() }}>
              <Icon name="download" size={26} />
              <strong>Choose a CSV file</strong>
              <span>Excel: File → Save As → CSV UTF-8. XLSX is not read directly.</span>
            </div>
            <input ref={fileInput} type="file" accept=".csv,text/csv" hidden
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void onFile(f) }} />
            <div className="wizard-hint">
              <Icon name="spark" size={15} />
              <span>
                <strong>Start from the template.</strong> Column names must match yours, so if your
                supplier sends their own layout the next step lets you map it — and save it.
              </span>
              <Button kind="secondary" icon="download"
                onClick={() => downloadText('fixflow-product-template.csv', productTemplateCsv())}>
                Download template
              </Button>
            </div>
          </div>
        )}

        {stage === 'map' && parsed && (
          <div className="wizard-body">
            <div className="map-summary">
              <span>{mappedCount} of {productImportFields.length} columns mapped</span>
              {missingRequired.length > 0
                ? <span className="danger-text">Required and unmapped: {missingRequired.map((f) => f.label).join(', ')}</span>
                : <span className="ok-text">All required columns mapped</span>}
            </div>
            <div className="mapping-grid">
              {parsed.headers.map((header) => (
                <label key={header}>
                  <span className="map-source" title={header}>{header}</span>
                  <Icon name="arrow" size={13} />
                  <select value={mapping[header] ?? ''}
                    onChange={(e) => setMapping((m) => ({ ...m, [header]: e.target.value || null }))}>
                    <option value="">— ignore —</option>
                    {productImportFields.map((f) => (
                      <option key={f.key} value={f.key}>{f.label}{f.required ? ' *' : ''}</option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
            <div className="preview-strip">
              <span>First row preview</span>
              {productImportFields
                .filter((f) => Object.values(mapping).includes(f.key))
                .slice(0, 5)
                .map((f) => {
                  const header = Object.entries(mapping).find(([, v]) => v === f.key)?.[0] ?? ''
                  return <div key={f.key}><small>{f.label}</small><strong>{parsed.rows[0]?.[header] || '—'}</strong></div>
                })}
            </div>
            <div className="modal-actions">
              <Button kind="secondary" onClick={() => setStage('pick')}>Back</Button>
              <Button disabled={missingRequired.length > 0} onClick={() => setStage('review')}>
                Check {parsed.rows.length} rows <Icon name="arrow" size={14} />
              </Button>
            </div>
          </div>
        )}

        {stage === 'review' && validated && (
          <div className="wizard-body">
            <div className="review-counts">
              <div className="ok"><strong>{valid}</strong><span>rows will import</span></div>
              <div className="bad"><strong>{failed}</strong><span>rows have problems</span></div>
              <div className="total"><strong>{parsed?.rows.length ?? 0}</strong><span>rows in file</span></div>
            </div>

            <label className="strategy">
              <span>If a SKU already exists</span>
              <select value={strategy} onChange={(e) => setStrategy(e.target.value as DuplicateStrategy)}>
                <option value="update">Update the existing product</option>
                <option value="skip">Skip that row</option>
              </select>
            </label>

            {failed > 0 && (
              <div className="issue-panel">
                <div className="issue-head">
                  <strong>{failed} problems</strong>
                  <button onClick={() => downloadText(stamp('fixflow-import-errors', 'csv'), issuesToCsv(validated.issues))}>
                    Download error rows
                  </button>
                </div>
                <div className="issue-list">
                  {validated.issues.slice(0, 30).map((issue, i) => (
                    <div key={`${issue.row}-${issue.field}-${i}`}>
                      <span className="issue-row">Row {issue.row}</span>
                      <strong>{issue.field}</strong>
                      <span>{issue.message}</span>
                      {issue.value !== '' && <code>{issue.value}</code>}
                    </div>
                  ))}
                  {validated.issues.length > 30 && <div className="issue-more">…and {validated.issues.length - 30} more in the download.</div>}
                </div>
              </div>
            )}

            <div className="modal-actions">
              <Button kind="secondary" onClick={() => setStage('map')}>Back</Button>
              <Button disabled={valid === 0 || busy} onClick={() => void commit()}>
                {busy ? <><span className="spinner" />Importing…</> : <>Import {valid} products</>}
              </Button>
            </div>
          </div>
        )}

        {stage === 'done' && result && (
          <div className="wizard-body">
            <div className="reset-success">
              <div className="success-mark"><Icon name="check" size={27} /></div>
              <h2>Imported {result.created + result.updated} products</h2>
              <p>
                {result.created} new · {result.updated} updated · {result.skipped} skipped.
                Everything was written in one transaction as batch <code>{result.batchId}</code>.
              </p>
              <div className="modal-actions">
                <Button kind="secondary" disabled={busy} onClick={() => void undo()}>Undo this import</Button>
                <Button onClick={close}>Done</Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function Button({ children, kind = 'primary', icon, onClick, disabled }: {
  children: React.ReactNode
  kind?: 'primary' | 'secondary'
  icon?: 'download'
  onClick?: () => void
  disabled?: boolean
}) {
  return (
    <button type="button" className={`btn ${kind}`} onClick={onClick} disabled={disabled}>
      {icon && <Icon name={icon} size={16} />}
      <span>{children}</span>
    </button>
  )
}
