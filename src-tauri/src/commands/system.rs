//! OS-level helpers: launching URLs in the user's default browser.
//!
//! Why a dedicated command instead of just calling `tauri-plugin-opener`?
//! The plugin (and the `xdg-open` it delegates to on Linux) doesn't pass
//! the launching process's startup-notification info to the spawned
//! child. On X11 this trips focus-stealing prevention — the new tab
//! opens, but the browser window stays parked behind whatever was in
//! front (i.e. the user's terminal, our app, anything). The user has to
//! alt-tab to find their answer.
//!
//! Per the freedesktop.org startup-notification spec, the WM only
//! permits a newly-launched app to raise itself when it carries a
//! `DESKTOP_STARTUP_ID` that the launching app minted. We mint one
//! tied to our PID and the click's wall-clock time and pass it via
//! both `DESKTOP_STARTUP_ID` (X11 startup-notification) and
//! `XDG_ACTIVATION_TOKEN` (the Wayland equivalent) so each platform
//! picks up whichever it consults.
//!
//! Wayland caveat: a compositor-issued activation token would be
//! stronger than our self-minted one. Reliable Wayland activation
//! ultimately needs portal (`org.freedesktop.portal.OpenURI`) or GTK
//! bindings; the env var here is best-effort and may be ignored by
//! strict compositors. macOS `open` and Windows `start` raise the
//! browser naturally and don't need this dance.

use std::process::Command;

/// Open a URL in the OS default browser with a best-effort window
/// activation hint so the browser actually comes to the foreground.
#[tauri::command]
pub fn open_external_url(url: String) -> Result<(), String> {
    if !is_routable_external_url(&url) {
        return Err(format!(
            "Refusing to open URL with unsupported scheme: {}",
            url
        ));
    }
    open_with_activation(&url)
}

fn is_routable_external_url(url: &str) -> bool {
    // Whitelist the schemes a chat-rendered link can plausibly carry.
    // Everything else (`javascript:`, `file:`, `chrome:`, custom
    // protocol handlers, ...) is refused so a hostile or buggy
    // artifact can't escalate via this entry point.
    let scheme = match url.split_once(':') {
        Some((s, _)) => s.to_ascii_lowercase(),
        None => return false,
    };
    matches!(
        scheme.as_str(),
        "http" | "https" | "mailto" | "ftp" | "ftps"
    )
}

#[cfg(target_os = "linux")]
fn open_with_activation(url: &str) -> Result<(), String> {
    use std::time::{SystemTime, UNIX_EPOCH};

    let time_ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    // Format follows the freedesktop startup-notification spec:
    // `<launcher>-<pid>_TIME<unix_time_ms>` is enough for the WM to
    // accept it as a fresh activation event.
    let startup_id = format!("clai-{}_TIME{}", std::process::id(), time_ms);

    Command::new("xdg-open")
        .arg(url)
        .env("DESKTOP_STARTUP_ID", &startup_id)
        .env("XDG_ACTIVATION_TOKEN", &startup_id)
        .spawn()
        .map_err(|e| format!("Failed to launch xdg-open: {}", e))?;
    Ok(())
}

#[cfg(target_os = "macos")]
fn open_with_activation(url: &str) -> Result<(), String> {
    Command::new("open")
        .arg(url)
        .spawn()
        .map_err(|e| format!("Failed to launch `open`: {}", e))?;
    Ok(())
}

#[cfg(target_os = "windows")]
fn open_with_activation(url: &str) -> Result<(), String> {
    // The empty `""` second arg is the window title for `start`; without
    // it `start` treats a quoted URL as the title and refuses to open.
    Command::new("cmd")
        .args(["/c", "start", "", url])
        .spawn()
        .map_err(|e| format!("Failed to launch `start`: {}", e))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn routes_http_https_mailto() {
        assert!(is_routable_external_url("https://example.com"));
        assert!(is_routable_external_url("http://example.com"));
        assert!(is_routable_external_url("mailto:foo@bar.com"));
    }

    #[test]
    fn rejects_unsafe_schemes() {
        assert!(!is_routable_external_url("javascript:alert(1)"));
        assert!(!is_routable_external_url("file:///etc/passwd"));
        assert!(!is_routable_external_url("data:text/html,<script>"));
        assert!(!is_routable_external_url("chrome://settings"));
    }

    #[test]
    fn rejects_schemeless_strings() {
        assert!(!is_routable_external_url("example.com"));
        assert!(!is_routable_external_url(""));
    }

    #[test]
    fn scheme_match_is_case_insensitive() {
        assert!(is_routable_external_url("HTTPS://example.com"));
        assert!(is_routable_external_url("MAILTO:foo@bar.com"));
    }
}
