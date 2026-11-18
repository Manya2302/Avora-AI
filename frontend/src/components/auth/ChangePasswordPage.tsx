'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import toast from 'react-hot-toast'
import { Eye, EyeOff, ArrowLeft, Check } from 'lucide-react'
import { usersApi } from '@/lib/api'
import Input from '@/components/shared/Input'
import Button from '@/components/shared/Button'
import { Card } from '@/components/shared/Card'
import PageHeader from '@/components/shared/PageHeader'

const schema = z.object({
  current_password: z.string().min(1, 'Enter your current password'),
  new_password: z.string().min(8, 'Use at least 8 characters').regex(/[A-Z]/, 'Add an uppercase letter').regex(/[0-9]/, 'Add a number'),
  confirm_password: z.string(),
}).refine(d => d.new_password === d.confirm_password, { message: "Passwords don't match", path: ['confirm_password'] })

export default function ChangePasswordPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [showCur, setShowCur] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const { register, handleSubmit, watch, formState: { errors } } = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema) })
  const newPw = watch('new_password', '')

  const strength = [newPw.length >= 8, /[A-Z]/.test(newPw), /[0-9]/.test(newPw), /[^A-Za-z0-9]/.test(newPw)].filter(Boolean).length
  const strengthColor = ['bg-[#DC2626]','bg-[#D97706]','bg-[#D97706]','bg-[#16A34A]'][strength - 1] || 'bg-[#ECEAE4]'
  const strengthLabel = ['','Weak','Fair','Good','Strong'][strength]

  const onSubmit = async (data: any) => {
    setLoading(true)
    try {
      await usersApi.changePassword(data)
      toast.success('Password updated. Your other sessions were signed out.')
      router.push('/profile')
    } catch (e: any) {
      toast.error(e?.response?.data?.current_password || 'Update failed.')
    } finally { setLoading(false) }
  }

  return (
    <div className="space-y-6">
      <div>
        <button onClick={() => router.back()} className="mb-3 inline-flex items-center gap-1.5 text-[13px] text-[#8A877F] transition-colors hover:text-[#0E0D0A]">
          <ArrowLeft className="h-4 w-4" strokeWidth={1.75} /> Back to profile
        </button>
        <PageHeader title="Change password" description="You’ll stay signed in here. Every other device will be signed out." />
      </div>

      <Card>
        <form onSubmit={handleSubmit(onSubmit)}>
          <div className="grid gap-5 border-b border-[#ECEAE4] p-5 md:grid-cols-[minmax(0,240px)_minmax(0,1fr)] md:gap-8">
            <div>
              <h3 className="text-[14px] font-semibold text-[#0E0D0A]">Current password</h3>
              <p className="mt-1 text-[13px] text-[#8A877F]">We need this to confirm it’s you.</p>
            </div>
            <div className="max-w-[420px]">
              <div className="relative">
                <Input label="Current password" type={showCur ? 'text' : 'password'} autoComplete="current-password" error={errors.current_password?.message} {...register('current_password')} className="pr-10" />
                <button type="button" onClick={() => setShowCur(!showCur)} aria-label={showCur ? 'Hide password' : 'Show password'} className="absolute right-3 top-[37px] text-[#8A877F] hover:text-[#0E0D0A]">{showCur ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>
              </div>
            </div>
          </div>

          <div className="grid gap-5 p-5 md:grid-cols-[minmax(0,240px)_minmax(0,1fr)] md:gap-8">
            <div>
              <h3 className="text-[14px] font-semibold text-[#0E0D0A]">New password</h3>
              <p className="mt-1 text-[13px] text-[#8A877F]">At least 8 characters, with an uppercase letter and a number.</p>
            </div>
            <div className="max-w-[420px] space-y-4">
              <div className="relative">
                <Input label="New password" type={showNew ? 'text' : 'password'} autoComplete="new-password" error={errors.new_password?.message} {...register('new_password')} className="pr-10" />
                <button type="button" onClick={() => setShowNew(!showNew)} aria-label={showNew ? 'Hide password' : 'Show password'} className="absolute right-3 top-[37px] text-[#8A877F] hover:text-[#0E0D0A]">{showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>
              </div>

              {newPw && (
                <div>
                  <div className="flex items-center gap-3">
                    <div className="flex flex-1 gap-1">
                      {[0,1,2,3].map(i => <div key={i} className={`h-1 flex-1 rounded-full transition-colors ${i < strength ? strengthColor : 'bg-[#ECEAE4]'}`} />)}
                    </div>
                    <span className="w-12 text-right text-[12px] text-[#8A877F]">{strengthLabel}</span>
                  </div>
                  <ul className="mt-3 space-y-1.5">
                    {[['At least 8 characters', newPw.length >= 8],['An uppercase letter', /[A-Z]/.test(newPw)],['A number', /[0-9]/.test(newPw)],['A symbol (optional)', /[^A-Za-z0-9]/.test(newPw)]].map(([label, ok]) => (
                      <li key={String(label)} className={`flex items-center gap-2 text-[12.5px] ${ok ? 'text-[#15803D]' : 'text-[#8A877F]'}`}>
                        <span className={`flex h-3.5 w-3.5 items-center justify-center rounded-full border ${ok ? 'border-[#16A34A] bg-[#16A34A]' : 'border-[#DDD9D0]'}`}>
                          {ok && <Check className="h-2.5 w-2.5 text-white" strokeWidth={3} />}
                        </span>
                        {String(label)}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <Input label="Confirm new password" type="password" autoComplete="new-password" error={errors.confirm_password?.message} {...register('confirm_password')} />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#ECEAE4] bg-[#FBFAF7] px-5 py-3">
            <p className="text-[12.5px] text-[#8A877F]">Other active sessions are signed out when you save.</p>
            <Button type="submit" loading={loading}>Update password</Button>
          </div>
        </form>
      </Card>
    </div>
  )
}
