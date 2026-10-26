// Streak reminders: subscribes this browser to Web Push and registers it with the server.
// The push function (supabase/functions/push) decides when to send, at 19:00 local time.

import { fromBase64Url } from '../../supabase/functions/push/webpush'
import { isTauri } from './platform'
import { supabase } from './supabase'

export type PushSupport = 'ok' | 'install' | 'unsupported'

/** iPhones and iPads only allow push for apps added to the home screen. */
export function pushSupport(): PushSupport {
  if (isTauri || typeof window === 'undefined') return 'unsupported'
  const standalone = window.matchMedia('(display-mode: standalone)').matches
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent)
  if (ios && !standalone) return 'install'
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'unsupported'
  return 'ok'
}

async function registration(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null
  return (await navigator.serviceWorker.getRegistration()) ?? null
}

export async function isSubscribed(): Promise<boolean> {
  if (pushSupport() !== 'ok' || Notification.permission !== 'granted') return false
  const reg = await registration()
  return Boolean(await reg?.pushManager.getSubscription())
}

export class PushError extends Error {}

export async function subscribe(locale: string): Promise<void> {
  if (!supabase) throw new PushError('offline')
  if ((await Notification.requestPermission()) !== 'granted') throw new PushError('denied')
  const reg = await registration()
  if (!reg) throw new PushError('no_worker')

  const { data, error } = await supabase.functions.invoke<{ public_key: string }>('push', { body: { action: 'public_key' } })
  if (error || !data?.public_key) throw new PushError('server')
  const key = fromBase64Url(data.public_key)

  let subscription = await reg.pushManager.getSubscription()
  // A subscription made with another key can't receive our messages.
  if (subscription && subscription.options.applicationServerKey) {
    const current = new Uint8Array(subscription.options.applicationServerKey)
    if (current.length !== key.length || current.some((byte, i) => byte !== key[i])) {
      await subscription.unsubscribe()
      subscription = null
    }
  }
  subscription ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key })

  const json = subscription.toJSON()
  const { error: saveError } = await supabase.rpc('save_push_subscription', {
    p_endpoint: subscription.endpoint,
    p_p256dh: json.keys?.p256dh ?? '',
    p_auth: json.keys?.auth ?? '',
    p_locale: locale,
  })
  if (saveError) throw new PushError('server')
}

export async function unsubscribe(): Promise<void> {
  const reg = await registration()
  const subscription = await reg?.pushManager.getSubscription()
  if (!subscription) return
  if (supabase) await supabase.rpc('delete_push_subscription', { p_endpoint: subscription.endpoint })
  await subscription.unsubscribe()
}
