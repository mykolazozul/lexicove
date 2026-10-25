import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'
import { Compass } from 'lucide-react'
import { Card } from '../components/ui'

export function NotFoundPage() {
  const { t } = useTranslation()
  return (
    <Card className="mx-auto mt-8 max-w-lg text-center">
      <Compass className="mx-auto size-12 text-accent" strokeWidth={1.6} />
      <h2 className="mt-4 font-display text-2xl font-semibold">{t('notFound.title')}</h2>
      <p className="mt-2 text-muted">{t('notFound.text')}</p>
      <Link to="/" className="btn btn-primary mt-6">
        {t('common.backHome')}
      </Link>
    </Card>
  )
}
