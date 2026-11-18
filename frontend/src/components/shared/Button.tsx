import { cn } from '@/lib/utils'
import { ButtonHTMLAttributes, forwardRef } from 'react'
import { Loader2 } from 'lucide-react'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'dark' | 'ghost' | 'accent' | 'red' | 'green' | 'plain'
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
}

const variants = {
  dark:   'bg-[#0E0D0A] text-[#F7F5F0] border-[#0E0D0A] hover:bg-[#2B2924] active:bg-black',
  accent: 'bg-[#1A3DAF] text-white border-[#1A3DAF] hover:bg-[#14308A]',
  ghost:  'bg-white text-[#2B2924] border-[#DDD9D0] hover:border-[#BDB8AC] hover:bg-[#FBFAF7]',
  plain:  'bg-transparent text-[#5A5750] border-transparent hover:bg-[#ECEAE4]/70 hover:text-[#0E0D0A]',
  red:    'bg-white text-[#B91C1C] border-[#F1C6C6] hover:bg-[#FEF2F2]',
  green:  'bg-white text-[#15803D] border-[#BFE3CB] hover:bg-[#F0FDF4]',
}
const sizes = {
  sm: 'h-8 px-3 text-[13px] gap-1.5',
  md: 'h-9 px-4 text-[14px] gap-2',
  lg: 'h-11 px-5 text-[15px] gap-2',
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'dark', size = 'md', loading, disabled, children, className, ...props }, ref) => (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        'inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-[8px] border font-medium',
        'transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-55',
        variants[variant], sizes[size], className
      )}
      {...props}
    >
      {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
      {children}
    </button>
  )
)
Button.displayName = 'Button'
export default Button
