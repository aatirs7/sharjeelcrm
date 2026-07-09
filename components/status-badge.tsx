import { cn } from '@/lib/utils'
import {
  titleCase,
  LEAD_STATUS_CLASSES,
  ORDER_STATUS_CLASSES,
  RISK_STATUS_CLASSES,
  WARRANTY_STATE_CLASSES,
  TICKET_TYPE_CLASSES,
} from '@/lib/labels'

function Pill({ value, classes }: { value: string; classes: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap',
        classes
      )}
    >
      {titleCase(value)}
    </span>
  )
}

export function LeadStatusBadge({ status }: { status: string }) {
  return <Pill value={status} classes={LEAD_STATUS_CLASSES[status] ?? 'bg-muted text-foreground'} />
}

export function OrderStatusBadge({ status }: { status: string }) {
  return <Pill value={status} classes={ORDER_STATUS_CLASSES[status] ?? 'bg-muted text-foreground'} />
}

export function RiskStatusBadge({ status }: { status: string }) {
  return <Pill value={status} classes={RISK_STATUS_CLASSES[status] ?? 'bg-muted text-foreground'} />
}

export function WarrantyBadge({ state }: { state: string }) {
  return <Pill value={state} classes={WARRANTY_STATE_CLASSES[state] ?? 'bg-muted text-foreground'} />
}

export function TicketTypeBadge({ type }: { type: string }) {
  return <Pill value={type} classes={TICKET_TYPE_CLASSES[type] ?? 'bg-muted text-muted-foreground'} />
}
