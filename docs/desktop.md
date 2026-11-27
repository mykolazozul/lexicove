# Desktop app

How the Lexicove desktop app works, how people install it, and how to release a new version.
Code: [`src-tauri/src/lib.rs`](../src-tauri/src/lib.rs) (windows, tray, hotkey) and
[`src-tauri/src/updates.rs`](../src-tauri/src/updates.rs) (self update).

## The idea

The app is a **frame around the live website**, not a second copy of it. Its window opens
`https://lexicove.vercel.app`, so:

- every deploy of the site shows up in the app at once, with no new app version;
- the app itself (window, tray, hotkey, updater) changes rarely and updates itself from GitHub Releases;
- sign-in, data and logic all stay on the site; the app adds what a browser can't do.

```
┌──────────────── Tauri ────────────────┐
│ lib.rs        windows, tray, hotkey,  │
│               link rules, autostart   │
│ updates.rs    checks GitHub Releases  │
│   │ commands (only for the site's own │
│   │ address, capabilities/site.json)  │
│ the site in a WebView                 │  checks `isTauri` and turns on the desktop parts
└───────────────────────────────────────┘
```

## What the frame does

| Part | How |
|---|---|
| **Start** | A tiny local page ([`src-tauri/shell`](../src-tauri/shell)) checks the connection and goes to the site. Offline, it says so with a "Try again" button and retries by itself when the network comes back. |
| **One copy** | A second launch only brings the open window forward (single instance plugin). |
| **Size and place** | Remembered between starts (window state plugin). |
| **Tray** | Closing the window keeps Lexicove in the tray, so word cards keep coming. Menu: open, word now, check for updates, quit. |
| **Word cards** | A small always-on-top window in the bottom-right corner, every 15, 30 or 60 minutes (Settings). Skipped while a full-screen game, video or presentation is in front. |
| **Hotkey** | Ctrl+Shift+E (or Ctrl+Shift with another letter or digit, Settings) copies the highlighted text in any app and opens the quick add card. |
| **Start with the system** | Optional (Settings); starts hidden in the tray. |
| **Links** | The windows only show the site and the start page. Any other address opens in the default browser (web pages and mail only). Pop-ups are never opened inside the app. |
| **Updates** | See below. |

## Security

1. Only `https://lexicove.vercel.app/*` gets the desktop functions ([`capabilities/site.json`](../src-tauri/capabilities/site.json)); any other page gets none.
2. Our own commands are declared in [`build.rs`](../src-tauri/build.rs), so each one must be granted by name.
3. The card window opens only `/desktop/...` routes of the site.
4. The clipboard is read only in Rust, right after the hotkey; the site has no clipboard access.
5. No secrets in the app: sign-in and data live on the site and Supabase.
6. Updates are verified against the public key compiled into the app; an unsigned or tampered update is refused.

## How people install it

On the site: **Settings → Desktop app → Download for Windows**. The link is always the same
and always gets the newest installer:

`https://github.com/mykolazozul/lexicove/releases/latest/download/Lexicove-Setup.exe`

The installer (NSIS) installs into the user's profile (`%LOCALAPPDATA%\Lexicove`):
**no administrator rights**, and updates don't need them either. It adds Start menu and desktop
shortcuts. macOS (`.dmg`) and Linux (`.AppImage`, `.deb`) builds are on the same release page.

The installer isn't code signed (a certificate costs money), so on the first start Windows
SmartScreen says "Unknown publisher": **More info → Run anyway**. macOS asks to confirm opening.

## Updates

Two levels, and that's the point of the frame:

1. **The site** (interface, lessons, games): new with every deploy, at once.
2. **The app itself**: rarely, through GitHub Releases.

```
start ──8 s──► read latest.json ──► newer? ──yes──► download in the background
  ▲                                   │no                     │
  └────────────── every 4 h ◄─────────┘                       ▼
                                          "ready" ─► toast in the app and a
                                                     "Restart and update" button in Settings
"Restart and update" ─► installer runs quietly ─► the new version opens by itself
```

- The app reads `releases/latest/download/latest.json` as a plain file: no GitHub token, no API limits.
- Settings → Desktop app shows the installed version, the state, and "Check for updates".
- Updates are signed. The installed app has the public key; GitHub Actions signs with the private one.

### One time setup: the signing key

Run once on your computer, from the repository folder (needs the [GitHub CLI](https://cli.github.com), signed in):

```powershell
npm run desktop:keys
```

Nothing to type. It creates `%USERPROFILE%\.tauri\lexicove.key` with a random password, saves
the key and the password as repository secrets (`TAURI_SIGNING_PRIVATE_KEY`,
`TAURI_SIGNING_PRIVATE_KEY_PASSWORD`) and writes the public key to `src-tauri/updater-key.pub`.
Commit that file (it is public).

Releases are built on GitHub, so you can release from any device without the key on it.
The key is only yours: whoever has it can ship updates to everyone's computers.

**Keep a copy of `%USERPROFILE%\.tauri`** (the key and its password). GitHub never shows secrets
again; lose both and installed apps can't be updated any more, people would have to download
the installer again.

### Releasing a new version

```powershell
npm run desktop:release 0.4.0 "Word cards pause during full-screen games. Pick your own hotkey."
```

The text in quotes is optional: it shows up as "What's new" next to "Restart and update" in the app and on the release page. It sets the version in `src-tauri/tauri.conf.json` and `Cargo.toml`, commits, tags `v0.3.0` and
pushes. The [Desktop release](../.github/workflows/release-desktop.yml) workflow then:

1. creates a draft release;
2. builds Windows, macOS and Linux installers, signs the update files and adds `latest.json`;
3. uploads a copy of the Windows installer as `Lexicove-Setup.exe` (the permanent link);
4. publishes the release as the latest.

Takes about 15 minutes. Check: `…/releases/latest/download/latest.json` shows the new version.
Only release when the frame changed (Rust, `tauri.conf.json`, the start page); site changes
need just a normal deploy.

## Development

```powershell
npm run tauri dev
```

In development the window shows the Vite dev server (`http://localhost:5173`) instead of the
live site, and the updater is off.

`npm run tauri build -- --bundles nsis` builds a local installer in
`src-tauri/target/release/bundle/nsis`. It opens the live site, so desktop changes to the site
need to be deployed to show up in it.

## Known limits

- Google, GitHub, Discord and Notion sign-in need a system browser flow (Google blocks embedded
  browsers). Until a deep link return lands, the app offers email sign-in and guest mode, and
  Notion is connected on the website.
- No code signing certificate, so SmartScreen warns on the first start.
