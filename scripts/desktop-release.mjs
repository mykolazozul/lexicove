// Releases a new version of the desktop app (docs/desktop.md):
//   npm run desktop:release 0.3.0
// Sets the version in src-tauri/tauri.conf.json and Cargo.toml, commits that, tags v0.3.0 and
// pushes. GitHub Actions then builds the installers and publishes the release; installed apps
// pick it up within a few hours (or at once with "Check for updates").

import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'

const version = process.argv[2]
if (!/^\d+\.\d+\.\d+$/.test(version ?? '')) {
  console.error('Usage: npm run desktop:release 0.3.0')
  process.exit(1)
}

const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim()
const tag = `v${version}`
if (git('status', '--porcelain', '--untracked-files=no')) {
  console.error('Commit or stash your changes first.')
  process.exit(1)
}
if (git('tag', '--list', tag)) {
  console.error(`${tag} already exists.`)
  process.exit(1)
}

if (!existsSync('src-tauri/updater-key.pub')) {
  console.error('Set up the update key first: npm run desktop:keys (once), then commit src-tauri/updater-key.pub.')
  process.exit(1)
}

const confPath = 'src-tauri/tauri.conf.json'
const conf = readFileSync(confPath, 'utf8')
const current = JSON.parse(conf).version
const newer = (a, b) => {
  const [x, y] = [a, b].map((v) => v.split('.').map(Number))
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i]
  return false
}
if (version !== current && !newer(version, current)) {
  console.error(`The new version must not be below ${current}, or installed apps won't update to it.`)
  process.exit(1)
}
writeFileSync(confPath, conf.replace(`"version": "${current}"`, `"version": "${version}"`))

const cargoPath = 'src-tauri/Cargo.toml'
const cargo = readFileSync(cargoPath, 'utf8')
writeFileSync(cargoPath, cargo.replace(/^version = ".*"$/m, `version = "${version}"`))

try {
  execFileSync('cargo', ['update', '-p', 'lexicove', '--offline'], { cwd: 'src-tauri', stdio: 'ignore' })
} catch {
  // Cargo.lock catches up on the next build; the release builds don't need it.
}

const files = [confPath, cargoPath, 'src-tauri/Cargo.lock']
git('add', ...files)
if (git('diff', '--cached', '--name-only')) git('commit', '-m', `Desktop app ${version}`)
git('tag', tag)
git('push', 'origin', 'HEAD', tag)
console.log(`Pushed ${tag}. The release builds in about 15 minutes: https://github.com/mykolazozul/lexicove/actions`)
