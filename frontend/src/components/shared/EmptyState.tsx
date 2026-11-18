import { cn } from '@/lib/utils'

export default function EmptyState({ icon, title, children, action, className }: {
  icon?: React.ReactNode
  title: string
  children?: React.ReactNode
  action?: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex flex-col items-center px-6 py-12 text-center', className)}>
      {icon && (
        <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-[#F1EFEA] text-[#8A877F] [&>svg]:h-[18px] [&>svg]:w-[18px]">
          {icon}
        </div>
      )}
      <p className="text-[14px] font-medium text-[#0E0D0A]">{title}</p>
      {children && <p className="mt-1 max-w-sm text-[13px] text-[#8A877F]">{children}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}
