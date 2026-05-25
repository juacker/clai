import { invoke } from '@tauri-apps/api/core';

/**
 * Opens an external URL in the system browser.
 *
 * Prefers the `open_external_url` Tauri command (see `commands::system`),
 * which spawns `xdg-open` / `open` / `start` with a freedesktop
 * startup-notification token so focus-stealing prevention lets the
 * browser actually raise its window. Falls back to the opener plugin,
 * then to `window.open`, so this also works in dev/non-Tauri builds.
 *
 * @param {string} url - The URL to open
 * @returns {Promise<void>}
 */
export async function openExternal(url) {
  try {
    await invoke('open_external_url', { url });
    return;
  } catch (err) {
    // Falls through — older Tauri builds without this command, or
    // non-Tauri (dev-server) environments, hit the legacy paths below.
    if (typeof console !== 'undefined') {
      console.debug('[openExternal] open_external_url failed, falling back:', err);
    }
  }
  try {
    const { openUrl } = await import('@tauri-apps/plugin-opener');
    await openUrl(url);
  } catch {
    window.open(url, '_blank');
  }
}
