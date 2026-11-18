'use client'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import toast from 'react-hot-toast'
import { ShieldCheck, KeyRound } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/authStore'
import { usersApi } from '@/lib/api'
import { getInitials, formatBytes, formatDateTime } from '@/lib/utils'
import Input from '@/components/shared/Input'
import Button from '@/components/shared/Button'
import { Card } from '@/components/shared/Card'
import PageHeader from '@/components/shared/PageHeader'
import Badge from '@/components/shared/Badge'

const INDUSTRIES = [
  { value: '', label: 'Not set' },
  { value: 'law_firm', label: 'Law Firm' },
  { value: 'ca_firm', label: 'CA / Accounting' },
  { value: 'healthcare', label: 'Healthcare' },
  { value: 'consulting', label: 'Consulting' },
  { value: 'startup', label: 'Startup' },
  { value: 'other', label: 'Other' },
]

interface AccountSummary {
  document_count: number
  encrypted_count: number
  storage_bytes: number
  member_since: string
  last_sign_in: { at: string; ip_address: string; location: string; user_agent: string; is_current: boolean } | null
}

/** "Chrome on Windows" from a user-agent string; falls back to "Unknown browser". */
function describeDevice(ua: string): string {
  if (!ua) return 'Unknown browser'
  const browser = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Firefox\//.test(ua) ? 'Firefox'
    : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : null
  const os = /Windows/.test(ua) ? 'Windows' : /iPhone|iPad/.test(ua) ? 'iOS' : /Android/.test(ua) ? 'Android'
    : /Mac OS X|Macintosh/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : null
  if (browser && os) return `${browser} on ${os}`
  return browser || os || ua.slice(0, 40)
}

