import { useRouteError } from 'react-router'
import { useTranslation } from 'react-i18next'
import { RefreshCw, TriangleAlert } from 'lucide-react'
import { isChunkError } from '../lib/reload'

/** What a crashed screen shows instead of the router's developer message. */
export function ErrorPage() {
  const { t } = useTranslation()
  const error = useRouteError()
  const outdated = isChunkError(error)
  if (import.meta.env.DEV) console.error(error)

  return (
    <div className="grid min-h-dvh place-items-center px-4">
      <div className="aurora" aria-hidden="true" />
      <div className="glass ring-gradient flex w-full max-w-md flex-col items-center gap-4 rounded-card p-8 text-center">
        <TriangleAlert className="size-12 text-coin" strokeWidth={1.6} />
        <h1 className="font-display text-2xl font-semibold">{t(outdated ? 'crash.outdatedTitle' : 'crash.title')}</h1>
        <p className="text-muted">{t(outdated ? 'crash.outdatedText' : 'crash.text')}</p>
        <div className="flex flex-wrap justify-center gap-2">
          <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>
            <RefreshCw className="size-4" />
            {t('crash.reload')}
          </button>
          <a href="/" className="btn btn-secondary">
            {t('common.backHome')}
          </a>
        </div>
      </div>
    </div>
  )
}
