import { NextResponse } from 'next/server'
import crypto from 'node:crypto'
import { applyTicketTag, type TicketTag } from '@/lib/ticket-tag'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// Discord interaction + response type constants.
const PING = 1
const MESSAGE_COMPONENT = 3
const PONG = 1
const UPDATE_MESSAGE = 7
const EPHEMERAL = 64
const MANAGE_CHANNELS = BigInt(16) // 1 << 4

const SPKI_ED25519_PREFIX = Buffer.from('302a300506032b6570032100', 'hex')

/** Verify Discord's Ed25519 request signature (no external deps). */
function verify(publicKeyHex: string, signatureHex: string, timestamp: string, body: string): boolean {
  try {
    const key = crypto.createPublicKey({
      key: Buffer.concat([SPKI_ED25519_PREFIX, Buffer.from(publicKeyHex, 'hex')]),
      format: 'der',
      type: 'spki',
    })
    return crypto.verify(
      null,
      Buffer.from(timestamp + body),
      key,
      Buffer.from(signatureHex, 'hex')
    )
  } catch {
    return false
  }
}

const TAG_LABEL: Record<TicketTag, string> = {
  purchase: '🛒 Purchase',
  support: '🛟 Support',
  warranty: '🛡️ Warranty',
}

export async function POST(req: Request): Promise<NextResponse> {
  const publicKey = process.env.DISCORD_PUBLIC_KEY
  const signature = req.headers.get('x-signature-ed25519')
  const timestamp = req.headers.get('x-signature-timestamp')
  const raw = await req.text()

  if (!publicKey || !signature || !timestamp || !verify(publicKey, signature, timestamp, raw)) {
    return new NextResponse('invalid request signature', { status: 401 })
  }

  const interaction = JSON.parse(raw)

  if (interaction.type === PING) {
    return NextResponse.json({ type: PONG })
  }

  if (interaction.type === MESSAGE_COMPONENT) {
    const customId: string = interaction.data?.custom_id ?? ''
    if (!customId.startsWith('tag:')) {
      return NextResponse.json({ type: PONG })
    }
    // custom_id is "tag:<tag>:<ticketChannelId>" (panel lives in a staff channel,
    // so the ticket id is carried explicitly rather than inferred).
    const [, tagPart, ticketId] = customId.split(':')
    const tag = tagPart as TicketTag

    // Staff only — needs Manage Channels.
    const perms = BigInt(interaction.member?.permissions ?? '0')
    if ((perms & MANAGE_CHANNELS) !== MANAGE_CHANNELS) {
      return NextResponse.json({
        type: 4,
        data: { content: 'Staff only.', flags: EPHEMERAL },
      })
    }

    const channelId: string = ticketId || interaction.channel_id || interaction.channel?.id
    const who = interaction.member?.user?.username ?? 'staff'
    const result = await applyTicketTag(channelId, tag)

    return NextResponse.json({
      type: UPDATE_MESSAGE,
      data: {
        embeds: [
          {
            title: 'The Desk — classify this ticket',
            description: `Tagged **${TAG_LABEL[tag]}** by ${who}${result.ok ? '' : ' — no lead found for this ticket'}`,
            color: tag === 'purchase' ? 0x22c55e : 0xf59e0b,
          },
        ],
        components: [], // remove buttons once tagged
      },
    })
  }

  return NextResponse.json({ type: PONG })
}
