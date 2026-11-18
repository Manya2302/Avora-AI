import {
  LayoutDashboard, FileText, Upload, Search, ClipboardList, Folder, Sparkles,
  CheckSquare, FileSignature, AlertTriangle, Network, LayoutGrid, Building2, Plug, Activity,
  type LucideIcon,
} from 'lucide-react'

export type NavItem = {
  href: string
  label: string
  icon: LucideIcon
  /** key into the sidebar's live counts */
  countKey?: 'documents' | 'compliance' | 'contracts' | 'risks'
}

export type NavGroup = { label: string | null; items: NavItem[] }

export const NAV: NavGroup[] = [
  {
    label: null,
    items: [
      { href: '/dashboard', label: 'Home',      icon: LayoutDashboard },
      { href: '/documents', label: 'Documents', icon: FileText, countKey: 'documents' },
      { href: '/upload',    label: 'Upload',    icon: Upload },
      { href: '/search',    label: 'Search',    icon: Search },
    ],
  },
  {
    label: 'Assistant',
    items: [
      { href: '/copilot',           label: 'Copilot',     icon: Sparkles },
      { href: '/copilot/workspace', label: 'Workspace',   icon: LayoutGrid },
      { href: '/collections',       label: 'Collections', icon: Folder },
      { href: '/knowledge',         label: 'Knowledge map', icon: Network },
      { href: '/analytics',         label: 'AI activity', icon: Activity },
    ],
  },
  {
    label: 'Compliance',
    items: [
      { href: '/compliance', label: 'Checklist', icon: CheckSquare,   countKey: 'compliance' },
      { href: '/contracts',  label: 'Contracts', icon: FileSignature, countKey: 'contracts' },
      { href: '/risk',       label: 'Risk',      icon: AlertTriangle, countKey: 'risks' },
    ],
  },
  {
    label: 'Organization',
    items: [
      { href: '/organization', label: 'People & teams', icon: Building2 },
      { href: '/audit-logs',   label: 'Audit log',      icon: ClipboardList },
      { href: '/integrations', label: 'Integrations',   icon: Plug },
    ],
  },
]

const ALL_ITEMS = NAV.flatMap(g => g.items.map(i => ({ ...i, group: g.label })))

/** Pages not in the sidebar but still worth a proper breadcrumb. */
const EXTRA: Record<string, { label: string; group: string | null }> = {
  '/profile':                   { label: 'Profile',          group: 'Account' },
  '/profile/change-password':   { label: 'Change password',  group: 'Account' },
  '/settings':                  { label: 'Settings',         group: 'Account' },
  '/copilot/history':           { label: 'History',          group: 'Assistant' },
  '/copilot/prompts':           { label: 'Saved prompts',    group: 'Assistant' },
  '/copilot/recommendations':   { label: 'Recommendations',  group: 'Assistant' },
  '/copilot/reports':           { label: 'Reports',          group: 'Assistant' },
  '/compliance/copilot':        { label: 'Compliance assistant', group: 'Compliance' },
  '/compliance/audit-package':  { label: 'Audit package',    group: 'Compliance' },
}

export function isActive(pathname: string, href: string) {
  if (href === '/dashboard') return pathname === '/dashboard'
  if (href === '/copilot') return pathname === '/copilot'
  return pathname === href || pathname.startsWith(href + '/')
}

/** Returns breadcrumb parts for the current path, e.g. ["Compliance", "Contracts", "Detail"]. */
export function crumbsFor(pathname: string): string[] {
  if (EXTRA[pathname]) {
    const e = EXTRA[pathname]
    return e.group ? [e.group, e.label] : [e.label]
  }
  // longest matching nav href wins
  const match = [...ALL_ITEMS]
    .sort((a, b) => b.href.length - a.href.length)
    .find(i => pathname === i.href || pathname.startsWith(i.href + '/'))
  if (!match) return []
  const parts = match.group ? [match.group, match.label] : [match.label]
  const rest = pathname.slice(match.href.length).split('/').filter(Boolean)
  if (rest.length) parts.push(rest[rest.length - 1] === 'insights' ? 'Insights' : 'Details')
  return parts
}