export default function ProfilePage() {
  const router = useRouter()
  const { user, fetchMe } = useAuthStore()
  const { register, handleSubmit, reset } = useForm()

  const [summary, setSummary] = useState<AccountSummary | null>(null)
  const [summaryFailed, setSummaryFailed] = useState(false)

  useEffect(() => { if (user) reset({ full_name: user.full_name, email: user.email, ...user.profile }) }, [user])
  useEffect(() => {
    usersApi.getSummary()
      .then(({ data }) => setSummary(data))
      .catch(() => setSummaryFailed(true))
  }, [])

  const onSubmit = async (data: any) => {
    try {
      await Promise.all([
        usersApi.updateMe({ full_name: data.full_name }),
        usersApi.updateProfile({ company_name: data.company_name, industry: data.industry, phone: data.phone, city: data.city, state: data.state, address: data.address, job_title: data.job_title, bio: data.bio }),
      ])
      await fetchMe()
      toast.success('Profile updated.')
    } catch { toast.error('Update failed.') }
  }

  const memberSince = summary?.member_since || user?.created_at
  const encryptedPct = summary && summary.document_count > 0
    ? `${Math.floor((summary.encrypted_count / summary.document_count) * 100)}%` : '—'
  const last = summary?.last_sign_in

  return (
    <div className="space-y-6">
      <PageHeader
        title="Profile"
        description="Your name and firm details, as your colleagues see them."
        actions={<>
          <Button variant="ghost" onClick={() => router.push('/profile/change-password')}>Change password</Button>
          <Button onClick={handleSubmit(onSubmit)}>Save changes</Button>
        </>}
      />

      {/* who you are */}
      <Card>
        <div className="flex flex-wrap items-center gap-4 p-5">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-[#1A3DAF] text-[18px] font-medium text-white">
            {getInitials(user?.full_name || 'U')}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[16px] font-semibold text-[#0E0D0A]">{user?.full_name}</p>
            <p className="truncate text-[13.5px] text-[#5A5750]">{user?.email}</p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <Badge variant="blue" className="capitalize">{user?.profile?.plan || 'free'} plan</Badge>
            <Badge variant="gray" className="capitalize">{user?.role}</Badge>
            {user?.is_email_verified && <Badge variant="green">Email verified</Badge>}
          </div>
        </div>
      </Card>

      <Section title="Personal details" description="Shown on documents you upload and in the audit log.">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input label="Full name" autoComplete="name" {...register('full_name')} />
            <Input label="Job title" placeholder="Managing partner" {...register('job_title')} />
          </div>
          <Input label="Email" type="email" {...register('email')} readOnly className="cursor-not-allowed bg-[#FBFAF7] text-[#5A5750]" hint="To change your email, contact support." />
          <Input label="Phone" type="tel" autoComplete="tel" placeholder="+91 98765 43210" {...register('phone')} />
          <div className="flex flex-col gap-1.5">
            <label htmlFor="profile-bio" className="text-[13px] font-medium text-[#2B2924]">Bio</label>
            <textarea id="profile-bio" {...register('bio')} rows={3} placeholder="A line or two about your role" className="field resize-none" />
          </div>
          <div className="flex justify-end">
            <Button type="submit" variant="ghost">Save profile</Button>
          </div>
        </form>
      </Section>

      <Section title="Firm" description="Used to tailor compliance checks to your line of work.">
        <div className="space-y-4">
          <Input label="Company or firm name" placeholder="Sharma & Associates LLP" {...register('company_name')} />
          <div className="flex flex-col gap-1.5">
            <label htmlFor="profile-industry" className="text-[13px] font-medium text-[#2B2924]">Industry</label>
            <select id="profile-industry" {...register('industry')} className="field h-10 py-0">
              {INDUSTRIES.map(i => <option key={i.value} value={i.value}>{i.label}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input label="City" placeholder="Bengaluru" {...register('city')} />
            <Input label="State" placeholder="Karnataka" {...register('state')} />
          </div>
          <Input label="Address" placeholder="42, MG Road" {...register('address')} />
        </div>
      </Section>

      <Section title="Account" description={`You're on the ${user?.profile?.plan || 'free'} plan.`}>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
          {[
            { label: 'Documents', value: summary ? summary.document_count.toLocaleString('en-IN') : '—' },
            { label: 'Storage', value: summary ? formatBytes(summary.storage_bytes) : '—' },
            { label: 'Encrypted', value: encryptedPct },
            { label: 'Member since', value: memberSince ? new Date(memberSince).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' }) : '—' },
          ].map(s => (
            <div key={s.label}>
              <dt className="text-[12.5px] text-[#8A877F]">{s.label}</dt>
              <dd className="mt-1 font-display text-[22px] font-semibold leading-none tabular-nums text-[#0E0D0A]">{s.value}</dd>
            </div>
          ))}
        </dl>
        {summaryFailed && <p className="mt-4 text-[12.5px] text-[#8A877F]">Account figures couldn’t be loaded. Refresh the page to try again.</p>}
      </Section>

      <Section title="Security" description="How your account and documents are protected.">
        <ul className="-my-3">
          <li className="flex items-center gap-3 border-t border-[#F1EFEA] py-3 first:border-0">
            <ShieldCheck className="h-4 w-4 shrink-0 text-[#15803D]" strokeWidth={1.75} />
            <div className="min-w-0 flex-1">
              <p className="text-[14px] font-medium text-[#0E0D0A]">Encryption on</p>
              <p className="text-[12.5px] text-[#8A877F]">AES-256-GCM, applied to every document</p>
            </div>
          </li>
          <li className="flex items-center gap-3 border-t border-[#F1EFEA] py-3 first:border-0">
            <KeyRound className="h-4 w-4 shrink-0 text-[#8A877F]" strokeWidth={1.75} />
            <div className="min-w-0 flex-1">
              <p className="text-[14px] font-medium text-[#0E0D0A]">Last sign-in</p>
              <p className="text-[12.5px] text-[#8A877F]">
                {last
                  ? <>{formatDateTime(last.at)}{last.is_current && ' (this session)'} · {describeDevice(last.user_agent)} · {last.location || <span className="font-mono text-[12px]">{last.ip_address}</span>}</>
                  : summaryFailed ? 'Couldn’t be loaded' : summary ? 'No sign-ins recorded yet' : '—'}
              </p>
            </div>
          </li>
        </ul>
      </Section>
    </div>
  )
}

/** Settings-style section: what it is on the left, the controls on the right. Stacks on small screens. */
function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <Card>
      <div className="grid gap-5 p-5 md:grid-cols-[minmax(0,240px)_minmax(0,1fr)] md:gap-8">
        <div>
          <h3 className="text-[14px] font-semibold text-[#0E0D0A]">{title}</h3>
          {description && <p className="mt-1 text-[13px] text-[#8A877F]">{description}</p>}
        </div>
        <div className="min-w-0">{children}</div>
      </div>
    </Card>
  )
}
