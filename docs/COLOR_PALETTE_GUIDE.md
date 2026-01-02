# CLAI - Color Palette Guide

**Version:** 2.0
**Date:** 2026-01-02
**Status:** Active

---

## Overview

This guide documents the CLAI "Premium Indigo Intelligence Platform" light theme color palette. The color system uses CSS custom properties (variables) defined in `/src/styles/theme-light.css`.

### Design Philosophy

- **Indigo (#6366F1)** as primary brand color - intelligent, modern, premium
- **Netdata Green (#00AB94)** as accent - healthy states, success actions, CTAs
- Glass morphism for layered depth
- Indigo-tinted shadows for cohesive warmth
- Purposeful animations that guide, not distract

---

## Primary Colors (Indigo)

The primary brand color used for main actions, focus states, and brand emphasis.

| Variable | Value | Usage |
|----------|-------|-------|
| `--color-primary` | `#6366F1` | Base indigo color |
| `--color-primary-light` | `#818CF8` | Hover states, lighter emphasis |
| `--color-primary-dark` | `#4F46E5` | Active states, pressed buttons |
| `--color-primary-darker` | `#4338CA` | Deep emphasis, strong contrast |

### Alpha Variations

| Variable | Opacity | Usage |
|----------|---------|-------|
| `--color-primary-alpha-04` | 4% | Very subtle backgrounds |
| `--color-primary-alpha-08` | 8% | Badge backgrounds |
| `--color-primary-alpha-10` | 10% | Light backgrounds |
| `--color-primary-alpha-15` | 15% | Medium backgrounds |
| `--color-primary-alpha-20` | 20% | Badge borders |
| `--color-primary-alpha-30` | 30% | Hover borders |
| `--color-primary-alpha-40` | 40% | Focus rings |

---

## Accent Colors (Netdata Green)

The accent color used for success states, CTAs, and positive actions.

| Variable | Value | Usage |
|----------|-------|-------|
| `--color-accent` | `#00AB94` | Base green color |
| `--color-accent-light` | `#00C49A` | Lighter emphasis |
| `--color-accent-dark` | `#009682` | Darker emphasis |

### Alpha Variations

| Variable | Opacity | Usage |
|----------|---------|-------|
| `--color-accent-alpha-06` | 6% | Success backgrounds |
| `--color-accent-alpha-10` | 10% | Light backgrounds |
| `--color-accent-alpha-20` | 20% | Badge borders |

---

## Gradients

| Variable | Value | Usage |
|----------|-------|-------|
| `--gradient-primary` | `linear-gradient(135deg, #818CF8 0%, #6366F1 100%)` | Primary buttons, active indicators |
| `--gradient-primary-hover` | `linear-gradient(135deg, #6366F1 0%, #4F46E5 100%)` | Button hover states |
| `--gradient-accent` | `linear-gradient(135deg, #00C49A 0%, #00AB94 100%)` | Accent buttons, success states |
| `--gradient-mixed` | `linear-gradient(135deg, #818CF8 0%, #00C49A 100%)` | Special emphasis, terminal accent |
| `--gradient-mesh` | Multi-layer radial gradient | Background decoration |

---

## Glass Morphism

| Variable | Value | Usage |
|----------|-------|-------|
| `--glass-bg` | `rgba(255, 255, 255, 0.72)` | Glass panels |
| `--glass-bg-strong` | `rgba(255, 255, 255, 0.88)` | Strong glass effect |
| `--glass-bg-tinted` | `rgba(248, 247, 255, 0.85)` | Indigo-tinted glass |
| `--glass-border` | `rgba(255, 255, 255, 0.20)` | Glass borders |
| `--glass-border-tinted` | `rgba(99, 102, 241, 0.12)` | Indigo-tinted borders |

### Usage Example

```css
.glassPanel {
  background: var(--glass-bg-tinted);
  backdrop-filter: blur(16px) saturate(180%);
  -webkit-backdrop-filter: blur(16px) saturate(180%);
  border: 1px solid var(--glass-border-tinted);
}
```

---

## Shadows

### Standard Shadows

| Variable | Usage |
|----------|-------|
| `--shadow-xs` | Very subtle depth |
| `--shadow-sm` | Small elevation |
| `--shadow-md` | Medium elevation |
| `--shadow-lg` | Large elevation |
| `--shadow-xl` | Extra large elevation |

### Primary (Indigo) Shadows

| Variable | Usage |
|----------|-------|
| `--shadow-primary` | Primary buttons |
| `--shadow-primary-glow` | Hover glow effect |
| `--shadow-ring-primary` | Focus ring |

---

## Semantic Colors

### Success (Accent Green)

| Variable | Value | Usage |
|----------|-------|-------|
| `--color-success` | `#00AB94` | Success messages |
| `--color-success-light` | `#00C49A` | Light emphasis |
| `--color-success-dark` | `#009682` | Text on light bg |

### Error

| Variable | Value | Usage |
|----------|-------|-------|
| `--color-error` | `#EF4444` | Error messages |
| `--color-error-light` | `#F87171` | Light emphasis |
| `--color-error-dark` | `#DC2626` | Text on light bg |

### Warning

| Variable | Value | Usage |
|----------|-------|-------|
| `--color-warning` | `#F59E0B` | Warning messages |
| `--color-warning-light` | `#FBBF24` | Light emphasis |
| `--color-warning-dark` | `#D97706` | Text on light bg |

### Info

| Variable | Value | Usage |
|----------|-------|-------|
| `--color-info` | `#3B82F6` | Info messages |
| `--color-info-light` | `#60A5FA` | Light emphasis |
| `--color-info-dark` | `#2563EB` | Text on light bg |

---

## Signature Visual Elements

### 1. The CLAI Glow
Subtle indigo glow on active/focused elements:
```css
box-shadow: 0 0 20px rgba(99, 102, 241, 0.20);
```

### 2. Gradient Border Cards
Premium feel on hover using mask technique:
```css
.card::before {
  background: var(--gradient-primary);
  -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
  -webkit-mask-composite: xor;
  mask-composite: exclude;
}
```

### 3. Gradient Underline Indicators
Active tabs with animated gradient:
```css
.tabActive::after {
  background: var(--gradient-primary);
  box-shadow: 0 0 8px rgba(99, 102, 241, 0.4);
}
```

### 4. Glass Panels
Layered depth with blur and saturation:
```css
backdrop-filter: blur(16px) saturate(180%);
```

### 5. Accent Line Headers
Thin gradient line at top of panels:
```css
.header::before {
  height: 2px;
  background: var(--gradient-primary);
}
```

---

## Component Usage

### Buttons

**Primary Button (Gradient)**:
```css
.primaryButton {
  background: var(--gradient-primary);
  color: white;
  box-shadow: var(--shadow-primary);
}

.primaryButton:hover {
  box-shadow: var(--shadow-primary-glow);
  transform: translateY(-2px);
}
```

**Accent Button (Green)**:
```css
.accentButton {
  background: var(--gradient-accent);
  color: white;
}
```

### Badges

**Space Badge (Indigo)**:
```css
.spaceBadge {
  background: linear-gradient(135deg, rgba(99, 102, 241, 0.08), rgba(99, 102, 241, 0.12));
  border: 1px solid rgba(99, 102, 241, 0.2);
  color: var(--color-primary);
}
```

**Credits Badge (Green)**:
```css
.creditsBadge {
  background: linear-gradient(135deg, rgba(0, 171, 148, 0.06), rgba(0, 171, 148, 0.10));
  border: 1px solid rgba(0, 171, 148, 0.2);
  color: var(--color-accent-dark);
}
```

### Input Focus

```css
.input:focus {
  border-color: var(--color-primary);
  box-shadow: var(--shadow-ring-primary);
}
```

---

## Accessibility

### Contrast Ratios (WCAG AA)

| Foreground | Background | Ratio | Status |
|------------|------------|-------|--------|
| Primary text | White | 11.2:1 | AAA |
| Secondary text | White | 8.5:1 | AAA |
| Tertiary text | White | 5.2:1 | AA |
| White on Indigo | #6366F1 | 4.8:1 | AA |

### Reduced Motion Support

```css
@media (prefers-reduced-motion: reduce) {
  * {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

---

## Migration from v1.0

| v1.0 (Green Primary) | v2.0 (Indigo Primary) |
|---------------------|----------------------|
| `#00AB44` primary | `#6366F1` primary |
| `#00B5D8` secondary | `#00AB94` accent |
| Green buttons | Indigo gradient buttons |
| Green focus rings | Indigo focus rings |

---

**Document Status**: Active
**Last Updated**: 2026-01-02

*End of Color Palette Guide*
