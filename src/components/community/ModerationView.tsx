import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Ban, Check, RefreshCw, Trash2, VolumeX } from 'lucide-react'
import { Badge, Card, SectionTitle, Select, Switch } from '../ui'
import { errorText, reasonText, UserCardModal, UserLine } from './People'
import { community, type ChatRoom, type Report, type Sanction } from '../../lib/community'
import { formatDateTime } from '../../lib/time'
import { toast } from '../../stores/toast'

const SLOW_MODES = [0, 10, 30, 60, 300] as const

/** The report queue, active mutes and bans, and room settings. For moderators and up. */
export function ModerationView() {
  const { t, i18n } = useTranslation()
  const [reports, setReports] = useState<Report[] | null>(null)
  const [sanctions, setSanctions] = useState<Sanction[]>([])
  const [rooms, setRooms] = useState<ChatRoom[]>([])
  const [busy, setBusy] = useState(false)
  const [card, setCard] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const [queue, active, list] = await Promise.all([community.modReports(), community.modSanctions(), community.rooms()])
      setReports(queue)
      setSanctions(active)
      setRooms(list)
    } catch (error) {
      toast(errorText(t, error), 'error')
    }
  }, [t])

  useEffect(() => {
    void load()
  }, [load])

  async function act(action: () => Promise<unknown>, done: string) {
    setBusy(true)
    try {
      await action()
      toast(done, 'ok')
      await load()
    } catch (error) {
      toast(errorText(t, error), 'error')
    } finally {
      setBusy(false)
    }
  }

  const when = (iso: string) => formatDateTime(iso, i18n.language)

  return (
    <div className="flex flex-col gap-6">
      <section>
        <SectionTitle
          action={
            <button type="button" className="btn btn-ghost h-8 px-2 text-xs" onClick={() => void load()} disabled={busy}>
              <RefreshCw className="size-3.5" />
              {t('admin.refresh')}
            </button>
          }
        >
          {t('community.mod.queue', { count: reports?.length ?? 0 })}
        </SectionTitle>
        {reports === null ? (
          <div className="h-32 animate-pulse rounded-card bg-surface" />
        ) : reports.length === 0 ? (
          <Card className="py-10 text-center text-sm text-muted">{t('community.mod.queueEmpty')}</Card>
        ) : (
          <div className="flex flex-col gap-3">
            {reports.map((report) => (
              <Card key={report.message_id} padding="p-4" className="flex flex-col gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <UserLine user={report.author} size={32} onClick={() => setCard(report.author.id)} subtitle={`#${t(`community.rooms.${report.room}.title`, { defaultValue: report.room })} · ${when(report.created_at)}`} />
                  <Badge tone="fire">{t('community.mod.reports', { count: report.reports })}</Badge>
                  {report.hidden && <Badge tone="coin">{t('community.mod.autoHidden')}</Badge>}
                </div>
                <blockquote className="rounded-control border border-line bg-surface px-4 py-3 text-sm break-words whitespace-pre-wrap">{report.body}</blockquote>
                <div className="flex flex-wrap gap-1.5">
                  {report.reasons.map((reason) => (
                    <Badge key={reason}>{t(`community.report.reasons.${reason}`)}</Badge>
                  ))}
                  {report.notes.map((note, index) => (
                    <span key={index} className="text-xs text-muted italic">“{note}”</span>
                  ))}
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" className="btn btn-secondary h-9 px-3 text-sm" disabled={busy} onClick={() => act(() => community.modDismiss(report.message_id), t('community.mod.done.dismissed'))}>
                    <Check className="size-4" />
                    {t('community.mod.dismiss')}
                  </button>
                  <button type="button" className="btn btn-ghost h-9 border border-danger/40 px-3 text-sm text-danger" disabled={busy} onClick={() => act(() => community.modDelete(report.message_id, report.reasons.join(', ')), t('community.mod.done.deleted'))}>
                    <Trash2 className="size-4" />
                    {t('community.mod.delete')}
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost h-9 border border-danger/40 px-3 text-sm text-danger"
                    disabled={busy}
                    onClick={() =>
                      act(async () => {
                        await community.modDelete(report.message_id, report.reasons.join(', '))
                        await community.modSanction(report.author.id, 'mute', 60, report.reasons.join(', '))
                      }, t('community.mod.done.mute'))
                    }
                  >
                    <VolumeX className="size-4" />
                    {t('community.mod.deleteAndMute')}
                  </button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>

      <section>
        <SectionTitle>{t('community.mod.active', { count: sanctions.length })}</SectionTitle>
        {sanctions.length === 0 ? (
          <Card className="py-8 text-center text-sm text-muted">{t('community.mod.activeEmpty')}</Card>
        ) : (
          <Card padding="p-0" className="divide-y divide-line overflow-hidden">
            {sanctions.map((sanction) => (
              <div key={sanction.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                {sanction.user && <UserLine user={sanction.user} size={32} onClick={() => setCard(sanction.user!.id)} subtitle={reasonText(t, sanction.reason)} />}
                <Badge tone={sanction.kind === 'ban' ? 'fire' : 'coin'}>
                  {sanction.kind === 'ban' ? <Ban className="size-3" /> : <VolumeX className="size-3" />}
                  {t(`community.mod.kinds.${sanction.kind}`)}
                </Badge>
                <span className="text-xs text-muted">
                  {sanction.until ? t('community.mod.until', { date: when(sanction.until) }) : t('community.chat.forever')}
                  {sanction.by ? ` · ${sanction.by}` : ` · ${t('community.mod.auto')}`}
                </span>
                <button type="button" className="ml-auto text-xs font-semibold text-accent" disabled={busy} onClick={() => act(() => community.modRevoke(sanction.id), t('community.mod.done.revoked'))}>
                  {t('community.mod.revoke')}
                </button>
              </div>
            ))}
          </Card>
        )}
      </section>

      <section>
        <SectionTitle>{t('community.mod.rooms')}</SectionTitle>
        <Card padding="p-0" className="divide-y divide-line overflow-hidden">
          {rooms.map((room) => (
            <div key={room.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <span className="text-xl">{room.icon}</span>
              <span className="min-w-0 flex-1 font-medium">{t(`community.rooms.${room.id}.title`, { defaultValue: room.id })}</span>
              <span className="flex items-center gap-2 text-xs text-muted">
                {t('community.chat.slowMode')}
                <Select
                  label={t('community.chat.slowMode')}
                  className="h-9 w-32 text-sm"
                  value={room.slow_mode_seconds}
                  disabled={busy}
                  onChange={(seconds) => act(() => community.modRoom(room.id, seconds, room.closed), t('community.mod.done.room'))}
                  options={SLOW_MODES.map((seconds) => ({
                    value: seconds,
                    label: seconds === 0 ? t('community.mod.off') : `${seconds} ${t('community.chat.secondsShort')}`,
                  }))}
                />
              </span>
              <label className="flex items-center gap-2 text-xs text-muted">
                {t('community.mod.close')}
                <Switch checked={room.closed} label={t('community.mod.close')} onChange={(closed) => act(() => community.modRoom(room.id, room.slow_mode_seconds, closed), t('community.mod.done.room'))} />
              </label>
            </div>
          ))}
        </Card>
      </section>

      <UserCardModal userId={card} onClose={() => setCard(null)} />
    </div>
  )
}
