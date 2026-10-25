import { useState, type FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import { motion } from 'motion/react'
import { ArrowRight, Info, Loader2, Mail } from 'lucide-react'
import { BrandIcon, providerName } from '../components/BrandIcon'
import { Logo } from '../components/Logo'
import { Card, Segmented } from '../components/ui'
import { LOCALE_SHORT, LOCALES } from '../lib/locale'
import { isTauri } from '../lib/platform'
import { isSupabaseConfigured } from '../lib/supabase'
import { OAUTH_PROVIDERS, useAuth, type OAuthProvider } from '../stores/auth'
import { useSettings } from '../stores/settings'

type Mode = 'signIn' | 'signUp'

export function WelcomePage() {
  const { t } = useTranslation()
  const session = useAuth((s) => s.session)
  const { locale, setLocale } = useSettings()

  // Guests may come back here to create an account; signed-in people go straight in.
  if (session) return <Navigate to="/" replace />

  const samples = t('welcome.samples', { returnObjects: true }) as Array<{ word: string; meaning: string }>

  return (
    <div className="relative min-h-dvh overflow-hidden">
      <div className="aurora" aria-hidden="true" />
      <div className="grain" aria-hidden="true" />

      <header className="pt-safe mx-auto flex max-w-6xl items-center justify-between px-4 py-5 sm:px-6 lg:px-10">
        <Logo />
        <Segmented
          label={t('settings.language')}
          value={locale}
          onChange={setLocale}
          options={LOCALES.map((code) => ({ value: code, label: LOCALE_SHORT[code] }))}
        />
      </header>

      <main className="mx-auto grid max-w-6xl items-center gap-10 px-4 pt-4 pb-16 sm:px-6 lg:grid-cols-[1.1fr_1fr] lg:gap-16 lg:px-10 lg:pt-12">
        <section className="relative isolate">
          <div
            className="bg-gradient-accent pointer-events-none absolute -top-16 -left-20 -z-10 size-[26rem] rounded-full opacity-20 blur-[100px]"
            aria-hidden="true"
          />
          <motion.h1
            className="font-display text-4xl leading-[1.08] font-semibold tracking-tight sm:text-5xl lg:text-6xl"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          >
            {t('welcome.line1')}
            <br />
            {t('welcome.line2')}
            <br />
            <span className="text-gradient">{t('welcome.line3')}</span>
          </motion.h1>
          <motion.p
            className="mt-6 max-w-xl text-lg text-muted"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
          >
            {t('welcome.subtitle')}
          </motion.p>

          <div className="mt-10 hidden flex-wrap items-start gap-3 sm:flex" aria-hidden="true">
            {samples.map((sample, index) => (
              <motion.div
                key={sample.word}
                className="glass ring-gradient rounded-card px-5 py-4"
                style={{ marginTop: index === 1 ? 24 : 0 }}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: [0, -8, 0] }}
                transition={{
                  opacity: { duration: 0.6, delay: 0.25 + index * 0.12 },
                  y: { duration: 5 + index, repeat: Infinity, ease: 'easeInOut', delay: index * 0.6 },
                }}
              >
                <div className="font-display font-semibold">{sample.word}</div>
                <div className="mt-1 text-sm text-muted">{sample.meaning}</div>
              </motion.div>
            ))}
          </div>
        </section>

        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
        >
          <AuthCard />
        </motion.section>
      </main>
    </div>
  )
}

