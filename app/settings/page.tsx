import { getSettings } from '@/lib/settings'
import { getBotProfile } from '@/lib/discord'
import { formatCents, FLAT_COMMISSION_CENTS } from '@/lib/money'
import { Card, CardContent } from '@/components/ui/card'
import { PageHeader, SectionLabel } from '@/components/page-header'
import { RewardsForm, RepeatForm, BotAvatarForm } from '@/components/settings/settings-forms'

export const dynamic = 'force-dynamic'

export default async function SettingsPage() {
  const [s, bot] = await Promise.all([getSettings(), getBotProfile()])

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
        <SectionLabel>discord bot</SectionLabel>
        <Card>
          <CardContent className="space-y-4 py-5 text-sm">
            <div>
              <div className="font-medium">Profile picture</div>
              <div className="text-muted-foreground">
                The picture {bot?.username ?? 'the bot'} shows next to its messages in Discord.
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-6">
              <div className="flex flex-col items-center gap-1.5">
                {bot?.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={bot.avatarUrl} alt="" className="size-16 rounded-full border border-border/60" />
                ) : (
                  <div className="flex size-16 items-center justify-center rounded-full border border-dashed border-border/60 font-mono text-[10px] text-muted-foreground">
                    none
                  </div>
                )}
                <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                  current
                </span>
              </div>
              <span className="text-muted-foreground">→</span>
              <div className="flex flex-col items-center gap-1.5">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/bot-avatar.png" alt="SA logo" className="size-16 rounded-full border border-border/60" />
                <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                  SA logo
                </span>
              </div>
            </div>
            {bot ? (
              <BotAvatarForm botName={bot.username} />
            ) : (
              <p className="text-muted-foreground">
                Bot token not configured, so the picture can&apos;t be changed from here.
              </p>
            )}
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
