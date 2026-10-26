# Setup

How to run your own copy of Lexicove: database, sign-in, website and desktop app.
Everything here fits in free tiers.

## 1. Supabase project

1. Create a project at [supabase.com](https://supabase.com) (free plan).
2. Apply the SQL files in [`supabase/migrations`](../supabase/migrations) in order, either with
   the Supabase CLI (`supabase db push`) or by pasting them into the SQL editor.
3. Copy **Project URL** and the **publishable key** (Settings → API Keys) into `.env.local`:

   ```
   VITE_SUPABASE_URL=https://<ref>.supabase.co
   VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
   ```

   Never use the `service_role` / secret key in the app or commit it anywhere.

## 2. Auth settings

In **Authentication → URL Configuration**:

- **Site URL:** your production address, for example `https://lexicove.vercel.app`
- **Redirect URLs:** add
  - `https://lexicove.vercel.app/**`
  - `http://localhost:5173/**`

In **Authentication → Sign In / Providers**:

| Provider | Where to create the OAuth app | Callback URL to paste there |
|---|---|---|
| Email | Built in. Turn on "Confirm email". | — |
| Google | [Google Cloud Console](https://console.cloud.google.com/apis/credentials) → OAuth client ID (Web) | `https://<ref>.supabase.co/auth/v1/callback` |
| GitHub | [GitHub → Settings → Developer settings → OAuth Apps](https://github.com/settings/developers) | same |
| Discord | [Discord Developer Portal](https://discord.com/developers/applications) → OAuth2 | same |
| Notion | [Notion integrations](https://www.notion.so/profile/integrations) → Public integration | same |

Paste each provider's client ID and secret into Supabase. The secrets stay in Supabase and
never reach the repository.

### Email delivery

Supabase's built-in email sender is only for testing and allows a handful of emails per hour.
For real users connect a free SMTP provider in **Authentication → Emails → SMTP Settings**,
for example [Resend](https://resend.com) (100 emails a day on the free plan).

New accounts confirm their email with a one-time code typed on the sign-up page, so no second
tab opens. Paste [supabase/templates/confirm-signup.html](../supabase/templates/confirm-signup.html)
into **Authentication → Emails → Templates → Confirm signup** (Source tab), set the subject to
"Код підтвердження Lexicove", and keep the email OTP expiry at 3600 seconds
(**Authentication → Sign In / Providers → Email**). The template shows `{{ .Token }}`, so the
code works even if the email app opens links in another browser.

### Chat photos

Migration `20261026160000_chat_images.sql` creates the public `chat-images` Storage bucket.
Only the owner account can upload, so there is nothing to configure; photos are shrunk to WebP
in the browser before upload.

### Owner and test accounts

Register the accounts in the app as usual, then give them roles in the SQL editor:

```sql
select private.grant_role('you@example.com', 'owner');
select private.grant_role('you+test@example.com', 'tester');
```

A tester is hidden from leagues, leaderboards and public stats, and starts with 1,000,000 coins
and enough XP to reach about level 41. Only the database owner can run `grant_role`; it isn't
exposed through the API.

## 3. Notion sync

Lexicove talks to Notion through the `notion` Edge Function
([`supabase/functions/notion`](../supabase/functions/notion)). Tokens are kept in Supabase Vault
and never reach the browser.

1. Open [Notion integrations](https://www.notion.so/profile/integrations) and create a
   **Public** integration.
2. Fill in the basic information:
   - Name: `Lexicove`, website `https://lexicove.vercel.app`
   - Privacy policy: `https://lexicove.vercel.app/privacy`
   - Terms of use: `https://lexicove.vercel.app/terms`
   - Redirect URIs:
     - `https://lexicove.vercel.app/notion/callback`
     - `http://localhost:5173/notion/callback`
     - `https://<ref>.supabase.co/auth/v1/callback` (only if you also want "Sign in with Notion")
3. Capabilities: **Read content**, **Update content**, **Insert content**.
4. Copy the OAuth **client ID** and **client secret** into Supabase:
   **Edge Functions → Secrets**, as `NOTION_CLIENT_ID` and `NOTION_CLIENT_SECRET`.
   The same pair can be pasted into **Authentication → Providers → Notion** for sign-in.
5. Deploy the function: `supabase functions deploy notion`.

On your own fork, change `ALLOWED_ORIGINS` and `REDIRECT_URIS` at the top of
[`index.ts`](../supabase/functions/notion/index.ts) to your domain.

How sync works: each sync first sends rows edited in Lexicove to Notion, then reads the whole
table back. Notion wins for rows without local edits; pages deleted in Notion are removed in
Lexicove; words deleted in Lexicove go to the Notion trash.

### Streak reminders

The `push` Edge Function ([`supabase/functions/push`](../supabase/functions/push)) sends Web Push
reminders. It needs no keys from you: on its first call it creates the VAPID key pair and stores
it in Vault, and the migration creates the token that pg_cron uses to call it every hour.

1. Deploy it with JWT checks off (it checks the cron token itself): `supabase functions deploy push --no-verify-jwt`.
2. On your own fork, change the project URL in the `streak-reminders` cron job
   ([`*_push_reminders.sql`](../supabase/migrations)) and `ALLOWED_ORIGINS` in the function.

## 4. Website on Vercel

1. Import the GitHub repository in Vercel. The settings come from [`vercel.json`](../vercel.json).
2. Add the two `VITE_SUPABASE_*` variables in **Project → Settings → Environment Variables**.
3. Every push to `main` deploys automatically.

## 5. Desktop app

Install [Rust](https://rustup.rs) once, then:

```bash
npm run tauri dev     # development window
npm run tauri build   # installers in src-tauri/target/release/bundle
```

To publish installers, set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` as
**repository variables** (Settings → Secrets and variables → Actions → Variables) and push a tag:

```bash
git tag v0.1.0
git push origin v0.1.0
```

The [Desktop release](../.github/workflows/release-desktop.yml) workflow builds Windows, macOS
and Linux installers and attaches them to a draft release.

Installers are not code-signed (that costs money), so Windows shows "Unknown publisher" and
macOS asks you to confirm opening the app. Both are expected for free open-source apps.

Sign-in with Google, GitHub, Discord and Notion inside the desktop app needs a system-browser
flow (Google blocks embedded browsers). Until that lands, the desktop app offers email sign-in
and guest mode.
