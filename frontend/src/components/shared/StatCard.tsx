import { cn } from '@/lib/utils'

interface StatCardProps {
  label: string
  value: string | number
  icon: React.ReactNode
  trend?: string
  trendUp?: boolean
  accent?: 'blue' | 'green' | 'amber' | 'red' | 'purple'
  hint?: string
  onClick?: () => void
}

const iconTone = {
  blue:   'text-[#1A3DAF]',
  green:  'text-[#15803D]',
  amber:  'text-[#B45309]',
  red:    'text-[#B91C1C]',
  purple: 'text-[#7E22CE]',
}

export default function StatCard({ label, value, icon, trend, trendUp, accent = 'blue', hint, onClick }: StatCardProps) {
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag
      onClick={onClick}
      className={cn(
        'group flex w-full flex-col rounded-[12px] border border-[#DDD9D0] bg-white p-4 text-left',
        onClick && 'transition-colors hover:border-[#BDB8AC]'
      )}
    >
      <div className="flex items-center justify-between">
        <span className="text-[13px] text-[#5A5750]">{label}</span>
        <span className={cn('[&>svg]:h-4 [&>svg]:w-4', iconTone[accent])}>{icon}</span>
      </div>
      <div className="mt-3 font-display text-[28px] font-semibold leading-none tabular-nums text-[#0E0D0A]">{value}</div>
      {(trend || hint) && (
        <div className="mt-2 text-[12.5px]">
          {trend && <span className={trendUp ? 'text-[#15803D]' : 'text-[#B91C1C]'}>{trend}</span>}
          {hint && <span className="text-[#8A877F]">{trend ? ' · ' : ''}{hint}</span>}
        </div>
      )}
    </Tag>
  )
}
