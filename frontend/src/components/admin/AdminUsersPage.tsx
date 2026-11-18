'use client'
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Search, Users } from 'lucide-react'
import toast from 'react-hot-toast'
import { formatDistanceToNow } from 'date-fns'
import { adminApi } from '@/lib/api'
import { useAuthStore } from '@/store/authStore'
import { cn, formatBytes, formatDate, getInitials } from '@/lib/utils'
import { Card } from '@/components/shared/Card'
import Badge from '@/components/shared/Badge'
import Button from '@/components/shared/Button'
import PageHeader from '@/components/shared/PageHeader'
import EmptyState from '@/components/shared/EmptyState'
import Modal from '@/components/shared/Modal'

/* What GET /admin-panel/users/ returns per row (AdminUserSerializer). */
type AdminUser = {
  id: string; email: string; full_name: string
  role: 'admin' | 'user' | 'viewer'; is_active: boolean; is_email_verified: boolean
  created_at: string; last_login: string | null
  document_count: number; storage_bytes: number
}
type Page<T> = { count: number; next: string | null; previous: string | null; results: T[] }

const PAGE_SIZE = 20   // DRF PAGE_SIZE
const ROLES: Array<{ value: AdminUser['role']; label: string; hint: string }> = [
  { value: 'admin',  label: 'Admin',  hint: 'Full access, including this console.' },
  { value: 'user',   label: 'User',   hint: 'Uploads and manages their own documents.' },
  { value: 'viewer', label: 'Viewer', hint: 'Read-only access to what is shared with them.' },
]
const roleLabel = (r: string) => ROLES.find(x => x.value === r)?.label ?? r

const apiError = (e: any, fallback: string) => {
  const d = e?.response?.data
  if (typeof d === 'string') return d
  if (Array.isArray(d) && d.length) return String(d[0])
  if (d?.detail) return String(d.detail)
  if (d && typeof d === 'object') {
    const first = Object.values(d)[0]
    if (Array.isArray(first) && first.length) return String(first[0])
  }
  return fallback
}

type Pending =
  | { kind: 'role'; user: AdminUser }
  | { kind: 'deactivate'; user: AdminUser }
  | { kind: 'reactivate'; user: AdminUser }

export default function AdminUsersPage() {
  const me = useAuthStore(s => s.user)
  const [q, setQ]           = useState('')
  const [search, setSearch] = useState('')
  const [role, setRole]     = useState('')
  const [status, setStatus] = useState('')
  const [page, setPage]     = useState(1)
  const [data, setData]     = useState<Page<AdminUser> | null>(null)
  const [failed, setFailed] = useState(false)
  const [pending, setPending] = useState<Pending | null>(null)

  // debounce the search box
  useEffect(() => {
    const t = setTimeout(() => { setSearch(q.trim()); setPage(1) }, 300)
    return () => clearTimeout(t)
  }, [q])

  const load = useCallback(() => {
    const params: Record<string, unknown> = { page }
    if (search) params.search = search
    if (role) params.role = role
    if (status) params.is_active = status === 'active'
    adminApi.users(params)
      .then(r => { setData(r.data); setFailed(false) })
      .catch(e => {
        // a page past the end (e.g. after deactivations under a filter) → go back to page 1
        if (e?.response?.status === 404 && page > 1) { setPage(1); return }
        setFailed(true)
      })
  }, [page, search, role, status])

  useEffect(() => { load() }, [load])

  const rows = data?.results ?? []
  const pages = data ? Math.max(1, Math.ceil(data.count / PAGE_SIZE)) : 1
  const filtered = !!(search || role || status)

  return (
    <div className="space-y-6">
      <PageHeader
        title="Users"
        description="Every account in this Avora workspace. Change roles, deactivate accounts that should no longer sign in, or reactivate them."
      />

      <Card>
        <div className="flex flex-wrap gap-2 border-b border-[#ECEAE4] p-3">
          <label className="relative min-w-[200px] flex-1">
            <span className="sr-only">Search users</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8A877F]" strokeWidth={1.75} />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search by name or email" className="field h-9 pl-9" />
          </label>
          <select value={role} onChange={e => { setRole(e.target.value); setPage(1) }} className="field h-9 w-auto pr-8" aria-label="Filter by role">
            <option value="">All roles</option>
            {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
          <select value={status} onChange={e => { setStatus(e.target.value); setPage(1) }} className="field h-9 w-auto pr-8" aria-label="Filter by status">
            <option value="">Any status</option>
            <option value="active">Active</option>
            <option value="inactive">Deactivated</option>
          </select>
        </div>

        {failed && !data ? (
          <EmptyState icon={<Users />} title="Couldn't load users" action={<Button variant="ghost" size="sm" onClick={load}>Try again</Button>}>
            The admin API didn't respond. Check that the backend is running.
          </EmptyState>
        ) : !data ? (
          <div className="space-y-2 p-5">{[0, 1, 2, 3].map(i => <div key={i} className="h-10 animate-pulse rounded-[6px] bg-[#F1EFEA]" />)}</div>
        ) : !rows.length ? (
          <EmptyState icon={<Users />} title={filtered ? 'No users match' : 'No users yet'}>
            {filtered ? 'Try a different search or clear the filters.' : 'Accounts appear here as people sign up.'}
          </EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-left text-[14px]">
              <thead>
                <tr className="text-[12.5px] text-[#8A877F]">
                  <th className="px-5 py-2.5 font-normal">Name</th>
                  <th className="px-3 py-2.5 font-normal">Role</th>
                  <th className="px-3 py-2.5 font-normal">Status</th>
                  <th className="px-3 py-2.5 text-right font-normal">Documents</th>
                  <th className="px-3 py-2.5 text-right font-normal">Storage</th>
                  <th className="px-3 py-2.5 font-normal">Joined</th>
                  <th className="px-3 py-2.5 font-normal">Last sign-in</th>
                  <th className="px-3 py-2.5"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {rows.map(u => (
                  <UserRow key={u.id} u={u} isMe={u.id === me?.id} onAction={setPending} />
                ))}
              </tbody>
            </table>
          </div>
        )}

        {data && data.count > PAGE_SIZE && (
          <Pager page={page} pages={pages} count={data.count} onPage={setPage} hasPrev={!!data.previous} hasNext={!!data.next} />
        )}
      </Card>

      <RoleModal pending={pending?.kind === 'role' ? pending.user : null} onClose={() => setPending(null)} onDone={load} />
      <StatusModal
        pending={pending && pending.kind !== 'role' ? { user: pending.user, activate: pending.kind === 'reactivate' } : null}
        onClose={() => setPending(null)} onDone={load}
      />
    </div>
  )
}

