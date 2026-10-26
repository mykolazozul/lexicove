import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import { Check, Coins, Lock, Sparkles } from 'lucide-react'
import { Banner, DisplayName, ItemPreview, TitleBadge, UserAvatar } from '../components/cosmetics'
import { Modal } from '../components/Modal'
import { Card, Reveal } from '../components/ui'
import { useSound } from '../lib/cosmetics'
import { cx } from '../lib/cx'
import { useViewer } from '../lib/viewer'
import { EconomyError, useEconomy, useEquipped, type Equipped, type ItemKind, type ShopItem } from '../stores/economy'
import { useProfile, type Slot } from '../stores/profile'
import { useSettings, type Theme } from '../stores/settings'
import { toast } from '../stores/toast'

const KINDS: ItemKind[] = ['avatar', 'frame', 'banner', 'theme', 'title', 'name_color', 'card_back', 'sound', 'boost']
type Filter = 'all' | 'owned' | ItemKind

const SLOT_OF: Partial<Record<ItemKind, keyof Equipped>> = {
  avatar: 'avatar',
  frame: 'frame',
  banner: 'banner',
  title: 'title',
  card_back: 'cardBack',
  sound: 'sound',
  name_color: 'nameColor',
}

/** What the main button on an item does right now. */
type Action =
  | { type: 'guest' }
  | { type: 'locked'; achievement: string }
  | { type: 'claim' }
  | { type: 'buy'; affordable: boolean }
  | { type: 'equip' }
  | { type: 'unequip' }
  | { type: 'apply' }
  | { type: 'active' }

export function ShopPage() {
  const { t } = useTranslation()
  const viewer = useViewer()
  const navigate = useNavigate()
  const sound = useSound()
  const equipped = useEquipped()
  const profileEquipped = useProfile((s) => s.profile?.equipped)
  const { items, inventory, unlocked, catalogLoaded, buy, equip, startBoost } = useEconomy()
  const theme = useSettings((s) => s.theme)
  const setTheme = useSettings((s) => s.setTheme)

  const [filter, setFilter] = useState<Filter>('all')
  const [busy, setBusy] = useState<string | null>(null)
  const [trying, setTrying] = useState<ShopItem | null>(null)

  const visible = useMemo(
    () =>
      items.filter((item) =>
        filter === 'all' ? true : filter === 'owned' ? inventory.has(item.id) : item.kind === filter,
      ),
    [items, inventory, filter],
  )

  function actionFor(item: ShopItem): Action {
    if (viewer.isGuest) return { type: 'guest' }
    if (!item.consumable && inventory.has(item.id)) {
      if (item.kind === 'theme') return theme === item.data.theme ? { type: 'active' } : { type: 'apply' }
      return profileEquipped?.[item.kind as Slot] === item.id ? { type: 'unequip' } : { type: 'equip' }
    }
    if (item.requires_achievement && !unlocked.has(item.requires_achievement)) {
      return { type: 'locked', achievement: item.requires_achievement }
    }
    if (item.price === 0) return { type: 'claim' }
    return { type: 'buy', affordable: viewer.coins >= item.price }
  }

  async function run(item: ShopItem, action: Action) {
    if (action.type === 'guest') return navigate('/welcome')
    if (action.type === 'locked' || action.type === 'active') return
    const name = t(`shop.items.${item.id}`)
    setBusy(item.id)
    try {
      if (action.type === 'buy' || action.type === 'claim') {
        await buy(item.id)
        sound('coin')
        // A new look goes on straight away; boosts wait in the inventory.
        if (item.kind === 'theme') setTheme(item.data.theme as Theme)
        else if (SLOT_OF[item.kind]) await equip(item.kind as Slot, item.id)
        toast(t(item.consumable ? 'shop.bought' : 'shop.boughtAndOn', { name }), 'reward', '🛍️')
      } else if (action.type === 'apply') {
        setTheme(item.data.theme as Theme)
      } else if (action.type === 'equip') {
        await equip(item.kind as Slot, item.id)
      } else if (action.type === 'unequip') {
        await equip(item.kind as Slot, null)
      }
    } catch (error) {
      const code = error instanceof EconomyError ? error.code : 'unknown'
      toast(t(`shop.errors.${code}`, { defaultValue: t('shop.errors.unknown') }), 'error')
    } finally {
      setBusy(null)
    }
  }

  async function boost() {
    setBusy('double_xp')
    try {
      await startBoost()
      sound('level')
      toast(t('shop.boostStarted'), 'reward', '⚡')
    } catch {
      toast(t('shop.errors.no_boost_left'), 'error')
    } finally {
      setBusy(null)
    }
  }

  const filters: Filter[] = ['all', ...(viewer.isGuest ? [] : (['owned'] as const)), ...KINDS]

  return (
    <div className="flex flex-col gap-6">
      <Reveal>
        <Card glow className="overflow-hidden">
          <div className="pointer-events-none absolute -top-24 -right-16 -z-10 size-72 rounded-full bg-coin/20 blur-3xl" />
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-display text-2xl font-semibold tracking-tight">{t('shop.title')}</h2>
              <p className="mt-1.5 max-w-xl text-muted">{t('shop.subtitle')}</p>
            </div>
            <div className="flex items-center gap-3 rounded-card border border-coin/25 bg-coin/10 px-5 py-3">
              <Coins className="size-7 text-coin" strokeWidth={2.2} />
              <div>
                <div className="font-display text-2xl font-semibold tabular-nums">{viewer.coins.toLocaleString()}</div>
                <div className="text-xs text-muted">{t('shop.balance')}</div>
              </div>
            </div>
          </div>
          <ul className="mt-5 flex flex-wrap gap-2 text-xs">
            {(t('shop.earn', { returnObjects: true }) as string[]).map((line) => (
              <li key={line} className="rounded-full border border-line bg-surface px-3 py-1.5 text-muted">
                {line}
              </li>
            ))}
          </ul>
        </Card>
      </Reveal>

      <Reveal delay={0.05}>
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0" role="tablist">
          {filters.map((value) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={filter === value}
              onClick={() => setFilter(value)}
              className={cx(
                'shrink-0 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors',
                filter === value ? 'border-accent bg-accent/12 text-fg' : 'border-line text-muted hover:text-fg',
              )}
            >
              {t(`shop.kinds.${value}`)}
            </button>
          ))}
        </div>
      </Reveal>

      {!catalogLoaded ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="h-60 animate-pulse rounded-card bg-surface" />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <Card className="py-12 text-center text-muted">{t('shop.empty')}</Card>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
          {visible.map((item, index) => (
            <li key={item.id}>
              <Reveal delay={Math.min(index, 12) * 0.02} className="h-full">
                <ItemCard
                  item={item}
                  action={actionFor(item)}
                  quantity={item.consumable ? (inventory.get(item.id) ?? 0) : undefined}
                  busy={busy === item.id}
                  equipped={equipped}
                  onTry={() => setTrying(item)}
                  onAction={(action) => void run(item, action)}
                  onBoost={item.id === 'double_xp' && (inventory.get(item.id) ?? 0) > 0 ? () => void boost() : undefined}
                />
              </Reveal>
            </li>
          ))}
        </ul>
      )}

      <TryOn
        item={trying}
        equipped={equipped}
        action={trying ? actionFor(trying) : null}
        busy={busy === trying?.id}
        onClose={() => setTrying(null)}
        onAction={(action) => trying && void run(trying, action)}
      />
    </div>
  )
}

