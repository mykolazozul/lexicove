import { useEffect, useState, type FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import { motion } from 'motion/react'
import { ArrowLeft, ArrowRight, Info, KeyRound, Loader2, Mail } from 'lucide-react'
import { BrandIcon, providerName } from '../components/BrandIcon'
import { Logo } from '../components/Logo'
import { Card, Segmented } from '../components/ui'
import { authErrorText } from '../lib/authErrors'
import { LOCALE_SHORT, LOCALES } from '../lib/locale'
import { isTauri } from '../lib/platform'
import { isSupabaseConfigured } from '../lib/supabase'
import { OAUTH_PROVIDERS, useAuth, type OAuthProvider } from '../stores/auth'
import { useSettings } from '../stores/settings'
import { toast } from '../stores/toast'

type Mode = 'signIn' | 'signUp'
type Step = 'form' | 'code' | 'forgot' | 'resetCode' | 'newPassword'

export function WelcomePage() {
  const { t } = useTranslation()
  const session = useAuth((s) => s.session)
  const passwordRecovery = useAuth((s) => s.passwordRecovery)
  const { locale, setLocale } = useSettings()

  // Guests may come back here to create an account; signed-in people go straight in,
  // unless they came with a reset code and still have to choose the new password.
  if (session && !passwordRecovery) return <Navigate to="/" replace />

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
  const recovering = useAuth((s) => s.session !== null && s.passwordRecovery)
  const accountEmail = useAuth((s) => s.session?.user.email ?? '')

  const [mode, setMode] = useState<Mode>('signIn')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [sentTo, setSentTo] = useState<string | null>(null)
  const [forgot, setForgot] = useState(false)
  const [resetSentTo, setResetSentTo] = useState<string | null>(null)

  const step: Step = recovering ? 'newPassword' : sentTo ? 'code' : resetSentTo ? 'resetCode' : forgot ? 'forgot' : 'form'
  const resetting = step === 'forgot' || step === 'resetCode'

  // Google refuses to sign in inside embedded webviews, so the desktop app needs a
  // system-browser flow before OAuth can be offered there.
  const oauthAvailable = isSupabaseConfigured && !isTauri && step === 'form'

  function openForgot() {
    setError(null)
    setForgot(true)
  }

  function closeReset() {
    setForgot(false)
    setResetSentTo(null)
  }

  async function run(key: string, action: () => Promise<void>) {
    setBusy(key)
    setError(null)
    try {
      await action()
    } catch (err) {
      setError(authErrorText(t, err))
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
        try {
          await signInWithEmail(email, password)
        } catch (err) {
          // Signed up but never entered the code: send a fresh one and ask for it here.
          if ((err as { code?: string }).code === 'email_not_confirmed') {
            await useAuth.getState().resendSignupCode(email).catch(() => {})
            setSentTo(email)
            return
          }
          throw err
        }
      } else {
        const { needsConfirmation } = await signUpWithEmail(email, password)
        if (needsConfirmation) setSentTo(email)
      }
    })
  }

  return (
    <Card glow padding="p-6 sm:p-8" className="mx-auto w-full max-w-md">
      <h2 className="font-display text-2xl font-semibold">
        {recovering ? t('welcome.reset.newTitle') : resetting ? t('welcome.reset.title') : t('welcome.cardTitle')}
      </h2>
      <p className="mt-1 text-muted">
        {recovering
          ? t('welcome.reset.newText', { email: accountEmail })
          : resetting
            ? t('welcome.reset.text')
            : t('welcome.cardText')}
      </p>

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

          {step === 'newPassword' ? (
            <NewPasswordStep />
          ) : step === 'code' && sentTo ? (
            <CodeStep kind="signup" email={sentTo} onBack={() => setSentTo(null)} />
          ) : step === 'resetCode' && resetSentTo ? (
            <CodeStep kind="reset" email={resetSentTo} onBack={() => setResetSentTo(null)} />
          ) : step === 'forgot' ? (
            <ForgotStep
              initialEmail={email}
              onSent={(address) => {
                setEmail(address)
                setResetSentTo(address)
              }}
              onBack={closeReset}
            />
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
              {mode === 'signIn' && (
                <div className="mt-2 text-right">
                  <button type="button" className="text-sm font-semibold text-accent hover:underline" onClick={openForgot}>
                    {t('welcome.forgot')}
                  </button>
                </div>
              )}
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

      {!recovering && (
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
      )}
    </Card>
  )
}

/** Asks where to send the reset code. */
function ForgotStep({ initialEmail, onSent, onBack }: { initialEmail: string; onSent: (email: string) => void; onBack: () => void }) {
  const { t } = useTranslation()
  const sendPasswordReset = useAuth((s) => s.sendPasswordReset)
  const [email, setEmail] = useState(initialEmail)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      const address = email.trim()
      await sendPasswordReset(address)
      onSent(address)
    } catch (err) {
      setError(authErrorText(t, err))
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="mt-6 flex flex-col gap-4">
      <label className="block">
        <span className="mb-1.5 block text-sm font-medium">{t('welcome.email')}</span>
        <input
          className="input"
          type="email"
          autoComplete="email"
          autoFocus
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </label>
      <button type="submit" className="btn btn-primary w-full" disabled={busy}>
        {busy && <Loader2 className="size-4 animate-spin" />}
        {t('welcome.reset.send')}
      </button>
      {error && (
        <p role="alert" className="rounded-control border border-danger/30 bg-danger/10 p-3 text-sm text-danger">
          {error}
        </p>
      )}
      <button type="button" className="inline-flex items-center gap-1.5 self-start text-sm text-muted transition-colors hover:text-fg" onClick={onBack}>
        <ArrowLeft className="size-4" />
        {t('welcome.reset.back')}
      </button>
    </form>
  )
}

