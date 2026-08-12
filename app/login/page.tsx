import { PinForm } from '@/components/pin-form'
import { Card, CardContent } from '@/components/ui/card'

export const dynamic = 'force-dynamic'

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>
}) {
  const { next } = await searchParams
  const target = next && next.startsWith('/') && !next.startsWith('//') ? next : '/'

  return (
    <div className="mx-auto flex w-full max-w-sm flex-col items-center gap-6 pt-10 md:pt-20">
      <div className="flex flex-col items-center gap-2 text-center">
        <span className="grid size-9 place-items-center rounded-lg bg-primary text-primary-foreground shadow-sm">
          <span className="size-3 rounded-[3px] bg-primary-foreground" />
        </span>
        <h1 className="font-heading text-2xl font-semibold tracking-tight">The Desk</h1>
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
          enter pin or coach code
        </p>
      </div>

      <Card className="w-full">
        <CardContent className="py-6">
          <PinForm next={target} />
        </CardContent>
      </Card>
    </div>
  )
}