function UserRow({ u, isMe, onAction }: { u: AdminUser; isMe: boolean; onAction: (p: Pending) => void }) {
  const name = u.full_name || u.email
  return (
    <tr className={cn('border-t border-[#F1EFEA] hover:bg-[#FBFAF7]', !u.is_active && 'text-[#8A877F]')}>
      <td className="px-5 py-2.5">
        <div className="flex items-center gap-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#F1EFEA] text-[12px] font-medium text-[#5A5750]">
            {getInitials(name || '?')}
          </span>
          <div className="min-w-0">
            <div className="truncate font-medium text-[#0E0D0A]">
              {u.full_name || '—'}{isMe && <span className="ml-1.5 text-[12.5px] font-normal text-[#8A877F]">(you)</span>}
            </div>
            <div className="truncate text-[12.5px] text-[#8A877F]">{u.email}</div>
          </div>
        </div>
      </td>
      <td className="px-3 py-2.5">
        {u.role === 'admin' ? <Badge variant="blue">Admin</Badge> : <span className="text-[#2B2924]">{roleLabel(u.role)}</span>}
      </td>
      <td className="px-3 py-2.5">
        {u.is_active ? <Badge variant="green">Active</Badge> : <Badge variant="gray">Deactivated</Badge>}
      </td>
      <td className="px-3 py-2.5 text-right tabular-nums">
        {u.document_count
          ? <Link href={`/securevault-admin/documents?owner=${u.id}`} className="link">{u.document_count.toLocaleString('en-IN')}</Link>
          : <span className="text-[#8A877F]">0</span>}
      </td>
      <td className="px-3 py-2.5 text-right tabular-nums text-[#2B2924]">{u.storage_bytes ? formatBytes(u.storage_bytes) : <span className="text-[#8A877F]">—</span>}</td>
      <td className="whitespace-nowrap px-3 py-2.5 text-[13px] text-[#5A5750]">{formatDate(u.created_at)}</td>
      <td className="whitespace-nowrap px-3 py-2.5 text-[13px] text-[#5A5750]">
        {u.last_login ? formatDistanceToNow(new Date(u.last_login), { addSuffix: true }) : <span className="text-[#8A877F]">Never</span>}
      </td>
      <td className="whitespace-nowrap px-3 py-2.5 text-right">
        {isMe ? (
          <span className="text-[12.5px] text-[#8A877F]" title="You can't change your own role or deactivate your own account.">Your account</span>
        ) : (
          <div className="inline-flex gap-1">
            <Button variant="plain" size="sm" className="h-7 px-2" onClick={() => onAction({ kind: 'role', user: u })} aria-label={`Change role for ${name}`}>Role</Button>
            {u.is_active
              ? <Button variant="plain" size="sm" className="h-7 px-2 text-[#B91C1C] hover:text-[#B91C1C]" onClick={() => onAction({ kind: 'deactivate', user: u })} aria-label={`Deactivate ${name}`}>Deactivate</Button>
              : <Button variant="plain" size="sm" className="h-7 px-2" onClick={() => onAction({ kind: 'reactivate', user: u })} aria-label={`Reactivate ${name}`}>Reactivate</Button>}
          </div>
        )}
      </td>
    </tr>
  )
}

