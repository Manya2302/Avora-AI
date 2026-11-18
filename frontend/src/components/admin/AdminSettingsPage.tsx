'use client'
import { useCallback, useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { adminApi } from '@/lib/api'
import { cn, formatBytes } from '@/lib/utils'
import { Card, CardHeader } from '@/components/shared/Card'
import Badge from '@/components/shared/Badge'
import PageHeader from '@/components/shared/PageHeader'

type HealthRow = { key: string; label: string; ok: boolean | null; status: string; ms?: number }

/* GET /admin-panel/settings/ — read-only, no secrets */
type SystemSettings = {
  storage: { use_mock_storage: boolean; compression_level: number | null; chunk_size_bytes: number | null
             max_upload_size_bytes: number | null; allowed_extensions: string[] }
  encryption: { rsa_key_size: number | null }
  ai: { cloud_providers: string[]; local_model_configured: boolean; local_chat_model: string | null
        local_embed_model: string | null; vision_provider: string | null }
  tasks: { run_in_process: boolean; ai_background_in_eager: boolean }
  auth: { access_token_minutes: number | null; refresh_token_minutes: number | null }
  tenancy: { signup_organization_mode: string | null }
  debug: boolean
}

const dash = <span className="text-[#8A877F]">—</span>
const duration = (min: number | null | undefined) => {
  if (!min) return null
  if (min % 1440 === 0) return `${min / 1440} ${min === 1440 ? 'day' : 'days'}`
  if (min % 60 === 0) return `${min / 60} ${min === 60 ? 'hour' : 'hours'}`
  return `${min} minutes`
}

export default function AdminSettingsPage() {
  const [health, setHealth]       = useState<HealthRow[] | null>(null)
  const [checkedAt, setCheckedAt] = useState<string | null>(null)
  const [healthErr, setHealthErr] = useState(false)
  const [checking, setChecking]   = useState(false)
  const [cfg, setCfg]             = useState<SystemSettings | null>(null)
  const [cfgErr, setCfgErr]       = useState(false)

  const loadHealth = useCallback(() => {
    setChecking(true)
    adminApi.systemHealth()
      .then(r => { setHealth(r.data?.checks || []); setCheckedAt(r.data?.checked_at || null); setHealthErr(false) })
      .catch(() => setHealthErr(true))
      .finally(() => setChecking(false))
  }, [])

  useEffect(() => {
    loadHealth()
    adminApi.settings().then(r => setCfg(r.data)).catch(() => setCfgErr(true))
  }, [loadHealth])

  return (
    <div className="space-y-6">
      <PageHeader
        title="System"
        description="Live service checks and the configuration this server is running with. Settings are read-only here — they come from the server's environment variables."
      />

      <Card>
        <CardHeader
          title="Service health"
          subtitle={checkedAt ? `Checked ${formatDistanceToNow(new Date(checkedAt), { addSuffix: true })}` : undefined}
          action={
            <button onClick={loadHealth} disabled={checking} className="link inline-flex items-center gap-1 text-[13px] disabled:opacity-50">
              <RefreshCw className={cn('h-3.5 w-3.5', checking && 'animate-spin')} /> {checking ? 'Checking…' : 'Check again'}
            </button>
          }
        />
        {healthErr && !health ? (
          <p className="px-5 py-10 text-center text-[13px] text-[#8A877F]">Couldn't run the health checks.</p>
        ) : !health ? (
          <p className="px-5 py-10 text-center text-[13px] text-[#8A877F]">Checking services…</p>
        ) : (
          <ul>
            {health.map(s => (
              <li key={s.key} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-[#F1EFEA] px-5 py-3 first:border-0">
                <span className={cn('h-2 w-2 shrink-0 rounded-full',
                  s.ok === true ? 'bg-[#16A34A]' : s.ok === false ? 'bg-[#DC2626]' : 'bg-[#BDB8AC]')} />
                <span className="min-w-0 flex-1 text-[13.5px] text-[#2B2924]">{s.label}</span>
                <span className={cn('text-right text-[13px]',
                  s.ok === true ? 'text-[#15803D]' : s.ok === false ? 'font-medium text-[#B91C1C]' : 'text-[#8A877F]')}>
                  {s.status}
                  {typeof s.ms === 'number' && s.ok !== null && <span className="ml-1.5 tabular-nums text-[#8A877F]">{Math.round(s.ms)} ms</span>}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {cfgErr && !cfg ? (
        <Card><p className="px-5 py-10 text-center text-[13px] text-[#8A877F]">Couldn't load the server configuration.</p></Card>
      ) : !cfg ? (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {[0, 1].map(i => <div key={i} className="h-48 animate-pulse rounded-[12px] bg-[#F1EFEA]" />)}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader title="Storage and encryption" />
            <dl>
              <Row label="Object storage">
                {cfg.storage.use_mock_storage
                  ? <><Badge variant="amber">Local mock</Badge><span className="ml-2 text-[#8A877F]">MinIO not in use</span></>
                  : 'MinIO'}
              </Row>
              <Row label="Compression">{cfg.storage.compression_level != null ? `Zstandard, level ${cfg.storage.compression_level}` : dash}</Row>
              <Row label="Encryption chunk size">{cfg.storage.chunk_size_bytes ? formatBytes(cfg.storage.chunk_size_bytes) : dash}</Row>
              <Row label="Maximum upload">{cfg.storage.max_upload_size_bytes ? formatBytes(cfg.storage.max_upload_size_bytes) : dash}</Row>
              <Row label="RSA key size">{cfg.encryption.rsa_key_size ? `${cfg.encryption.rsa_key_size}-bit` : dash}</Row>
              <Row label="Allowed file types">
                {cfg.storage.allowed_extensions.length
                  ? cfg.storage.allowed_extensions.map(x => x.replace(/^\./, '').toUpperCase()).join(', ')
                  : dash}
              </Row>
            </dl>
          </Card>

          <Card>
            <CardHeader title="AI" subtitle="Provider names only — keys are never shown" />
            <dl>
              <Row label="Cloud providers">
                {cfg.ai.cloud_providers.length ? cfg.ai.cloud_providers.join(', ') : <span className="text-[#8A877F]">None configured</span>}
              </Row>
              <Row label="Local model (Ollama)">
                {cfg.ai.local_model_configured ? (cfg.ai.local_chat_model || 'Configured') : <span className="text-[#8A877F]">Not configured</span>}
              </Row>
              <Row label="Local embedding model">{cfg.ai.local_model_configured && cfg.ai.local_embed_model ? cfg.ai.local_embed_model : dash}</Row>
              <Row label="Figure understanding">{cfg.ai.vision_provider || dash}</Row>
            </dl>
          </Card>

          <Card>
            <CardHeader title="Background work" />
            <dl>
              <Row label="Task execution">
                {cfg.tasks.run_in_process ? 'In the web process (no Celery worker)' : 'Celery workers'}
              </Row>
              {cfg.tasks.run_in_process && (
                <Row label="AI pipeline">{cfg.tasks.ai_background_in_eager ? 'Background thread pool' : 'Inside the upload request'}</Row>
              )}
            </dl>
          </Card>

          <Card>
            <CardHeader title="Accounts and sessions" />
            <dl>
              <Row label="Access token lifetime">{duration(cfg.auth.access_token_minutes) ?? dash}</Row>
              <Row label="Refresh token lifetime">{duration(cfg.auth.refresh_token_minutes) ?? dash}</Row>
              <Row label="New sign-ups join">
                {cfg.tenancy.signup_organization_mode === 'isolated' ? 'Their own organisation'
                  : cfg.tenancy.signup_organization_mode === 'default' ? 'The shared organisation'
                  : cfg.tenancy.signup_organization_mode || dash}
              </Row>
              <Row label="Debug mode">
                {cfg.debug ? <Badge variant="red">On</Badge> : <span className="text-[#15803D]">Off</span>}
              </Row>
            </dl>
          </Card>
        </div>
      )}
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-t border-[#F1EFEA] px-5 py-3 first:border-0">
      <dt className="text-[13.5px] text-[#5A5750]">{label}</dt>
      <dd className="min-w-0 text-right text-[13.5px] text-[#0E0D0A]">{children}</dd>
    </div>
  )
}
