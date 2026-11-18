'use client'
import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import api, { orgApi } from '@/lib/api'
import Modal from '@/components/shared/Modal'
import Button from '@/components/shared/Button'
import { cn } from '@/lib/utils'

type Level = 'private' | 'user_share' | 'department' | 'organization' | 'custom'

const LEVELS: { value: Level; label: string; hint: string }[] = [
  { value: 'private',      label: 'Private',       hint: 'Only you.' },
  { value: 'user_share',   label: 'Specific people', hint: 'You and the people you pick.' },
  { value: 'department',   label: 'Departments',   hint: 'Everyone in the departments you pick.' },
  { value: 'organization', label: 'Organisation',  hint: 'Everyone in your organisation.' },
  { value: 'custom',       label: 'Custom',        hint: 'Any mix of people, departments and roles.' },
]

interface Option { id: string; label: string; sub?: string }

/** Collect every page of a DRF list (paginated or plain array). */
async function fetchAll(first: Promise<{ data: any }>): Promise<any[]> {
  let res = await first
  const out: any[] = []
  for (let guard = 0; guard < 50; guard++) {
    const d = res.data
    if (Array.isArray(d)) return out.concat(d)
    out.push(...(d?.results || []))
    if (!d?.next) break
    res = await api.get(d.next)
  }
  return out
}

function PickList({ title, options, selected, onToggle, empty }: {
  title: string; options: Option[]; selected: Set<string>; onToggle: (id: string) => void; empty: string
}) {
  return (
    <fieldset className="mt-4">
      <legend className="mb-1.5 text-[13px] font-medium text-[#2B2924]">{title}</legend>
      {options.length === 0 ? (
        <p className="text-[12.5px] text-[#8A877F]">{empty}</p>
      ) : (
        <ul className="max-h-40 overflow-y-auto rounded-[8px] border border-[#ECEAE4]">
          {options.map(o => (
            <li key={o.id} className="border-t border-[#F1EFEA] first:border-0">
              <label className="flex cursor-pointer items-center gap-2.5 px-3 py-2 hover:bg-[#FBFAF7]">
                <input type="checkbox" className="accent-[#1A3DAF]" checked={selected.has(o.id)} onChange={() => onToggle(o.id)} />
                <span className="min-w-0 flex-1 truncate text-[13.5px] text-[#0E0D0A]">{o.label}</span>
                {o.sub && <span className="shrink-0 truncate text-[12px] text-[#8A877F]">{o.sub}</span>}
              </label>
            </li>
          ))}
        </ul>
      )}
    </fieldset>
  )
}

