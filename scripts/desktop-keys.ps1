# One time setup: the key that signs desktop app updates (docs/desktop.md).
# Run it from the repository folder:  npm run desktop:keys
#
# Nothing to type. It makes a key pair with a random password in your user folder, gives the
# private key and its password to GitHub as repository secrets (the release workflow signs with
# them) and copies the public key into src-tauri/updater-key.pub (installed apps check every
# update against it). Nothing secret goes into the repository or on screen.
#
# The key and password also stay in %USERPROFILE%\.tauri as a backup. GitHub never shows secrets
# again, so keep that folder (copy it to a safe place): without the key, installed apps can't be
# updated any more.

# Native tools write progress to stderr; failures are caught by their exit codes instead.
$ErrorActionPreference = 'Continue'
$repo = 'mykolazozul/lexicove'
$dir = Join-Path $env:USERPROFILE '.tauri'
$key = Join-Path $dir 'lexicove.key'
$passwordFile = "$key.password"

if (-not (Get-Command gh -ErrorAction SilentlyContinue)) { throw 'GitHub CLI (gh) is needed: https://cli.github.com' }
gh auth status 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Sign in to GitHub first: gh auth login' }

New-Item -ItemType Directory -Force $dir | Out-Null
if ((Test-Path $key) -and (Test-Path $passwordFile)) {
  Write-Host "Using the existing key in $dir"
  $password = (Get-Content $passwordFile -Raw).Trim()
} else {
  # 32 random bytes from the system's secure generator, as letters and digits.
  $bytes = New-Object byte[] 32
  [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  $password = ([Convert]::ToBase64String($bytes) -replace '[^A-Za-z0-9]', '')
  Set-Content -Path $passwordFile -Value $password -NoNewline
  npx tauri signer generate --ci --force -w $key -p $password 2>&1 | Out-Null
  if ($LASTEXITCODE -ne 0 -or -not (Test-Path "$key.pub")) { throw 'Could not make the key.' }
  Write-Host "Made a new key in $dir"
}

Get-Content $key -Raw | gh secret set TAURI_SIGNING_PRIVATE_KEY -R $repo
if ($LASTEXITCODE -ne 0) { throw 'Could not save the key on GitHub.' }
gh secret set TAURI_SIGNING_PRIVATE_KEY_PASSWORD -R $repo --body $password
if ($LASTEXITCODE -ne 0) { throw 'Could not save the password on GitHub.' }

Copy-Item "$key.pub" (Join-Path $PSScriptRoot '..\src-tauri\updater-key.pub') -Force
Write-Host ''
Write-Host 'Done. The key and its password are on GitHub; a backup is in' $dir
