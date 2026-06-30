import { cn } from '@/lib/utils'
const variants = {
  blue:   'bg-[#EBF0FF] text-[#1A3DAF] border-blue-100',
  green:  'bg-[#F0FDF4] text-[#16A34A] border-green-100',
  red:    'bg-[#FEF2F2] text-[#DC2626] border-red-100',
  amber:  'bg-[#FFFBEB] text-[#D97706] border-yellow-100',
  purple: 'bg-[#FDF4FF] text-[#9333EA] border-purple-100',
  gray:   'bg-[#F7F5F0] text-[#9B9890] border-[#DDD9D0]',
}
type Variant = keyof typeof variants
export default function Badge({ variant = 'gray', children, className }: {
  variant?: Variant; children: React.ReactNode; className?: string
}) {
  return (
    <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full border font-mono text-[9.5px] font-semibold', variants[variant], className)}>
      {children}
    </span>
  )
}