export default function ShareDocumentModal({ docId, open, onOpenChange }: {
  docId: string; open: boolean; onOpenChange: (o: boolean) => void
}) {
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState(false)
  const [saving, setSaving] = useState(false)
  const [level, setLevel] = useState<Level>('private')
  const [inherit, setInherit] = useState(true)
  const [users, setUsers] = useState<Set<string>>(new Set())
  const [depts, setDepts] = useState<Set<string>>(new Set())
  const [roles, setRoles] = useState<Set<string>>(new Set())
  const [userOpts, setUserOpts] = useState<Option[]>([])
  const [deptOpts, setDeptOpts] = useState<Option[]>([])
  const [roleOpts, setRoleOpts] = useState<Option[]>([])

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoading(true); setLoadError(false)
    Promise.all([
      orgApi.visibility(docId),
      fetchAll(orgApi.members()).catch(() => []),
      fetchAll(orgApi.departments()).catch(() => []),
      fetchAll(orgApi.roles()).catch(() => []),
    ]).then(([vis, members, departments, orgRoles]) => {
      if (cancelled) return
      const v = vis.data || {}
      setLevel((v.visibility as Level) || 'private')
      setInherit(v.inherit_upward ?? true)
      setUsers(new Set((v.allowed_user_ids || []).map(String)))
      setDepts(new Set((v.allowed_department_ids || []).map(String)))
      setRoles(new Set((v.allowed_role_ids || []).map(String)))
      setUserOpts(members.map((m: any) => ({ id: String(m.user), label: m.user_name || m.user_email || 'Unnamed member', sub: m.user_email })))
      setDeptOpts(departments.map((d: any) => ({ id: String(d.id), label: d.name })))
      setRoleOpts(orgRoles.map((r: any) => ({ id: String(r.id), label: r.name, sub: r.department_name || undefined })))
    }).catch(() => { if (!cancelled) setLoadError(true) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [open, docId])

  const toggle = (set: Set<string>, setter: (s: Set<string>) => void) => (id: string) => {
    const s = new Set(set); s.has(id) ? s.delete(id) : s.add(id); setter(s)
  }

  const showUsers = level === 'user_share' || level === 'custom'
  const showDepts = level === 'department' || level === 'custom'
  const showRoles = level === 'custom'
  const missingTargets =
    (level === 'user_share' && users.size === 0) ||
    (level === 'department' && depts.size === 0) ||
    (level === 'custom' && users.size + depts.size + roles.size === 0)

  const save = async () => {
    setSaving(true)
    try {
      // Grants that don't apply to the chosen level are cleared so they can't linger.
      await orgApi.setVisibility(docId, {
        visibility: level,
        inherit_upward: inherit,
        allowed_user_ids: showUsers ? Array.from(users) : [],
        allowed_department_ids: showDepts ? Array.from(depts) : [],
        allowed_role_ids: showRoles ? Array.from(roles) : [],
      })
      toast.success('Sharing settings saved.')
      onOpenChange(false)
    } catch (e: any) {
      toast.error(e?.response?.data?.error || 'Sharing settings could not be saved.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open={open} onOpenChange={o => { if (!saving) onOpenChange(o) }} title="Share document"
      description="Choose who else can open and search this document."
      className="max-w-[520px]"
      footer={<>
        <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
        <Button size="sm" onClick={save} loading={saving} disabled={loading || loadError || missingTargets}
          title={missingTargets ? 'Pick at least one person, department or role' : undefined}>Save</Button>
      </>}>
      {loading ? (
        <div className="space-y-2">{[0, 1, 2].map(i => <div key={i} className="h-9 animate-pulse rounded-[6px] bg-[#F1EFEA]" />)}</div>
      ) : loadError ? (
        <p className="text-[13.5px] text-[#B91C1C]">The current sharing settings couldn’t be loaded. Close this and try again.</p>
      ) : (
        <div>
          <div role="radiogroup" aria-label="Who can see it" className="space-y-1.5">
            {LEVELS.map(l => (
              <label key={l.value} className={cn('flex cursor-pointer items-start gap-2.5 rounded-[8px] border px-3 py-2',
                level === l.value ? 'border-[#1A3DAF] bg-[#EEF2FC]' : 'border-[#ECEAE4] hover:bg-[#FBFAF7]')}>
                <input type="radio" name="visibility" className="mt-0.5 accent-[#1A3DAF]" checked={level === l.value} onChange={() => setLevel(l.value)} />
                <span>
                  <span className="block text-[13.5px] font-medium text-[#0E0D0A]">{l.label}</span>
                  <span className="block text-[12.5px] text-[#8A877F]">{l.hint}</span>
                </span>
              </label>
            ))}
          </div>
          {showUsers && <PickList title="People" options={userOpts} selected={users} onToggle={toggle(users, setUsers)}
            empty="No organisation members found. Add people on the Organisation page first." />}
          {showDepts && <PickList title="Departments" options={deptOpts} selected={depts} onToggle={toggle(depts, setDepts)}
            empty="No departments found. Create them on the Organisation page first." />}
          {showRoles && <PickList title="Roles" options={roleOpts} selected={roles} onToggle={toggle(roles, setRoles)}
            empty="No roles found." />}
          <label className="mt-4 flex cursor-pointer items-center gap-2.5 text-[13px] text-[#2B2924]">
            <input type="checkbox" className="accent-[#1A3DAF]" checked={inherit} onChange={e => setInherit(e.target.checked)} />
            Managers above me in the department hierarchy can also open it
          </label>
        </div>
      )}
    </Modal>
  )
}
