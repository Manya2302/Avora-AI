import { cn } from '@/lib/utils'
interface StatCardProps {
  label: string; value: string | number; icon: React.ReactNode
  trend?: string; trendUp?: boolean; accent?: 'blue'|'green'|'amber'|'red'|'purple'
  onClick?: () => void
}
const accents = {
  blue:   { bar: 'bg-[#1A3DAF]', icon: 'bg-[#EBF0FF]', iconColor: 'text-[#1A3DAF]' },
  green:  { bar: 'bg-[#16A34A]', icon: 'bg-[#F0FDF4]', iconColor: 'text-[#16A34A]' },
  amber:  { bar: 'bg-[#D97706]', icon: 'bg-[#FFFBEB]', iconColor: 'text-[#D97706]' },
  red:    { bar: 'bg-[#DC2626]', icon: 'bg-[#FEF2F2]', iconColor: 'text-[#DC2626]' },
  purple: { bar: 'bg-[#9333EA]', icon: 'bg-[#FDF4FF]', iconColor: 'text-[#9333EA]' },
}
export default function StatCard({ label, value, icon, trend, trendUp, accent = 'blue', onClick }: StatCardProps) {
  const a = accents[accent]
  return (
    <div className={cn('relative bg-white border border-[#DDD9D0] rounded-[16px] p-5 overflow-hidden', onClick && 'cursor-pointer hover:shadow-md transition-all hover:-translate-y-0.5')} onClick={onClick}>
      <div className={cn('absolute top-0 left-0 right-0 h-0.5', a.bar)} />
      <div className="flex items-start justify-between mb-3">
        <div className={cn('w-9 h-9 rounded-[9px] flex items-center justify-center', a.icon)}>
          <span className={cn('w-4 h-4', a.iconColor)}>{icon}</span>
        </div>
        {trend && <span className={cn('text-[9.5px] font-mono font-semibold px-2 py-0.5 rounded-full', trendUp ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700')}>{trend}</span>}
      </div>
      <div className="font-display text-2xl font-bold tracking-tight text-[#0E0D0A] leading-none mb-1">{value}</div>
      <div className="text-xs text-[#9B9890] font-light">{label}</div>
    </div>
  )
}
