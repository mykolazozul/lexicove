// The desktop app's extras: the small word card above other windows and start with the system.
// Only ever called inside Tauri (src-tauri/src/lib.rs); the web app never loads these modules.

import { isTauri } from './platform'

async function invoke(command: string, args?: Record<string, unknown>) {
  const { invoke: call } = await import('@tauri-apps/api/core')
  return call(command, args)
}

/** Opens the card window at a desktop route: "/desktop/card" or "/desktop/add?word=…". */
export function showCard(path: string): Promise<unknown> {
  return isTauri ? invoke('show_card', { path }) : Promise.resolve()
}

export function hideCard(): Promise<unknown> {
  return isTauri ? invoke('hide_card') : Promise.resolve()
}

export async function startsWithSystem(): Promise<boolean> {
  if (!isTauri) return false
  const { isEnabled } = await import('@tauri-apps/plugin-autostart')
  return isEnabled()
}

export async function setStartsWithSystem(on: boolean): Promise<void> {
  if (!isTauri) return
  const autostart = await import('@tauri-apps/plugin-autostart')
  await (on ? autostart.enable() : autostart.disable())
}

/** The desktop app's own update (src-tauri/src/updates.rs); the site itself is always the newest. */
export type UpdateStatus = {
  state: 'idle' | 'checking' | 'none' | 'downloading' | 'ready' | 'error' | 'disabled'
  /** Installed version of the desktop app. */
  current: string
  /** The newer version, once one is found. */
  version: string | null
  percent: number | null
  error: string | null
  /** What the new version brings (the release notes), once one is found. */
  notes: string | null
}

export const DESKTOP_DOWNLOAD_URL = 'https://github.com/mykolazozul/lexicove/releases/latest/download/Lexicove-Setup.exe'
export const DESKTOP_RELEASES_URL = 'https://github.com/mykolazozul/lexicove/releases/latest'

export async function updateStatus(): Promise<UpdateStatus | null> {
  return isTauri ? ((await invoke('update_status')) as UpdateStatus) : null
}

export function checkForUpdate(): Promise<unknown> {
  return isTauri ? invoke('update_check') : Promise.resolve()
}

/** Installs the downloaded version; the app closes and opens again. */
export function installUpdate(): Promise<unknown> {
  return isTauri ? invoke('update_install') : Promise.resolve()
}

/** Calls back on every change; returns the unsubscribe function. */
export function onUpdate(callback: (status: UpdateStatus) => void): () => void {
  if (!isTauri) return () => {}
  let stop: (() => void) | null = null
  let stopped = false
  void import('@tauri-apps/api/event').then(({ listen }) =>
    listen<UpdateStatus>('lexicove-update', (event) => callback(event.payload)).then((unlisten) => {
      if (stopped) unlisten()
      else stop = unlisten
    }),
  )
  return () => {
    stopped = true
    stop?.()
  }
}

/** The key of the add-a-word hotkey, used with Ctrl+Shift (one letter or digit). */
export function setHotkey(key: string): Promise<unknown> {
  return isTauri ? invoke('set_hotkey', { key }) : Promise.resolve()
}

/** A full-screen game, video or presentation is in front: no word cards now. */
export async function userBusy(): Promise<boolean> {
  return isTauri ? Boolean(await invoke('user_busy')) : false
}
