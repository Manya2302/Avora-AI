'use client'
import { useState, useEffect, useRef } from 'react'
import {
  X, CheckCircle2, XCircle, AlertCircle, RefreshCw, Download,
  FileText, Clock, HardDrive, Folder, ChevronDown, ChevronUp,
  RotateCcw, Eye,
} from 'lucide-react'
import { integrationsApi } from '@/lib/api'
import toast from 'react-hot-toast'
import Button from '@/components/shared/Button'

// ── Types ─────────────────────────────────────────────────────────────────────

interface SyncSession {
  id: string
  overall_status: 'running' | 'completed' | 'failed' | 'cancelled'
  current_phase: string
  current_file: string
  total_folders: number
  total_files: number
  supported_files: number
  unsupported_files: number
  estimated_size_bytes: number
  files_queued: number
  files_completed: number
  files_skipped: number
  files_failed: number
  elapsed_seconds: number
  error_log: { file: string; reason: string }[]
  started_at: string
  finished_at: string | null
}

interface FileStatus {
  id: string
  file_name: string
  file_size: number
  status: string
  error_message: string
  retry_count: number
  is_duplicate: boolean
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtBytes(b: number) {
  if (b < 1024) return `${b} B`
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`
  if (b < 1024 ** 3) return `${(b / 1024 / 1024).toFixed(1)} MB`
  return `${(b / 1024 ** 3).toFixed(2)} GB`
}

function fmtTime(s: number) {
  const m = Math.floor(s / 60)
  const sec = s % 60
  return m > 0 ? `${m}m ${sec}s` : `${sec}s`
}

const PHASE_LABELS: Record<string, string> = {
  queued:      'Queued',
  scanning:    'Scanning folders…',
  downloading: 'Downloading files…',
  extracting:  'Extracting text…',
  embedding:   'Generating embeddings…',
  completed:   'Completed',
  failed:      'Failed',
}

const STATUS_COLOR: Record<string, string> = {
  queued:      'text-[#8A877F]',
  downloading: 'text-[#1A3DAF]',
  processing:  'text-[#A35A04]',
  ocr:         'text-[#7E22CE]',
  embedding:   'text-[#1A3DAF]',
  completed:   'text-[#15803D]',
  skipped:     'text-[#8A877F]',
  failed:      'text-[#B91C1C]',
}

const STATUS_DOT: Record<string, string> = {
  queued:      'bg-[#BDB8AC]',
  downloading: 'bg-[#1A3DAF]',
  processing:  'bg-[#D97706]',
  ocr:         'bg-[#7E22CE]',
  embedding:   'bg-[#1A3DAF]',
  completed:   'bg-[#16A34A]',
  skipped:     'bg-[#BDB8AC]',
  failed:      'bg-[#DC2626]',
}

const OVERLAY = 'fixed inset-0 z-50 flex items-center justify-center bg-[#0E0D0A]/35 p-4'
const PANEL   = 'w-full overflow-hidden rounded-[12px] border border-[#DDD9D0] bg-white shadow-lg'

const DriveLogo = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 87.3 78" className={className} fill="none" aria-hidden="true">
    <path d="M6.6 66.85l3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8H4.1a7.3 7.3 0 000 6.65l2.5 7.2z" fill="#0066DA"/>
    <path d="M43.65 25L29.9 1.2c-1.35.8-2.5 1.9-3.3 3.3L1.8 49.7a7.27 7.27 0 000 6.65h23.3L43.65 25z" fill="#00AC47"/>
    <path d="M73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25a7.27 7.27 0 000-6.65H63.1l4.9 9.4 5.55 16.55z" fill="#EA4335"/>
    <path d="M43.65 25L57.4 1.2C56.05.4 54.5 0 52.9 0H34.4c-1.6 0-3.15.45-4.5 1.2L43.65 25z" fill="#00832D"/>
    <path d="M63.1 56.35H27.1L13.35 80.1c1.35.8 2.9 1.2 4.5 1.2h50.6c1.6 0 3.15-.45 4.5-1.2L63.1 56.35z" fill="#2684FC"/>
    <path d="M73.4 27.5l-12.85-22.25c-.8-1.4-1.95-2.5-3.3-3.3L43.5 25 63.1 56.35h23.1c0-2.35-.6-4.65-1.8-6.65L73.4 27.5z" fill="#FFBA00"/>
  </svg>
)

// ── Confirmation Dialog ───────────────────────────────────────────────────────

interface ConfirmProps {
  session: SyncSession
  folderName: string
  onConfirm: () => void
  onCancel: () => void
  busy?: boolean
}

function ConfirmDialog({ session, folderName, onConfirm, onCancel, busy }: ConfirmProps) {
  const estMins = Math.ceil(session.estimated_size_bytes / (1024 * 1024 * 60)) || 1

  return (
    <div className={OVERLAY}>
      <div className={`${PANEL} max-w-md`} role="dialog" aria-modal="true" aria-labelledby="gd-confirm-title">
        {/* Header */}
        <div className="px-5 pb-2 pt-5">
          <div className="flex items-center gap-2">
            <DriveLogo className="h-4 w-4 flex-shrink-0" />
            <p id="gd-confirm-title" className="truncate text-[16px] font-semibold text-[#0E0D0A]">{folderName}</p>
          </div>
          <p className="mt-1 text-[13px] text-[#8A877F]">Here’s what we found in Google Drive. Nothing is imported until you confirm.</p>
        </div>

        {/* Stats */}
        <dl className="grid grid-cols-2 gap-x-6 gap-y-4 px-5 py-4">
          {[
            { icon: Folder,       label: 'Folders',     val: session.total_folders,     color: 'text-[#8A877F]' },
            { icon: FileText,     label: 'Total files', val: session.total_files,       color: 'text-[#8A877F]' },
            { icon: CheckCircle2, label: 'Supported',   val: session.supported_files,   color: 'text-[#15803D]' },
            { icon: XCircle,      label: 'Unsupported', val: session.unsupported_files, color: 'text-[#8A877F]' },
          ].map(({ icon: Icon, label, val, color }) => (
            <div key={label} className="flex flex-col-reverse">
              <dt className="mt-1 flex items-center gap-1.5 text-[12.5px] text-[#8A877F]">
                <Icon className={`h-3.5 w-3.5 flex-shrink-0 ${color}`} strokeWidth={1.75} />
                {label}
              </dt>
              <dd className="font-display text-[28px] font-semibold leading-none tabular-nums text-[#0E0D0A]">{val.toLocaleString()}</dd>
            </div>
          ))}
        </dl>

        {/* Estimates */}
        <div className="mx-5 mb-4 divide-y divide-[#F1EFEA] rounded-[8px] border border-[#ECEAE4] text-[13.5px]">
          <div className="flex items-center justify-between gap-3 px-3 py-2">
            <span className="flex items-center gap-2 text-[#5A5750]"><Clock className="h-4 w-4 text-[#8A877F]" strokeWidth={1.75} /> Estimated time</span>
            <span className="font-medium tabular-nums text-[#0E0D0A]">~{estMins} min</span>
          </div>
          <div className="flex items-center justify-between gap-3 px-3 py-2">
            <span className="flex items-center gap-2 text-[#5A5750]"><HardDrive className="h-4 w-4 text-[#8A877F]" strokeWidth={1.75} /> Storage needed</span>
            <span className="font-medium tabular-nums text-[#0E0D0A]">{fmtBytes(session.estimated_size_bytes)}</span>
          </div>
        </div>

        {session.unsupported_files > 0 && (
          <div className="mx-5 mb-4 flex items-start gap-2 rounded-[8px] bg-[#FBF3E4] px-3 py-2.5">
            <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-[#D97706]" strokeWidth={1.75} />
            <p className="text-[13px] text-[#A35A04]">
              {session.unsupported_files} unsupported file{session.unsupported_files !== 1 ? 's' : ''} will be skipped automatically.
            </p>
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-wrap justify-end gap-2 border-t border-[#ECEAE4] px-5 py-3">
          <Button variant="ghost" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button
            onClick={onConfirm}
            disabled={busy || session.supported_files === 0}
            title={session.supported_files === 0 ? 'No supported files were found in the selected folders.' : undefined}
          >
            <Download className="h-4 w-4" strokeWidth={1.75} /> Import {session.supported_files.toLocaleString()} files
          </Button>
        </div>
      </div>
    </div>
  )
}

// ── Progress Step ─────────────────────────────────────────────────────────────

function PhaseStep({ label, active, done }: { label: string; active: boolean; done: boolean }) {
  return (
    <div className={`flex items-center gap-2 text-[13.5px] transition-colors ${
      done ? 'text-[#5A5750]' : active ? 'font-medium text-[#0E0D0A]' : 'text-[#8A877F]'
    }`}>
      {done ? (
        <CheckCircle2 className="h-4 w-4 flex-shrink-0 text-[#16A34A]" strokeWidth={1.75} />
      ) : active ? (
        <RefreshCw className="h-4 w-4 flex-shrink-0 animate-spin text-[#1A3DAF]" strokeWidth={1.75} />
      ) : (
        <div className="h-4 w-4 flex-shrink-0 rounded-full border-[1.5px] border-[#DDD9D0]" />
      )}
      {label}
    </div>
  )
}

// ── Main Modal ────────────────────────────────────────────────────────────────

interface Props {
  sessionId: string
  folderName: string
  /** Close a finished import. */
  onClose: () => void
  /** Hide the modal while the import keeps running in the background. */
  onMinimize: () => void
  /** The user abandoned the scan before importing; the session has been cancelled. */
  onCancel: () => void
  initialPhase?: 'prescan' | 'sync'
}

const TERMINAL = ['completed', 'failed', 'cancelled']

export default function GDriveSyncModal({ sessionId, folderName, onClose, onMinimize, onCancel, initialPhase = 'prescan' }: Props) {
  const [phase, setPhase]               = useState<'prescan' | 'confirming' | 'syncing' | 'done'>(
    initialPhase === 'sync' ? 'syncing' : 'prescan'
  )
  const [session, setSession]           = useState<SyncSession | null>(null)
  const [fileStatuses, setFileStatuses] = useState<FileStatus[]>([])
  const [showFiles, setShowFiles]       = useState(false)
  const [showErrors, setShowErrors]     = useState(false)
  const [busy, setBusy]                 = useState(false)

  // Latest phase for the polling callback, so phase changes don't restart the interval.
  const phaseRef = useRef(phase)
  phaseRef.current = phase
  const sawScanningRef = useRef(false)

  // Poll only while something is in progress (prescan or import). Exactly one
  // interval exists at a time: it is torn down when polling is no longer needed
  // (confirming / done) and on unmount.
  const needsPolling = phase === 'prescan' || phase === 'syncing'

  useEffect(() => {
    if (!needsPolling) return
    let stopped = false

    const tick = async () => {
      try {
        const r = await integrationsApi.gdProgress(sessionId)
        if (stopped) return
        const s: SyncSession = r.data.session
        if (!s) return
        setSession(s)
        setFileStatuses(r.data.file_statuses || [])

        if (TERMINAL.includes(s.overall_status)) {
          setPhase('done')
          return
        }
        if (phaseRef.current === 'prescan') {
          if (s.current_phase === 'scanning') sawScanningRef.current = true
          // The prescan task returns the session to 'queued' with its totals (and a
          // non-zero time estimate in elapsed_seconds), even when no files were found.
          const prescanDone = s.current_phase === 'queued'
            && (s.total_files > 0 || s.elapsed_seconds > 0 || sawScanningRef.current)
          if (prescanDone) setPhase('confirming')
        }
      } catch { /* transient polling errors: try again on the next tick */ }
    }

    tick()
    const id = setInterval(tick, 2000)
    return () => { stopped = true; clearInterval(id) }
  }, [sessionId, needsPolling])

  const handleConfirm = async () => {
    setBusy(true)
    try {
      await integrationsApi.gdConfirmImport(sessionId)
      setPhase('syncing')
    } catch {
      toast.error('The import could not be started. Please try again.')
    } finally { setBusy(false) }
  }

  const handleCancel = async () => {
    setBusy(true)
    try {
      await integrationsApi.gdCancelSession(sessionId)
    } catch {
      toast.error('The scan could not be cancelled on the server. Nothing was imported.')
    } finally {
      setBusy(false)
      onCancel()
    }
  }

  const handleRetry = async () => {
    try {
      await integrationsApi.gdRetryFailed(sessionId)
      toast.success('Retrying failed files')
      setShowErrors(false)
      setPhase('syncing')
    } catch { toast.error('The retry could not be started.') }
  }

  // ── Prescan spinner ──────────────────────────────────────────────────────
  if (phase === 'prescan') {
    return (
      <div className={OVERLAY}>
        <div className={`${PANEL} max-w-sm px-6 py-7 text-center`} role="dialog" aria-modal="true" aria-busy="true">
          <RefreshCw className="mx-auto h-5 w-5 animate-spin text-[#1A3DAF]" strokeWidth={1.75} />
          <p className="mt-3 text-[16px] font-semibold text-[#0E0D0A]">Scanning folders…</p>
          <p className="mt-1 text-[13px] text-[#8A877F]">
            Counting files and estimating storage for <span className="font-medium text-[#2B2924]">{folderName}</span>
          </p>
          <div className="mt-5 flex justify-center">
            <Button variant="ghost" size="sm" onClick={handleCancel} disabled={busy}>Cancel</Button>
          </div>
        </div>
      </div>
    )
  }

  // ── Confirmation dialog ──────────────────────────────────────────────────
  if (phase === 'confirming' && session) {
    return <ConfirmDialog session={session} folderName={folderName} onConfirm={handleConfirm} onCancel={handleCancel} busy={busy} />
  }

  // ── Syncing / Done ───────────────────────────────────────────────────────
  const isDone     = phase === 'done'
  const totalDone  = (session?.files_completed ?? 0) + (session?.files_skipped ?? 0) + (session?.files_failed ?? 0)
  const totalKnown = session?.supported_files ?? 0
  const pct        = totalKnown > 0 ? Math.min(100, Math.round((totalDone / totalKnown) * 100)) : (isDone ? 100 : 0)

  const PHASES = ['scanning', 'downloading', 'extracting', 'embedding', 'completed']
  const curPhaseIdx = PHASES.indexOf(session?.current_phase ?? '')

  return (
    <div className={OVERLAY}>
      <div className={`${PANEL} flex max-h-[calc(100vh-32px)] max-w-lg flex-col`} role="dialog" aria-modal="true" aria-labelledby="gd-sync-title">
        {/* Header */}
        <div className="flex items-start gap-3 px-5 pb-2 pt-5">
          <div className="min-w-0 flex-1">
            <p id="gd-sync-title" className="flex items-center gap-2 text-[16px] font-semibold text-[#0E0D0A]">
              {isDone && session?.overall_status === 'completed' ? (
                <><CheckCircle2 className="h-4 w-4 flex-shrink-0 text-[#16A34A]" strokeWidth={1.75} /> Import complete</>
              ) : isDone && session?.overall_status === 'failed' ? (
                <><XCircle className="h-4 w-4 flex-shrink-0 text-[#DC2626]" strokeWidth={1.75} /> Import failed</>
              ) : isDone ? (
                <><XCircle className="h-4 w-4 flex-shrink-0 text-[#8A877F]" strokeWidth={1.75} /> Import cancelled</>
              ) : (
                <><RefreshCw className="h-4 w-4 flex-shrink-0 animate-spin text-[#1A3DAF]" strokeWidth={1.75} /> Syncing Google Drive…</>
              )}
            </p>
            <p className="mt-1 truncate text-[13px] text-[#8A877F]">{folderName}</p>
          </div>
          <button onClick={isDone ? onClose : onMinimize}
            aria-label={isDone ? 'Close' : 'Hide (the import keeps running)'}
            title={isDone ? 'Close' : 'Hide. The import keeps running in the background.'}
            className="-mr-1 -mt-1 rounded-[6px] p-1 text-[#8A877F] transition-colors hover:bg-[#F1EFEA] hover:text-[#0E0D0A]">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {/* Progress bar */}
          <div className="px-5 pt-3">
            <div className="mb-1.5 flex items-center justify-between text-[13px]">
              <span className="font-medium tabular-nums text-[#0E0D0A]">{totalKnown > 0 || isDone ? `${pct}%` : '—'}</span>
              <span className="tabular-nums text-[#8A877F]">
                {totalKnown > 0 ? `${totalDone} of ${totalKnown} files` : isDone ? 'No files imported' : 'Counting files…'}
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-[#ECEAE4]">
              <div
                className="h-full rounded-full bg-[#1A3DAF] transition-all duration-700"
                style={{ width: `${pct}%` }}
              />
            </div>
            {session?.current_file && !isDone && (
              <p className="mt-1.5 truncate text-[12px] text-[#8A877F]">
                Now processing: {session.current_file}
              </p>
            )}
          </div>

          {/* Phase pipeline */}
          <div className="space-y-2 px-5 py-4">
            {PHASES.slice(0, -1).map((p, i) => (
              <PhaseStep
                key={p}
                label={PHASE_LABELS[p] ?? p}
                active={curPhaseIdx === i}
                done={curPhaseIdx > i || isDone}
              />
            ))}
          </div>

          {/* Counters */}
          <dl className="mx-5 grid grid-cols-2 gap-x-4 gap-y-3 border-y border-[#F1EFEA] py-3 sm:grid-cols-4">
            {[
              { label: 'Completed', val: session?.files_completed ?? 0, cls: 'text-[#15803D]' },
              { label: 'Queued',    val: session?.files_queued ?? 0,     cls: 'text-[#0E0D0A]' },
              { label: 'Skipped',   val: session?.files_skipped ?? 0,    cls: 'text-[#8A877F]' },
              { label: 'Failed',    val: session?.files_failed ?? 0,     cls: 'text-[#B91C1C]' },
            ].map(({ label, val, cls }) => (
              <div key={label} className="flex flex-col-reverse">
                <dt className="mt-1 text-[12.5px] text-[#8A877F]">{label}</dt>
                <dd className={`font-display text-[24px] font-semibold leading-none tabular-nums ${cls}`}>{val}</dd>
              </div>
            ))}
          </dl>

          {/* Elapsed time */}
          {session && (
            <div className="px-5 pt-3">
              <p className="text-[12.5px] text-[#8A877F]">
                Elapsed <span className="tabular-nums text-[#2B2924]">{fmtTime(session.elapsed_seconds)}</span>
                {isDone && session.files_failed > 0 && (
                  <span> · <span className="text-[#B91C1C]">{session.files_failed} failed</span></span>
                )}
              </p>
            </div>
          )}

          {/* Done actions */}
          {isDone && (
            <div className="flex flex-wrap gap-2 px-5 pt-4">
              {session && session.files_failed > 0 && (
                <Button variant="ghost" size="sm" onClick={handleRetry}>
                  <RotateCcw className="h-3.5 w-3.5" strokeWidth={1.75} /> Retry {session.files_failed} failed files
                </Button>
              )}
              <Button variant="plain" size="sm" onClick={() => setShowErrors(s => !s)} aria-expanded={showErrors}>
                <Eye className="h-3.5 w-3.5" strokeWidth={1.75} />
                {showErrors ? 'Hide' : 'View'} errors
                {showErrors ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              </Button>
            </div>
          )}

          {/* Error log */}
          {showErrors && session && session.error_log.length > 0 && (
            <div className="mx-5 mt-3 max-h-36 overflow-y-auto rounded-[8px] border border-[#ECEAE4]">
              {session.error_log.map((e, i) => (
                <div key={i} className="flex items-start gap-2 border-t border-[#F1EFEA] px-3 py-2 first:border-0">
                  <XCircle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-[#DC2626]" strokeWidth={1.75} />
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-medium text-[#0E0D0A]">{e.file}</p>
                    <p className="text-[12px] text-[#B91C1C]">{e.reason}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Per-file status toggle */}
          <div className="px-5 pb-5 pt-4">
            <button onClick={() => setShowFiles(s => !s)} aria-expanded={showFiles}
              className="link flex items-center gap-1 text-[13px]">
              {showFiles ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              {showFiles ? 'Hide' : 'Show'} file details ({fileStatuses.length})
            </button>

            {showFiles && (
              <div className="mt-2 max-h-48 overflow-y-auto rounded-[8px] border border-[#ECEAE4]">
                {fileStatuses.length === 0 ? (
                  <p className="p-3 text-center text-[13px] text-[#8A877F]">No files yet</p>
                ) : fileStatuses.map(f => (
                  <div key={f.id} className="flex items-center gap-2.5 border-t border-[#F1EFEA] px-3 py-2 first:border-0 hover:bg-[#FBFAF7]">
                    <span className={`h-1.5 w-1.5 flex-shrink-0 rounded-full ${STATUS_DOT[f.status] ?? 'bg-[#BDB8AC]'}`} />
                    <span className="min-w-0 flex-1 truncate text-[13px] text-[#0E0D0A]">{f.file_name}</span>
                    {f.retry_count > 0 && (
                      <span className="flex-shrink-0 text-[12px] text-[#A35A04]">retry ×{f.retry_count}</span>
                    )}
                    <span className={`flex-shrink-0 text-[12px] capitalize ${STATUS_COLOR[f.status] ?? 'text-[#8A877F]'}`}>
                      {f.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
