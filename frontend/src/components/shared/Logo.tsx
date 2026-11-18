import { cn } from '@/lib/utils'

/**
 * Avora wordmark. The mark is a simple folded-corner page with a keyhole —
 * a document that's locked — drawn by hand rather than pulled from an icon set.
 */
export function LogoMark({ className, inverted }: { className?: string; inverted?: boolean }) {
  const fg = inverted ? '#0E0D0A' : '#F7F5F0'
  const bg = inverted ? '#F7F5F0' : '#0E0D0A'
  return (
    <svg viewBox="0 0 28 28" className={cn('h-7 w-7', className)} aria-hidden="true">
      <rect width="28" height="28" rx="7" fill={bg} />
      <path d="M9 6.5h7.2L20 10.3V21.5H9z" fill="none" stroke={fg} strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M16 6.5v4h4" fill="none" stroke={fg} strokeWidth="1.6" strokeLinejoin="round" />
      <circle cx="14.5" cy="14.6" r="1.7" fill={fg} />
      <path d="M14.5 15.8v2.6" stroke={fg} strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

export default function Logo({ className, inverted, size = 'md' }: { className?: string; inverted?: boolean; size?: 'sm' | 'md' }) {
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <LogoMark inverted={inverted} className={size === 'sm' ? 'h-6 w-6' : 'h-7 w-7'} />
      <span className={cn(
        'font-display font-semibold tracking-[-0.01em]',
        size === 'sm' ? 'text-[16px]' : 'text-[18px]',
        inverted ? 'text-[#F7F5F0]' : 'text-[#0E0D0A]'
      )}>
        Avora
      </span>
    </span>
  )
}
