import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Activity,
  AlertTriangle,
  BookOpen,
  ExternalLink,
  Loader2,
  RefreshCw,
  Search,
  ShieldAlert,
  UserPlus,
  Users,
} from 'lucide-react'
import { BarList, ColumnChart, formatNumber, Heatmap, Meter, type Point } from '../components/admin/charts'
import { BrandIcon } from '../components/BrandIcon'
import { relativeTime } from '../components/words/NotionPanel'
import { Badge, Card, IconChip, Reveal, Segmented, type ChipTone } from '../components/ui'
import {
  admin,
  FREE_LIMITS,
  formatBytes,
  isAdmin,
  ROLE_RANK,
  type AdminSource,
  type AdminUser,
  type AuditEntry,
  type Overview,
} from '../lib/admin'
import { LOCALE_NAMES, type Locale } from '../lib/locale'
import { REPO_URL } from '../lib/platform'
import { useViewer } from '../lib/viewer'
import type { Role } from '../stores/profile'

type Tab = 'overview' | 'users' | 'notion' | 'system' | 'audit'

const ROLES: Role[] = ['user', 'tester', 'moderator', 'admin', 'owner']

const LINKS = [
  { key: 'supabase', url: 'https://supabase.com/dashboard/project/eahfdgqyjeyensmskvcg' },
  { key: 'vercel', url: 'https://vercel.com/mikolazzzzzs-projects/lexicove' },
  { key: 'github', url: REPO_URL },
  { key: 'notion', url: 'https://www.notion.so/profile/integrations' },
] as const

export function AdminPage() {
  const { t } = useTranslation()
  const viewer = useViewer()
  const [tab, setTab] = useState<Tab>('overview')

  if (!isAdmin(viewer.role)) {
    return (
      <Card className="mx-auto mt-8 flex max-w-md flex-col items-center gap-3 py-10 text-center">
        <ShieldAlert className="size-10 text-subtle" strokeWidth={1.6} />
        <h2 className="font-display text-lg font-semibold">{t('admin.noAccess')}</h2>
        <p className="text-sm text-muted">{t('admin.noAccessText')}</p>
      </Card>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <Reveal className="overflow-x-auto">
        <Segmented
          label={t('admin.title')}
          value={tab}
          onChange={setTab}
          options={(['overview', 'users', 'notion', 'system', 'audit'] as const).map((value) => ({
            value,
            label: t(`admin.tabs.${value}`),
          }))}
        />
      </Reveal>
      {tab === 'overview' && <OverviewTab />}
      {tab === 'users' && <UsersTab viewerRole={viewer.role} />}
      {tab === 'notion' && <NotionTab />}
      {tab === 'system' && <SystemTab />}
      {tab === 'audit' && <AuditTab />}
    </div>
  )
}

// ---------- shared ----------

function useLoad<T>(loader: () => Promise<T>) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadedAt, setLoadedAt] = useState<string | null>(null)

  const reload = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setData(await loader())
      setLoadedAt(new Date().toISOString())
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [loader])

  useEffect(() => {
    void reload()
  }, [reload])

  return { data, error, loading, reload, loadedAt }
}

function TabHeader({ loading, loadedAt, onReload }: { loading: boolean; loadedAt: string | null; onReload: () => void }) {
  const { t, i18n } = useTranslation()
  return (
    <div className="flex items-center justify-end gap-3 text-xs text-subtle">
      {loadedAt && <span>{t('admin.updated', { time: relativeTime(loadedAt, i18n.language) })}</span>}
      <button type="button" className="btn btn-secondary h-9 px-3" onClick={onReload} disabled={loading}>
        <RefreshCw className={loading ? 'size-4 animate-spin' : 'size-4'} />
        {t('admin.refresh')}
      </button>
    </div>
  )
}

function ErrorBox({ message }: { message: string }) {
  return (
    <p role="alert" className="flex gap-2 rounded-control border border-danger/30 bg-danger/10 p-3 text-sm text-danger">
      <AlertTriangle className="mt-0.5 size-4 shrink-0" />
      {message}
    </p>
  )
}

function Panel({ title, hint, children, className }: { title: string; hint?: string; children: ReactNode; className?: string }) {
  return (
    <Card className={className}>
      <h3 className="font-display font-semibold">{title}</h3>
      {hint && <p className="mt-0.5 text-sm text-muted">{hint}</p>}
      <div className="mt-5">{children}</div>
    </Card>
  )
}

