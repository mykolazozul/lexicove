// Streak reminders and the word of the day over Web Push.
//
// "public_key" is public: the app needs the VAPID public key to subscribe. On the first call the
// key pair is created here and stored in Vault, so the private key never leaves the server.
// "remind" runs every hour from pg_cron and must carry the cron token that lives in Vault. Each
// run sends the streak reminders due at 19:00 and the words of the day due at 09:00, local time.

import { createClient } from 'npm:@supabase/supabase-js@2'
import { createVapidKeys, sendPush, type Vapid } from './webpush.ts'

const ALLOWED_ORIGINS = ['https://lexicove.vercel.app', 'http://localhost:5173']
const SUBJECT = 'https://lexicove.vercel.app'
const MAX_BODY_BYTES = 4 * 1024

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false },
})

type Config = { public_key: string | null; private_jwk: string | null; cron_token: string | null }
type Subscription = { id: string; endpoint: string; p256dh: string; auth: string; locale: 'uk' | 'en' }
type StreakTarget = Subscription & { streak: number }
type WordTarget = Subscription & { word: string; translation: string }
type Message = { title: string; body: string; url: string; tag: string }

class HttpError extends Error {
  constructor(public status: number, public code: string) {
    super(code)
  }
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin') ?? ''
  const headers = {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
    Vary: 'Origin',
  }
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers })

  try {
    if (req.method !== 'POST') throw new HttpError(405, 'method_not_allowed')
    const text = await req.text()
    if (text.length > MAX_BODY_BYTES) throw new HttpError(413, 'too_large')
    const body = JSON.parse(text || '{}') as { action?: unknown }

    if (body.action === 'public_key') {
      const config = await ensureKeys()
      return new Response(JSON.stringify({ public_key: config.public_key }), { status: 200, headers })
    }
    if (body.action === 'remind') {
      const config = await ensureKeys()
      if (!config.cron_token || !sameSecret(req.headers.get('x-cron-token') ?? '', config.cron_token)) {
        throw new HttpError(401, 'unauthorized')
      }
      return new Response(JSON.stringify(await remind(config)), { status: 200, headers })
    }
    throw new HttpError(400, 'unknown_action')
  } catch (error) {
    if (!(error instanceof HttpError)) console.error(error)
    const status = error instanceof HttpError ? error.status : 500
    return new Response(JSON.stringify({ error: error instanceof HttpError ? error.code : 'internal_error' }), { status, headers })
  }
})

async function readConfig(): Promise<Config> {
  const { data, error } = await admin.rpc('push_config')
  if (error) throw error
  return data as Config
}

async function ensureKeys(): Promise<Config> {
  const config = await readConfig()
  if (config.public_key && config.private_jwk) return config
  const keys = await createVapidKeys()
  const { error } = await admin.rpc('push_save_vapid', { p_public: keys.publicKey, p_private_jwk: JSON.stringify(keys.privateJwk) })
  if (error) throw error
  // Another run may have saved its pair first; whichever is stored is the one to use.
  return readConfig()
}

/** Compares secrets in constant time. */
function sameSecret(given: string, expected: string): boolean {
  const a = new TextEncoder().encode(given)
  const b = new TextEncoder().encode(expected)
  let diff = a.length ^ b.length
  for (let i = 0; i < b.length; i++) diff |= (a[i] ?? 0) ^ b[i]!
  return diff === 0
}

function daysUk(n: number): string {
  const last = n % 10
  const lastTwo = n % 100
  if (last === 1 && lastTwo !== 11) return `${n} день`
  if (last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14)) return `${n} дні`
  return `${n} днів`
}

function streakMessage(target: StreakTarget): Message {
  return target.locale === 'en'
    ? {
        title: `🔥 Your ${target.streak}-day streak is at risk`,
        body: 'A few minutes today keeps the flame going.',
        url: '/learn',
        tag: 'streak',
      }
    : {
        title: `🔥 Серія ${daysUk(target.streak)} під загрозою`,
        body: 'Кілька хвилин сьогодні, і вогник горітиме далі.',
        url: '/learn',
        tag: 'streak',
      }
}

function wordMessage(target: WordTarget): Message {
  const translation = target.translation.length > 90 ? `${target.translation.slice(0, 89)}…` : target.translation
  return target.locale === 'en'
    ? { title: `📖 Word of the day: ${target.word}`, body: `${translation}. Tap to practise it.`, url: '/', tag: 'word' }
    : { title: `📖 Слово дня: ${target.word}`, body: `${translation}. Натисни, щоб повторити.`, url: '/', tag: 'word' }
}

async function remind(config: Config) {
  const vapid: Vapid = { publicKey: config.public_key!, privateJwk: JSON.parse(config.private_jwk!), subject: SUBJECT }
  const streak = await deliver<StreakTarget>('push_targets', 'push_mark', streakMessage, vapid)
  const words = await deliver<WordTarget>('push_word_targets', 'push_mark_words', wordMessage, vapid)
  return { streak, words }
}

/** Sends one kind of message to everyone due, then records who got it and which addresses died. */
async function deliver<T extends Subscription>(
  targetsRpc: string,
  markRpc: string,
  message: (target: T) => Message,
  vapid: Vapid,
) {
  const { data, error } = await admin.rpc(targetsRpc)
  if (error) throw error
  const targets = (data ?? []) as T[]

  const sent: string[] = []
  const gone: string[] = []
  // A few at a time keeps the function well inside its time limit.
  for (let i = 0; i < targets.length; i += 20) {
    await Promise.all(
      targets.slice(i, i + 20).map(async (target) => {
        try {
          const status = await sendPush(target, message(target), vapid)
          if (status >= 200 && status < 300) sent.push(target.id)
          // Expired or unsubscribed: the browser won't take messages on this address again.
          else if (status === 404 || status === 410) gone.push(target.id)
          else console.warn('push failed', status)
        } catch (err) {
          console.warn('push error', err instanceof Error ? err.message : err)
        }
      }),
    )
  }

  if (sent.length || gone.length) {
    const { error: markError } = await admin.rpc(markRpc, { p_sent: sent, p_gone: gone })
    if (markError) throw markError
  }
  return { targets: targets.length, sent: sent.length, gone: gone.length }
}
