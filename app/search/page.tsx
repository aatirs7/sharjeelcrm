import Link from 'next/link'
import { or, ilike, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { leads, customers, products, coaches } from '@/lib/db/schema'
import { PageHeader, SectionLabel } from '@/components/page-header'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

export const dynamic = 'force-dynamic'

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  const { q } = await searchParams
  const query = (q ?? '').trim()
  const like = `%${query}%`
  const dealNum = Number(query.replace(/^deal-?/i, ''))

  const [dealRows, customerRows, productRows, coachRows] = query
    ? await Promise.all([
        db
          .select()
          .from(leads)
          .where(
            or(
              ilike(leads.discordUsername, like),
              ilike(leads.discordUserId, like),
              ilike(leads.referralCode, like),
              ilike(leads.promoCodeUsed, like),
              ilike(leads.email, like),
              Number.isFinite(dealNum) ? eq(leads.dealNumber, dealNum) : undefined
            )
          )
          .limit(25),
        db.select().from(customers).where(ilike(customers.discordUsername, like)).limit(15),
        db.select().from(products).where(ilike(products.name, like)).limit(15),
        db
          .select()
          .from(coaches)
          .where(or(ilike(coaches.name, like), ilike(coaches.promoCode, like)))
          .limit(15),
      ])
    : [[], [], [], []]

  return (
    <div className="space-y-6">
      <PageHeader marker="search" title="Search" meta="deals · customers · products · coaches" />

      <form className="flex gap-2" action="/search">
        <Input name="q" defaultValue={query} placeholder="Deal id, discord, code, email, product…" className="max-w-md" />
        <Button type="submit">Search</Button>
      </form>

      {query && (
        <div className="space-y-6">
          <Group title={`Deals (${dealRows.length})`}>
            {dealRows.map((l) => (
              <Row key={l.id} href={`/tickets/${l.id}`} left={`DEAL-${l.dealNumber} · ${l.discordUsername}`} right={l.status} />
            ))}
          </Group>
          <Group title={`Customers (${customerRows.length})`}>
            {customerRows.map((c) => (
              <Row key={c.id} href={`/customers/${c.id}`} left={c.discordUsername} right={`${c.totalOrders} orders`} />
            ))}
          </Group>
          <Group title={`Products (${productRows.length})`}>
            {productRows.map((p) => (
              <Row key={p.id} href="/products" left={p.name} right={p.active ? 'active' : 'inactive'} />
            ))}
          </Group>
          <Group title={`Coaches (${coachRows.length})`}>
            {coachRows.map((c) => (
              <Row key={c.id} href="/coaches" left={c.name} right={c.promoCode ?? '—'} />
            ))}
          </Group>
        </div>
      )}
    </div>
  )
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  const has = Array.isArray(children) ? children.length > 0 : !!children
  return (
    <div className="space-y-2">
      <SectionLabel>{title}</SectionLabel>
      <div className="overflow-hidden rounded-xl border bg-card">
        {has ? children : <p className="px-4 py-4 text-sm text-muted-foreground">No matches.</p>}
      </div>
    </div>
  )
}

function Row({ href, left, right }: { href: string; left: string; right: string }) {
  return (
    <Link href={href} className="flex items-center justify-between gap-3 border-b border-border/50 px-4 py-2.5 text-sm last:border-0 hover:bg-muted/40">
      <span className="font-medium">{left}</span>
      <span className="text-muted-foreground">{right}</span>
    </Link>
  )
}