function AuthCard() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { signInWithProvider, signInWithEmail, signUpWithEmail, continueAsGuest } = useAuth()

  const [mode, setMode] = useState<Mode>('signIn')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [sentTo, setSentTo] = useState<string | null>(null)

  // Google refuses to sign in inside embedded webviews, so the desktop app needs a
  // system-browser flow before OAuth can be offered there.
  const oauthAvailable = isSupabaseConfigured && !isTauri

  async function run(key: string, action: () => Promise<void>) {
    setBusy(key)
    setError(null)
    try {
      await action()
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : t('errors.generic'))
    } finally {
      setBusy(null)
    }
  }

  function onProvider(provider: OAuthProvider) {
    void run(provider, () => signInWithProvider(provider))
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault()
    void run('email', async () => {
      if (mode === 'signIn') {
        await signInWithEmail(email, password)
      } else {
        const { needsConfirmation } = await signUpWithEmail(email, password)
        if (needsConfirmation) setSentTo(email)
      }
    })
  }

  return (
    <Card glow className="mx-auto w-full max-w-md p-6 sm:p-8">
      <h2 className="font-display text-2xl font-semibold">{t('welcome.cardTitle')}</h2>
      <p className="mt-1 text-muted">{t('welcome.cardText')}</p>

      {!isSupabaseConfigured && <Notice>{t('welcome.notConfigured')}</Notice>}
      {isSupabaseConfigured && isTauri && <Notice>{t('welcome.desktopOauth')}</Notice>}

      {oauthAvailable && (
        <div className="mt-6 grid grid-cols-2 gap-2.5">
          {OAUTH_PROVIDERS.map((provider) => (
            <button
              key={provider}
              type="button"
              className="btn btn-secondary px-3"
              disabled={busy !== null}
              onClick={() => onProvider(provider)}
              aria-label={t('welcome.continueWith', { provider: providerName(provider) })}
            >
              {busy === provider ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <BrandIcon provider={provider} className="size-4" />
              )}
              {providerName(provider)}
            </button>
          ))}
        </div>
      )}

      {isSupabaseConfigured && (
        <>
          {oauthAvailable && (
            <div className="my-6 flex items-center gap-3 text-xs font-semibold tracking-wide text-subtle uppercase">
              <span className="h-px flex-1 bg-line" />
              {t('welcome.or')}
              <span className="h-px flex-1 bg-line" />
            </div>
          )}

          {sentTo ? (
            <div className="mt-6 flex gap-3 rounded-control border border-success/30 bg-success/10 p-4 text-sm">
              <Mail className="size-5 shrink-0 text-success" />
              <p>{t('welcome.checkEmail', { email: sentTo })}</p>
            </div>
          ) : (
            <form onSubmit={onSubmit} className={oauthAvailable ? '' : 'mt-6'}>
              <Segmented
                label={t('welcome.tabSignIn')}
                value={mode}
                onChange={setMode}
                options={[
                  { value: 'signIn', label: t('welcome.tabSignIn') },
                  { value: 'signUp', label: t('welcome.tabSignUp') },
                ]}
              />
              <label className="mt-4 block">
                <span className="mb-1.5 block text-sm font-medium">{t('welcome.email')}</span>
                <input
                  className="input"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </label>
              <label className="mt-3 block">
                <span className="mb-1.5 block text-sm font-medium">{t('welcome.password')}</span>
                <input
                  className="input"
                  type="password"
                  autoComplete={mode === 'signIn' ? 'current-password' : 'new-password'}
                  minLength={8}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                {mode === 'signUp' && (
                  <span className="mt-1.5 block text-xs text-subtle">{t('welcome.passwordHint')}</span>
                )}
              </label>
              <button type="submit" className="btn btn-primary mt-5 w-full" disabled={busy !== null}>
                {busy === 'email' && <Loader2 className="size-4 animate-spin" />}
                {mode === 'signIn' ? t('welcome.signIn') : t('welcome.signUp')}
              </button>
            </form>
          )}
        </>
      )}

      {error && (
        <p role="alert" className="mt-4 rounded-control border border-danger/30 bg-danger/10 p-3 text-sm text-danger">
          {error}
        </p>
      )}

      <div className="mt-6 border-t border-line pt-5">
        <button
          type="button"
          className="btn btn-ghost w-full"
          onClick={() => {
            continueAsGuest()
            navigate('/')
          }}
        >
          {t('welcome.guest')}
          <ArrowRight className="size-4" />
        </button>
        <p className="mt-2 text-center text-xs text-subtle">{t('welcome.guestHint')}</p>
      </div>
    </Card>
  )
}

function Notice({ children }: { children: string }) {
  return (
    <div className="mt-5 flex gap-3 rounded-control border border-line bg-surface p-3.5 text-sm text-muted">
      <Info className="mt-0.5 size-4 shrink-0 text-accent-2" />
      <p>{children}</p>
    </div>
  )
}
