import { getSettings } from '@/lib/settings'
import { checkSquareConnection, squareConfigured } from '@/lib/square'
import { getBotProfile } from '@/lib/discord'
import { formatCents, FLAT_COMMISSION_CENTS } from '@/lib/money'
import { Card, CardContent } from '@/components/ui/card'
import { PageHeader, SectionLabel } from '@/components/page-header'
import { RewardsForm, RepeatForm, BotAvatarForm, CryptoWalletsForm, CardLinksForm } from '@/components/settings/settings-forms'

export const dynamic = 'force-dynamic'

export default async function SettingsPage() {
  const [s, bot, square] = await Promise.all([
    getSettings(),
    getBotProfile(),
    squareConfigured() ? checkSquareConnection() : Promise.resolve(null),
  ])

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
        <SectionLabel>payments</SectionLabel>
        <Card>
          <CardContent className="space-y-4 py-5 text-sm">
            <p className="text-muted-foreground">
              Once a buyer picks a product in their Discord ticket, the bot asks whether they want to pay by
              card or crypto.
            </p>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="font-medium">Card (Square)</div>
                <div className="text-muted-foreground">
                  {square?.ok
                    ? `Connected to ${square.locationName}. Each buyer gets their own Square checkout for the exact price, and the ticket marks itself paid and the sale is recorded here as soon as they pay.`
                    : square
                      ? `Square is set up but not responding: ${square.error}`
                      : 'Square is not connected, so the bot uses the backup links below.'}
                </div>
              </div>
              <span
                className={`rounded-full px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.18em] ${
                  square?.ok
                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                    : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                }`}
              >
                {square?.ok ? 'connected' : 'not connected'}
              </span>
            </div>
            <div className="space-y-3 border-t border-border/60 pt-4">
              <div>
                <div className="font-medium">Backup card links</div>
                <div className="text-muted-foreground">
                  Only used if Square checkout is unavailable: the bot posts the link saved for the exact amount
                  owed. Payments through these links are matched to their ticket automatically when it is clear
                  which ticket they belong to.
                </div>
              </div>
              <CardLinksForm links={s.cardPaymentLinks} />
            </div>
            <div className="space-y-3 border-t border-border/60 pt-4">
              <div>
                <div className="font-medium">Crypto wallets</div>
                <div className="text-muted-foreground">
                  When a buyer chooses crypto, the bot posts these wallets in the ticket. Leave the list
                  empty and the buyer is asked to wait for your reply instead.
                </div>
              </div>
              <CryptoWalletsForm wallets={s.cryptoAddresses} />
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
