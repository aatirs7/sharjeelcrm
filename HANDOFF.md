# The Desk — TikTok Shop CRM · Handoff

_Last updated: 2026-08-12_

Internal CRM for a Discord-based TikTok Shop account sales operation. Tracks every
buyer from ticket-opened → order → delivered → warranty, plus revenue, affiliates,
tasks, customers, and issues. Money is reconciled against **live Stripe**.

- **Live:** https://sharjeelcrm.vercel.app (gated by a 5-digit PIN)
- **Repo:** `aatirs7/sharjeelcrm` (branch `main`)
- **PIN:** `11005`

---

## 1. Stack

| Layer | Choice | Notes |
|---|---|---|
| Framework | **Next.js 16.2.10** (App Router, Turbopack) | Middleware is renamed **`proxy.ts`**. `params`/`searchParams` are Promises. Bundled docs in `node_modules/next/dist/docs/`. |
| UI | React 19.2.4, TypeScript, **Tailwind v4** | `@theme inline` in `globals.css`. |
| Components | shadcn/ui on **`@base-ui/react`** (NOT Radix) | Use `render={<Button/>}` not `asChild`; `Select.onValueChange` yields `string \| null`. |
| DB | **Neon Postgres** + **Drizzle ORM** | `drizzle-orm/neon-http`. Migrations `0000`–`0004` in `/drizzle`. |
| Auth | **Shared 5-digit PIN** (`proxy.ts`) | No Clerk. See §5. |
| Money truth | **Stripe REST API** (no SDK) | `lib/stripe.ts`, read-only. |
| Discord | REST API (no SDK) | Hourly Vercel Cron poll + serverless button interactions. |
| Hosting | **Vercel Pro** + Vercel Cron | Deploy: `npx vercel --prod --yes`. |
| Fonts / theme | Bricolage Grotesque / Instrument Sans / JetBrains Mono, next-themes (dark default) | |

---

## 2. What the site does (by page)

- **`/` Dashboard** — revenue/AOV/refunds/awaiting-delivery + admin split cards
  (55/10/35). Money comes from Stripe when connected. Week/month toggle. Task inbox.
- **`/tickets`** — every Discord ticket as a row (renamed from "leads"). Type tabs
  (purchase / support / question), status + rep + referral-code filters, created time,
  **Email** column, quick-add. Row → `/tickets/[id]` detail with status flow + convert-to-order.
- **`/orders`, `/orders/[id]`** — order table + financial card (admin only) showing the
  full split, payment fields, mark-delivered, warranty dates, linked issues.
- **`/revenue`** — the money page. All figures derive from Stripe: revenue, the
  55/10/35 split, affiliate commissions, payment-method breakdown, and a **live Stripe
  section** (withdrawn / available / incoming / 30d volume, recent charges matched to
  tickets by email, recent payouts).
- **`/customers`, `/issues`, `/affiliates`, `/tasks`** — rollups, warranty state,
  replacement tracking, commission-owed, task inbox.

---

## 3. Money logic — **single source of truth: `lib/money.ts`**

Revenue splits **three ways**, and the three always sum to the exact price:

```
supplierPayoutCents = round(price * 0.55)   // supplier
serviceFeeCents     = round(price * 0.10)   // service / infrastructure
profitCents         = price - supplier - service   // 0.35, taken as remainder (no drift)
commissionCents     = affiliate ? round(price * rate) : 0
netProfitCents      = profit - commission
```

- Percentages live **only** in `lib/money.ts` (`SUPPLIER_SHARE` / `SERVICE_SHARE` /
  `PROFIT_SHARE` and the `*_PCT` label constants). Change them there and every label +
  computation updates. `splitRevenue()` applies the same split to an aggregate (Stripe gross).
- Stored per-order in the `orders` table (incl. new `service_fee_cents`, migration `0004`).
- **⚠️ Open business question (`TODO(sharjeel)` in the file):** commission is currently
  taken **out of the 35% profit**, off the **gross** price. Confirm with Sharjeel whether
  commission should instead come off gross *before* the split. Also confirm the default
  affiliate `commissionRate` (currently `0.10`).

> History: the split was **85/15** (straight from the original spec) until 2026-08-12,
> when it was changed to **55/10/35** at the user's request.

---

## 4. Stripe (`lib/stripe.ts`) — money truth

- Needs a **secret** (`sk_…`) or **restricted read** (`rk_…`) key in `STRIPE_SECRET_KEY`
  (or `STRIPE_TOKEN`). A publishable `pk_…` key is ignored — it can't read account data.
- Paginates all charges + payouts (10 pages / 1000 max each). Everything is derived:
  gross, month, week, 30d volume, refunds, and payout metrics:
  - **Already withdrawn** = payouts with status `paid` (landed in bank)
  - **Available to withdraw** = `balance.available`
  - **Incoming** = `balance.pending`
  - in-transit payouts (`pending`/`in_transit`) shown as a subtitle
