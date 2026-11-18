'use client'
import { useEffect, useMemo, useState } from 'react'
import { ChevronRight, Plus, Search, Users, Building2, Trash2, Pencil, Lock, Share2, Globe, Layers } from 'lucide-react'
import toast from 'react-hot-toast'
import { orgApi } from '@/lib/api'
import { useAuthStore } from '@/store/authStore'
import { cn, getInitials } from '@/lib/utils'
import { Card } from '@/components/shared/Card'
import Button from '@/components/shared/Button'
import PageHeader from '@/components/shared/PageHeader'
import EmptyState from '@/components/shared/EmptyState'
import Modal from '@/components/shared/Modal'

/* ── types (what the /org endpoints return) ─────────────────── */
type Dept = { id: string; name: string; description?: string; color: string; parent?: string | null }
type Role = { id: string; name: string; level: number; department?: string | null; department_name?: string | null }
type Member = {
  id: string; user_name: string; user_email: string
  department?: string | null; department_name?: string | null
  role?: string | null; role_name?: string | null; role_level?: number | null
}
type TreeNode = {
  id: string; name: string; color: string; member_count: number
  roles: { id: string; name: string; level: number }[]
  members: { id: string; name: string; email: string; role: string | null }[]
  children: TreeNode[]
}
type MyAccess = {
  department: { id: string; name: string } | null
  role: { id: string; name: string; level: number } | null
  accessible_doc_count: number
}

const LEVELS: Record<number, string> = {
  1: 'Executive', 2: 'Director', 3: 'Senior manager', 4: 'Manager', 5: 'Senior',
  6: 'Mid-level', 7: 'Junior', 8: 'Intern', 9: 'Trainee', 10: 'Observer',
}

const SWATCHES = ['#1A3DAF', '#15803D', '#B45309', '#B91C1C', '#7E22CE', '#0E7490', '#5A5750']

const VISIBILITY = [
  { icon: Lock,      name: 'Private',      desc: 'Only the person who uploaded it.' },
  { icon: Share2,    name: 'Shared',       desc: 'Specific people, picked by name.' },
  { icon: Building2, name: 'Department',   desc: 'The department and anyone senior to it.' },
  { icon: Globe,     name: 'Organisation', desc: 'Everyone with an account.' },
  { icon: Layers,    name: 'Custom',       desc: 'A mix of people, departments and roles.' },
]

type Tab = 'teams' | 'people' | 'roles'

const list = <T,>(d: any): T[] => (Array.isArray(d) ? d : d?.results ?? [])
const apiError = (e: any, fallback: string) => {
  const d = e?.response?.data
  if (!d) return fallback
  if (typeof d === 'string') return d
  if (d.detail || d.error) return d.detail || d.error
  const first = Object.values(d)[0]
  return Array.isArray(first) ? String(first[0]) : fallback
}

