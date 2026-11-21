import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, Loader2, Monitor } from '../components/icons'
import { LogoMark } from '../components/Logo'
import { handoff, isProvider, isState } from '../lib/desktopSignIn'

/**
 * Opened by the desktop app in the user's own browser (src/lib/desktopSignIn.ts): "start" sends
 * them to the provider, "done" hands the session back to the app through lexicove://signin.
 */
export function DesktopSignInPage({ step }: { step: 'start' | 'done' }) {
  return step === 'start' ? <Start /> : <Done />
}

function Frame({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-dvh place-items-center bg-bg px-4 py-10">
      <div className="flex w-full max-w-sm flex-col items-center gap-5 text-center">
        <LogoMark className="size-12" />
        {children}
      </div>
    </div>
  )
}

function Start() {
  const { t } = useTranslation()
  const [failed, setFailed] = useState(false)
  const started = useRef(false)

  useEffect(() => {
    if (started.current) return
    started.current = true
    const params = new URLSearchParams(window.location.search)
    const provider = params.get('provider')
    const state = params.get('state')
    const client = handoff()
    if (!client || !isProvider(provider) || !isState(state)) {
      setFailed(true)
      return
    }
    const redirectTo = `${window.location.origin}/desktop/signin/done?state=${state}`
    void client.auth.signInWithOAuth({ provider, options: { redirectTo } }).then(({ error }) => error && setFailed(true))
  }, [])

  return (
    <Frame>
      {failed ? (
        <>
          <h1 className="text-xl font-semibold">{t('desktopSignIn.failedTitle')}</h1>
          <p className="text-sm text-muted">{t('desktopSignIn.failedText')}</p>
        </>
      ) : (
        <>
          <Loader2 className="size-6 animate-spin text-accent" />
          <p className="text-sm text-muted">{t('desktopSignIn.redirecting')}</p>
        </>
      )}
    </Frame>
  )
}

function Done() {
  const { t } = useTranslation()
  const [link, setLink] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  const started = useRef(false)

  useEffect(() => {
    if (started.current) return
    started.current = true
    const state = new URLSearchParams(window.location.search).get('state')
    const client = handoff()
    if (!client || !isState(state)) {
      setFailed(true)
      return
    }
    void (async () => {
      // The client takes the code from the address on its own; wait for that.
      const { data } = await client.auth.getSession()
      const session = data.session
      if (!session) {
        setFailed(true)
        return
      }
      const hash = new URLSearchParams({ state, access_token: session.access_token, refresh_token: session.refresh_token })
      const deepLink = `lexicove://signin#${hash.toString()}`
      // Forget it here: from now on only the app uses this session.
      await client.auth.signOut({ scope: 'local' })
      window.history.replaceState(null, '', '/desktop/signin/done')
      setLink(deepLink)
      window.location.href = deepLink
    })()
  }, [])

  return (
    <Frame>
      {failed ? (
        <>
          <h1 className="text-xl font-semibold">{t('desktopSignIn.failedTitle')}</h1>
          <p className="text-sm text-muted">{t('desktopSignIn.failedText')}</p>
        </>
      ) : link ? (
        <>
          <Check className="size-8 text-success" />
          <h1 className="text-xl font-semibold">{t('desktopSignIn.doneTitle')}</h1>
          <p className="text-sm text-muted">{t('desktopSignIn.doneText')}</p>
          <a href={link} className="btn btn-primary">
            <Monitor className="size-4" />
            {t('desktopSignIn.open')}
          </a>
        </>
      ) : (
        <Loader2 className="size-6 animate-spin text-accent" />
      )}
    </Frame>
  )
}