function Kpi({ icon, tone, label, value, delta }: { icon: ReactNode; tone: ChipTone; label: string; value: number | string; delta?: string }) {
  return (
    <Card padding="p-4 sm:p-5">
      <IconChip tone={tone}>{icon}</IconChip>
      <div className="mt-4 font-display text-2xl font-semibold">{typeof value === 'number' ? formatNumber(value) : value}</div>
      <div className="mt-0.5 text-sm text-muted">{label}</div>
      {delta && <div className="mt-1 text-xs font-semibold text-success">{delta}</div>}
    </Card>
  )
}

const toPoints = (record: Record<string, number>, rename?: (key: string) => string): Point[] =>
  Object.entries(record)
    .map(([key, value]) => ({ label: rename ? rename(key) : key, value }))
    .sort((a, b) => b.value - a.value)

// ---------- overview ----------

function OverviewTab() {
  const { t, i18n } = useTranslation()
  const { data, error, loading, reload, loadedAt } = useLoad(admin.overview)

  const dayLabels = useMemo(() => {
    // 2024-01-01 was a Monday.
    return Array.from({ length: 7 }, (_, i) =>
      new Date(2024, 0, 1 + i).toLocaleDateString(i18n.language, { weekday: 'short' }),
    )
  }, [i18n.language])

  const daily = (rows: Overview['signups_by_day']): Point[] =>
    rows.map((row) => {
      const date = new Date(`${row.day}T12:00:00`)
      return {
        label: date.toLocaleDateString(i18n.language, { day: 'numeric', month: 'short' }),
        hint: date.toLocaleDateString(i18n.language, { weekday: 'long', day: 'numeric', month: 'long' }),
        value: row.count,
      }
    })

  if (!data) {
    return (
      <>
        <TabHeader loading={loading} loadedAt={loadedAt} onReload={reload} />
        {error ? <ErrorBox message={error} /> : <LoadingCard />}
      </>
    )
  }

  const funnel = data.funnel
  const retention = data.retention_7d.cohort > 0 ? Math.round((data.retention_7d.returned / data.retention_7d.cohort) * 100) : null
  const opens = Object.values(data.platforms).reduce((sum, n) => sum + n, 0)

  return (
    <div className="flex flex-col gap-4">
      <TabHeader loading={loading} loadedAt={loadedAt} onReload={reload} />
      {error && <ErrorBox message={error} />}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi
          icon={<Users className="size-5" />}
          tone="accent"
          label={t('admin.kpi.users')}
          value={data.users_total}
          delta={data.users_7d > 0 ? t('admin.kpi.newThisWeek', { n: data.users_7d }) : undefined}
        />
        <Kpi icon={<Activity className="size-5" />} tone="success" label={t('admin.kpi.dau')} value={data.dau} />
        <Kpi icon={<Activity className="size-5" />} tone="accent-2" label={t('admin.kpi.wau')} value={data.wau} />
        <Kpi icon={<Activity className="size-5" />} tone="xp" label={t('admin.kpi.mau')} value={data.mau} />
        <Kpi icon={<BookOpen className="size-5" />} tone="coin" label={t('admin.kpi.words')} value={data.words_total} />
        <Kpi icon={<BookOpen className="size-5" />} tone="fire" label={t('admin.kpi.rules')} value={data.rules_total} />
        <Kpi
          icon={<BrandIcon provider="notion" className="size-5" />}
          tone="accent"
          label={t('admin.kpi.notion')}
          value={data.notion_connections}
        />
        <Kpi
          icon={<UserPlus className="size-5" />}
          tone="success"
          label={t('admin.kpi.retention')}
          value={retention === null ? '—' : `${retention}%`}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title={t('admin.charts.signups')} hint={t('admin.charts.last30')}>
          <ColumnChart points={daily(data.signups_by_day)} caption={t('admin.charts.signups')} />
        </Panel>
        <Panel title={t('admin.charts.active')} hint={t('admin.charts.last30')}>
          <ColumnChart points={daily(data.active_by_day)} caption={t('admin.charts.active')} />
        </Panel>
      </div>

      <Panel title={t('admin.charts.heatmap')} hint={t('admin.charts.heatmapHint')}>
        <Heatmap
          cells={data.heatmap}
          dayLabels={dayLabels}
          caption={t('admin.charts.heatmap')}
          lowLabel={t('admin.charts.less')}
          highLabel={t('admin.charts.more')}
        />
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title={t('admin.charts.funnel')} hint={t('admin.charts.funnelHint')}>
          <BarList
            caption={t('admin.charts.funnel')}
            total={funnel.signed_up}
            items={[
              { label: t('admin.funnel.signed_up'), value: funnel.signed_up },
              { label: t('admin.funnel.has_words'), value: funnel.has_words },
              { label: t('admin.funnel.notion_connected'), value: funnel.notion_connected },
              { label: t('admin.funnel.notion_linked'), value: funnel.notion_linked },
            ]}
          />
        </Panel>
        <Panel title={t('admin.charts.wordsPerUser')} hint={t('admin.charts.wordsPerUserHint')}>
          <ColumnChart
            height={140}
            caption={t('admin.charts.wordsPerUser')}
            points={Object.entries(data.words_histogram).map(([bucket, count]) => ({ label: bucket, value: count }))}
          />
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title={t('admin.charts.platforms')} hint={t('admin.charts.opens', { count: opens })}>
          <BarList caption={t('admin.charts.platforms')} total={opens} items={toPoints(data.platforms, (k) => t(`admin.platforms.${k}`, k))} />
        </Panel>
        <Panel title={t('admin.charts.locales')}>
          <BarList
            caption={t('admin.charts.locales')}
            total={opens}
            items={toPoints(data.locales, (k) => LOCALE_NAMES[k as Locale] ?? k)}
          />
        </Panel>
        <Panel title={t('admin.charts.providers')}>
          <BarList caption={t('admin.charts.providers')} items={toPoints(data.providers, (k) => t(`admin.providers.${k}`, k))} />
        </Panel>
        <Panel title={t('admin.charts.themes')}>
          <BarList caption={t('admin.charts.themes')} total={opens} items={toPoints(data.themes, (k) => t(`settings.themes.${k}`, k))} />
        </Panel>
        <Panel title={t('admin.charts.appleStyle')}>
          <BarList
            caption={t('admin.charts.appleStyle')}
            total={opens}
            items={toPoints(data.apple_style, (k) => t(`admin.onOff.${k}`, k))}
          />
        </Panel>
        <Panel title={t('admin.charts.pages')}>
          <BarList
            caption={t('admin.charts.pages')}
            items={data.top_pages.map((page) => ({ label: page.path, value: page.count }))}
          />
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title={t('admin.charts.categories')} className="lg:col-span-2">
          <BarList caption={t('admin.charts.categories')} items={data.top_categories.map((c) => ({ label: c.name, value: c.count }))} />
        </Panel>
        <Panel title={t('admin.charts.actions')}>
          <BarList caption={t('admin.charts.actions')} items={toPoints(data.actions, (k) => t(`admin.actions.${k}`, k))} />
        </Panel>
      </div>

      <Panel title={t('admin.recentSignups')}>
        {data.recent_signups.length === 0 ? (
          <p className="text-sm text-subtle">—</p>
        ) : (
          <ul className="divide-y divide-line">
            {data.recent_signups.map((signup) => (
              <li key={signup.created_at} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                <span className="truncate font-medium">{signup.name}</span>
                <span className="flex shrink-0 items-center gap-2 text-muted">
                  <Badge>{t(`admin.providers.${signup.provider}`, signup.provider)}</Badge>
                  {relativeTime(signup.created_at, i18n.language)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <p className="text-xs text-subtle">
        {t('admin.footnote', { testers: data.testers, guests: data.guest_opens_7d })}
      </p>
    </div>
  )
}

function LoadingCard() {
  const { t } = useTranslation()
  return (
    <Card className="flex items-center gap-3 text-muted">
      <Loader2 className="size-4 animate-spin" />
      {t('common.loading')}
    </Card>
  )
}

// ---------- users ----------

function UsersTab({ viewerRole }: { viewerRole: Role }) {
  const { t, i18n } = useTranslation()
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState('')
  const [users, setUsers] = useState<AdminUser[]>([])
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadPage = useCallback(
    async (offset: number) => {
      setLoading(true)
      setError(null)
      try {
        const page = await admin.users(query, offset)
        setUsers((current) => (offset === 0 ? page : [...current, ...page]))
        setDone(page.length < 50)
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      } finally {
        setLoading(false)
      }
    },
    [query],
  )

  useEffect(() => {
    void loadPage(0)
  }, [loadPage])

  async function changeRole(user: AdminUser, role: Role) {
    if (!window.confirm(t('admin.users.confirmRole', { name: user.display_name, role: t(`admin.roles.${role}`) }))) return
    try {
      await admin.setRole(user.id, role)
      setUsers((current) =>
        current.map((u) => (u.id === user.id ? { ...u, role, hidden_from_stats: role === 'tester' } : u)),
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  // Only the owner touches admin and owner rights; the server enforces the same rule.
  const canEdit = (user: AdminUser) => viewerRole === 'owner' || ROLE_RANK[user.role] < ROLE_RANK.admin
  const allowedRoles = ROLES.filter((role) => viewerRole === 'owner' || ROLE_RANK[role] < ROLE_RANK.admin)

  return (
    <div className="flex flex-col gap-4">
      <form
        className="relative"
        onSubmit={(event) => {
          event.preventDefault()
          setQuery(search.trim())
        }}
      >
        <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-subtle" />
        <input
          type="search"
          className="input pl-10"
          placeholder={t('admin.users.search')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </form>
      {error && <ErrorBox message={error} />}

      <Card padding="p-0" className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="text-xs text-subtle">
            <tr className="border-b border-line">
              <th className="px-4 py-3 font-medium">{t('admin.users.person')}</th>
              <th className="px-4 py-3 font-medium">{t('admin.users.role')}</th>
              <th className="px-4 py-3 text-right font-medium">{t('admin.users.words')}</th>
              <th className="px-4 py-3 font-medium">Notion</th>
              <th className="px-4 py-3 font-medium">{t('admin.users.joined')}</th>
              <th className="px-4 py-3 font-medium">{t('admin.users.lastSeen')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {users.map((user) => (
              <tr key={user.id}>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2 font-medium">
                    {user.display_name}
                    {user.hidden_from_stats && <Badge tone="coin">{t('admin.users.hidden')}</Badge>}
                  </div>
                  <div className="text-xs text-muted">
                    {user.email ?? '—'} · {t(`admin.providers.${user.provider}`, user.provider)}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <select
                    className="input h-9 w-36 py-0"
                    value={user.role}
                    disabled={!canEdit(user)}
                    onChange={(e) => void changeRole(user, e.target.value as Role)}
                    aria-label={t('admin.users.role')}
                  >
                    {(canEdit(user) ? allowedRoles : ROLES).map((role) => (
                      <option key={role} value={role}>
                        {t(`admin.roles.${role}`)}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-4 py-3 text-right tabular-nums">{formatNumber(user.words)}</td>
                <td className="px-4 py-3">{user.notion_connected ? '✓' : '—'}</td>
                <td className="px-4 py-3 text-muted">{new Date(user.created_at).toLocaleDateString(i18n.language)}</td>
                <td className="px-4 py-3 text-muted">
                  {user.last_seen_at ? relativeTime(user.last_seen_at, i18n.language) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {users.length === 0 && !loading && <p className="p-6 text-center text-sm text-subtle">{t('admin.users.none')}</p>}
      </Card>

      {!done && users.length > 0 && (
        <button type="button" className="btn btn-secondary self-center" disabled={loading} onClick={() => loadPage(users.length)}>
          {loading && <Loader2 className="size-4 animate-spin" />}
          {t('admin.users.more')}
        </button>
      )}
    </div>
  )
}

// ---------- notion ----------

function NotionTab() {
  const { t, i18n } = useTranslation()
  const { data, error, loading, reload, loadedAt } = useLoad(admin.sources)
  const failing = (data ?? []).filter((source) => source.last_error)

  return (
    <div className="flex flex-col gap-4">
      <TabHeader loading={loading} loadedAt={loadedAt} onReload={reload} />
      {error && <ErrorBox message={error} />}
      {data && (
        <p className="text-sm text-muted">
          {t('admin.notion.summary', { n: data.length, failing: failing.length })}
        </p>
      )}
      <Card padding="p-0" className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="text-xs text-subtle">
            <tr className="border-b border-line">
              <th className="px-4 py-3 font-medium">{t('admin.notion.table')}</th>
              <th className="px-4 py-3 font-medium">{t('admin.notion.owner')}</th>
              <th className="px-4 py-3 text-right font-medium">{t('admin.notion.rows')}</th>
              <th className="px-4 py-3 font-medium">{t('admin.notion.synced')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {(data ?? []).map((source: AdminSource, index) => (
              <tr key={`${source.email}-${source.title}-${index}`}>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2 font-medium">
                    {source.title || t('notion.untitled')}
                    <Badge tone={source.kind === 'words' ? 'accent' : 'coin'}>{t(`notion.kinds.${source.kind}`)}</Badge>
                  </div>
                  {source.last_error && (
                    <div className="mt-1 flex items-start gap-1.5 text-xs text-danger">
                      <AlertTriangle className="mt-px size-3.5 shrink-0" />
                      {source.last_error}
                    </div>
                  )}
                </td>
                <td className="px-4 py-3 text-muted">{source.email ?? '—'}</td>
                <td className="px-4 py-3 text-right tabular-nums">{formatNumber(source.rows_count)}</td>
                <td className="px-4 py-3 text-muted">
                  {source.last_synced_at ? relativeTime(source.last_synced_at, i18n.language) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {data?.length === 0 && <p className="p-6 text-center text-sm text-subtle">{t('admin.notion.none')}</p>}
      </Card>
    </div>
  )
}

// ---------- system ----------

function SystemTab() {
  const { t } = useTranslation()
  const { data, error, loading, reload, loadedAt } = useLoad(admin.overview)

  return (
    <div className="flex flex-col gap-4">
      <TabHeader loading={loading} loadedAt={loadedAt} onReload={reload} />
      {error && <ErrorBox message={error} />}
      {data && (
        <>
          <Panel title={t('admin.system.limits')} hint={t('admin.system.limitsHint')}>
            <div className="flex flex-col gap-5">
              <Meter label={t('admin.system.database')} value={data.db_bytes} limit={FREE_LIMITS.dbBytes} format={formatBytes} />
              <Meter
                label={t('admin.system.mau')}
                value={data.mau}
                limit={FREE_LIMITS.mau}
                format={formatNumber}
              />
            </div>
          </Panel>
          <Panel title={t('admin.system.tables')} hint={t('admin.system.events', { count: data.events_30d })}>
            <BarList
              caption={t('admin.system.tables')}
              format={formatBytes}
              items={(data.tables ?? []).map((table) => ({
                label: `${table.name} · ${formatNumber(table.rows)}`,
                value: table.bytes,
              }))}
            />
          </Panel>
        </>
      )}
      <Panel title={t('admin.system.links')}>
        <div className="grid gap-2 sm:grid-cols-2">
          {LINKS.map((link) => (
            <a key={link.key} href={link.url} target="_blank" rel="noreferrer" className="btn btn-secondary justify-between">
              {t(`admin.system.link.${link.key}`)}
              <ExternalLink className="size-4 text-muted" />
            </a>
          ))}
        </div>
      </Panel>
    </div>
  )
}

// ---------- audit ----------

function AuditTab() {
  const { t, i18n } = useTranslation()
  const { data, error, loading, reload, loadedAt } = useLoad(admin.audit)

  return (
    <div className="flex flex-col gap-4">
      <TabHeader loading={loading} loadedAt={loadedAt} onReload={reload} />
      {error && <ErrorBox message={error} />}
      <Card padding="p-0">
        {(data ?? []).length === 0 ? (
          <p className="p-6 text-center text-sm text-subtle">{t('admin.audit.none')}</p>
        ) : (
          <ul className="divide-y divide-line">
            {(data ?? []).map((entry: AuditEntry, index) => (
              <li key={`${entry.created_at}-${index}`} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-3 text-sm sm:px-5">
                <span className="font-medium">{entry.actor ?? t('admin.audit.system')}</span>
                <span className="text-muted">{t(`admin.audit.actions.${entry.action}`, entry.action)}</span>
                <span className="font-medium">{entry.target ?? '—'}</span>
                {'from' in entry.details && (
                  <span className="text-muted">
                    {t(`admin.roles.${String(entry.details.from)}`, String(entry.details.from))} →{' '}
                    {t(`admin.roles.${String(entry.details.to)}`, String(entry.details.to))}
                  </span>
                )}
                <span className="ml-auto text-xs text-subtle">{relativeTime(entry.created_at, i18n.language)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}