function ItemCard({
  item,
  action,
  quantity,
  busy,
  equipped,
  onTry,
  onAction,
  onBoost,
}: {
  item: ShopItem
  action: Action
  quantity?: number
  busy: boolean
  equipped: Equipped
  onTry: () => void
  onAction: (action: Action) => void
  onBoost?: () => void
}) {
  const { t } = useTranslation()
  const viewer = useViewer()
  const owned = ['equip', 'unequip', 'apply', 'active'].includes(action.type)

  return (
    <Card padding="p-0" className={cx('flex h-full flex-col overflow-hidden', `rarity-${item.rarity}`)}>
      {/* The whole preview opens the try-on; the preview itself lets clicks through, except the sound button. */}
      <div
        className="relative grid h-32 place-items-center overflow-hidden border-b border-line sm:h-36"
        style={{ background: 'radial-gradient(circle at 50% 130%, color-mix(in oklab, var(--rarity) 26%, transparent), transparent 70%)' }}
      >
        <button
          type="button"
          onClick={onTry}
          aria-label={t('shop.tryOn', { name: t(`shop.items.${item.id}`) })}
          className="absolute inset-0 cursor-zoom-in"
        />
        <div className="pointer-events-none contents">
          <ItemPreview item={item} name={viewer.name} url={viewer.avatarUrl} equipped={equipped} />
          <span
            className="absolute top-2 left-2 rounded-full px-2 py-0.5 text-[0.65rem] font-bold tracking-wide uppercase backdrop-blur"
            style={{ color: 'var(--rarity)', background: 'color-mix(in oklab, var(--bg) 70%, transparent)' }}
          >
            {t(`shop.rarity.${item.rarity}`)}
          </span>
          {owned && (
            <span className="absolute top-2 right-2 grid size-6 place-items-center rounded-full bg-success text-bg">
              <Check className="size-3.5" strokeWidth={3.5} />
            </span>
          )}
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-3 p-3.5 sm:p-4">
        <div className="min-w-0">
          <div className="truncate font-semibold">{t(`shop.items.${item.id}`)}</div>
          <div className="truncate text-xs text-muted">
            {quantity !== undefined ? t('shop.inStock', { count: quantity }) : t(`shop.kinds.${item.kind}`)}
          </div>
        </div>
        <div className="mt-auto flex flex-col gap-2">
          <ActionButton action={action} price={item.price} busy={busy} onClick={() => onAction(action)} />
          {onBoost && (
            <button type="button" className="btn btn-secondary h-9 text-sm" disabled={busy} onClick={onBoost}>
              <Sparkles className="size-4 text-xp" />
              {t('shop.useBoost')}
            </button>
          )}
        </div>
      </div>
    </Card>
  )
}

