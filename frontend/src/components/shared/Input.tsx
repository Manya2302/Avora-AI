import { cn } from '@/lib/utils'
import { InputHTMLAttributes, forwardRef } from 'react'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  hint?: string
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, hint, className, ...props }, ref) => (
    <div className="flex flex-col gap-1.5">
      {label && <label className="text-xs font-semibold text-[#0E0D0A] tracking-[0.2px]">{label}</label>}
      <input
        ref={ref}
        className={cn(
          'w-full px-3 py-2.5 bg-[#F7F5F0] border border-[#DDD9D0] rounded-[7px] font-light text-sm text-[#0E0D0A] outline-none transition-all placeholder:text-[#9B9890]',
          'focus:border-[#1A3DAF] focus:bg-white focus:ring-2 focus:ring-[#1A3DAF]/8',
          error && 'border-red-400 focus:border-red-400 focus:ring-red-100',
          className
        )}
        {...props}
      />
      {error && <span className="text-xs text-[#DC2626]">{error}</span>}
      {hint && !error && <span className="text-xs text-[#9B9890]">{hint}</span>}
    </div>
  )
)
Input.displayName = 'Input'
export default Input
