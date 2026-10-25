import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'
import { UserPlus } from 'lucide-react'
import { Card } from './ui'

/** Shown in place of features that need an account. */
export function GuestNotice({ title, text }: { title: string; text: string }) {
  const { t } = useTranslation()
  return (
    <Card glow className="mx-auto mt-4 flex max-w-xl flex-col items-center gap-3 py-10 text-center">
      <UserPlus className="size-10 text-accent" strokeWidth={1.8} />
      <h2 className="font-display text-xl font-semibold">{title}</h2>
      <p className="max-w-sm text-muted">{text}</p>
      <Link to="/welcome" className="btn btn-primary mt-2">
        {t('profile.createAccount')}
      </Link>
    </Card>
  )
}
