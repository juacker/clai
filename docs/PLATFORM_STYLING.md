# Platform-Specific Styling Guide

This document explains how to implement platform-specific styling in the Netdata AI application.

## Overview

The application uses a hybrid approach for platform-specific styling that combines:
1. **Tauri Platform Detection** - Accurate OS/platform detection at runtime
2. **CSS Custom Properties + Platform Classes** - Platform-specific classes for targeted styling
3. **Media Queries as Fallback** - Responsive design for additional viewport-based adjustments

## Architecture

### 1. Platform Detection Hook (`src/hooks/usePlatform.js`)

The `usePlatform` hook provides platform information to React components:

```javascript
import { usePlatform } from './hooks/usePlatform';

function MyComponent() {
  const { os, type, isDesktop, isMobile, isLoading } = usePlatform();
  // os: 'windows' | 'macos' | 'linux' | 'android' | 'ios' | 'unknown'
  // type: 'desktop' | 'mobile' | 'unknown'
  // isDesktop: boolean
  // isMobile: boolean
  // isLoading: boolean
}
```

**Features:**
- Uses Tauri's `@tauri-apps/plugin-os` for accurate platform detection
- Falls back to user agent detection during browser development
- Provides both specific OS and general device type information

### 2. Root Element Classes (`src/App.jsx`)

The App component automatically applies platform-specific classes to the document root:

```javascript
// Applied attributes:
document.documentElement.setAttribute('data-platform', os);
document.documentElement.setAttribute('data-device-type', type);

// Applied classes:
document.documentElement.classList.add(`platform-${os}`);
document.documentElement.classList.add(`device-${type}`);
```

**Result:**
```html
<html data-platform="android" data-device-type="mobile" 
      class="platform-android device-mobile">
```

### 3. CSS Targeting

You can now target specific platforms in your CSS:

#### By Device Type (Recommended for most cases)
```css
/* Desktop-specific styles */
.device-desktop .myComponent {
  /* styles */
}

/* Mobile-specific styles */
.device-mobile .myComponent {
  /* styles */
}
```

#### By Specific Platform
```css
/* iOS-specific styles */
.platform-ios .myComponent {
  /* styles */
}

/* Android-specific styles */
.platform-android .myComponent {
  /* styles */
}

/* macOS-specific styles */
.platform-macos .myComponent {
  /* styles */
}
```

#### Using Data Attributes
```css
/* Alternative syntax */
[data-device-type="mobile"] .myComponent {
  /* styles */
}

[data-platform="ios"] .myComponent {
  /* styles */
}
```

## Example: Avatar Positioning

The user avatar demonstrates platform-specific positioning:

**Desktop:** Bottom-left (matches Netdata Cloud UI)
**Mobile:** Top-right (avoids navigation bars)

```css
/* src/layouts/MainLayout.module.css */

.avatarWrapper {
  position: fixed;
  z-index: 1000;
}

/* Desktop positioning */
.device-desktop .avatarWrapper {
  bottom: 20px;
  left: 20px;
}

/* Mobile positioning */
.device-mobile .avatarWrapper {
  top: 20px;
  right: 20px;
}

/* iOS safe area adjustments */
.platform-ios .avatarWrapper {
  top: max(20px, env(safe-area-inset-top, 20px));
  right: max(20px, env(safe-area-inset-right, 20px));
}
```

## Best Practices

### 1. Device Type vs Platform
- **Use device type** (`device-desktop`, `device-mobile`) for general layout differences
- **Use specific platform** (`platform-ios`, `platform-android`) only when needed for OS-specific quirks

### 2. Fallback with Media Queries
Always provide media query fallbacks for unknown platforms:

```css
/* Platform-specific */
.device-mobile .component {
  /* mobile styles */
}

/* Fallback for undetected devices */
@media (max-width: 768px) {
  .component {
    /* mobile styles */
  }
}
```

### 3. Mobile Safe Areas
Use CSS environment variables for mobile safe areas:

```css
.platform-ios .component {
  padding-top: env(safe-area-inset-top, 20px);
  padding-bottom: env(safe-area-inset-bottom, 20px);
  padding-left: env(safe-area-inset-left, 20px);
  padding-right: env(safe-area-inset-right, 20px);
}
```

### 4. Progressive Enhancement
Start with base styles, then enhance for specific platforms:

```css
/* Base styles for all platforms */
.component {
  padding: 16px;
  background: white;
}

/* Enhanced for desktop */
.device-desktop .component {
  padding: 24px;
  max-width: 1200px;
}

/* Enhanced for mobile */
.device-mobile .component {
  padding: 12px;
  border-radius: 0; /* Full-width on mobile */
}
```

## Conditional Rendering in React

You can also use the hook for conditional rendering:

```javascript
import { usePlatform } from './hooks/usePlatform';

function MyComponent() {
  const { isMobile, isDesktop } = usePlatform();

  return (
    <div>
      {isMobile && <MobileNavigation />}
      {isDesktop && <DesktopSidebar />}
    </div>
  );
}
```

## Testing

### Development (Browser)
The hook falls back to user agent detection, so you can test by:
1. Using browser DevTools device emulation
2. Changing the user agent string

### Production (Tauri)
Test on actual devices or use Tauri's development builds for each platform.

## Dependencies

- `@tauri-apps/plugin-os` - For accurate platform detection
- React hooks (`useState`, `useEffect`) - For state management

## Migration from Other Approaches

If you're currently using media queries only:

**Before:**
```css
@media (max-width: 768px) {
  .component { /* mobile styles */ }
}
```

**After:**
```css
.device-mobile .component { /* mobile styles */ }

/* Keep media query as fallback */
@media (max-width: 768px) {
  .component { /* mobile styles */ }
}
```

## Future Enhancements

Potential additions to the platform detection system:
- Screen size/density information
- Orientation detection
- Touch capability detection
- Dark mode preference
- System theme colors
