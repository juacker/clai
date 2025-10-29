import { useState, useEffect } from 'react';

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
        // Import the platform function from the Tauri plugin
        const { platform: tauriPlatform } = await import('@tauri-apps/plugin-os');
        const osType = await tauriPlatform();

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