- Charges are matched to tickets by **billing email** (Stripe) ↔ `leads.email` (CRM).
  Buyers rarely paste their email in Discord, so most matches require a rep to fill the
  email on the ticket manually. Two known unlinked charges exist.

---

## 5. Auth — shared PIN gate

- `proxy.ts` redirects everything except `/login` and `/api/*` to the PIN screen.
- `/api/*` is intentionally exempt — those routes authenticate themselves
  (`CRON_SECRET`, Discord Ed25519 signature, `DISCORD_WEBHOOK_SECRET`) and are called by
  machines that can't type a PIN.
- Cookie (`crm_session`, httpOnly, 30-day) stores an **HMAC of the PIN**, never the PIN.
- PIN = `APP_PIN` (default `11005`); `APP_PIN_SECRET` salts the HMAC — change it to force
  re-login. Files: `lib/pin.ts`, `lib/actions/auth.ts`, `components/pin-form.tsx`,
  `app/login/page.tsx`. Lock button (sign-out) is in the nav.
- **⚠️ Limitation:** 5 digits, **no rate-limiting**. Stops casual access; would not stop a
  determined brute-forcer. Since the app exposes live Stripe balances + customer PII,
  consider adding lockout-after-N-failures if this is more than an internal tool.

---

## 6. Discord integration

- **Hourly poll** — `app/api/discord/poll/route.ts` (Vercel Cron `0 * * * *`). Finds
  ticket channels newer than a watermark (max ingested channel id), identifies the buyer
  (the non–Ticket-Tool member overwrite), extracts first message → interest, referral
  code, email, and ticket type; upserts a ticket via `lib/leads-ingest.ts`; posts staff
  tag buttons.
- **Button interactions** — `app/api/discord/interactions/route.ts`. Ed25519-verifies the
  signature, then tags the ticket (purchase/support/question) via `lib/ticket-tag.ts`.
- Tag buttons post to the **staff channel** (`STAFF_CHANNEL_ID`), never inside customer
  ticket channels.
- Classification is keyword-based (`lib/discord.ts` `classifyTicket`) — all 371 existing
  tickets came from one generic Ticket Tool panel, so type can only come from buyer text.
- `discord-bot/` holds standalone scripts: `audit.mjs`, `backfill.mjs` (`--write`), and an
  unused always-on `bot.mjs`. The serverless poll replaced the need for a 24/7 bot.

---

## 7. Environment variables

| Var | Where | Purpose |
|---|---|---|
| `DATABASE_URL` | Neon (pooled, `?sslmode=require`) | Postgres |
| `APP_PIN` | self | 5-digit gate PIN (default `11005`) |
| `APP_PIN_SECRET` | self (`openssl rand -hex 32`) | HMAC salt for the session cookie |
| `CRON_SECRET` | self | Bearer for Vercel Cron routes |
| `STRIPE_SECRET_KEY` | Stripe (`sk_`/`rk_`) | live money |
| `BOT_TOKEN` | Discord bot | REST calls (poll) |
| `GUILD_ID` | Discord | server id |
| `STAFF_CHANNEL_ID` | Discord | where tag buttons post |
| `DISCORD_PUBLIC_KEY` | Discord | verify interaction signatures (must be 64 chars — beware CRLF) |
| `BOT_APP_ID` | Discord | app id |
| `DISCORD_WEBHOOK_SECRET` | self | shared secret for lead/ticket-tag endpoints |

Set locally in `.env.local` (gitignored). `.env.example` documents each. On Vercel they're
set for production/preview/development. **Secrets go in env files only — never in chat.**

---

## 8. Commands

```bash
npm run dev            # local dev
npm run build          # production build (run before deploy)
npm run db:generate    # create a migration from schema.ts
npm run db:migrate     # apply migrations to Neon
npm run db:seed        # seed demo data
npx vercel --prod --yes   # deploy
```

Gotchas: after deleting/renaming a route, `rm -rf .next` before rebuilding (stale route
types). Turbopack **dev** can mis-order CSS variants — verify responsive layout against a
**production** build.

---

## 9. Open items

1. **Confirm the money model with Sharjeel** — the 55/10/35 split and whether affiliate
   commission comes off profit (current) or gross; default commission rate `0.10`.
   (`TODO(sharjeel)` in `lib/money.ts`.)
2. **PIN hardening** — add failed-attempt lockout if this becomes more than internal use.
3. **Email matching** — reps must enter buyer emails on tickets for Stripe charges to link;
   two known charges (Aiden Rubalcava / Mark McCabe) are currently unlinked.
4. Real delivery-proof file upload (currently a URL field).
