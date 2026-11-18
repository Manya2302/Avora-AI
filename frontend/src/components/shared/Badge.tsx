import { cn } from '@/lib/utils'

const variants = {
  blue:   'bg-[#EEF2FC] text-[#1A3DAF]',
  green:  'bg-[#EDF7F0] text-[#15803D]',
  red:    'bg-[#FCEFEF] text-[#B91C1C]',
  amber:  'bg-[#FBF3E4] text-[#A35A04]',
  purple: 'bg-[#F5EEFB] text-[#7E22CE]',
  gray:   'bg-[#F1EFEA] text-[#5A5750]',
}
type Variant = keyof typeof variants

export default function Badge({ variant = 'gray', children, className }: {
  variant?: Variant; children: React.ReactNode; className?: string
}) {
  return (
    <span className={cn(
      'inline-flex items-center gap-1 whitespace-nowrap rounded-[5px] px-1.5 py-0.5 text-[11px] font-medium leading-none',
      variants[variant], className
    )}>
      {children}
    </span>
  )
}