function ActionButton({ action, price, busy, onClick }: { action: Action; price: number; busy: boolean; onClick: () => void }) {
  const { t } = useTranslation()
  const achievement = action.type === 'locked' ? t(`achievements.items.${action.achievement}.title`) : ''

  const base = 'btn h-9 w-full px-3 text-sm'
  switch (action.type) {
    case 'guest':
      return <button type="button" className={cx(base, 'btn-secondary')} onClick={onClick}>{t('shop.signIn')}</button>
    case 'locked':
      return (
        <span className={cx(base, 'cursor-default border border-dashed border-line text-subtle')} title={t('shop.lockedHint', { achievement })}>
          <Lock className="size-3.5 shrink-0" />
          <span className="truncate">{achievement}</span>
        </span>
      )
    case 'claim':
      return <button type="button" className={cx(base, 'btn-primary')} disabled={busy} onClick={onClick}>{t('shop.claim')}</button>
    case 'buy':
      return (
        <button type="button" className={cx(base, 'btn-primary')} disabled={busy || !action.affordable} onClick={onClick} title={action.affordable ? undefined : t('shop.errors.not_enough_coins')}>
          <Coins className="size-4" strokeWidth={2.4} />
          <span className="tabular-nums">{price.toLocaleString()}</span>
        </button>
      )
    case 'equip':
      return <button type="button" className={cx(base, 'btn-secondary')} disabled={busy} onClick={onClick}>{t('shop.equip')}</button>
    case 'unequip':
      return <button type="button" className={cx(base, 'btn-ghost border border-success/40 text-success')} disabled={busy} onClick={onClick}><Check className="size-4" />{t('shop.equipped')}</button>
    case 'apply':
      return <button type="button" className={cx(base, 'btn-secondary')} disabled={busy} onClick={onClick}>{t('shop.apply')}</button>
    case 'active':
      return <span className={cx(base, 'cursor-default border border-success/40 text-success')}><Check className="size-4" />{t('shop.active')}</span>
  }
}

/** A profile card with the item put on, before buying it. */
function TryOn({
  item,
  equipped,
  action,
  busy,
  onClose,
  onAction,
}: {
  item: ShopItem | null
  equipped: Equipped
  action: Action | null
  busy: boolean
  onClose: () => void
  onAction: (action: Action) => void
}) {
  const { t } = useTranslation()
  const viewer = useViewer()
  const look: Equipped = { ...equipped }
  const slot = item ? SLOT_OF[item.kind] : undefined
  if (item && slot) look[slot] = item

  return (
    <Modal
      open={item !== null}
      onClose={onClose}
      title={item ? t(`shop.items.${item.id}`) : ''}
      footer={
        item && action ? (
          <>
            <button type="button" className="btn btn-ghost" onClick={onClose}>{t('common.close')}</button>
            <div className="w-44"><ActionButton action={action} price={item.price} busy={busy} onClick={() => onAction(action)} /></div>
          </>
        ) : null
      }
    >
      {item && (
        <div className="flex flex-col gap-4">
          <div data-theme={item.kind === 'theme' ? item.data.theme : undefined} className="overflow-hidden rounded-card bg-bg">
            <div className="glass overflow-hidden rounded-card">
              <Banner banner={look.banner} className="h-24" />
              <div className="relative z-10 -mt-10 flex items-end gap-3 px-4 pb-4">
                <span className="rounded-full bg-elevated p-1">
                  <UserAvatar name={viewer.name} url={viewer.avatarUrl} size={76} avatar={look.avatar} frame={look.frame} />
                </span>
                <div className="min-w-0 pb-1">
                  <DisplayName name={viewer.name} color={look.nameColor} className="block truncate font-display text-lg font-semibold" />
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted">
                    <TitleBadge title={look.title} />
                    <span>{t('common.level', { level: viewer.level })}</span>
                  </div>
                </div>
              </div>
              {(item.kind === 'card_back' || item.kind === 'theme') && (
                <div className={cx('mx-4 mb-4 grid h-28 place-items-center rounded-control border border-line', item.kind === 'card_back' && `card-back-${item.data.style}`)}>
                  <div className="text-center">
                    <div className="font-display text-2xl font-semibold">serendipity</div>
                    <div className="text-sm text-muted">{t('shop.sampleTranslation')}</div>
                  </div>
                </div>
              )}
            </div>
          </div>
          {(item.kind === 'sound' || item.kind === 'boost') && (
            <div className="grid place-items-center py-2">
              <ItemPreview item={item} name={viewer.name} url={viewer.avatarUrl} equipped={equipped} />
            </div>
          )}
          <p className="text-sm text-muted">{t(`shop.describe.${item.kind}`)}</p>
        </div>
      )}
    </Modal>
  )
}
