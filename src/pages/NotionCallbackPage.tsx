import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { useTranslation } from 'react-i18next'
import { AlertTriangle, Loader2 } from 'lucide-react'
import { BrandIcon } from '../components/BrandIcon'
import { notionErrorText } from '../components/words/notionErrors'
import { Card } from '../components/ui'
import { track } from '../lib/analytics'
import { notionCall, type AutoLinked } from '../lib/notion'
import { useLibrary } from '../stores/library'

/** Notion sends people here after they approve (or cancel) access. */
export function NotionCallbackPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const refreshNotion = useLibrary((s) => s.refreshNotion)
  const [error, setError] = useState<string | null>(null)
  const started = useRef(false)

  useEffect(() => {
    // Strict mode runs effects twice in development; the code may only be exchanged once.
    if (started.current) return
    started.current = true

    const code = params.get('code')
    const state = params.get('state')
    if (params.get('error') || !code || !state) {
      setError(t('notion.callback.cancelled'))
      return
    }
    notionCall<{ auto_linked?: AutoLinked[] }>('finish', { code, state })
      .then(async ({ auto_linked: autoLinked = [] }) => {
        track('notion_connected')
        await refreshNotion()
        // Familiar tables were linked and synced already; otherwise open the table picker.
        if (autoLinked.length > 0) navigate('/words', { replace: true, state: { autoLinked } })
        else navigate('/words?connected=1', { replace: true })
      })
      .catch((err) => setError(notionErrorText(t, err)))
  }, [params, navigate, refreshNotion, t])

  return (
    <Card glow className="mx-auto mt-8 flex max-w-md flex-col items-center gap-4 py-10 text-center">
      <span className="grid size-14 place-items-center rounded-card bg-fg text-bg">
        <BrandIcon provider="notion" className="size-7" />
      </span>
      {error ? (
        <>
          <h2 className="flex items-center gap-2 font-display text-lg font-semibold">
            <AlertTriangle className="size-5 text-danger" />
            {t('notion.callback.failed')}
          </h2>
          <p className="text-sm text-muted">{error}</p>
          <Link to="/words" className="btn btn-primary">
            {t('notion.callback.back')}
          </Link>
        </>
      ) : (
        <p className="flex items-center gap-2 text-muted">
          <Loader2 className="size-4 animate-spin" />
          {t('notion.callback.connecting')}
        </p>
      )}
    </Card>
  )
}
