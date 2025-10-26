import { useState, useEffect } from 'react';

/**
 * Custom hook to detect the current platform/OS
 * Returns platform information for styling and conditional rendering
 *
 * @returns {Object} Platform information
 * @property {string} os - The operating system ('windows', 'macos', 'linux', 'android', 'ios', 'unknown')
 * @property {string} type - The device type ('desktop' or 'mobile')
 * @property {boolean} isDesktop - True if running on desktop
 * @property {boolean} isMobile - True if running on mobile
 * @property {boolean} isLoading - True while platform is being detected
 */
export function usePlatform() {
  const [platform, setPlatform] = useState({
    os: 'unknown',
    type: 'unknown',
    isDesktop: false,
    isMobile: false,
    isLoading: true,
  });

  useEffect(() => {
    const detectPlatform = async () => {
      try {
        // Try to use Tauri's platform detection
        const { platform: tauriPlatform } = await import('@tauri-apps/plugin-os');
        const osType = await tauriPlatform();

        // Map Tauri platform strings to our platform types
        const platformMap = {
          'windows': { os: 'windows', type: 'desktop', isDesktop: true, isMobile: false },
          'macos': { os: 'macos', type: 'desktop', isDesktop: true, isMobile: false },
          'linux': { os: 'linux', type: 'desktop', isDesktop: true, isMobile: false },
          'android': { os: 'android', type: 'mobile', isDesktop: false, isMobile: true },
          'ios': { os: 'ios', type: 'mobile', isDesktop: false, isMobile: true },
        };

        const detectedPlatform = platformMap[osType] || {
          os: osType || 'unknown',
          type: 'unknown',
          isDesktop: false,
          isMobile: false,
        };

        setPlatform({
          ...detectedPlatform,
          isLoading: false,
        });
      } catch (error) {
        // Fallback: Use user agent detection if Tauri API is not available
        // This can happen during development in a browser
        console.warn('Tauri platform detection failed, falling back to user agent:', error);

        const ua = navigator.userAgent.toLowerCase();
        let fallbackPlatform = {
          os: 'unknown',
          type: 'desktop',
          isDesktop: true,
          isMobile: false,
        };

        if (/android/.test(ua)) {
          fallbackPlatform = { os: 'android', type: 'mobile', isDesktop: false, isMobile: true };
        } else if (/iphone|ipad|ipod/.test(ua)) {
          fallbackPlatform = { os: 'ios', type: 'mobile', isDesktop: false, isMobile: true };
        } else if (/win/.test(ua)) {
          fallbackPlatform = { os: 'windows', type: 'desktop', isDesktop: true, isMobile: false };
        } else if (/mac/.test(ua)) {
          fallbackPlatform = { os: 'macos', type: 'desktop', isDesktop: true, isMobile: false };
        } else if (/linux/.test(ua)) {
          fallbackPlatform = { os: 'linux', type: 'desktop', isDesktop: true, isMobile: false };
        }

        setPlatform({
          ...fallbackPlatform,
          isLoading: false,
        });
      }
    };

    detectPlatform();
  }, []);

  return platform;
}
