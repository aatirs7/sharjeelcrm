import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'

export function MetricCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string
  value: React.ReactNode
  sub?: React.ReactNode
  accent?: 'default' | 'admin'
}) {
  return (
    <Card className={cn(accent === 'admin' && 'border-amber-300/60 dark:border-amber-800/60')}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
          {label}
          {accent === 'admin' && (
            <span className="text-[10px] uppercase tracking-wide text-amber-600 dark:text-amber-400">
              admin
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-semibold tabular-nums">{value}</div>
        {sub != null && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
      </CardContent>
    </Card>
  )
}
