// After a new version is deployed the old code files are gone, so a page opened before the
// deploy fails to load its next screen. One quiet reload fetches the new version; a second
// failure within a short while is a real error and is shown instead of looping.

const KEY = 'lexicove-reloaded-at'

/** Reloads the page unless it already did so in the last 20 seconds. True when it reloads. */
export function reloadOnce(): boolean {
  try {
    const last = Number(sessionStorage.getItem(KEY) ?? 0)
    if (Date.now() - last < 20_000) return false
    sessionStorage.setItem(KEY, String(Date.now()))
  } catch {
    return false
  }
  window.location.reload()
  return true
}

/** Whether an error is a code file that failed to download. */
export function isChunkError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return /dynamically imported module|Importing a module script failed|error loading dynamically imported module|Loading chunk/i.test(message)
}

/** A dynamic import that reloads the page once if the file is gone. */
export function importFresh<T>(load: () => Promise<T>): () => Promise<T> {
  return () =>
    load().catch((error) => {
      // Never settles: the page is reloading.
      if (isChunkError(error) && reloadOnce()) return new Promise<T>(() => {})
      throw error
    })
}
