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

## 3. Website on Vercel

1. Import the GitHub repository in Vercel. The settings come from [`vercel.json`](../vercel.json).
2. Add the two `VITE_SUPABASE_*` variables in **Project → Settings → Environment Variables**.
3. Every push to `main` deploys automatically.

## 4. Desktop app

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
