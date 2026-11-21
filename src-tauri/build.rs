fn main() {
    // The public key for update signatures. Release builds have it (see docs/desktop.md); without
    // it the app just doesn't update itself.
    println!("cargo:rerun-if-changed=updater-key.pub");
    if let Ok(key) = std::fs::read_to_string("updater-key.pub") {
        let key = key.trim();
        if !key.is_empty() {
            println!("cargo:rustc-env=LEXICOVE_UPDATER_PUBKEY={key}");
        }
    }

    // Our own commands, so each window and site gets only the ones its capability lists.
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(tauri_build::AppManifest::new().commands(&[
        "show_card",
        "hide_card",
        "update_status",
        "update_check",
        "update_install",
    ])))
    .expect("failed to run tauri-build");
}
