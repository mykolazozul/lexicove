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
  are never trusted from the client. A trigger on `review_log` grants XP and Coins (with daily
  caps), counts streaks, quests and achievements; users can read their economy tables but not
  write them. The shop, quests, chest, boosts and streak freezes are SECURITY DEFINER functions
  (`buy_item`, `equip_item`, `claim_quest`, `open_daily_chest`, `use_boost`,
  `apply_streak_freeze`, `ensure_quests`) that act only on `auth.uid()` and lock the balance row
  before spending, so the advisor lists them on purpose.
- **The community is checked on the server too.** Messages are posted only through
  `send_message`, which checks bans and mutes, flood limits, duplicates, links from new accounts,
  that direct messages go between friends, and masks swear words before saving. Users read only
  public rooms and their own direct messages; moderators see a direct message only once it is
  reported. Mutes, bans, deletions and room changes go through `mod_*` functions that check the
  moderator's rank against the target's and are written to `admin_audit_log`. Other people's
  coins, time zone and goal are hidden by column grants; the owner reads them via `my_profile()`.
  Chat text is rendered as plain text, and only `http(s)` links become clickable.
- **Only the owner posts photos.** The `chat-images` bucket accepts uploads only from the owner
  role and only into their own folder (Storage policies), files are capped at 5 MB and four
  image types, and the bucket can't be listed. `send_message` accepts an image only from the
  owner and only as a URL inside that folder of this project's bucket.
- **Names are checked on the server.** A trigger on `profiles` rejects display names and
  usernames with swear words (including look-alike letters) or reserved words such as "admin"
  and "Lexicove", and limits changes to once in 7 days for a display name and once in 30 days for
  a username. The verified badge is a server-managed column that only the owner can set through
  `admin_set_verified`, which is audited.
- **Sign-up is confirmed with a one-time code** from the email, entered on the same page; the
  code expires after an hour.
- **Password resets use a one-time code too.** The page answers the same way whether or not an
  account exists, so nobody can probe addresses, and saving the new password signs the account
  out on every other device.
- **Push reminders keep their keys on the server.** The VAPID key pair and the cron token live in
  Vault and are read only by the `push` function with the service role. Subscriptions are accepted
  only for the browsers' own push services, so the function never posts anywhere else.
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
3. Supabase security advisor: no warnings beyond the intentional definer functions listed above
4. Review new code for XSS, reward forgery, mute/ban bypass and token leaks
