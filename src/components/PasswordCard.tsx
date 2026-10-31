import { useEffect, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { KeyRound, Loader2, Mail } from 'lucide-react'
import { authErrorText } from '../lib/authErrors'
import { useAuth } from '../stores/auth'
import { toast } from '../stores/toast'
import { Modal } from './Modal'
import { Card } from './ui'

type Step = 'send' | 'code' | 'password'

/**
 * Changing the password from Settings. A code from the email proves it's really you (the same
 * code as a forgotten-password reset), then the new password is saved and every other device
 * is signed out.
 */
export function PasswordCard() {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  return (
    <Card className="flex flex-col gap-4 sm:flex-row sm:items-center">
      <KeyRound className="hidden size-5 shrink-0 text-muted sm:block" />
      <div className="min-w-0 flex-1">
        <div className="font-semibold">{t('settings.password.title')}</div>
        <p className="mt-0.5 text-sm text-muted">{t('settings.password.hint')}</p>
      </div>
      <button type="button" className="btn btn-secondary self-start sm:self-center" onClick={() => setOpen(true)}>
        {t('settings.password.change')}
      </button>
      {open && <PasswordDialog onClose={() => setOpen(false)} />}
    </Card>
  )
}

function PasswordDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation()
  const email = useAuth((s) => s.session?.user.email ?? '')
  const { sendPasswordReset, verifyResetCode, setNewPassword, skipNewPassword } = useAuth()
  const [step, setStep] = useState<Step>('send')
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [cooldown, setCooldown] = useState(0)

  useEffect(() => {
    if (cooldown <= 0) return
    const timer = setTimeout(() => setCooldown((s) => s - 1), 1000)
    return () => clearTimeout(timer)
  }, [cooldown])

  function close() {
    // A code that was accepted but not followed by a new password leaves nothing pending.
    skipNewPassword()
    onClose()
  }

  async function run(action: () => Promise<void>) {
    setBusy(true)
    setError(null)
    try {
      await action()
    } catch (err) {
      setError(authErrorText(t, err))
    } finally {
      setBusy(false)
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault()
    if (busy) return
    if (step === 'send') {
      void run(async () => {
        await sendPasswordReset(email)
        setCooldown(60)
        setStep('code')
      })
    } else if (step === 'code') {
      if (code.length < 6) return
      void run(async () => {
        await verifyResetCode(email, code)
        setStep('password')
      })
    } else {
      void run(async () => {
        await setNewPassword(password)
        toast(t('welcome.reset.done'), 'ok', '🔒')
        onClose()
      })
    }
  }

  const label = step === 'send' ? t('settings.password.send') : step === 'code' ? t('welcome.reset.next') : t('welcome.reset.save')

  return (
    <Modal
      open
      onClose={close}
      title={t('settings.password.title')}
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={close}>
            {t('common.cancel')}
          </button>
          <button type="submit" form="password-form" className="btn btn-primary" disabled={busy || (step === 'code' && code.length < 6)}>
            {busy && <Loader2 className="size-4 animate-spin" />}
            {label}
          </button>
        </>
      }
    >
      <form id="password-form" onSubmit={submit} className="flex flex-col gap-4">
        {step === 'send' && (
          <div className="flex gap-3 rounded-control border border-line bg-surface p-4 text-sm">
            <Mail className="size-5 shrink-0 text-accent" />
            <p>{t('settings.password.sendText', { email })}</p>
          </div>
        )}

        {step === 'code' && (
          <>
            <div className="flex gap-3 rounded-control border border-accent/30 bg-accent/10 p-4 text-sm">
              <Mail className="size-5 shrink-0 text-accent" />
              <p>{t('settings.password.sent', { email })}</p>
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
              />
            </label>
            <button
              type="button"
              className="self-end text-sm font-semibold text-accent disabled:text-subtle"
              disabled={cooldown > 0 || busy}
              onClick={() =>
                void run(async () => {
                  await sendPasswordReset(email)
                  setCooldown(60)
                })
              }
            >
              {cooldown > 0 ? t('welcome.code.resendIn', { seconds: cooldown }) : t('welcome.code.resend')}
            </button>
          </>
        )}

        {step === 'password' && (
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">{t('welcome.reset.newPassword')}</span>
            <input
              className="input"
              type="password"
              autoComplete="new-password"
              autoFocus
              minLength={8}
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
            <span className="mt-1.5 block text-xs text-subtle">{t('settings.password.newHint')}</span>
          </label>
        )}

        {error && (
          <p role="alert" className="rounded-control border border-danger/30 bg-danger/10 p-3 text-sm text-danger">
            {error}
          </p>
        )}
      </form>
    </Modal>
  )
}
