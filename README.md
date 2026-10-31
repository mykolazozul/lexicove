<p align="center">
  <img src="public/logo.svg" width="96" height="96" alt="Lexicove logo" />
</p>

<h1 align="center">Lexicove</h1>

<p align="center">
  Learn English words from your own Notion tables, as a game.<br />
  Web, phone (installable PWA) and desktop (Windows, macOS, Linux). Free and open source.
</p>

<p align="center">
  <a href="https://lexicove.vercel.app"><strong>lexicove.vercel.app</strong></a>
</p>

> 🇺🇦 **Українською:** Lexicove — безкоштовний додаток для вивчення англійських слів з твоїх таблиць Notion: уроки з інтервальним повторенням, ігри, дуелі, ліги, магазин і чат. Працює в браузері, на телефоні та як програма для ноутбука. Повний план — у [SPEC.md](SPEC.md).

## Status

- **Phase 0, foundation:** app shell, ten themes plus an optional Apple-style interface, Ukrainian
  and English, sign-in, guest mode, installable PWA, the Tauri desktop shell.
- **Phase 1, words:** two-way Notion sync for word and rule tables (with automatic column
  matching), adding and editing words in the app, CSV import and export.
- **Phase 2, learning:** FSRS spaced repetition and ten modes — flashcards, multiple choice,
  spelling, fill the gap, sentence builder, listening, dictation, pronunciation, categories
  and a rules quiz — plus a mixed daily lesson, daily goal, streak and accuracy.
- **Admin panel:** usage statistics, users and roles, Notion sync health, free-plan limits.
- **Phase 3, motivation:** server-side XP, levels and Coins, 30 achievements, daily and weekly
  quests, a daily chest, streak freezes and double-XP boosts, and a shop with try-on: animated
  avatars, frames, banners, four more themes, titles, name colours, card backs and sound packs.
  The profile shows a six-month activity calendar, accuracy by category, the hardest words and
  the week's review forecast.

- **Phase 4, community:** chat rooms and direct messages between friends with replies, reactions
  and mentions, friends with online status, weekly leagues from Bronze to Legend, reports,
  warnings, mutes and bans, a profanity filter and anti-spam limits on the server, community
  rules, streak reminders over Web Push and an economy view in the admin panel. Names are
  checked for bad words and can change once a week (username once a month), the owner has a
  verified badge and can post photos in chats, levels take longer as they rise, and times follow
  the device's 12- or 24-hour clock.
- **Getting started:** four starter decks from A1 to B2 (40 words each with translations,
  pronunciation and examples), a word of the day on the home page and as a 09:00 notification,
  first-visit tips, and password changes by email code in Settings.

Games and duels arrive phase by phase. See the roadmap in [SPEC.md](SPEC.md#16-етапи).

## Features (planned)

- **Your own words:** two-way sync with Notion, words added in the app, CSV/Excel import
- **Learning:** spaced-repetition flashcards (FSRS), multiple choice, spelling, fill in the blank,
  sentence builder, listening, dictation, pronunciation with a microphone, grammar quizzes
- **Games:** match pairs, speed round, word rain, hangman, Wordle, crosswords, word search
- **Motivation:** XP and levels, streaks, daily goals, achievements, quests, detailed stats
- **Economy:** coins earned only by learning, a shop with animated avatars, frames and themes
- **Community:** chat rooms, friends, real-time duels, weekly leagues, clans, moderation tools
- **Desktop extras:** a flashcard that pops up over your work, a global hotkey to save a word

## Tech

React 19, TypeScript, Vite, Tailwind CSS 4, Motion · Supabase (Postgres, Auth, Realtime) ·
Tauri 2 for the desktop app · vite-plugin-pwa for offline use. Everything runs on free tiers.

## Getting started

```bash
npm install
cp .env.example .env.local   # then fill in your Supabase project (optional)
npm run dev                  # http://localhost:5173
```

Without a Supabase project the app still runs, in guest mode.
Full setup (database, sign-in providers, deploy) is in [docs/SETUP.md](docs/SETUP.md).

| Command | What it does |
|---|---|
| `npm run dev` | Web app with hot reload |
| `npm run build` | Typecheck and production build into `dist/` |
| `npm run tauri dev` | Desktop app in development (needs [Rust](https://rustup.rs)) |
| `npm run tauri build` | Desktop installers |
| `npm run lint:secrets` | Scan the tree for leaked credentials |

## Security

The repository is public, so nothing secret is stored in it and the server never trusts the
client with rewards or moderation. Details and how to report a problem: [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE)
