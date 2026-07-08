import Link from 'next/link'
import { cn } from '@/lib/utils'

const OPTIONS = [
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
] as const

export function PeriodToggle({ period }: { period: 'week' | 'month' }) {
  return (
    <div className="inline-flex rounded-lg border p-0.5">
      {OPTIONS.map((o) => (
        <Link
          key={o.value}
          href={`/?period=${o.value}`}
          className={cn(
            'px-3 py-1 text-sm rounded-md transition-colors',
            period === o.value
              ? 'bg-muted font-medium text-foreground'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          {o.label}
        </Link>
      ))}
    </div>
  )
}
