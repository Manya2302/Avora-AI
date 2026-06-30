import { cn } from '@/lib/utils'
import { ButtonHTMLAttributes, forwardRef } from 'react'
import { Loader2 } from 'lucide-react'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'dark' | 'ghost' | 'accent' | 'red' | 'green'
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
}

const variants = {
  dark:   'bg-[#0E0D0A] text-[#F7F5F0] border-[#0E0D0A] hover:bg-[#252318]',
  ghost:  'bg-transparent text-[#5A5750] border-[#DDD9D0] hover:bg-white hover:text-[#0E0D0A]',
  accent: 'bg-[#1A3DAF] text-white border-[#1A3DAF] hover:bg-[#14308A]',
  red:    'bg-[#FEF2F2] text-[#DC2626] border-red-200 hover:bg-red-100',
  green:  'bg-[#F0FDF4] text-[#16A34A] border-green-200 hover:bg-green-100',
}
const sizes = {
  sm: 'px-3 py-1.5 text-xs',
  md: 'px-4 py-2 text-sm',
  lg: 'px-6 py-3 text-sm',
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'dark', size = 'md', loading, disabled, children, className, ...props }, ref) => (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center justify-center gap-2 font-medium border rounded-[7px] transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed',
        variants[variant], sizes[size], className
      )}
      {...props}
    >
      {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
      {children}
    </button>
  )
)
Button.displayName = 'Button'
export default Button