/** After a reset code or link: the new password, chosen right here. */
function NewPasswordStep() {
  const { t } = useTranslation()
  const setNewPassword = useAuth((s) => s.setNewPassword)
  const skipNewPassword = useAuth((s) => s.skipNewPassword)
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      // Saving ends the recovery, and the page then lets you into the app.
      await setNewPassword(password)
      toast(t('welcome.reset.done'))
    } catch (err) {
      setError(authErrorText(t, err))
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="mt-6 flex flex-col gap-4">
      <label className="block">
        <span className="mb-1.5 flex items-center gap-2 text-sm font-medium">
          <KeyRound className="size-4 text-accent" />
          {t('welcome.reset.newPassword')}
        </span>
        <input
          className="input"
          type="password"
          autoComplete="new-password"
          autoFocus
          minLength={8}
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <span className="mt-1.5 block text-xs text-subtle">{t('welcome.passwordHint')}</span>
      </label>
      <button type="submit" className="btn btn-primary w-full" disabled={busy}>
        {busy && <Loader2 className="size-4 animate-spin" />}
        {t('welcome.reset.save')}
      </button>
      {error && (
        <p role="alert" className="rounded-control border border-danger/30 bg-danger/10 p-3 text-sm text-danger">
          {error}
        </p>
      )}
      <button type="button" className="btn btn-ghost w-full" disabled={busy} onClick={skipNewPassword}>
        {t('welcome.reset.keepOld')}
      </button>
    </form>
  )
}

/**
 * The code from the email, typed in right here, so no new tab opens: either the sign-up
 * confirmation or the password reset code.
 */
function CodeStep({ kind, email, onBack }: { kind: 'signup' | 'reset'; email: string; onBack: () => void }) {
  const { t } = useTranslation()
  const verifySignupCode = useAuth((s) => s.verifySignupCode)
  const resendSignupCode = useAuth((s) => s.resendSignupCode)
  const verifyResetCode = useAuth((s) => s.verifyResetCode)
  const sendPasswordReset = useAuth((s) => s.sendPasswordReset)
  const verify = kind === 'signup' ? verifySignupCode : verifyResetCode
  const resendCode = kind === 'signup' ? resendSignupCode : sendPasswordReset
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [cooldown, setCooldown] = useState(60)

  useEffect(() => {
    if (cooldown <= 0) return
    const timer = setTimeout(() => setCooldown((s) => s - 1), 1000)
    return () => clearTimeout(timer)
  }, [cooldown])

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (code.length < 6 || busy) return
    setBusy(true)
    setError(null)
    try {
      // On success the session arrives: a confirmed sign-up goes into the app, a reset code
      // moves on to the new password.
      await verify(email, code)
    } catch (err) {
      setError(authErrorText(t, err))
      setBusy(false)
    }
  }

  async function resend() {
    setError(null)
    try {
      await resendCode(email)
      setCooldown(60)
    } catch (err) {
      setError(authErrorText(t, err))
    }
  }

  return (
    <form onSubmit={submit} className="mt-6 flex flex-col gap-4">
      <div className="flex gap-3 rounded-control border border-accent/30 bg-accent/10 p-4 text-sm">
        <Mail className="size-5 shrink-0 text-accent" />
        <p>{kind === 'signup' ? t('welcome.code.sent', { email }) : t('welcome.reset.sent', { email })}</p>
      </div>
      <label className="block">
        <span className="mb-1.5 block text-sm font-medium">{t('welcome.code.label')}</span>
        <input
          className="input h-14 text-center font-display text-2xl font-semibold tracking-[0.4em] tabular-nums"
          inputMode="numeric"
          autoComplete="one-time-code"
          autoFocus
          maxLength={10}
          value={code}
          onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))}
          placeholder="••••••"
          aria-describedby="code-hint"
        />
        <span id="code-hint" className="mt-1.5 block text-xs text-subtle">{t('welcome.code.hint')}</span>
      </label>
      <button type="submit" className="btn btn-primary w-full" disabled={busy || code.length < 6}>
        {busy && <Loader2 className="size-4 animate-spin" />}
        {kind === 'signup' ? t('welcome.code.confirm') : t('welcome.reset.next')}
      </button>
      {error && (
        <p role="alert" className="rounded-control border border-danger/30 bg-danger/10 p-3 text-sm text-danger">
          {error}
        </p>
      )}
      <div className="flex items-center justify-between gap-3 text-sm">
        <button type="button" className="inline-flex items-center gap-1.5 text-muted transition-colors hover:text-fg" onClick={onBack}>
          <ArrowLeft className="size-4" />
          {t('welcome.code.otherEmail')}
        </button>
        <button type="button" className="font-semibold text-accent disabled:text-subtle" disabled={cooldown > 0} onClick={() => void resend()}>
          {cooldown > 0 ? t('welcome.code.resendIn', { seconds: cooldown }) : t('welcome.code.resend')}
        </button>
      </div>
    </form>
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
