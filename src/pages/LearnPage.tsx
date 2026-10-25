import { useEffect, useMemo } from 'react'
import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'
import { ArrowRight, BookOpen, Flame, Lock } from 'lucide-react'
import { MODES } from '../app/modes'
import { GuestNotice } from '../components/GuestNotice'
import { Card, IconChip, ProgressRing, Reveal } from '../components/ui'
import { cx } from '../lib/cx'
import { canRecognize, canSpeak } from '../lib/speech'
import { modesFor, type Mode } from '../lib/study'
import { useViewer } from '../lib/viewer'
import { useLibrary } from '../stores/library'
import { useSettings } from '../stores/settings'
import { useStudy } from '../stores/study'

export function LearnPage() {
  const { t } = useTranslation()
  const viewer = useViewer()
  const { loaded, load, words, rules } = useLibrary()
  const { progress, progressLoaded, loadProgress, summary, streak, refreshSummary } = useStudy()
  const dailyGoal = useSettings((s) => s.dailyGoal)

  useEffect(() => {
    if (viewer.isGuest) return
    if (!loaded) void load()
    if (!progressLoaded) void loadProgress().catch(() => {})
    void refreshSummary()
  }, [viewer.isGuest, loaded, load, progressLoaded, loadProgress, refreshSummary])

  const stats = useMemo(() => {
    const now = new Date()
    const categories = new Set(words.map((w) => w.category).filter(Boolean)).size
    const abilities = { speech: canSpeak, recognition: canRecognize, categories }
    const counts = new Map<Mode, number>()
    let due = 0
    let fresh = 0
    for (const word of words) {
      const row = progress.get(word.id)
      if (!row) fresh++
      else if (new Date(row.due) <= now) due++
      for (const mode of modesFor(word, abilities)) counts.set(mode, (counts.get(mode) ?? 0) + 1)
    }
    counts.set('mix', words.length)
    counts.set('rules', rules.filter((r) => r.explanation.trim()).length >= 4 ? rules.length : 0)
    return { due, fresh, counts }
  }, [words, rules, progress])

  if (viewer.isGuest) return <GuestNotice title={t('learn.guestTitle')} text={t('learn.guestText')} />

  if (loaded && words.length === 0) {
    return (
      <Card glow className="mx-auto mt-4 flex max-w-xl flex-col items-center gap-3 py-10 text-center">
        <BookOpen className="size-10 text-accent" strokeWidth={1.8} />
        <h2 className="font-display text-xl font-semibold">{t('learn.noWords')}</h2>
        <p className="max-w-sm text-muted">{t('learn.noWordsText')}</p>
        <Link to="/words" className="btn btn-primary mt-2">
          {t('nav.words')}
        </Link>
      </Card>
    )
  }

  const today = summary?.today ?? 0

  return (
    <div className="flex flex-col gap-6">
      <Reveal>
        <Card glow className="overflow-hidden">
          <div className="bg-gradient-accent pointer-events-none absolute -top-24 -right-24 -z-10 size-72 rounded-full opacity-25 blur-3xl" />
          <div className="flex flex-col items-center gap-6 sm:flex-row">
            <ProgressRing value={today} max={dailyGoal}>
              <div>
                <div className="font-display text-3xl font-semibold">{today}</div>
                <div className="text-xs text-muted">{t('home.goal.progress', { goal: dailyGoal })}</div>
              </div>
            </ProgressRing>
            <div className="flex-1 text-center sm:text-left">
              <h2 className="font-display text-xl font-semibold">{t('learn.lesson.title')}</h2>
              <p className="mt-1 text-muted">{t('learn.lesson.text', { due: stats.due, fresh: Math.min(stats.fresh, 5) })}</p>
              <div className="mt-4 flex flex-wrap items-center justify-center gap-3 sm:justify-start">
                <Link to="/learn/mix" className="btn btn-primary">
                  {t('learn.lesson.start')}
                  <ArrowRight className="size-4" />
                </Link>
                <span className="inline-flex items-center gap-1.5 text-sm text-muted">
                  <Flame className="size-4 text-fire" />
                  {t('common.days', { count: streak })}
                </span>
              </div>
            </div>
          </div>
        </Card>
      </Reveal>

      <Reveal delay={0.05} className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Mini label={t('learn.stats.due')} value={stats.due} />
        <Mini label={t('learn.stats.new')} value={stats.fresh} />
        <Mini label={t('learn.stats.learned')} value={summary?.learned ?? 0} />
        <Mini
          label={t('learn.stats.accuracy')}
          value={
            summary && summary.accuracy_30d.total > 0
              ? `${Math.round((summary.accuracy_30d.correct / summary.accuracy_30d.total) * 100)}%`
              : '—'
          }
        />
      </Reveal>

      <Reveal delay={0.1}>
        <h2 className="mb-3 font-display text-sm font-semibold tracking-wide text-muted uppercase">{t('learn.modesTitle')}</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {MODES.filter((m) => m.mode !== 'mix').map(({ mode, icon: Icon, tone }) => {
            const count = stats.counts.get(mode) ?? 0
            const locked = count === 0
            const reason = locked ? t(`learn.locked.${lockReason(mode)}`) : t('learn.available', { count })
            const content = (
              <>
                <IconChip tone={tone}>
                  <Icon className="size-5" />
                </IconChip>
                <div className="min-w-0 flex-1">
                  <div className="font-semibold">{t(`learn.modes.${mode}.title`)}</div>
                  <div className="mt-0.5 text-sm text-muted">{t(`learn.modes.${mode}.text`)}</div>
                  <div className={cx('mt-2 flex items-center gap-1 text-xs', locked ? 'text-subtle' : 'text-accent')}>
                    {locked && <Lock className="size-3" />}
                    {reason}
                  </div>
                </div>
              </>
            )
            return locked ? (
              <div key={mode} className="glass flex gap-4 rounded-card p-4 opacity-60" aria-disabled="true">
                {content}
              </div>
            ) : (
              <Link key={mode} to={`/learn/${mode}`} className="glass spotlight flex gap-4 rounded-card p-4 transition-transform hover:-translate-y-0.5">
                {content}
              </Link>
            )
          })}
        </div>
      </Reveal>
    </div>
  )
}

function lockReason(mode: Mode): string {
  switch (mode) {
    case 'cloze':
    case 'builder':
      return 'examples'
    case 'listening':
    case 'dictation':
      return 'speech'
    case 'speaking':
      return 'microphone'
    case 'sorting':
      return 'categories'
    case 'rules':
      return 'rules'
    default:
      return 'words'
  }
}

function Mini({ label, value }: { label: string; value: number | string }) {
  return (
    <Card padding="p-4">
      <div className="font-display text-2xl font-semibold">{value}</div>
      <div className="mt-0.5 text-sm text-muted">{label}</div>
    </Card>
  )
}
