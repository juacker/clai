/**
 * Opens an external URL in the system browser.
 * Works in both Tauri apps and regular browser environments.
 *
 * @param {string} url - The URL to open
 * @returns {Promise<void>}
 */
export async function openExternal(url) {
  try {
    // Try to use Tauri's opener plugin first
    const { openUrl } = await import('@tauri-apps/plugin-opener');
    await openUrl(url);
  } catch (error) {
    // Fall back to window.open for browser environments
    window.open(url, '_blank');
  }
}
