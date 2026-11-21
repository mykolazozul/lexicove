// The desktop shell around the web app: a tray icon, a small always-on-top card window for the
// word of the moment, a global hotkey that adds the highlighted word, and start with the system.
// Everything the user sees inside the windows is the same React app; this file only manages
// windows, the tray and the hotkey.

use std::{thread, time::Duration};

use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager, WebviewUrl, WebviewWindowBuilder, WindowEvent,
};
use tauri_plugin_clipboard_manager::ClipboardExt;
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

const CARD_WIDTH: f64 = 380.0;
const CARD_HEIGHT: f64 = 300.0;
const CARD_MARGIN: f64 = 24.0;

/// Opens the small card window at a route of the app (`/desktop/card` or `/desktop/add?...`),
/// in the bottom-right corner, above every other window. An open card is replaced.
#[tauri::command]
fn show_card(app: AppHandle, path: String) -> Result<(), String> {
    // Only the app's own desktop routes, never an outside address.
    if !path.starts_with("/desktop/") {
        return Err("bad path".into());
    }
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

    WebviewWindowBuilder::new(&app, "card", WebviewUrl::App(path.trim_start_matches('/').into()))
        .title("Lexicove")
        .inner_size(CARD_WIDTH, CARD_HEIGHT)
        .position(x, y)
        .resizable(false)
        .decorations(false)
        .always_on_top(true)
        .skip_taskbar(true)
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

fn show_main(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
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
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| show_main(app)))
        .plugin(tauri_plugin_clipboard_manager::init())
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
        .invoke_handler(tauri::generate_handler![show_card, hide_card])
        .setup(move |app| {
            app.global_shortcut().register(add_shortcut)?;

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

            // Started with the system: stay in the tray until called.
            if std::env::args().any(|arg| arg == "--hidden") {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.hide();
                }
            }
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
