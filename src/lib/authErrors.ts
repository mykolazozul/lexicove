/** Supabase's English auth errors, in the app's language. */
export function authErrorText(t: (key: string) => string, error: unknown): string {
  const { code, message } = (error ?? {}) as { code?: string; message?: string }
  const known = [
    'invalid_credentials',
    'email_not_confirmed',
    'user_already_exists',
    'weak_password',
    'over_email_send_rate_limit',
    'otp_expired',
    'email_address_invalid',
    'email_address_not_authorized',
    'same_password',
  ]
  if (code && known.includes(code)) return t(`welcome.errors.${code}`)
  // Supabase reports a failed SMTP delivery only as "Error sending … email".
  if (message && /error sending .*email/i.test(message)) return t('welcome.errors.email_send_failed')
  return t('errors.generic')
}
