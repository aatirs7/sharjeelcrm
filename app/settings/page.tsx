import { getSettings } from '@/lib/settings'
import { formatCents, FLAT_COMMISSION_CENTS } from '@/lib/money'
import { Card, CardContent } from '@/components/ui/card'
import { PageHeader, SectionLabel } from '@/components/page-header'
import { RewardsForm, RepeatForm } from '@/components/settings/settings-forms'

export const dynamic = 'force-dynamic'

export default async function SettingsPage() {
  const s = await getSettings()

  return (
    <div className="space-y-8">
      <PageHeader marker="settings" title="Settings" meta="business rules" />

      <div className="space-y-3">
        <SectionLabel>commission</SectionLabel>
        <Card>
          <CardContent className="space-y-4 py-5 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="font-medium">Flat commission per completed sale</div>
                <div className="text-muted-foreground">Every referred sale pays this to the coach.</div>
              </div>
              <div className="font-mono text-lg">{formatCents(FLAT_COMMISSION_CENTS)}</div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/60 pt-4">
              <div>
                <div className="font-medium">Repeat customers</div>
                <div className="text-muted-foreground">
                  Does the referrer earn again when their customer buys again?
                </div>
              </div>
              <RepeatForm mode={s.repeatCommission} />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-3">
        <SectionLabel>data export</SectionLabel>
        <Card>
          <CardContent className="flex flex-wrap gap-2 py-5 text-sm">
            {['deals', 'customers', 'commissions', 'payouts', 'leaderboard'].map((t) => (
              <a
                key={t}
                href={`/api/export?type=${t}`}
                className="rounded-md border px-3 py-1.5 font-medium capitalize hover:bg-muted"
              >
                {t}.csv
              </a>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="space-y-3">
        <SectionLabel>monthly leaderboard rewards</SectionLabel>
        <Card>
          <CardContent className="py-5">
            <p className="mb-4 text-sm text-muted-foreground">
              Bonuses paid to the top 3 coaches when each month is archived. Set to 0 for none.
            </p>
            <RewardsForm
              first={s.leaderboardRewards.first}
              second={s.leaderboardRewards.second}
              third={s.leaderboardRewards.third}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
