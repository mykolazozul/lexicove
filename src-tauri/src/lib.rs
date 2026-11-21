// The desktop shell around the live website (lexicove.vercel.app). Everything the user sees is the
// site, so a deploy shows up in the app at once; this frame changes rarely and updates itself from
// GitHub Releases (updates.rs). It adds what a browser can't: a tray icon, a small always-on-top
// card window for the word of the moment, a global hotkey that adds the highlighted word, start
// with the system, a remembered window size, and links to other sites opening in the browser.
//
// Start-up: a tiny local page (src-tauri/shell) checks the connection and goes to the site, or
// shows "no connection" with a retry button. See docs/desktop.md.

mod updates;

use std::{thread, time::Duration};

use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    webview::NewWindowResponse,
    AppHandle, Emitter, Manager, Url, WebviewUrl, WebviewWindowBuilder, WindowEvent,
};
use tauri_plugin_clipboard_manager::ClipboardExt;
use tauri_plugin_deep_link::DeepLinkExt;
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};
use tauri_plugin_opener::OpenerExt;
use tauri_plugin_window_state::StateFlags;

/// The site the app shows. Debug builds use the Vite dev server instead (`devUrl`).
const APP_URL: &str = "https://lexicove.vercel.app";

const CARD_WIDTH: f64 = 380.0;
const CARD_HEIGHT: f64 = 300.0;
const CARD_MARGIN: f64 = 24.0;

/// The pages a window may show: the site, the local start-up page, and the dev server in debug.
fn is_ours(url: &Url) -> bool {
    let host = url.host_str().unwrap_or_default();
    match url.scheme() {
        "https" => host == "lexicove.vercel.app",
        // The local start-up page: tauri://localhost on macOS and Linux, http://tauri.localhost on Windows.
        "tauri" => host == "localhost",
        "http" => host == "tauri.localhost" || (cfg!(debug_assertions) && host == "localhost" && url.port() == Some(5173)),
        "about" => url.as_str() == "about:blank",
        _ => false,
    }
}

/// Anything else goes to the user's browser (web pages and mail only, never files or programs).
fn open_outside(app: &AppHandle, url: &Url) {
    if matches!(url.scheme(), "http" | "https" | "mailto") {
        let _ = app.opener().open_url(url.as_str(), None::<&str>);
    }
}

/// A window that only ever shows our pages; links elsewhere and pop-ups open in the browser.
fn guarded<'a>(app: &'a AppHandle, builder: WebviewWindowBuilder<'a, tauri::Wry, AppHandle>) -> WebviewWindowBuilder<'a, tauri::Wry, AppHandle> {
    let nav = app.clone();
    let popup = app.clone();
    builder
        .on_navigation(move |url| {
            let ours = is_ours(url);
            if !ours {
                open_outside(&nav, url);
            }
            ours
        })
        .on_new_window(move |url, _features| {
            open_outside(&popup, &url);
            NewWindowResponse::Deny
        })
}

/// A route of the site, e.g. `/desktop/card`.
fn page(path: &str) -> Result<WebviewUrl, String> {
    if cfg!(debug_assertions) {
        return Ok(WebviewUrl::App(path.trim_start_matches('/').into()));
    }
    let url: Url = format!("{APP_URL}{path}").parse().map_err(|_| "bad path".to_string())?;
    if !is_ours(&url) {
        return Err("bad path".into());
    }
    Ok(WebviewUrl::External(url))
}

