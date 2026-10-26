import { useTranslation } from 'react-i18next'
import { Crown, Volume2 } from 'lucide-react'
import type { ReactNode } from 'react'
import { cx } from '../lib/cx'
import { play, type Pack } from '../lib/sounds'
import type { Equipped, ShopItem } from '../stores/economy'
import type { Theme } from '../stores/settings'
import { Avatar } from './ui'

/** An emoji avatar from the shop on its own gradient, with the item's idle animation. */
function EmojiAvatar({ item, size }: { item: ShopItem; size: number }) {
  const { emoji, from = '#8b5cf6', to = '#22d3ee', motion } = item.data
  return (
    <span
      className="grid shrink-0 place-items-center overflow-hidden rounded-full"
      style={{ width: size, height: size, background: `linear-gradient(135deg, ${from}, ${to})` }}
      aria-hidden="true"
    >
      <span className={cx('inline-block leading-none', motion && `avatar-${motion}`)} style={{ fontSize: size * 0.56 }}>
        {emoji}
      </span>
    </span>
  )
}

/** The profile picture with whatever avatar and frame the person has equipped. */
export function UserAvatar({
  name,
  url,
  size = 40,
  avatar,
  frame,
}: {
  name: string
  url?: string | null
  size?: number
  avatar?: ShopItem
  frame?: ShopItem
}) {
  const ring = frame?.data.style ? Math.max(2, Math.round(size * 0.055)) : 0
  const inner = size - ring * 2
  const picture = avatar?.data.emoji ? <EmojiAvatar item={avatar} size={inner} /> : <Avatar name={name} url={url} size={inner} />
  if (!ring) return picture
  return (
    <span className={cx('frame shrink-0', `frame-${frame!.data.style}`)} style={{ width: size, height: size, padding: ring }}>
      {picture}
    </span>
  )
}

export function Banner({ banner, className, children }: { banner?: ShopItem; className?: string; children?: ReactNode }) {
  return <div className={cx(`banner-${banner?.data.style ?? 'default'}`, className)}>{children}</div>
}

/** A name in the equipped colour; "gradient" is an animated rainbow. */
export function DisplayName({ name, color, className }: { name: string; color?: ShopItem; className?: string }) {
  const value = color?.data.color
  if (value === 'gradient') return <span className={cx('name-gradient', className)}>{name}</span>
  return (
    <span className={className} style={value ? { color: value } : undefined}>
      {name}
    </span>
  )
}

export function TitleBadge({ title }: { title?: ShopItem }) {
  const { t } = useTranslation()
  if (!title) return null
  return (
    <span className={cx('inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold', `rarity-${title.rarity}`)}
      style={{ borderColor: 'color-mix(in oklab, var(--rarity) 40%, transparent)', color: 'var(--rarity)', background: 'color-mix(in oklab, var(--rarity) 12%, transparent)' }}
    >
      <Crown className="size-3" strokeWidth={2.4} />
      {t(`shop.items.${title.id}`)}
    </span>
  )
}

/** A tiny mock screen drawn with the given theme's own colours. */
export function ThemePreview({ theme, className }: { theme: Theme; className?: string }) {
  return (
    <div data-theme={theme} className={cx('relative isolate overflow-hidden bg-bg p-3', className)}>
      <div className="aurora absolute" />
      <div className="glass flex h-full flex-col gap-1.5 rounded-[var(--radius-md)] p-2">
        <div className="h-1.5 w-1/2 rounded-full bg-fg/80" />
        <div className="h-1.5 w-3/4 rounded-full bg-muted/50" />
        <div className="bg-gradient-accent mt-auto h-3.5 w-2/5 rounded-full" />
      </div>
    </div>
  )
}

const BOOST_ICONS: Record<string, string> = { streak_freeze: '🧊', double_xp: '⚡' }

/** What a shop item looks like on its own, as drawn on the item's card. */
export function ItemPreview({ item, name, url, equipped }: { item: ShopItem; name: string; url?: string | null; equipped: Equipped }) {
  const { t } = useTranslation()
  switch (item.kind) {
    case 'avatar':
      return <UserAvatar name={name} size={76} avatar={item} frame={equipped.frame} />
    case 'frame':
      return <UserAvatar name={name} url={url} size={76} avatar={equipped.avatar} frame={item} />
    case 'banner':
      return <Banner banner={item} className="absolute inset-0" />
    case 'theme':
      return <ThemePreview theme={item.data.theme as Theme} className="absolute inset-0" />
    case 'title':
      return <TitleBadge title={item} />
    case 'card_back':
      return (
        <div className={cx('glass grid h-20 w-32 place-items-center rounded-control font-display font-semibold', `card-back-${item.data.style}`)}>
          Hello
        </div>
      )
    case 'sound':
      return (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation()
            const pack = item.data.pack as Pack
            play('correct', pack)
            setTimeout(() => play('level', pack), 450)
          }}
          className="bg-gradient-accent pointer-events-auto relative grid size-16 place-items-center rounded-full text-on-accent shadow-[var(--shadow-accent)] transition-transform hover:scale-105"
          aria-label={t('shop.listen')}
        >
          <Volume2 className="size-7" />
        </button>
      )
    case 'name_color':
      return <DisplayName name={name} color={item} className="font-display text-2xl font-semibold" />
    case 'boost':
      return <span className="text-5xl drop-shadow-[0_6px_18px_rgb(0_0_0/0.35)]">{BOOST_ICONS[item.id] ?? '✨'}</span>
  }
}
