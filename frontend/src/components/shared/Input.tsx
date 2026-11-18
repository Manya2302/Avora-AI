import { cn } from '@/lib/utils'
import { InputHTMLAttributes, forwardRef, useId } from 'react'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  hint?: string
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, hint, className, id, ...props }, ref) => {
    const autoId = useId()
    const inputId = id || autoId
    return (
      <div className="flex flex-col gap-1.5">
        {label && <label htmlFor={inputId} className="text-[13px] font-medium text-[#2B2924]">{label}</label>}
        <input
          ref={ref}
          id={inputId}
          aria-invalid={!!error || undefined}
          className={cn(
            'h-10 w-full rounded-[8px] border border-[#DDD9D0] bg-white px-3 text-[14px] text-[#0E0D0A] outline-none transition-colors placeholder:text-[#A8A49B]',
            'hover:border-[#C9C4B9] focus:border-[#1A3DAF] focus:ring-[3px] focus:ring-[#1A3DAF]/10',
            error && 'border-[#E5A3A3] focus:border-[#DC2626] focus:ring-[#DC2626]/10',
            className
          )}
          {...props}
        />
        {error && <span className="text-[12.5px] text-[#B91C1C]">{error}</span>}
        {hint && !error && <span className="text-[12.5px] text-[#8A877F]">{hint}</span>}
      </div>
    )
  }
)
Input.displayName = 'Input'
export default Input
