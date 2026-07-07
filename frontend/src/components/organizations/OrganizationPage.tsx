'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Building2, Users, Shield, Network, ChevronRight,
  Plus, Edit2, Trash2, UserCheck, Lock, Globe, Share2, Layers
} from 'lucide-react'
import api from '@/lib/api'
import toast from 'react-hot-toast'
import { Card, CardHeader, CardBody } from '@/components/shared/Card'
import Badge from '@/components/shared/Badge'
import Button from '@/components/shared/Button'

// ── API helpers ──────────────────────────────────────────────
const orgApi = {
  tree:            () => api.get('/org/tree/'),
  departments:     () => api.get('/org/departments/'),
  createDept:      (d: any) => api.post('/org/departments/', d),
  deleteDept:      (id: string) => api.delete(`/org/departments/${id}/`),
  roles:           () => api.get('/org/roles/'),
  createRole:      (d: any) => api.post('/org/roles/', d),
  members:         (dept?: string) => api.get('/org/members/', { params: dept ? { department: dept } : {} }),
  assignMember:    (d: any) => api.post('/org/members/assign/', d),
  myPermissions:   () => api.get('/org/my-permissions/'),
}

const LEVEL_LABELS: Record<number, string> = {
  1: 'Executive', 2: 'Director', 3: 'Senior Manager',
  4: 'Manager',   5: 'Senior',   6: 'Mid-Level',
  7: 'Junior',    8: 'Intern',   9: 'Trainee', 10: 'Observer'
}

const VISIBILITY_ICONS: Record<string, any> = {
  private:      { icon: Lock,    label: 'Private',      variant: 'gray' },
  user_share:   { icon: Share2,  label: 'User Share',   variant: 'blue' },
  department:   { icon: Building2,label: 'Department',  variant: 'amber' },
  organization: { icon: Globe,   label: 'Organization', variant: 'green' },
  custom:       { icon: Layers,  label: 'Custom',       variant: 'red' },
}

