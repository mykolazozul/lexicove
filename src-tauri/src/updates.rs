// Updates of the desktop app itself (the frame: windows, tray, hotkey). The interface is the live
// website, so it changes with every deploy and needs no update here.
//
// Every release on GitHub carries `latest.json`; the app reads it straight from
// `releases/latest/download`, so there is no token and no API limit. The first check runs a few
// seconds after start, then every four hours. A newer version downloads in the background and
// waits; the site shows "Restart and update" (Settings → Desktop app) and a toast.

use std::{sync::Mutex, thread, time::Duration};

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_updater::{Update, UpdaterExt};

const ENDPOINT: &str = "https://github.com/mykolazozul/lexicove/releases/latest/download/latest.json";
const FIRST_CHECK: Duration = Duration::from_secs(8);
const EVERY: Duration = Duration::from_secs(4 * 60 * 60);

/// Public key that release builds are signed with (src-tauri/updater-key.pub, read by build.rs).
/// Without it the app still works, it just doesn't update itself.
pub const PUBKEY: Option<&str> = option_env!("LEXICOVE_UPDATER_PUBKEY");

/// What the site shows: idle → checking → none | downloading → ready, or error / disabled.
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateStatus {
    state: &'static str,
    current: String,
    version: Option<String>,
    percent: Option<u8>,
    error: Option<String>,
}

#[derive(Default)]
pub struct Updates {
    status: Mutex<Option<UpdateStatus>>,
    ready: Mutex<Option<(Update, Vec<u8>)>>,
    busy: Mutex<bool>,
}

fn enabled() -> bool {
    PUBKEY.is_some_and(|key| !key.trim().is_empty()) && !cfg!(debug_assertions)
}

fn set(app: &AppHandle, state: &'static str, version: Option<String>, percent: Option<u8>, error: Option<String>) {
    let status = UpdateStatus { state, current: app.package_info().version.to_string(), version, percent, error };
    *app.state::<Updates>().status.lock().unwrap() = Some(status.clone());
    let _ = app.emit("lexicove-update", status);
}

pub fn status(app: &AppHandle) -> UpdateStatus {
    app.state::<Updates>().status.lock().unwrap().clone().unwrap_or(UpdateStatus {
        state: if enabled() { "idle" } else { "disabled" },
        current: app.package_info().version.to_string(),
        version: None,
        percent: None,
        error: None,
    })
}

/// Looks for a newer version and downloads it. Does nothing while a check runs or one is ready.
pub async fn check(app: AppHandle) {
    if !enabled() {
        return set(&app, "disabled", None, None, None);
    }
    let updates = app.state::<Updates>();
    {
        let mut busy = updates.busy.lock().unwrap();
        if *busy || updates.ready.lock().unwrap().is_some() {
            return;
        }
        *busy = true;
    }
    set(&app, "checking", None, None, None);
    if let Err(error) = fetch(&app).await {
        set(&app, "error", None, None, Some(error.to_string()));
    }
    *updates.busy.lock().unwrap() = false;
}

async fn fetch(app: &AppHandle) -> Result<(), tauri_plugin_updater::Error> {
    let updater = app
        .updater_builder()
        .pubkey(PUBKEY.unwrap_or_default().trim())
        .endpoints(vec![ENDPOINT.parse().expect("valid update address")])?
        .build()?;
    let Some(update) = updater.check().await? else {
        set(app, "none", None, None, None);
        return Ok(());
    };
    let version = update.version.clone();
    set(app, "downloading", Some(version.clone()), Some(0), None);

    let mut received = 0u64;
    let mut shown = 0u8;
    let bytes = update
        .download(
            |chunk, total| {
                received += chunk as u64;
                if let Some(total) = total.filter(|total| *total > 0) {
                    let percent = (received * 100 / total).min(100) as u8;
                    if percent != shown {
                        shown = percent;
                        set(app, "downloading", Some(version.clone()), Some(percent), None);
                    }
                }
            },
            || {},
        )
        .await?;

    *app.state::<Updates>().ready.lock().unwrap() = Some((update, bytes));
    set(app, "ready", Some(version), None, None);
    Ok(())
}

/// Installs the downloaded version and starts it again. On Windows the installer closes the app.
pub fn install(app: &AppHandle) -> Result<(), String> {
    let Some((update, bytes)) = app.state::<Updates>().ready.lock().unwrap().take() else {
        return Err("nothing to install".into());
    };
    let version = update.version.clone();
    match update.install(bytes) {
        Ok(()) => app.restart(),
        Err(error) => {
            set(app, "error", Some(version), None, Some(error.to_string()));
            Err(error.to_string())
        }
    }
}

/// The background schedule: a first check soon after start, then every few hours.
pub fn start(app: AppHandle) {
    if !enabled() {
        return;
    }
    thread::spawn(move || {
        thread::sleep(FIRST_CHECK);
        loop {
            tauri::async_runtime::block_on(check(app.clone()));
            thread::sleep(EVERY);
        }
    });
}
