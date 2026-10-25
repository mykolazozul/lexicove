/** True inside the Tauri desktop app, false in a regular browser or installed PWA. */
export const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

export const APP_VERSION = __APP_VERSION__

export const REPO_URL = 'https://github.com/mykolazozul/lexicove'