/// Opens the small card window at a route of the app (`/desktop/card` or `/desktop/add?...`),
/// in the bottom-right corner, above every other window. An open card is replaced.
#[tauri::command]
fn show_card(app: AppHandle, path: String) -> Result<(), String> {
    // Only the app's own desktop routes, never an outside address.
    if !path.starts_with("/desktop/") || path.contains("..") || path.contains('\\') {
        return Err("bad path".into());
    }
    let url = page(&path)?;
    if let Some(card) = app.get_webview_window("card") {
        let _ = card.close();
    }

    let (x, y) = match app.primary_monitor().ok().flatten() {
        Some(monitor) => {
            let scale = monitor.scale_factor();
            let size = monitor.size();
            (
                size.width as f64 / scale - CARD_WIDTH - CARD_MARGIN,
                size.height as f64 / scale - CARD_HEIGHT - CARD_MARGIN - 48.0,
            )
        }
        None => (CARD_MARGIN, CARD_MARGIN),
    };

    guarded(&app, WebviewWindowBuilder::new(&app, "card", url))
        .title("Lexicove")
        .inner_size(CARD_WIDTH, CARD_HEIGHT)
        .position(x, y)
        .resizable(false)
        .decorations(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .background_color(tauri::window::Color(0, 0, 0, 255))
        .focused(true)
        .build()
        .map(|_| ())
        .map_err(|error| error.to_string())
}

/// Closes the card window (its own close button calls this).
#[tauri::command]
fn hide_card(app: AppHandle) {
    if let Some(card) = app.get_webview_window("card") {
        let _ = card.close();
    }
}

#[tauri::command]
fn update_status(app: AppHandle) -> updates::UpdateStatus {
    updates::status(&app)
}

#[tauri::command]
fn update_check(app: AppHandle) {
    tauri::async_runtime::spawn(updates::check(app));
}

#[tauri::command]
fn update_install(app: AppHandle) -> Result<(), String> {
    updates::install(&app)
}

fn show_main(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

/// `lexicove://signin#…`: the website finished a sign-in in the user's browser (Google and the
/// like refuse embedded browsers). The main window checks the one-time state it started with
/// and takes the session (src/lib/desktopSignIn.ts); anything else is ignored.
fn open_link(app: &AppHandle, url: &Url) {
    if url.scheme() != "lexicove" || url.host_str() != Some("signin") {
        return;
    }
    show_main(app);
    let _ = app.emit_to("main", "lexicove-signin", url.as_str());
}

/// Percent-encodes text for a query string.
fn encode(text: &str) -> String {
    text.bytes()
        .map(|byte| match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => (byte as char).to_string(),
            _ => format!("%{byte:02X}"),
        })
        .collect()
}

/// Copies whatever is highlighted in the app in front (by pressing Ctrl+C for the user), reads
/// it from the clipboard and opens the quick-add card with it.
fn add_highlighted(app: AppHandle) {
    thread::spawn(move || {
        let before = app.clipboard().read_text().unwrap_or_default();
        {
            use enigo::{Direction, Enigo, Key, Keyboard, Settings};
            if let Ok(mut keys) = Enigo::new(&Settings::default()) {
                // The hotkey's own modifiers may still be held; let go of them first.
                let _ = keys.key(Key::Shift, Direction::Release);
                let _ = keys.key(Key::Control, Direction::Press);
                let _ = keys.key(Key::Unicode('c'), Direction::Click);
                let _ = keys.key(Key::Control, Direction::Release);
            }
        }
        thread::sleep(Duration::from_millis(180));
        let copied = app.clipboard().read_text().unwrap_or_default();
        // Nothing new was copied: fall back to what was on the clipboard already.
        let text = if copied.trim().is_empty() { before } else { copied };
        let word: String = text.trim().chars().take(200).collect();
        let _ = show_card(app, format!("/desktop/add?word={}", encode(&word)));
    });
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let add_shortcut = Shortcut::new(Some(Modifiers::CONTROL | Modifiers::SHIFT), Code::KeyE);

    tauri::Builder::default()
        // A second launch brings the running app forward instead of opening another one.
        // With the deep-link feature it also hands a lexicove:// link to the running app.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| show_main(app)))
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(
            // Size, place and "maximized" survive a restart; visibility doesn't (start in the tray).
            tauri_plugin_window_state::Builder::default()
                .with_denylist(&["card"])
                .with_state_flags(StateFlags::all() & !StateFlags::VISIBLE)
                .build(),
        )
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec!["--hidden"]),
        ))
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(move |app, shortcut, event| {
                    if shortcut == &add_shortcut && event.state() == ShortcutState::Released {
                        add_highlighted(app.clone());
                    }
                })
                .build(),
        )
        .manage(updates::Updates::default())
        .invoke_handler(tauri::generate_handler![show_card, hide_card, update_status, update_check, update_install])
        .setup(move |app| {
            let handle = app.handle().clone();

            // Started with the system: stay in the tray until called.
            let hidden = std::env::args().any(|arg| arg == "--hidden");
            let config = app
                .config()
                .app
                .windows
                .iter()
                .find(|window| window.label == "main")
                .cloned()
                .expect("tauri.conf.json has the main window");
            guarded(&handle, WebviewWindowBuilder::from_config(&handle, &config)?)
                .visible(!hidden)
                .build()?;

            app.global_shortcut().register(add_shortcut)?;

            // The installer registers lexicove:// for release builds; development registers it here.
            #[cfg(all(debug_assertions, any(windows, target_os = "linux")))]
            let _ = app.deep_link().register_all();
            let links = handle.clone();
            app.deep_link().on_open_url(move |event| {
                for url in event.urls() {
                    open_link(&links, &url);
                }
            });

            let open = MenuItem::with_id(app, "open", "Lexicove", true, None::<&str>)?;
            let word = MenuItem::with_id(app, "word", "Word now / Слово зараз", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Quit / Вийти", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&open, &word, &quit])?;

            TrayIconBuilder::with_id("main")
                .icon(app.default_window_icon().cloned().expect("the app has an icon"))
                .tooltip("Lexicove")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id().as_ref() {
                    "open" => show_main(app),
                    "word" => {
                        let _ = show_card(app.clone(), "/desktop/card".into());
                    }
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                        show_main(tray.app_handle());
                    }
                })
                .build(app)?;

            updates::start(handle);
            Ok(())
        })
        // Closing the main window keeps Lexicove running in the tray, so the cards keep coming.
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                if window.label() == "main" {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running Lexicove");
}
