# CLAI - Light Theme Design Specification

**Version:** 2.0
**Date:** 2026-01-02
**Status:** Implemented

---

## Design Philosophy

**"Premium Indigo Intelligence Platform"**

The CLAI light theme creates a visually distinctive, premium desktop application experience using indigo as the primary brand color with Netdata green as the accent.

### Core Principles

1. **Premium Brand Identity** - Indigo (#6366F1) conveys intelligence, modernity, and sophistication
2. **Accent for Action** - Netdata Green (#00AB94) for success states and positive actions
3. **Glass Morphism** - Layered depth with blur and saturation effects
4. **Purposeful Animation** - Micro-interactions that guide, not distract
5. **Accessibility First** - WCAG AA compliance maintained throughout

---

## Color Palette

### Primary (Indigo)

| Color | Hex | Usage |
|-------|-----|-------|
| Primary | `#6366F1` | Main brand color, focus states |
| Primary Light | `#818CF8` | Gradients, hover states |
| Primary Dark | `#4F46E5` | Active states, emphasis |

### Accent (Netdata Green)

| Color | Hex | Usage |
|-------|-----|-------|
| Accent | `#00AB94` | Success, CTAs, positive states |
| Accent Light | `#00C49A` | Lighter emphasis |
| Accent Dark | `#009682` | Darker text on light backgrounds |

### Gradients

```css
--gradient-primary: linear-gradient(135deg, #818CF8 0%, #6366F1 100%);
--gradient-accent: linear-gradient(135deg, #00C49A 0%, #00AB94 100%);
--gradient-mixed: linear-gradient(135deg, #818CF8 0%, #00C49A 100%);
```

---

## Signature Visual Elements

### 1. Glass Panels
Tinted glass backgrounds with blur:
```css
background: rgba(248, 247, 255, 0.85);
backdrop-filter: blur(16px) saturate(180%);
border: 1px solid rgba(99, 102, 241, 0.12);
```

### 2. Gradient Buttons
Primary actions use indigo gradient:
```css
background: var(--gradient-primary);
box-shadow: 0 4px 14px rgba(99, 102, 241, 0.25);
```

### 3. Accent Line Headers
Thin gradient line at top of panels (2px height).

### 4. Gradient Tab Indicators
Active tabs have gradient underline with glow.

### 5. The CLAI Glow
Indigo glow on focused/active elements:
```css
box-shadow: 0 0 20px rgba(99, 102, 241, 0.20);
```

---

## Component Guidelines

### Chat Messages
- **AI Messages**: Indigo gradient background (`rgba(99, 102, 241, 0.04)` to `0.08`), indigo left border
- **User Messages**: Green accent background, green left border

### Buttons
- **Primary**: Indigo gradient with glow on hover
- **Secondary**: Transparent with indigo border
- **Accent**: Green gradient for positive actions

### Badges
- **Space/Context**: Indigo theme
- **Credits/Success**: Green accent theme
- **Warning**: Orange theme
- **Error**: Red theme

### Input Fields
- Default border: `--color-border-medium`
- Focus: Indigo border with indigo ring shadow

### Terminal
- Glass background with gradient accent line at top
- Gradient text for prompt symbol
- Indigo focus ring on input

---

## Files Modified

### Foundation
- `src/styles/theme-light.css` - Color variables, gradients, glass, shadows
- `src/styles/global.css` - Animation keyframes

### Components
- `Chat.module.css` - Messages, buttons, header
- `TabBar.module.css` - Glass background, gradient indicators
- `TerminalEmulator.module.css` - Gradient accent, prompt styling
- `ContextPanel.module.css` - Tinted glass
- `ContextBadge.module.css` - Indigo/green badge variants
- `ToolBlock.module.css` - Status indicators
- `Canvas.module.css` - Glass header
- `Login.module.css` - Mesh gradient, glass card
- `DesktopChatPanel.module.css` - Tinted glass, indigo shadow
- `NetdataSpinner.module.css` - Indigo glow

---

## Accessibility

All color combinations meet WCAG AA standards:
- Primary text on white: 11.2:1
- Secondary text on white: 8.5:1
- White on indigo: 4.8:1

Reduced motion support included for all animations.

---

**Document Status**: Implemented
**Last Updated**: 2026-01-02
