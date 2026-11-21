# One time setup: the key that signs desktop app updates (docs/desktop.md).
# Run it from the repository folder:  powershell -ExecutionPolicy Bypass -File scripts/desktop-keys.ps1
#
# It makes a key pair in your user folder, gives the private half to GitHub as a repository secret
# (the release workflow signs with it) and copies the public half into src-tauri/updater-key.pub
# (installed apps check every update against it). The private key never goes into the repository.
# Keep %USERPROFILE%\.tauri\lexicove.key and its password safe: without them, installed apps can't
# be updated any more.

$ErrorActionPreference = 'Stop'
$repo = 'mykolazozul/lexicove'
$dir = Join-Path $env:USERPROFILE '.tauri'
$key = Join-Path $dir 'lexicove.key'

if (-not (Get-Command gh -ErrorAction SilentlyContinue)) { throw 'GitHub CLI (gh) is needed: https://cli.github.com' }
gh auth status | Out-Null

New-Item -ItemType Directory -Force $dir | Out-Null
if (Test-Path $key) {
  Write-Host "Using the existing key $key"
} else {
  Write-Host 'Choose a password for the key (you will type it twice, then once more for GitHub).'
  npx tauri signer generate -w $key
  if ($LASTEXITCODE -ne 0) { throw 'Could not make the key.' }
}

Get-Content $key -Raw | gh secret set TAURI_SIGNING_PRIVATE_KEY -R $repo
if ($LASTEXITCODE -ne 0) { throw 'Could not save the key on GitHub.' }
Write-Host 'Now type the same password for GitHub:'
gh secret set TAURI_SIGNING_PRIVATE_KEY_PASSWORD -R $repo
if ($LASTEXITCODE -ne 0) { throw 'Could not save the password on GitHub.' }

Copy-Item "$key.pub" (Join-Path $PSScriptRoot '..\src-tauri\updater-key.pub') -Force
Write-Host ''
Write-Host 'Done. Commit src-tauri/updater-key.pub (it is public), then release with: npm run desktop:release 0.2.0'