export default function OrganizationPage() {
  const { user } = useAuthStore()
  const isAdmin = user?.role === 'admin'

  const [tab, setTab] = useState<Tab>('teams')
  const [loading, setLoading] = useState(true)
  const [tree, setTree] = useState<TreeNode[]>([])
  const [depts, setDepts] = useState<Dept[]>([])
  const [roles, setRoles] = useState<Role[]>([])
  const [members, setMembers] = useState<Member[]>([])
  const [me, setMe] = useState<MyAccess | null>(null)

  const [deptModal, setDeptModal] = useState(false)
  const [roleModal, setRoleModal] = useState(false)
  const [editing, setEditing] = useState<Member | null>(null)

  const load = async () => {
    const results = await Promise.allSettled([
      orgApi.tree(), orgApi.departments(), orgApi.roles(), orgApi.members(), orgApi.myPermissions(),
    ])
    const [t, d, r, m, p] = results
    if (t.status === 'fulfilled') setTree(t.value.data.tree || [])
    if (d.status === 'fulfilled') setDepts(list<Dept>(d.value.data))
    if (r.status === 'fulfilled') setRoles(list<Role>(r.value.data).sort((a, b) => a.level - b.level))
    if (m.status === 'fulfilled') setMembers(list<Member>(m.value.data))
    if (p.status === 'fulfilled') setMe(p.value.data)
    if (results.every(x => x.status === 'rejected')) toast.error('Couldn’t load your organisation. Try refreshing.')
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  const removeDept = async (d: { id: string; name: string }) => {
    if (!window.confirm(`Delete the “${d.name}” department? People in it will be left without a department.`)) return
    try {
      await orgApi.deleteDept(d.id)
      toast.success(`Deleted ${d.name}`)
      load()
    } catch (e) { toast.error(apiError(e, 'Couldn’t delete that department.')) }
  }

  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: 'teams',  label: 'Departments', count: depts.length },
    { key: 'people', label: 'People',      count: members.length },
    { key: 'roles',  label: 'Roles',       count: roles.length },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title="People & teams"
        description="How your organisation is structured. Departments and roles decide which documents each person can open."
        actions={isAdmin && (
          <>
            <Button variant="ghost" size="sm" onClick={() => setRoleModal(true)}><Plus className="h-3.5 w-3.5" /> Role</Button>
            <Button size="sm" onClick={() => setDeptModal(true)}><Plus className="h-3.5 w-3.5" /> Department</Button>
          </>
        )}
      />

      <MyAccessStrip me={me} loading={loading} />

      {/* tabs */}
      <div className="flex gap-6 border-b border-[#DDD9D0]" role="tablist">
        {tabs.map(t => (
          <button
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              '-mb-px flex items-center gap-2 border-b-2 pb-2.5 text-[14px] transition-colors',
              tab === t.key ? 'border-[#0E0D0A] font-medium text-[#0E0D0A]' : 'border-transparent text-[#8A877F] hover:text-[#2B2924]'
            )}
          >
            {t.label}
            {!loading && <span className="text-[12.5px] tabular-nums text-[#8A877F]">{t.count}</span>}
          </button>
        ))}
      </div>

      {loading ? (
        <Card><div className="space-y-3 p-5">{[0, 1, 2].map(i => <div key={i} className="h-9 animate-pulse rounded-[6px] bg-[#F1EFEA]" />)}</div></Card>
      ) : (
        <>
          {tab === 'teams' && (
            <TeamsTab tree={tree} depts={depts} isAdmin={isAdmin} onAdd={() => setDeptModal(true)} onDelete={removeDept} />
          )}
          {tab === 'people' && (
            <PeopleTab members={members} depts={depts} isAdmin={isAdmin} onEdit={setEditing} />
          )}
          {tab === 'roles' && (
            <RolesTab roles={roles} isAdmin={isAdmin} onAdd={() => setRoleModal(true)} />
          )}
        </>
      )}

      <VisibilityGuide />

      {isAdmin && (
        <>
          <DeptModal open={deptModal} onOpenChange={setDeptModal} depts={depts} onSaved={load} />
          <RoleModal open={roleModal} onOpenChange={setRoleModal} depts={depts} onSaved={load} />
          <MemberModal member={editing} onClose={() => setEditing(null)} depts={depts} roles={roles} onSaved={load} />
        </>
      )}
    </div>
  )
}

/* ── “you” strip ─────────────────────────────────────────────── */
function MyAccessStrip({ me, loading }: { me: MyAccess | null; loading: boolean }) {
  if (loading) return <div className="h-[58px] animate-pulse rounded-[12px] bg-[#ECEAE4]/60" />
  if (!me) return null
  return (
    <div className="flex flex-wrap items-center gap-x-8 gap-y-2 rounded-[12px] border border-[#DDD9D0] bg-white px-5 py-3.5 text-[14px]">
      <div>
        <span className="text-[#8A877F]">Your department </span>
        <span className="font-medium">{me.department?.name || 'Not assigned'}</span>
      </div>
      <div>
        <span className="text-[#8A877F]">Your role </span>
        <span className="font-medium">{me.role ? `${me.role.name} · ${LEVELS[me.role.level] ?? `Level ${me.role.level}`}` : 'Not assigned'}</span>
      </div>
      <div className="sm:ml-auto">
        <span className="font-medium tabular-nums">{me.accessible_doc_count.toLocaleString()}</span>
        <span className="text-[#8A877F]"> documents you can open</span>
      </div>
    </div>
  )
}

