'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import toast from 'react-hot-toast'
import { Eye, EyeOff, ArrowLeft, Lock } from 'lucide-react'
import { usersApi } from '@/lib/api'
import Input from '@/components/shared/Input'
import Button from '@/components/shared/Button'
import { Card, CardHeader, CardBody } from '@/components/shared/Card'

const schema = z.object({
  current_password: z.string().min(1, 'Required'),
  new_password: z.string().min(8, 'Min 8 characters').regex(/[A-Z]/, 'Need uppercase').regex(/[0-9]/, 'Need number'),
  confirm_password: z.string(),
}).refine(d => d.new_password === d.confirm_password, { message: "Passwords don't match", path: ['confirm_password'] })

export default function ChangePasswordPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [showCur, setShowCur] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const { register, handleSubmit, watch, formState: { errors } } = useForm({ resolver: zodResolver(schema) })
  const newPw = watch('new_password', '')

  const strength = [newPw.length >= 8, /[A-Z]/.test(newPw), /[0-9]/.test(newPw), /[^A-Za-z0-9]/.test(newPw)].filter(Boolean).length
  const strengthColor = ['bg-red-400','bg-orange-400','bg-amber-400','bg-green-500'][strength - 1] || 'bg-[#ECEAE4]'
  const strengthLabel = ['','Weak','Fair','Good','Strong'][strength]

  const onSubmit = async (data: any) => {
    setLoading(true)
    try {
      await usersApi.changePassword(data)
      toast.success('Password updated. Other sessions revoked.')
      router.push('/profile')
    } catch (e: any) {
      toast.error(e?.response?.data?.current_password || 'Update failed.')
    } finally { setLoading(false) }
  }

  return (
    <div className="max-w-md mx-auto space-y-5">
      <button onClick={() => router.back()} className="flex items-center gap-2 text-sm text-[#9B9890] hover:text-[#0E0D0A] transition-colors">
        <ArrowLeft className="w-4 h-4" /> Back to Profile
      </button>
      <div>
        <h2 className="font-display text-2xl font-bold tracking-tight text-[#0E0D0A]">Change Password</h2>
        <p className="text-sm font-light text-[#9B9890]">Your vault will be re-encrypted with the new credentials.</p>
      </div>

      <Card>
        <CardHeader title="Update Credentials" action={<span className="font-mono text-[9.5px] font-semibold px-2 py-1 rounded-full bg-green-50 text-green-600 border border-green-100">AES-256 Protected</span>} />
        <CardBody>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            <div className="relative">
              <Input label="Current Password" type={showCur ? 'text' : 'password'} placeholder="Your current password" error={errors.current_password?.message} {...register('current_password')} className="pr-10" />
              <button type="button" onClick={() => setShowCur(!showCur)} className="absolute right-3 top-[30px] text-[#9B9890] hover:text-[#0E0D0A]">{showCur ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}</button>
            </div>

            <div className="h-px bg-[#ECEAE4]" />

            <div className="relative">
              <Input label="New Password" type={showNew ? 'text' : 'password'} placeholder="Min 8 chars, uppercase + number" error={errors.new_password?.message} {...register('new_password')} className="pr-10" />
              <button type="button" onClick={() => setShowNew(!showNew)} className="absolute right-3 top-[30px] text-[#9B9890] hover:text-[#0E0D0A]">{showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}</button>
            </div>

            {newPw && (
              <div>
                <div className="flex gap-1 mb-1">
                  {[0,1,2,3].map(i => <div key={i} className={`h-1 flex-1 rounded-full transition-all ${i < strength ? strengthColor : 'bg-[#ECEAE4]'}`} />)}
                </div>
                <p className="text-[10.5px] font-mono text-[#9B9890]">{strengthLabel}</p>
                <div className="mt-2 space-y-1">
                  {[['At least 8 characters', newPw.length >= 8],['Uppercase letter', /[A-Z]/.test(newPw)],['Number', /[0-9]/.test(newPw)],['Special character', /[^A-Za-z0-9]/.test(newPw)]].map(([label, ok]) => (
                    <div key={String(label)} className={`flex items-center gap-2 text-xs ${ok ? 'text-green-600' : 'text-[#9B9890]'}`}>
                      <div className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center ${ok ? 'bg-green-600 border-green-600' : 'border-[#DDD9D0]'}`}>
                        {ok && <svg className="w-2 h-2 text-white" viewBox="0 0 10 10" fill="none"><path d="M2 5l2 2 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>}
                      </div>
                      {String(label)}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <Input label="Confirm New Password" type="password" placeholder="Repeat new password" error={errors.confirm_password?.message} {...register('confirm_password')} />

            <div className="flex items-start gap-2.5 p-3 bg-[#EBF0FF] border border-[#1A3DAF]/12 rounded-[9px]">
              <Lock className="w-4 h-4 text-[#1A3DAF] flex-shrink-0 mt-0.5" />
              <p className="text-[11.5px] font-light text-[#1A3DAF]">After updating, all other active sessions will be automatically signed out for security.</p>
            </div>

            <Button type="submit" loading={loading} className="w-full justify-center py-3">Update Password 🔒</Button>
          </form>
        </CardBody>
      </Card>
    </div>
  )
}