function RoleModal({ pending, onClose, onDone }: { pending: AdminUser | null; onClose: () => void; onDone: () => void }) {
  const [role, setRole] = useState<AdminUser['role']>('user')
  const [saving, setSaving] = useState(false)
  useEffect(() => { if (pending) setRole(pending.role) }, [pending])

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!pending || role === pending.role) { onClose(); return }
    setSaving(true)
    try {
      await adminApi.updateUser(pending.id, { role })
      toast.success(`${pending.full_name || pending.email} is now ${roleLabel(role).toLowerCase() === 'admin' ? 'an admin' : `a ${roleLabel(role).toLowerCase()}`}.`)
      onClose(); onDone()
    } catch (err) { toast.error(apiError(err, 'Couldn’t change that role.')) }
    finally { setSaving(false) }
  }

  return (
    <Modal open={!!pending} onOpenChange={o => !o && onClose()} title="Change role" description={pending ? `${pending.full_name || pending.email} · ${pending.email}` : undefined}>
      <form id="role-form" onSubmit={save} className="space-y-2">
        {ROLES.map(r => (
          <label key={r.value} className={cn('flex cursor-pointer gap-3 rounded-[8px] border px-3 py-2.5',
            role === r.value ? 'border-[#0E0D0A] bg-[#FBFAF7]' : 'border-[#DDD9D0] hover:border-[#BDB8AC]')}>
            <input type="radio" name="role" value={r.value} checked={role === r.value} onChange={() => setRole(r.value)} className="mt-1 accent-[#0E0D0A]" />
            <span>
              <span className="block text-[14px] font-medium text-[#0E0D0A]">{r.label}</span>
              <span className="block text-[12.5px] text-[#8A877F]">{r.hint}</span>
            </span>
          </label>
        ))}
        {role === 'admin' && pending?.role !== 'admin' && (
          <p className="pt-1 text-[12.5px] text-[#A35A04]">Admins can see every user's documents and the audit log.</p>
        )}
        <div className="-mx-5 mt-5 flex justify-end gap-2 border-t border-[#ECEAE4] px-5 pt-3">
          <Button type="button" variant="plain" size="sm" onClick={onClose}>Cancel</Button>
          <Button type="submit" size="sm" loading={saving} disabled={!pending || role === pending.role}>Save role</Button>
        </div>
      </form>
    </Modal>
  )
}

function StatusModal({ pending, onClose, onDone }: {
  pending: { user: AdminUser; activate: boolean } | null; onClose: () => void; onDone: () => void
}) {
  const [saving, setSaving] = useState(false)
  const u = pending?.user
  const name = u ? (u.full_name || u.email) : ''

  const confirm = async () => {
    if (!pending || !u) return
    setSaving(true)
    try {
      if (pending.activate) await adminApi.updateUser(u.id, { is_active: true })
      else await adminApi.deleteUser(u.id)   // the backend deactivates (never hard-deletes) and signs them out
      toast.success(pending.activate ? `${name} can sign in again.` : `${name} has been deactivated and signed out.`)
      onClose(); onDone()
    } catch (err) {
      toast.error(apiError(err, pending.activate ? 'Couldn’t reactivate that account.' : 'Couldn’t deactivate that account.'))
    } finally { setSaving(false) }
  }

  return (
    <Modal
      open={!!pending} onOpenChange={o => !o && onClose()}
      title={pending?.activate ? `Reactivate ${name}?` : `Deactivate ${name}?`}
      footer={<>
        <Button variant="plain" size="sm" onClick={onClose}>Cancel</Button>
        <Button variant={pending?.activate ? 'dark' : 'red'} size="sm" loading={saving} onClick={confirm}>
          {pending?.activate ? 'Reactivate' : 'Deactivate'}
        </Button>
      </>}
    >
      <p className="text-[14px] text-[#2B2924]">
        {pending?.activate
          ? 'They will be able to sign in again with their existing password. Their documents were kept while the account was deactivated.'
          : 'They will be signed out everywhere and won’t be able to sign in. Their documents, audit history and compliance records are kept, and you can reactivate the account later.'}
      </p>
    </Modal>
  )
}

function Pager({ page, pages, count, onPage, hasPrev, hasNext }: {
  page: number; pages: number; count: number; onPage: (p: number) => void; hasPrev: boolean; hasNext: boolean
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#ECEAE4] px-5 py-3 text-[13px] text-[#8A877F]">
      <span className="tabular-nums">Page {page} of {pages} · {count.toLocaleString('en-IN')} users</span>
      <div className="flex gap-2">
        <Button variant="ghost" size="sm" disabled={!hasPrev} onClick={() => onPage(page - 1)}>Previous</Button>
        <Button variant="ghost" size="sm" disabled={!hasNext} onClick={() => onPage(page + 1)}>Next</Button>
      </div>
    </div>
  )
}