/* ── Departments ─────────────────────────────────────────────── */
function TeamsTab({ tree, depts, isAdmin, onAdd, onDelete }: {
  tree: TreeNode[]; depts: Dept[]; isAdmin: boolean; onAdd: () => void; onDelete: (d: { id: string; name: string }) => void
}) {
  if (!tree.length && !depts.length) {
    return (
      <Card>
        <EmptyState icon={<Building2 />} title="No departments yet"
          action={isAdmin && <Button size="sm" onClick={onAdd}><Plus className="h-3.5 w-3.5" /> Add the first one</Button>}>
          {isAdmin
            ? 'Start with how your firm is split today — for example Tax, Audit and Admin. You can nest teams later.'
            : 'An administrator hasn’t set up departments yet.'}
        </EmptyState>
      </Card>
    )
  }
  return (
    <Card>
      <ul>{tree.map(n => <DeptRow key={n.id} node={n} depth={0} isAdmin={isAdmin} onDelete={onDelete} />)}</ul>
    </Card>
  )
}

function DeptRow({ node, depth, isAdmin, onDelete }: {
  node: TreeNode; depth: number; isAdmin: boolean; onDelete: (d: { id: string; name: string }) => void
}) {
  const [open, setOpen] = useState(depth === 0 && node.members.length > 0 && node.members.length <= 6)
  const hasContent = node.members.length > 0 || node.children.length > 0
  const pad = 20 + depth * 24

  return (
    <li className="border-b border-[#F1EFEA] last:border-0">
      <div className="group flex items-center gap-3 py-3 pr-4 hover:bg-[#FBFAF7]" style={{ paddingLeft: pad }}>
        <button
          onClick={() => setOpen(o => !o)}
          disabled={!hasContent}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center gap-3 text-left disabled:cursor-default"
        >
          <ChevronRight className={cn('h-4 w-4 shrink-0 text-[#8A877F] transition-transform', open && 'rotate-90', !hasContent && 'invisible')} />
          <span className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: node.color }} />
          <span className="truncate text-[14px] font-medium">{node.name}</span>
          <span className="shrink-0 text-[13px] text-[#8A877F]">
            {node.member_count} {node.member_count === 1 ? 'person' : 'people'}
            {node.children.length > 0 && ` · ${node.children.length} sub-team${node.children.length > 1 ? 's' : ''}`}
          </span>
        </button>
        <div className="hidden max-w-[40%] flex-wrap justify-end gap-1 md:flex">
          {node.roles.slice(0, 3).map(r => (
            <span key={r.id} className="rounded-[5px] bg-[#F1EFEA] px-1.5 py-0.5 text-[11.5px] text-[#5A5750]">{r.name}</span>
          ))}
          {node.roles.length > 3 && <span className="px-1 text-[11.5px] text-[#8A877F]">+{node.roles.length - 3}</span>}
        </div>
        {isAdmin && (
          <button
            onClick={() => onDelete(node)}
            className="rounded-[6px] p-1.5 text-[#8A877F] opacity-0 transition-opacity hover:bg-[#FCEFEF] hover:text-[#B91C1C] focus:opacity-100 group-hover:opacity-100"
            aria-label={`Delete ${node.name}`}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {open && (
        <>
          {node.members.length > 0 && (
            <ul className="pb-2" style={{ paddingLeft: pad + 28 }}>
              {node.members.map(m => (
                <li key={m.id} className="flex items-center gap-2.5 py-1.5 pr-4">
                  <Avatar name={m.name || m.email} size="sm" />
                  <span className="truncate text-[13.5px]">{m.name || m.email}</span>
                  {m.role && <span className="truncate text-[13px] text-[#8A877F]">{m.role}</span>}
                </li>
              ))}
            </ul>
          )}
          {node.children.length > 0 && (
            <ul className="border-t border-[#F1EFEA]">
              {node.children.map(c => <DeptRow key={c.id} node={c} depth={depth + 1} isAdmin={isAdmin} onDelete={onDelete} />)}
            </ul>
          )}
        </>
      )}
    </li>
  )
}

