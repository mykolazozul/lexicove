import { siDiscord, siGithub, siGoogle, siNotion } from 'simple-icons'
import type { OAuthProvider } from '../stores/auth'

const ICONS = {
  google: siGoogle,
  github: siGithub,
  discord: siDiscord,
  notion: siNotion,
} satisfies Record<OAuthProvider, { title: string; path: string }>

export function providerName(provider: OAuthProvider): string {
  return ICONS[provider].title
}

export function BrandIcon({ provider, className }: { provider: OAuthProvider; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" fill="currentColor">
      <path d={ICONS[provider].path} />
    </svg>
  )
}
