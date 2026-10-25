# Security

## Reporting a vulnerability

Please don't open a public issue. Use GitHub's private reporting instead:
**Security → Report a vulnerability** on this repository. You'll get a reply within a few days.

## How the app is protected

The code is public, so the app assumes anyone can read it and call the API directly.

- **No secrets in the repository.** The browser only ever sees the Supabase URL and the
  publishable key, which are public by design. Server keys live in Supabase and Vercel settings.
- **Row Level Security on every table.** A signed-in user can read and change only what the
  policies allow. Users can edit their cosmetic profile fields; role, XP and coins are
  server-managed and protected by column-level grants.
- **Rewards and moderation run on the server.** XP, coins, purchases, duels, mutes and bans
  are never trusted from the client.
- **Policy helpers aren't exposed.** Functions used by policies live in a `private` schema
  that the REST API doesn't serve.
- **Admin functions check the role first.** `admin_*` functions run as SECURITY DEFINER (they
  need `auth.users`) and are callable by signed-in users, so the Supabase advisor lists them;
  each starts with `private.require_role('admin')`, and only the owner can grant admin rights.
  Every role change is written to `admin_audit_log`.
- **Server-only tables have no policies on purpose.** `notion_oauth_states` and
  `admin_audit_log` are reachable only with the service role or through the admin functions.
- **Analytics are first-party and minimal.** Events hold a name, a page, platform, language and
  theme; guests carry no identifier, no IP is stored, inserts are rate-limited by a trigger and
  rows are purged after 90 days by `pg_cron`. Nobody can read events back except through
  `admin_overview()`.
- **The answer log can't be rewritten.** `review_log` is insert-only for users and capped at
  120 answers a minute, so future XP and coin rewards can be computed from it on the server.
  Progress rows and log entries may only point at the user's own words and rules.
- **Strict Content-Security-Policy** on the website and in the desktop app.
- **Automated checks:** secretlint locally and gitleaks in CI scan for leaked credentials,
  `npm audit` and Dependabot watch dependencies.

## Before every push

1. `npm run lint:secrets`: no credentials in the tree
2. `npm audit`: no known vulnerable dependencies
3. Supabase security advisor: no warnings
4. Review new code for XSS, reward forgery, mute/ban bypass and token leaks