/* ── People ──────────────────────────────────────────────────── */
function PeopleTab({ members, depts, isAdmin, onEdit }: {
  members: Member[]; depts: Dept[]; isAdmin: boolean; onEdit: (m: Member) => void
}) {
  const [q, setQ] = useState('')
  const [dept, setDept] = useState('')

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return members
      .filter(m => !dept || (dept === '__none' ? !m.department : m.department === dept))
      .filter(m => !needle || `${m.user_name} ${m.user_email} ${m.role_name ?? ''}`.toLowerCase().includes(needle))
      .sort((a, b) => (a.role_level ?? 99) - (b.role_level ?? 99) || (a.user_name || '').localeCompare(b.user_name || ''))
  }, [members, q, dept])

  if (!members.length) {
    return (
      <Card>
        <EmptyState icon={<Users />} title="Nobody has been added yet">
          People appear here once they have an account and are placed in a department.
        </EmptyState>
      </Card>
    )
  }

  return (
    <Card>
      <div className="flex flex-wrap gap-2 border-b border-[#ECEAE4] p-3">
        <label className="relative min-w-[200px] flex-1">
          <span className="sr-only">Search people</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8A877F]" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search by name, email or role" className="field h-9 pl-9" />
        </label>
        <select value={dept} onChange={e => setDept(e.target.value)} className="field h-9 w-auto pr-8" aria-label="Filter by department">
          <option value="">All departments</option>
          {depts.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          <option value="__none">No department</option>
        </select>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-left text-[14px]">
          <thead>
            <tr className="text-[12.5px] text-[#8A877F]">
              <th className="px-5 py-2.5 font-normal">Name</th>
              <th className="px-3 py-2.5 font-normal">Department</th>
              <th className="px-3 py-2.5 font-normal">Role</th>
              {isAdmin && <th className="w-12 px-3 py-2.5"><span className="sr-only">Actions</span></th>}
            </tr>
          </thead>
          <tbody>
            {rows.map(m => (
              <tr key={m.id} className="group border-t border-[#F1EFEA] hover:bg-[#FBFAF7]">
                <td className="px-5 py-2.5">
                  <div className="flex items-center gap-3">
                    <Avatar name={m.user_name || m.user_email} />
                    <div className="min-w-0">
                      <div className="truncate font-medium">{m.user_name || '—'}</div>
                      <div className="truncate text-[12.5px] text-[#8A877F]">{m.user_email}</div>
                    </div>
                  </div>
                </td>
                <td className="px-3 py-2.5 text-[#2B2924]">{m.department_name || <span className="text-[#8A877F]">—</span>}</td>
                <td className="px-3 py-2.5">
                  {m.role_name
                    ? <>{m.role_name}<span className="text-[#8A877F]"> · {LEVELS[m.role_level ?? 0] ?? `L${m.role_level}`}</span></>
                    : <span className="text-[#8A877F]">—</span>}
                </td>
                {isAdmin && (
                  <td className="px-3 py-2.5 text-right">
                    <button onClick={() => onEdit(m)} aria-label={`Edit ${m.user_name}`}
                      className="rounded-[6px] p-1.5 text-[#8A877F] opacity-0 hover:bg-[#ECEAE4] hover:text-[#0E0D0A] focus:opacity-100 group-hover:opacity-100">
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && <p className="border-t border-[#F1EFEA] px-5 py-8 text-center text-[13.5px] text-[#8A877F]">No one matches that search.</p>}
      </div>
    </Card>
  )
}

/* ── Roles ───────────────────────────────────────────────────── */
function RolesTab({ roles, isAdmin, onAdd }: { roles: Role[]; isAdmin: boolean; onAdd: () => void }) {
  if (!roles.length) {
    return (
      <Card>
        <EmptyState title="No roles yet"
          action={isAdmin && <Button size="sm" onClick={onAdd}><Plus className="h-3.5 w-3.5" /> Add a role</Button>}>
          Roles carry a seniority level. Someone at a higher level can see documents shared with the teams below them.
        </EmptyState>
      </Card>
    )
  }
  return (
    <Card>
      <ul>
        {roles.map(r => (
          <li key={r.id} className="flex items-center gap-4 border-b border-[#F1EFEA] px-5 py-3 last:border-0">
            <LevelMeter level={r.level} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-[14px] font-medium">{r.name}</div>
              <div className="text-[12.5px] text-[#8A877F]">{r.department_name || 'Any department'}</div>
            </div>
            <span className="shrink-0 text-[13px] text-[#5A5750]">{LEVELS[r.level] ?? `Level ${r.level}`}</span>
          </li>
        ))}
      </ul>
    </Card>
  )
}

/** Ten little bars; more filled = more senior. Easier to scan than "L3". */
function LevelMeter({ level }: { level: number }) {
  const filled = 11 - level
  return (
    <span className="flex h-4 shrink-0 items-end gap-[2px]" title={`Level ${level}`} aria-label={`Level ${level} of 10`}>
      {Array.from({ length: 10 }, (_, i) => (
        <span key={i} className={cn('w-[3px] rounded-[1px]', i < filled ? 'bg-[#1A3DAF]' : 'bg-[#E2DED5]')} style={{ height: 6 + i }} />
      ))}
    </span>
  )
}

/* ── visibility explainer ────────────────────────────────────── */
function VisibilityGuide() {
  return (
    <section className="pt-2">
      <h2 className="text-[15px] font-semibold">Who can see a document</h2>
      <p className="mt-1 text-[13.5px] text-[#5A5750]">Every document has one of these settings. It can be changed from the document’s page.</p>
      <div className="mt-4 grid gap-px overflow-hidden rounded-[12px] border border-[#DDD9D0] bg-[#DDD9D0] sm:grid-cols-2 lg:grid-cols-5">
        {VISIBILITY.map(v => (
          <div key={v.name} className="bg-white p-4">
            <v.icon className="h-4 w-4 text-[#5A5750]" strokeWidth={1.75} />
            <div className="mt-2.5 text-[14px] font-medium">{v.name}</div>
            <p className="mt-0.5 text-[13px] leading-snug text-[#8A877F]">{v.desc}</p>
          </div>
        ))}
      </div>
    </section>
  )
}

/* ── modals ──────────────────────────────────────────────────── */
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[13px] font-medium text-[#2B2924]">{label}</span>
      {children}
    </label>
  )
}

function DeptModal({ open, onOpenChange, depts, onSaved }: {
  open: boolean; onOpenChange: (o: boolean) => void; depts: Dept[]; onSaved: () => void
}) {
  const blank = { name: '', description: '', color: SWATCHES[0], parent: '' }
  const [form, setForm] = useState(blank)
  const [saving, setSaving] = useState(false)
  useEffect(() => { if (open) setForm(blank) }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name.trim()) return
    setSaving(true)
    try {
      await orgApi.createDept({ ...form, name: form.name.trim(), parent: form.parent || null })
      toast.success(`Added ${form.name.trim()}`)
      onOpenChange(false)
      onSaved()
    } catch (err) { toast.error(apiError(err, 'Couldn’t create the department.')) }
    finally { setSaving(false) }
  }

  return (
    <Modal open={open} onOpenChange={onOpenChange} title="New department">
      <form id="dept-form" onSubmit={save} className="space-y-4">
        <Field label="Name">
          <input autoFocus value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Tax" className="field" />
        </Field>
        <Field label="Part of">
          <select value={form.parent} onChange={e => setForm(f => ({ ...f, parent: e.target.value }))} className="field">
            <option value="">Nothing — it’s a top-level department</option>
            {depts.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </Field>
        <Field label="Description (optional)">
          <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="What this team handles" className="field" />
        </Field>
        <div>
          <span className="mb-1.5 block text-[13px] font-medium text-[#2B2924]">Colour</span>
          <div className="flex gap-2">
            {SWATCHES.map(c => (
              <button key={c} type="button" onClick={() => setForm(f => ({ ...f, color: c }))} aria-label={`Colour ${c}`}
                className={cn('h-7 w-7 rounded-full ring-offset-2 transition', form.color === c && 'ring-2 ring-[#0E0D0A]')} style={{ background: c }} />
            ))}
          </div>
        </div>
      </form>
      <ModalFooter formId="dept-form" saving={saving} disabled={!form.name.trim()} onCancel={() => onOpenChange(false)} label="Create department" />
    </Modal>
  )
}

function RoleModal({ open, onOpenChange, depts, onSaved }: {
  open: boolean; onOpenChange: (o: boolean) => void; depts: Dept[]; onSaved: () => void
}) {
  const blank = { name: '', level: 5, department: '' }
  const [form, setForm] = useState(blank)
  const [saving, setSaving] = useState(false)
  useEffect(() => { if (open) setForm(blank) }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name.trim()) return
    setSaving(true)
    try {
      await orgApi.createRole({ ...form, name: form.name.trim(), department: form.department || null })
      toast.success(`Added ${form.name.trim()}`)
      onOpenChange(false)
      onSaved()
    } catch (err) { toast.error(apiError(err, 'Couldn’t create the role.')) }
    finally { setSaving(false) }
  }

  return (
    <Modal open={open} onOpenChange={onOpenChange} title="New role" description="Seniority decides how far up the tree a person can see.">
      <form id="role-form" onSubmit={save} className="space-y-4">
        <Field label="Role name">
          <input autoFocus value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Audit manager" className="field" />
        </Field>
        <Field label="Seniority">
          <select value={form.level} onChange={e => setForm(f => ({ ...f, level: Number(e.target.value) }))} className="field">
            {Object.entries(LEVELS).map(([l, n]) => <option key={l} value={l}>{n} (level {l})</option>)}
          </select>
        </Field>
        <Field label="Department">
          <select value={form.department} onChange={e => setForm(f => ({ ...f, department: e.target.value }))} className="field">
            <option value="">Any department</option>
            {depts.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </Field>
      </form>
      <ModalFooter formId="role-form" saving={saving} disabled={!form.name.trim()} onCancel={() => onOpenChange(false)} label="Create role" />
    </Modal>
  )
}

function MemberModal({ member, onClose, depts, roles, onSaved }: {
  member: Member | null; onClose: () => void; depts: Dept[]; roles: Role[]; onSaved: () => void
}) {
  const [dept, setDept] = useState('')
  const [role, setRole] = useState('')
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    if (member) { setDept(member.department || ''); setRole(member.role || '') }
  }, [member])

  // Only offer roles that belong to the chosen department, or to none.
  const roleOptions = roles.filter(r => !r.department || r.department === dept)

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!member) return
    setSaving(true)
    try {
      await orgApi.updateMember(member.id, { department: dept || null, role: role || null })
      toast.success(`Updated ${member.user_name || member.user_email}`)
      onClose()
      onSaved()
    } catch (err) { toast.error(apiError(err, 'Couldn’t save those changes.')) }
    finally { setSaving(false) }
  }

  return (
    <Modal open={!!member} onOpenChange={o => !o && onClose()} title={member?.user_name || 'Edit person'} description={member?.user_email}>
      <form id="member-form" onSubmit={save} className="space-y-4">
        <Field label="Department">
          <select value={dept} onChange={e => { setDept(e.target.value); setRole('') }} className="field">
            <option value="">No department</option>
            {depts.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </Field>
        <Field label="Role">
          <select value={role} onChange={e => setRole(e.target.value)} className="field">
            <option value="">No role</option>
            {roleOptions.map(r => <option key={r.id} value={r.id}>{r.name} — {LEVELS[r.level]}</option>)}
          </select>
        </Field>
      </form>
      <ModalFooter formId="member-form" saving={saving} onCancel={onClose} label="Save" />
    </Modal>
  )
}

