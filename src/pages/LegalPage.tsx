import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'
import { ArrowLeft } from 'lucide-react'
import { Logo } from '../components/Logo'
import { Card } from '../components/ui'
import { REPO_URL } from '../lib/platform'

type Section = { title: string; body: string }

/** Privacy policy and terms of use. Public pages: Notion requires links to both. */
export function LegalPage({ doc }: { doc: 'privacy' | 'terms' }) {
  const { t } = useTranslation()
  const sections = t(`legal.${doc}.sections`, { returnObjects: true }) as Section[]

  return (
    <div className="relative min-h-dvh">
      <div className="aurora" aria-hidden="true" />
      <header className="pt-safe mx-auto flex max-w-3xl items-center justify-between px-4 py-5 sm:px-6">
        <Link to="/">
          <Logo />
        </Link>
        <Link to="/" className="btn btn-ghost">
          <ArrowLeft className="size-4" />
          {t('common.backHome')}
        </Link>
      </header>
      <main className="mx-auto max-w-3xl px-4 pb-16 sm:px-6">
        <Card padding="p-6 sm:p-10">
          <h1 className="font-display text-3xl font-semibold tracking-tight">{t(`legal.${doc}.title`)}</h1>
          <p className="mt-2 text-sm text-subtle">{t('legal.updated', { date: '25.10.2026' })}</p>
          <div className="mt-8 flex flex-col gap-6">
            {sections.map((section) => (
              <section key={section.title}>
                <h2 className="font-display text-lg font-semibold">{section.title}</h2>
                <p className="mt-2 leading-relaxed whitespace-pre-line text-muted">{section.body}</p>
              </section>
            ))}
          </div>
          <p className="mt-10 text-sm text-muted">
            {t('legal.contact')}{' '}
            <a href={`${REPO_URL}/issues`} target="_blank" rel="noreferrer" className="text-accent underline-offset-4 hover:underline">
              {REPO_URL.replace('https://', '')}/issues
            </a>
          </p>
        </Card>
      </main>
    </div>
  )
}
