'use client'
import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import toast from 'react-hot-toast'
import { Shield, Lock } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/authStore'
import { usersApi } from '@/lib/api'
import { getInitials, formatBytes } from '@/lib/utils'
import Input from '@/components/shared/Input'
import Button from '@/components/shared/Button'
import { Card, CardHeader, CardBody } from '@/components/shared/Card'

export default function ProfilePage() {
  const router = useRouter()
  const { user, fetchMe } = useAuthStore()
  const { register, handleSubmit, reset } = useForm()

  useEffect(() => { if (user) reset({ full_name: user.full_name, email: user.email, ...user.profile }) }, [user])

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

  const storageUsed = user?.profile?.storage_used || 0
  const storagePct  = Math.min((storageUsed / (500 * 1024 * 1024 * 1024)) * 100, 100)

  return (
    <div className="space-y-5 max-w-5xl">
      {/* Hero */}
      <div className="bg-[#0C0B09] rounded-[16px] p-8 relative overflow-hidden">
        <div className="absolute bottom-0 left-0 w-72 h-72 bg-[#1A3DAF]/12 rounded-full blur-3xl -translate-x-1/2 translate-y-1/2 pointer-events-none" />
        <div className="relative z-10 flex items-center gap-6 flex-wrap">
          <div className="relative">
            <div className="w-20 h-20 rounded-full bg-[#1A3DAF] flex items-center justify-center font-display text-3xl font-bold text-white border-2 border-white/10">
              {getInitials(user?.full_name || 'U')}
            </div>
          </div>
          <div className="flex-1">
            <h2 className="font-display text-2xl font-bold text-white/92">{user?.full_name}</h2>
            <p className="font-mono text-sm text-white/40 mt-0.5">{user?.email}</p>
            <div className="flex gap-2 mt-2.5 flex-wrap">
              <span className="font-mono text-[9.5px] font-medium px-2 py-1 rounded-full bg-[#1A3DAF]/25 text-[#7B9FE8] border border-[#7B9FE8]/20 capitalize">{user?.profile?.plan || 'free'} Plan</span>
              <span className="font-mono text-[9.5px] font-medium px-2 py-1 rounded-full bg-white/6 text-white/45 border border-white/10 capitalize">{user?.role}</span>
              {user?.is_email_verified && <span className="font-mono text-[9.5px] font-medium px-2 py-1 rounded-full bg-green-900/30 text-green-400 border border-green-800/30">✓ Verified</span>}
            </div>
          </div>
          <div className="flex gap-3">
            <Button variant="ghost" size="sm" className="border-white/15 text-white/60 hover:bg-white/6 hover:text-white hover:border-white/25" onClick={() => router.push('/profile/change-password')}>Change Password</Button>
            <Button size="sm" className="bg-white text-[#0E0D0A] border-white hover:bg-[#F7F5F0]" onClick={handleSubmit(onSubmit)}>Save Changes</Button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 space-y-5">
          <Card>
            <CardHeader title="Personal Information" />
            <CardBody>
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <Input label="Full Name" {...register('full_name')} />
                  <Input label="Job Title" placeholder="Managing Partner" {...register('job_title')} />
                </div>
                <Input label="Email Address" type="email" {...register('email')} readOnly className="opacity-60 cursor-not-allowed" hint="Contact support to change email." />
                <Input label="Phone Number" placeholder="+91 98765 43210" {...register('phone')} />
                <div>
                  <label className="text-xs font-semibold text-[#0E0D0A] mb-1.5 block">Bio</label>
                  <textarea {...register('bio')} rows={3} placeholder="Brief description…" className="w-full px-3 py-2.5 bg-[#F7F5F0] border border-[#DDD9D0] rounded-[7px] text-sm font-light outline-none focus:border-[#1A3DAF] resize-none" />
                </div>
                <Button type="submit" className="w-full justify-center">Save Profile</Button>
              </form>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Company Information" />
            <CardBody>
              <div className="space-y-4">
                <Input label="Company / Firm Name" placeholder="Sharma & Associates LLP" {...register('company_name')} />
                <div>
                  <label className="text-xs font-semibold text-[#0E0D0A] mb-1.5 block">Industry</label>
                  <select {...register('industry')} className="w-full px-3 py-2.5 bg-[#F7F5F0] border border-[#DDD9D0] rounded-[7px] text-sm font-light outline-none focus:border-[#1A3DAF]">
                    {['Law Firm','CA / Accounting','Healthcare','Consulting','Startup','Other'].map(i => <option key={i}>{i}</option>)}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Input label="City" placeholder="Bengaluru" {...register('city')} />
                  <Input label="State" placeholder="Karnataka" {...register('state')} />
                </div>
                <Input label="Address" placeholder="42, MG Road…" {...register('address')} />
              </div>
            </CardBody>
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader title="Account Summary" />
            <CardBody className="space-y-3">
              <div className="grid grid-cols-2 gap-2.5">
                {[
                  { label: 'Documents', value: '1,284' },
                  { label: 'Storage', value: formatBytes(storageUsed) },
                  { label: 'Encrypted', value: '100%' },
                  { label: 'Member Since', value: 'Jan 2026' },
                ].map(s => (
                  <div key={s.label} className="p-3 bg-[#F7F5F0] border border-[#ECEAE4] rounded-[9px] text-center">
                    <div className="font-display text-xl font-bold text-[#0E0D0A]">{s.value}</div>
                    <div className="text-[11px] text-[#9B9890] mt-0.5">{s.label}</div>
                  </div>
                ))}
              </div>
              <div className="p-3 bg-[#EBF0FF] border border-[#1A3DAF]/12 rounded-[9px]">
                <div className="flex justify-between mb-1.5 text-xs">
                  <span className="font-medium text-[#1A3DAF]">{user?.profile?.plan?.toUpperCase() || 'FREE'} Plan</span>
                  <span className="font-mono text-[#1A3DAF]">{storagePct.toFixed(1)}% used</span>
                </div>
                <div className="h-1.5 bg-[#1A3DAF]/15 rounded-full overflow-hidden">
                  <div className="h-full bg-[#1A3DAF] rounded-full" style={{ width: `${storagePct}%` }} />
                </div>
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Security Overview" />
            <CardBody className="space-y-2.5">
              <div className="flex items-center gap-2.5 p-3 bg-green-50 border border-green-100 rounded-[9px]">
                <Shield className="w-4 h-4 text-green-600 flex-shrink-0" />
                <div>
                  <p className="text-xs font-semibold text-green-700">Encryption Active</p>
                  <p className="text-[10px] font-mono text-green-600/70">AES-256-GCM · All documents</p>
                </div>
              </div>
              <div className="flex items-center justify-between p-3 bg-[#F7F5F0] border border-[#ECEAE4] rounded-[9px]">
                <div className="flex items-center gap-2">
                  <Lock className="w-4 h-4 text-[#9B9890]" />
                  <div>
                    <p className="text-xs font-semibold text-[#0E0D0A]">Two-Factor Auth</p>
                    <p className="text-[10px] text-[#9B9890]">Not enabled</p>
                  </div>
                </div>
                <Button variant="ghost" size="sm" onClick={() => router.push('/settings')}>Enable</Button>
              </div>
              <div className="p-3 bg-[#F7F5F0] border border-[#ECEAE4] rounded-[9px]">
                <p className="text-xs font-semibold text-[#0E0D0A] mb-0.5">Last Login</p>
                <p className="text-[11px] font-mono text-[#9B9890]">Today · 09:01 AM · Bengaluru</p>
              </div>
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  )
}
