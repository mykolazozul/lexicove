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
