import webpush from 'web-push'
import { eq } from 'drizzle-orm'
import { db } from './db'
import { pushSubscriptions } from './db/schema'

const configured = Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY)

if (configured) {
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || 'mailto:admin@example.com',
    process.env.VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!,
  )
}

interface PushPayload {
  title: string
  body: string
  url?: string
}

/**
 * Best-effort push to every device the owner installed and enabled. Never
 * throws: a subscription that Web Push reports as gone (404/410) is pruned
 * rather than retried. No-ops until the VAPID keys are set, so it is safe to
 * call from anywhere, including before push is configured.
 */
export async function sendPush(payload: PushPayload): Promise<void> {
  if (!configured) return
  try {
    const subs = await db.select().from(pushSubscriptions)
    if (subs.length === 0) return
    const body = JSON.stringify({ url: '/', ...payload })
    await Promise.all(
      subs.map(async (sub) => {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            body,
          )
        } catch (err) {
          const code = (err as { statusCode?: number })?.statusCode
          if (code === 404 || code === 410) {
            await db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, sub.endpoint))
          }
        }
      }),
    )
  } catch {
    /* push is a nicety; never let it break the caller */
  }
}