// ── Main Component ────────────────────────────────────────────
export default function OrganizationPage() {
  const [tab, setTab] = useState<'tree'|'departments'|'roles'|'members'>('tree')
  const [tree, setTree] = useState<any[]>([])
  const [departments, setDepts] = useState<any[]>([])
  const [roles, setRoles] = useState<any[]>([])
  const [members, setMembers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [myPerms, setMyPerms] = useState<any>(null)

  // Modals
  const [showAddDept, setShowAddDept] = useState(false)
  const [showAddRole, setShowAddRole] = useState(false)
  const [newDept, setNewDept] = useState({ name: '', description: '', color: '#1A3DAF' })
  const [newRole, setNewRole] = useState({ name: '', level: 5, department: '' })

  const load = async () => {
    setLoading(true)
    try {
      const [treeR, deptsR, rolesR, membersR, permsR] = await Promise.all([
        orgApi.tree(),
        orgApi.departments(),
        orgApi.roles(),
        orgApi.members(),
        orgApi.myPermissions(),
      ])
      setTree(treeR.data.tree || [])
      setDepts(deptsR.data.results || deptsR.data || [])
      setRoles(rolesR.data.results || rolesR.data || [])
      setMembers(membersR.data.results || membersR.data || [])
      setMyPerms(permsR.data)
    } catch (e) {
      toast.error('Failed to load organization data.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const createDept = async () => {
    if (!newDept.name) return
    await orgApi.createDept(newDept)
    toast.success('Department created!')
    setNewDept({ name: '', description: '', color: '#1A3DAF' })
    setShowAddDept(false)
    load()
  }

  const createRole = async () => {
    if (!newRole.name) return
    await orgApi.createRole(newRole)
    toast.success('Role created!')
    setNewRole({ name: '', level: 5, department: '' })
    setShowAddRole(false)
    load()
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-[#EBF0FF] rounded-[11px] flex items-center justify-center">
            <Building2 className="w-5 h-5 text-[#1A3DAF]" />
          </div>
          <div>
            <h2 className="font-display text-2xl font-bold text-[#0E0D0A]">Organization</h2>
            <p className="text-sm text-[#9B9890]">Hierarchy · Roles · Permissions · Access Control</p>
          </div>
        </div>
        {myPerms && (
          <div className="flex items-center gap-2 bg-[#F7F5F0] border border-[#ECEAE4] rounded-[11px] px-4 py-2.5">
            <UserCheck className="w-4 h-4 text-[#9B9890]" />
            <div className="text-xs">
              <span className="text-[#9B9890]">You · </span>
              <span className="font-medium text-[#0E0D0A]">{myPerms.department?.name || 'No Department'}</span>
              {myPerms.role && <span className="text-[#9B9890]"> / {myPerms.role.name} (L{myPerms.role.level})</span>}
            </div>
            <div className="ml-4 font-mono text-[11px] text-[#1A3DAF] bg-[#EBF0FF] px-2 py-0.5 rounded-full">
              {myPerms.accessible_doc_count} docs accessible
            </div>
          </div>
        )}
      </div>

      {/* Tab Bar */}
      <div className="flex gap-1 bg-[#F7F5F0] border border-[#DDD9D0] rounded-[11px] p-1">
        {[
          ['tree', 'Org Chart', Network],
          ['departments', 'Departments', Building2],
          ['roles', 'Roles', Shield],
          ['members', 'Members', Users],
        ].map(([k, l, Icon]: any) => (
          <button key={k} onClick={() => setTab(k)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-[8px] text-xs font-medium transition-all
              ${tab === k ? 'bg-white text-[#0E0D0A] shadow-sm' : 'text-[#9B9890] hover:text-[#5A5750]'}`}>
            <Icon className="w-3.5 h-3.5" />{l}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="h-48 bg-white border border-[#DDD9D0] rounded-[14px] animate-pulse" />
      ) : (
        <>
          {/* ── Org Chart Tab ── */}
          {tab === 'tree' && (
            <Card>
              <CardHeader title="Organization Chart" />
              <CardBody>
                {tree.length === 0 ? (
                  <p className="text-center text-sm text-[#9B9890] py-10">
                    No departments yet. Create departments and assign members to build your org chart.
                  </p>
                ) : (
                  <div className="space-y-4">
                    {tree.map(dept => <OrgNode key={dept.id} node={dept} depth={0} />)}
                  </div>
                )}
              </CardBody>
            </Card>
          )}

          {/* ── Departments Tab ── */}
          {tab === 'departments' && (
            <Card>
              <CardHeader title="Departments" action={
                <Button size="sm" onClick={() => setShowAddDept(true)}>
                  <Plus className="w-3.5 h-3.5" /> Add Department
                </Button>
              } />
              {showAddDept && (
                <div className="px-5 pt-4 pb-2 border-b border-[#ECEAE4] bg-[#F7F9FF]">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
                    <input value={newDept.name} onChange={e => setNewDept(p => ({...p, name: e.target.value}))}
                      placeholder="Department name" className="px-3 py-2 border border-[#DDD9D0] rounded-[8px] text-sm" />
                    <input value={newDept.description} onChange={e => setNewDept(p => ({...p, description: e.target.value}))}
                      placeholder="Description (optional)" className="px-3 py-2 border border-[#DDD9D0] rounded-[8px] text-sm" />
                    <div className="flex gap-2">
                      <input type="color" value={newDept.color} onChange={e => setNewDept(p => ({...p, color: e.target.value}))}
                        className="w-10 h-10 rounded border border-[#DDD9D0] cursor-pointer" />
                      <Button onClick={createDept} className="flex-1">Create</Button>
                      <Button variant="ghost" onClick={() => setShowAddDept(false)}>Cancel</Button>
                    </div>
                  </div>
                </div>
              )}
              <div className="divide-y divide-[#ECEAE4]">
                {departments.map(d => (
                  <div key={d.id} className="flex items-center gap-3 px-5 py-3.5 hover:bg-[#F7F5F0]">
                    <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: d.color }} />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-[#0E0D0A]">{d.name}</p>
                      {d.description && <p className="text-xs text-[#9B9890]">{d.description}</p>}
                    </div>
                  </div>
                ))}
                {departments.length === 0 && (
                  <div className="p-10 text-center text-sm text-[#9B9890]">No departments created yet.</div>
                )}
              </div>
            </Card>
          )}

          {/* ── Roles Tab ── */}
          {tab === 'roles' && (
            <Card>
              <CardHeader title="Roles" action={
                <Button size="sm" onClick={() => setShowAddRole(true)}>
                  <Plus className="w-3.5 h-3.5" /> Add Role
                </Button>
              } />
              {showAddRole && (
                <div className="px-5 pt-4 pb-2 border-b border-[#ECEAE4] bg-[#F7F9FF]">
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-3">
                    <input value={newRole.name} onChange={e => setNewRole(p => ({...p, name: e.target.value}))}
                      placeholder="Role name (e.g. Finance Manager)" className="px-3 py-2 border border-[#DDD9D0] rounded-[8px] text-sm" />
                    <select value={newRole.level} onChange={e => setNewRole(p => ({...p, level: Number(e.target.value)}))}
                      className="px-3 py-2 border border-[#DDD9D0] rounded-[8px] text-sm">
                      {Object.entries(LEVEL_LABELS).map(([l, name]) => (
                        <option key={l} value={l}>L{l} — {name}</option>
                      ))}
                    </select>
                    <select value={newRole.department} onChange={e => setNewRole(p => ({...p, department: e.target.value}))}
                      className="px-3 py-2 border border-[#DDD9D0] rounded-[8px] text-sm">
                      <option value="">No Department</option>
                      {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                    </select>
                    <div className="flex gap-2">
                      <Button onClick={createRole} className="flex-1">Create</Button>
                      <Button variant="ghost" onClick={() => setShowAddRole(false)}>Cancel</Button>
                    </div>
                  </div>
                </div>
              )}
              <div className="divide-y divide-[#ECEAE4]">
                {roles.map(r => (
                  <div key={r.id} className="flex items-center gap-3 px-5 py-3.5 hover:bg-[#F7F5F0]">
                    <div className={`font-mono text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      r.level <= 2 ? 'bg-red-50 text-red-600' :
                      r.level <= 4 ? 'bg-amber-50 text-amber-700' :
                      'bg-[#F7F5F0] text-[#9B9890]'
                    }`}>L{r.level}</div>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-[#0E0D0A]">{r.name}</p>
                      <p className="text-xs text-[#9B9890]">{r.department_name || 'Cross-department'} · {LEVEL_LABELS[r.level]}</p>
                    </div>
                  </div>
                ))}
                {roles.length === 0 && (
                  <div className="p-10 text-center text-sm text-[#9B9890]">No roles created yet.</div>
                )}
              </div>
            </Card>
          )}

          {/* ── Members Tab ── */}
          {tab === 'members' && (
            <Card>
              <CardHeader title="Members" action={
                <span className="font-mono text-[11px] text-[#9B9890]">{members.length} members</span>
              } />
              <div className="divide-y divide-[#ECEAE4]">
                {members.map(m => (
                  <div key={m.id} className="flex items-center gap-3 px-5 py-3.5 hover:bg-[#F7F5F0]">
                    <div className="w-8 h-8 bg-[#EBF0FF] rounded-full flex items-center justify-center font-display text-xs font-bold text-[#1A3DAF] flex-shrink-0">
                      {(m.user_name || m.user_email || '?')[0].toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-[#0E0D0A] truncate">{m.user_name}</p>
                      <p className="font-mono text-[11px] text-[#9B9890] truncate">{m.user_email}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs font-medium text-[#0E0D0A]">{m.role_name || '—'}</p>
                      <p className="text-[11px] text-[#9B9890]">{m.department_name || 'No Department'} {m.role_level ? `· L${m.role_level}` : ''}</p>
                    </div>
                  </div>
                ))}
                {members.length === 0 && (
                  <div className="p-10 text-center text-sm text-[#9B9890]">
                    No members assigned yet. Use the admin panel to assign users.
                  </div>
                )}
              </div>
            </Card>
          )}
        </>
      )}

      {/* Visibility Guide */}
      <Card>
        <CardHeader title="Document Visibility Levels" />
        <CardBody>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
            {Object.entries(VISIBILITY_ICONS).map(([key, v]: any) => {
              const Icon = v.icon
              return (
                <div key={key} className="text-center p-4 bg-[#F7F5F0] border border-[#ECEAE4] rounded-[12px]">
                  <div className="w-9 h-9 bg-white border border-[#DDD9D0] rounded-[10px] flex items-center justify-center mx-auto mb-2">
                    <Icon className="w-4 h-4 text-[#0E0D0A]" />
                  </div>
                  <p className="font-semibold text-xs text-[#0E0D0A] mb-1">{v.label}</p>
                  <p className="text-[11px] text-[#9B9890] leading-relaxed">
                    {key === 'private'      && 'Only the uploader can access.'}
                    {key === 'user_share'   && 'Specific named users.'}
                    {key === 'department'   && 'Everyone in the department + hierarchy above.'}
                    {key === 'organization' && 'All registered users.'}
                    {key === 'custom'       && 'Custom mix of users, departments, and roles.'}
                  </p>
                </div>
              )
            })}
          </div>
        </CardBody>
      </Card>
    </div>
  )
}

// ── Org Node (recursive) ─────────────────────────────────────
function OrgNode({ node, depth }: { node: any, depth: number }) {
  const [expanded, setExpanded] = useState(depth < 1)

  return (
    <div className={`${depth > 0 ? 'ml-6 pl-4 border-l-2 border-[#ECEAE4]' : ''}`}>
      <div
        className="flex items-center gap-2 py-2 cursor-pointer group"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: node.color }} />
        <span className="font-semibold text-sm text-[#0E0D0A] group-hover:text-[#1A3DAF] transition-colors">
          {node.name}
        </span>
        <span className="font-mono text-[10px] text-[#9B9890]">{node.member_count} members</span>
        {(node.children?.length > 0 || node.members?.length > 0) && (
          <ChevronRight className={`w-3 h-3 text-[#9B9890] transition-transform ${expanded ? 'rotate-90' : ''}`} />
        )}
      </div>

      {expanded && (
        <div className="ml-4">
          {/* Roles */}
          {node.roles?.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-2">
              {node.roles.map((r: any) => (
                <span key={r.id} className="font-mono text-[10px] text-[#9B9890] bg-[#F7F5F0] border border-[#ECEAE4] px-2 py-0.5 rounded-full">
                  L{r.level} · {r.name}
                </span>
              ))}
            </div>
          )}
          {/* Members */}
          {node.members?.map((m: any) => (
            <div key={m.id} className="flex items-center gap-2 py-1.5">
              <div className="w-5 h-5 bg-[#EBF0FF] rounded-full flex items-center justify-center text-[9px] font-bold text-[#1A3DAF] flex-shrink-0">
                {m.name[0]?.toUpperCase() || '?'}
              </div>
              <span className="text-xs text-[#5A5750]">{m.name}</span>
              {m.role && <span className="font-mono text-[10px] text-[#9B9890]">· {m.role}</span>}
            </div>
          ))}
          {/* Children (recursive) */}
          {node.children?.map((c: any) => <OrgNode key={c.id} node={c} depth={depth + 1} />)}
        </div>
      )}
    </div>
  )
}
