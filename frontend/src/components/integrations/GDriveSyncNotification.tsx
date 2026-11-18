'use client'
import { useState, useEffect } from 'react'
import { CheckCircle2, XCircle, RefreshCw, Download, ChevronDown, X } from 'lucide-react'
import { integrationsApi } from '@/lib/api'
import Button from '@/components/shared/Button'

interface SyncSession {
  id: string
  overall_status: string
  current_phase: string
  current_file: string
  files_completed: number
  files_queued: number
  files_failed: number
  files_skipped: number
  supported_files: number
  elapsed_seconds: number
}

const PHASE_LABEL: Record<string, string> = {
  queued:      'Queued',
  scanning:    'Scanning…',
  downloading: 'Downloading',
  extracting:  'Extracting',
  embedding:   'Embedding',
  completed:   'Completed',
  failed:      'Failed',
}

interface Props {
  sessionId: string
  onOpen: () => void   // open the full modal
  onDismiss: () => void
}

export default function GDriveSyncNotification({ sessionId, onOpen, onDismiss }: Props) {
  const [session, setSession]   = useState<SyncSession | null>(null)
  const [expanded, setExpanded] = useState(false)
  const [finished, setFinished] = useState(false)

  // One interval while the session is running; stops once it is completed,
  // failed or cancelled, and on unmount.
  useEffect(() => {
    if (finished) return
    let stopped = false
    const tick = async () => {
      try {
        const r = await integrationsApi.gdProgress(sessionId)
        if (stopped) return
        const s = r.data.session
        if (!s) return
        setSession(s)
        if (['completed', 'failed', 'cancelled'].includes(s.overall_status)) setFinished(true)
      } catch { /* transient polling errors: try again on the next tick */ }
    }
    tick()
    const id = setInterval(tick, 2500)
    return () => { stopped = true; clearInterval(id) }
  }, [sessionId, finished])

  if (!session) return null

  const isDone      = ['completed', 'failed', 'cancelled'].includes(session.overall_status)
  const isFailed    = session.overall_status === 'failed'
  const isCancelled = session.overall_status === 'cancelled'
  const total       = session.supported_files
  const done        = session.files_completed + session.files_skipped + session.files_failed
  // Totals arrive once the sync has scanned the folders; until then progress is unknown.
  const pct: number | null = total > 0
    ? Math.min(100, Math.round((done / total) * 100))
    : (isDone ? 100 : null)

  const phaseSteps = ['downloading', 'extracting', 'embedding', 'completed']
  const curIdx     = phaseSteps.indexOf(session.current_phase)

  return (
    <div
      className="fixed bottom-4 right-4 z-50 w-[calc(100vw-32px)] overflow-hidden rounded-[12px] border border-[#DDD9D0] bg-white shadow-lg sm:w-80"
      style={{ animation: 'slideUp 0.3s ease' }}
      role="status"
    >
      <style>{`@keyframes slideUp { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }`}</style>

      {/* Header row */}
      <div
        className="flex cursor-pointer items-center gap-2.5 px-4 pb-2 pt-3 transition-colors hover:bg-[#FBFAF7]"
        onClick={() => setExpanded(e => !e)}
        aria-expanded={expanded}
      >
        {/* Status icon */}
        <div className="flex-shrink-0">
          {isCancelled ? (
            <XCircle className="h-4 w-4 text-[#8A877F]" strokeWidth={1.75} />
          ) : isDone && !isFailed ? (
            <CheckCircle2 className="h-4 w-4 text-[#16A34A]" strokeWidth={1.75} />
          ) : isFailed ? (
            <XCircle className="h-4 w-4 text-[#DC2626]" strokeWidth={1.75} />
          ) : (
            <Download className="h-4 w-4 text-[#1A3DAF]" strokeWidth={1.75} />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-[13.5px] font-semibold text-[#0E0D0A]">
            {isCancelled ? 'Import cancelled' : isDone && !isFailed ? 'Import complete' : isFailed ? 'Import failed' : 'Google Drive sync'}
          </p>
          <p className="truncate text-[12px] text-[#8A877F]">
            {isDone
              ? `${session.files_completed} imported · ${session.files_failed} failed · ${session.elapsed_seconds}s`
              : PHASE_LABEL[session.current_phase] ?? '…'
            }
          </p>
        </div>

        <div className="flex items-center gap-1">
          <span className="text-[12.5px] tabular-nums text-[#5A5750]">{pct === null ? '—' : `${pct}%`}</span>
          <ChevronDown className={`h-3.5 w-3.5 text-[#8A877F] transition-transform ${expanded ? 'rotate-180' : ''}`} />
        </div>

        <button
          onClick={e => { e.stopPropagation(); onDismiss() }}
          aria-label="Dismiss"
          className="rounded-[6px] p-1 text-[#8A877F] transition-colors hover:bg-[#F1EFEA] hover:text-[#0E0D0A]"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Progress bar */}
      <div className="px-4 pb-3">
        <div className={`h-1.5 overflow-hidden rounded-full bg-[#ECEAE4] ${pct === null ? 'animate-pulse' : ''}`}>
          <div
            className={`h-full rounded-full transition-all duration-700 ${
              isFailed ? 'bg-[#DC2626]' : isCancelled ? 'bg-[#BDB8AC]' : isDone ? 'bg-[#16A34A]' : 'bg-[#1A3DAF]'
            }`}
            style={{ width: `${pct ?? 0}%` }}
          />
        </div>
      </div>

      {/* Expanded phase pipeline */}
      {expanded && (
        <div className="space-y-2 border-t border-[#ECEAE4] px-4 pb-4 pt-3">
          {phaseSteps.map((step, i) => {
            const isActive = curIdx === i && !isDone
            const isDoneStep = curIdx > i || isDone
            return (
              <div key={step} className={`flex min-w-0 items-center gap-2 text-[13px] transition-colors ${
                isDoneStep ? 'text-[#5A5750]' : isActive ? 'font-medium text-[#0E0D0A]' : 'text-[#8A877F]'
              }`}>
                {isDoneStep ? (
                  <CheckCircle2 className="h-3.5 w-3.5 flex-shrink-0 text-[#16A34A]" strokeWidth={1.75} />
                ) : isActive ? (
                  <RefreshCw className="h-3.5 w-3.5 flex-shrink-0 animate-spin text-[#1A3DAF]" strokeWidth={1.75} />
                ) : (
                  <div className="h-3.5 w-3.5 flex-shrink-0 rounded-full border-[1.5px] border-[#DDD9D0]" />
                )}
                {PHASE_LABEL[step]}
                {isActive && session.current_file && (
                  <span className="min-w-0 truncate text-[12px] font-normal text-[#8A877F]">
                    {session.current_file.split('/').pop()}
                  </span>
                )}
              </div>
            )
          })}

          {/* Mini counters */}
          <dl className="grid grid-cols-3 gap-2 border-t border-[#F1EFEA] pt-3">
            {[
              { l: 'Done',    v: session.files_completed, c: 'text-[#15803D]' },
              { l: 'Skipped', v: session.files_skipped,   c: 'text-[#8A877F]' },
              { l: 'Failed',  v: session.files_failed,    c: 'text-[#B91C1C]' },
            ].map(({ l, v, c }) => (
              <div key={l} className="flex flex-col-reverse">
                <dt className="text-[12px] text-[#8A877F]">{l}</dt>
                <dd className={`text-[15px] font-semibold tabular-nums ${c}`}>{v}</dd>
              </div>
            ))}
          </dl>

          <Button variant="ghost" size="sm" onClick={onOpen} className="mt-1 w-full">
            View full progress
          </Button>
        </div>
      )}
    </div>
  )
}