function ModalFooter({ formId, saving, disabled, onCancel, label }: {
  formId: string; saving: boolean; disabled?: boolean; onCancel: () => void; label: string
}) {
  return (
    <div className="-mx-5 mt-5 flex justify-end gap-2 border-t border-[#ECEAE4] px-5 pt-3">
      <Button type="button" variant="plain" size="sm" onClick={onCancel}>Cancel</Button>
      <Button type="submit" form={formId} size="sm" loading={saving} disabled={disabled}>{label}</Button>
    </div>
  )
}

function Avatar({ name, size = 'md' }: { name: string; size?: 'sm' | 'md' }) {
  // A stable, muted colour per person so a long list is easier to scan.
  const palette = ['#E4E9F7', '#E6F2EA', '#F6EBDD', '#F3E6F4', '#E2F0F2', '#ECEAE4']
  const fg = ['#1A3DAF', '#15803D', '#A35A04', '#7E22CE', '#0E7490', '#5A5750']
  const i = [...(name || '?')].reduce((a, c) => a + c.charCodeAt(0), 0) % palette.length
  return (
    <span
      className={cn('flex shrink-0 items-center justify-center rounded-full font-medium', size === 'sm' ? 'h-6 w-6 text-[10px]' : 'h-8 w-8 text-[12px]')}
      style={{ background: palette[i], color: fg[i] }}
    >
      {getInitials(name || '?')}
    </span>
  )
}
