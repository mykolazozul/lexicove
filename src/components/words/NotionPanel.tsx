import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AlertTriangle, Info, Loader2, Plus, RefreshCw, Unplug, X } from 'lucide-react'
import { canConnectHere, notionCall, notionRedirectUri } from '../../lib/notion'
import { useLibrary, type Source } from '../../stores/library'
import { BrandIcon } from '../BrandIcon'
import { Badge, Card } from '../ui'
import { notionErrorText } from './notionErrors'

export function relativeTime(iso: string, locale: string): string {
  const seconds = Math.round((Date.parse(iso) - Date.now()) / 1000)
  const format = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' })
  const steps: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ['day', 86400],
    ['hour', 3600],
    ['minute', 60],
  ]
  for (const [unit, size] of steps) {
    if (Math.abs(seconds) >= size) return format.format(Math.round(seconds / size), unit)
  }
  return format.format(seconds, 'second')
}

export function NotionPanel({
  onAddSource,
  onMessage,
}: {
  onAddSource: () => void
  onMessage: (text: string, tone?: 'ok' | 'error') => void
}) {
  const { t, i18n } = useTranslation()
  const { notion, sources, words, rules, syncing, sync, load, refreshNotion, removeSource } = useLibrary()
  const [connecting, setConnecting] = useState(false)

  if (!notion) {
    return (
      <Card className="flex items-center gap-3 text-muted">
        <Loader2 className="size-4 animate-spin" />
        {t('common.loading')}
      </Card>
    )
  }

  if (!notion.configured) {
    return (
      <Card className="flex gap-3 text-sm text-muted">
        <Info className="mt-0.5 size-4 shrink-0 text-accent-2" />
        <p>{t('notion.notConfigured')}</p>
      </Card>
    )
  }

  async function connect() {
    setConnecting(true)
    try {
      const { url } = await notionCall<{ url: string }>('start', { redirect_uri: notionRedirectUri() })
      window.location.assign(url)
    } catch (error) {
      onMessage(notionErrorText(t, error), 'error')
      setConnecting(false)
    }
  }

  async function runSync() {
    try {
      const results = await sync()
      const total = results.reduce(
        (sum, r) => ({
          pulled: sum.pulled + (r.pulled ?? 0),
          created: sum.created + (r.pushed?.created ?? 0),
          updated: sum.updated + (r.pushed?.updated ?? 0),
        }),
        { pulled: 0, created: 0, updated: 0 },
      )
      onMessage(t('notion.syncDone', total))
    } catch (error) {
      onMessage(notionErrorText(t, error), 'error')
    }
  }

  async function disconnect() {
    if (!window.confirm(t('notion.confirmDisconnect'))) return
    try {
      await notionCall('disconnect')
      await load()
      await refreshNotion()
    } catch (error) {
      onMessage(notionErrorText(t, error), 'error')
    }
  }

  async function unlink(source: Source) {
    if (!window.confirm(t('notion.confirmRemoveSource', { name: source.title || t('notion.untitled') }))) return
    try {
      await removeSource(source)
    } catch (error) {
      onMessage(notionErrorText(t, error), 'error')
    }
  }

  if (!notion.connected) {
    return (
      <Card glow className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <span className="grid size-12 shrink-0 place-items-center rounded-control bg-fg text-bg">
          <BrandIcon provider="notion" className="size-6" />
        </span>
        <div className="flex-1">
          <h3 className="font-display font-semibold">{t('notion.connectTitle')}</h3>
          <p className="mt-1 text-sm text-muted">{canConnectHere ? t('notion.connectText') : t('notion.desktopNote')}</p>
        </div>
        {canConnectHere && (
          <button type="button" className="btn btn-primary" onClick={connect} disabled={connecting}>
            {connecting && <Loader2 className="size-4 animate-spin" />}
            {t('notion.connect')}
          </button>
        )}
      </Card>
    )
  }

  const workspace = notion.workspace?.workspace_name || t('notion.workspaceFallback')
  const counts = (source: Source) =>
    (source.kind === 'words' ? words : rules).filter((item) => item.source_id === source.id).length

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-control bg-fg text-bg">
          <BrandIcon provider="notion" className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-semibold">{t('notion.connectedTo', { name: workspace })}</h3>
          <p className="text-xs text-muted">
            {sources.length === 0 ? t('notion.noSources') : t('notion.sourcesCount', { count: sources.length })}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {sources.length > 0 && (
            <button type="button" className="btn btn-primary" onClick={runSync} disabled={syncing}>
              <RefreshCw className={syncing ? 'size-4 animate-spin' : 'size-4'} />
              {syncing ? t('notion.syncing') : t('notion.sync')}
            </button>
          )}
          <button type="button" className="btn btn-secondary" onClick={onAddSource}>
            <Plus className="size-4" />
            {t('notion.addSource')}
          </button>
          <button type="button" className="btn btn-ghost" onClick={disconnect} title={t('notion.disconnect')}>
            <Unplug className="size-4" />
            <span className="sr-only sm:not-sr-only">{t('notion.disconnect')}</span>
          </button>
        </div>
      </div>

      {sources.length > 0 && (
        <ul className="flex flex-col divide-y divide-line rounded-control border border-line">
          {sources.map((source) => (
            <li key={source.id} className="flex items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="truncate font-medium">{source.title || t('notion.untitled')}</span>
                  <Badge tone={source.kind === 'words' ? 'accent' : 'coin'}>{t(`notion.kinds.${source.kind}`)}</Badge>
                </div>
                <p className="mt-0.5 text-xs text-muted">
                  {t('notion.rows', { count: counts(source) })} ·{' '}
                  {source.last_synced_at
                    ? t('notion.syncedAgo', { time: relativeTime(source.last_synced_at, i18n.language) })
                    : t('notion.neverSynced')}
                </p>
                {source.last_error && (
                  <p className="mt-1 flex items-start gap-1.5 text-xs text-danger">
                    <AlertTriangle className="mt-px size-3.5 shrink-0" />
                    {source.last_error}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => unlink(source)}
                aria-label={t('notion.removeSource')}
                title={t('notion.removeSource')}
                className="grid size-8 shrink-0 place-items-center rounded-full text-subtle transition-colors hover:bg-surface hover:text-fg"
              >
                <X className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
