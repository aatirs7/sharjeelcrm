# The Desk — Discord bot (Phase 2)

Connects Sharjeel's Discord server to the CRM. Phase-2 goal: when a support
ticket opens, create a lead in the CRM automatically (later: post the payment
link into the ticket, and reflect CRM status back into the channel).

The CRM side is already live: `POST /api/discord/lead` (bearer
`DISCORD_WEBHOOK_SECRET`) creates a lead. This folder is the bot that calls it.

---

## You do NOT need admin on the server

- **Bot token** ("api key") comes from a Discord *application*, not the server.
- **Inviting** the bot needs a server admin — but that's one click on a link.

**Recommended split (you keep the token):**
1. *You* create the application + bot (below) and copy the token.
2. *You* send the server admin the invite link.
3. *Admin* clicks it and gives the bot access to ticket channels (a staff role,
   or Administrator — Ticket Tool channels are private, so the bot needs this).

Never paste the token into chat or commit it. It lives in `.env.local`
(local) and the host's secrets (production).

---

## 1. Create the bot (Developer Portal, ~2 min)

1. https://discord.com/developers/applications → **New Application**.
2. **Bot** tab → **Reset Token** → copy it → put in repo-root `.env.local`:
   ```
   DISCORD_BOT_TOKEN=your-token-here
   ```
3. Copy the **Application ID** (General Information tab).
4. Under **Bot → Privileged Gateway Intents**: enable **Server Members Intent**.
   (Message Content is only needed if we end up reading ticket messages — the
   audit avoids that by reading channel permission overwrites instead.)

## 2. Invite the bot (server admin clicks this)

Replace `APPLICATION_ID`. `permissions=8` = Administrator (simplest so it can
see private ticket channels; can be scoped down later):

```
https://discord.com/oauth2/authorize?client_id=APPLICATION_ID&scope=bot%20applications.commands&permissions=8
```

## 3. Run the read-only audit

Find the server (guild) id, then dump the structure. Nothing is modified.

```
# lists the servers the bot is in (grab the guild id):
node --env-file=.env.local discord-bot/audit.mjs

# then set it and re-run for the full audit:
#   add DISCORD_GUILD_ID=... to .env.local
node --env-file=.env.local discord-bot/audit.mjs
```

The audit prints the channel tree, roles, the likely ticket category, and a
sample ticket channel's **member permission overwrites** — that's how we
identify the buyer who opened a ticket without reading any messages.

## 4. (Next) build + host the bot

Once the audit tells us how tickets are structured, the bot itself is a small
`discord.js` process that listens for ticket-channel creation and POSTs to
`/api/discord/lead`. It must run 24/7 → deploy to **Railway** (or Fly.io):
a Node worker, `DISCORD_BOT_TOKEN` + `CRM_URL` + `DISCORD_WEBHOOK_SECRET` as
secrets. (Vercel's serverless can't hold a gateway connection.)
