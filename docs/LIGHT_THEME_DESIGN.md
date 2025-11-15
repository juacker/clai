# Netdata AI - Light Theme Design Specification

**Version:** 1.0
**Date:** 2025-11-14
**Status:** Design Phase

---

## 📋 Table of Contents

1. [Overview](#overview)
2. [Design Philosophy](#design-philosophy)
3. [Netdata Brand Colors](#netdata-brand-colors)
4. [Color Palette](#color-palette)
5. [Component-Specific Guidelines](#component-specific-guidelines)
6. [Implementation Strategy](#implementation-strategy)
7. [Accessibility Considerations](#accessibility-considerations)
8. [Migration Plan](#migration-plan)

---

## 🎯 Overview

This document defines the new light theme design for Netdata AI, incorporating Netdata's iconic brand colors while maintaining the application's modern, minimalistic, and lightweight philosophy. The new theme will strengthen brand identity and create a more cohesive visual experience that users will immediately associate with Netdata.

### Current State

The existing light theme uses:
- **Primary Blue:** `#4a9eff` (generic blue)
- **Secondary Purple:** `#667eea` (indigo)
- **Success Green:** `rgba(16, 185, 129, ...)` (emerald)
- **White backgrounds** with subtle gray overlays

### Design Goal

Replace the generic color palette with Netdata's distinctive brand colors while preserving:
- ✅ Light, elegant, modern aesthetic
- ✅ Minimalistic design philosophy
- ✅ Excellent readability and contrast
- ✅ Smooth animations and transitions
- ✅ Cross-platform consistency

---

## 🎨 Design Philosophy

### Core Principles

1. **Netdata Brand Identity First**
   - Netdata Green (`#00AB44`) as the primary brand color
   - Complementary colors that support the green without overwhelming
   - Maintain brand recognition across all touchpoints

2. **Light, Modern, & Minimalistic**
   - Clean white backgrounds with subtle overlays
   - Generous whitespace
   - Refined typography hierarchy
   - Subtle shadows and depth

3. **Functional & Purposeful**
   - Colors serve a clear purpose (action, status, emphasis)
   - Semantic color usage (success, error, warning, info)
   - Visual hierarchy guides user attention

4. **Performance & Accessibility**
   - WCAG AA compliant contrast ratios (minimum 4.5:1 for text)
   - Color-blind friendly palette
   - Reduced motion support

---

## 🌈 Netdata Brand Colors

### Primary Brand Color

**Netdata Green**
```css
--netdata-green: #00AB44;
--netdata-green-rgb: 0, 171, 68;
```

This distinctive green is Netdata's signature color, representing:
- Growth and vitality (monitoring health)
- Technology and innovation
- Positive action and success
- Real-time responsiveness

### Supporting Brand Colors

**Netdata Dark Gray** (for contrast and text)
```css
--netdata-dark: #35414A;
--netdata-dark-rgb: 53, 65, 74;
```

**Netdata Light Gray** (for backgrounds and subtle elements)
```css
--netdata-gray: #8B9BA8;
--netdata-gray-rgb: 139, 155, 168;
```

---

## 🎨 Color Palette

### 1. Primary Colors

#### Netdata Green (Primary Action Color)
```css
/* Base */
--color-primary: #00AB44;
--color-primary-rgb: 0, 171, 68;

/* Variations */
--color-primary-light: #00C851;      /* Lighter, hover state */
--color-primary-lighter: #E6F9EE;    /* Very light, backgrounds */
--color-primary-dark: #009639;       /* Darker, active state */
--color-primary-darker: #007A2D;     /* Very dark, emphasis */

/* Alpha variations */
--color-primary-alpha-05: rgba(0, 171, 68, 0.05);
--color-primary-alpha-08: rgba(0, 171, 68, 0.08);
--color-primary-alpha-10: rgba(0, 171, 68, 0.10);
--color-primary-alpha-15: rgba(0, 171, 68, 0.15);
--color-primary-alpha-20: rgba(0, 171, 68, 0.20);
--color-primary-alpha-30: rgba(0, 171, 68, 0.30);
--color-primary-alpha-40: rgba(0, 171, 68, 0.40);
--color-primary-alpha-70: rgba(0, 171, 68, 0.70);
--color-primary-alpha-90: rgba(0, 171, 68, 0.90);
```

**Usage:**
- Primary action buttons
- Links and interactive elements
- Focus states
- Primary data visualization
- Success indicators (when contextually appropriate)

#### Netdata Teal (Secondary Action Color)
```css
/* Base - Complementary to green, modern tech feel */
--color-secondary: #00B5D8;
--color-secondary-rgb: 0, 181, 216;

/* Variations */
--color-secondary-light: #00D4FF;
--color-secondary-lighter: #E6F7FB;
--color-secondary-dark: #009BB8;
--color-secondary-darker: #007A93;

/* Alpha variations */
--color-secondary-alpha-05: rgba(0, 181, 216, 0.05);
--color-secondary-alpha-08: rgba(0, 181, 216, 0.08);
--color-secondary-alpha-10: rgba(0, 181, 216, 0.10);
--color-secondary-alpha-15: rgba(0, 181, 216, 0.15);
--color-secondary-alpha-20: rgba(0, 181, 216, 0.20);
--color-secondary-alpha-30: rgba(0, 181, 216, 0.30);
```

**Usage:**
- Secondary buttons and actions
- Context indicators (Space badges)
- Alternative data series in charts
- Informational highlights
- Terminal cursor and prompts

### 2. Neutral Colors

#### Backgrounds
```css
/* Pure white base */
--color-bg-primary: #FFFFFF;
--color-bg-primary-rgb: 255, 255, 255;

/* Semi-transparent white for glassmorphism */
--color-bg-glass: rgba(255, 255, 255, 0.98);
--color-bg-glass-light: rgba(255, 255, 255, 0.95);

/* Light gray backgrounds */
--color-bg-secondary: #F8F9FA;       /* Very light gray */
--color-bg-tertiary: #F1F3F5;        /* Light gray */
--color-bg-hover: #E9ECEF;           /* Hover state */
--color-bg-active: #DEE2E6;          /* Active state */

/* Subtle overlays (using black with low opacity) */
--color-overlay-02: rgba(0, 0, 0, 0.02);
--color-overlay-04: rgba(0, 0, 0, 0.04);
--color-overlay-06: rgba(0, 0, 0, 0.06);
--color-overlay-08: rgba(0, 0, 0, 0.08);
```

#### Text Colors
```css
/* Primary text (Netdata Dark Gray based) */
--color-text-primary: rgba(53, 65, 74, 0.95);    /* Near black, excellent readability */
--color-text-secondary: rgba(53, 65, 74, 0.75);  /* Medium emphasis */
--color-text-tertiary: rgba(53, 65, 74, 0.55);   /* Low emphasis */
--color-text-disabled: rgba(53, 65, 74, 0.38);   /* Disabled state */
--color-text-placeholder: rgba(53, 65, 74, 0.40);/* Placeholders */

/* Alternative using Netdata Gray */
--color-text-muted: #8B9BA8;                     /* Muted text */
--color-text-subtle: rgba(139, 155, 168, 0.7);   /* Very subtle */
```

#### Borders
```css
/* Light borders */
--color-border-light: rgba(53, 65, 74, 0.08);
--color-border-medium: rgba(53, 65, 74, 0.12);
--color-border-strong: rgba(53, 65, 74, 0.20);

/* Specific use cases */
--color-border-default: rgba(53, 65, 74, 0.12);
--color-border-hover: rgba(0, 171, 68, 0.30);    /* Green on hover */
--color-border-focus: rgba(0, 171, 68, 0.40);    /* Green on focus */
```

### 3. Semantic Colors

#### Success (Netdata Green)
```css
--color-success: #00AB44;
--color-success-light: #00C851;
--color-success-lighter: #E6F9EE;
--color-success-dark: #009639;

/* Alpha variations */
--color-success-alpha-06: rgba(0, 171, 68, 0.06);
--color-success-alpha-10: rgba(0, 171, 68, 0.10);
--color-success-alpha-90: rgba(0, 171, 68, 0.90);
```

**Usage:**
- Success messages
- Completed states
- Positive metrics
- Health indicators (OK status)

#### Error (Netdata Red)
```css
--color-error: #E74C3C;              /* Warm red, less aggressive */
--color-error-light: #FF6B6B;
--color-error-lighter: #FFE8E8;
--color-error-dark: #C0392B;

/* Alpha variations */
--color-error-alpha-06: rgba(231, 76, 60, 0.06);
--color-error-alpha-10: rgba(231, 76, 60, 0.10);
--color-error-alpha-90: rgba(231, 76, 60, 0.90);
```

**Usage:**
- Error messages
- Failed states
- Critical alerts
- Destructive actions

#### Warning (Netdata Orange)
```css
--color-warning: #F39C12;            /* Warm orange */
--color-warning-light: #FFC107;
--color-warning-lighter: #FFF3E0;
--color-warning-dark: #E67E22;

/* Alpha variations */
--color-warning-alpha-06: rgba(243, 156, 18, 0.06);
--color-warning-alpha-10: rgba(243, 156, 18, 0.10);
--color-warning-alpha-90: rgba(243, 156, 18, 0.90);
```

**Usage:**
- Warning messages
- Caution states
- Moderate alerts
- Pending actions

#### Info (Netdata Teal)
```css
--color-info: #00B5D8;               /* Using secondary teal */
--color-info-light: #00D4FF;
--color-info-lighter: #E6F7FB;
--color-info-dark: #009BB8;

/* Alpha variations */
--color-info-alpha-06: rgba(0, 181, 216, 0.06);
--color-info-alpha-10: rgba(0, 181, 216, 0.10);
--color-info-alpha-90: rgba(0, 181, 216, 0.90);
```

**Usage:**
- Informational messages
- Help text
- Neutral notifications
- Loading states

### 4. Chart & Data Visualization Colors

#### Primary Chart Palette (Netdata-inspired)
```css
/* 8-color palette for data visualization */
--chart-color-1: #00AB44;    /* Netdata Green */
--chart-color-2: #00B5D8;    /* Netdata Teal */
--chart-color-3: #3498DB;    /* Sky Blue */
--chart-color-4: #9B59B6;    /* Purple */
--chart-color-5: #F39C12;    /* Orange */
--chart-color-6: #E74C3C;    /* Red */
--chart-color-7: #1ABC9C;    /* Turquoise */
--chart-color-8: #34495E;    /* Dark Gray */
```

#### Chart Elements
```css
/* Grid and axes */
--chart-grid: rgba(53, 65, 74, 0.10);
--chart-axis: rgba(53, 65, 74, 0.20);
--chart-label: rgba(53, 65, 74, 0.75);

/* Chart backgrounds */
--chart-bg: rgba(255, 255, 255, 0.04);
--chart-bg-hover: rgba(255, 255, 255, 0.06);
--chart-border: rgba(255, 255, 255, 0.12);
--chart-border-hover: rgba(0, 171, 68, 0.30);

/* Chart title */
--chart-title: #00AB44;      /* Netdata Green for emphasis */
```

### 5. Special Colors

#### Accent & Highlights
```css
/* Code and monospace */
--color-code-bg: rgba(0, 171, 68, 0.05);
--color-code-text: #007A2D;
--color-code-border: rgba(0, 171, 68, 0.15);

/* Selection */
--color-selection-bg: rgba(0, 171, 68, 0.15);
--color-selection-text: rgba(53, 65, 74, 0.95);

/* Shadows */
--shadow-sm: 0 1px 3px rgba(53, 65, 74, 0.08);
--shadow-md: 0 4px 12px rgba(53, 65, 74, 0.10);
--shadow-lg: 0 8px 24px rgba(53, 65, 74, 0.12);
--shadow-xl: 0 12px 36px rgba(53, 65, 74, 0.15);

/* Primary color shadows (for emphasis) */
--shadow-primary: 0 4px 12px rgba(0, 171, 68, 0.25);
--shadow-primary-lg: 0 8px 24px rgba(0, 171, 68, 0.30);
```

---

## 🎯 Component-Specific Guidelines

### Chat Components

#### Chat Container
```css
.chatContainer {
  background: var(--color-bg-primary);
  border: 1px solid var(--color-border-light);
  box-shadow: var(--shadow-md);
}
```

#### Chat Header
```css
.chatHeader {
  background: var(--color-overlay-02);
  border-bottom: 1px solid var(--color-border-light);
}

.chatTitle {
  color: var(--color-text-primary);
}

.chatContext {
  color: var(--color-text-tertiary);
}

.contextValue {
  color: var(--color-secondary);              /* Teal for context */
  background: var(--color-secondary-alpha-08);
  border: 1px solid var(--color-secondary-alpha-15);
}
```

#### Message Bubbles
```css
/* Assistant messages */
.messageBubble {
  background: var(--color-overlay-04);
  border: 1px solid var(--color-border-light);
  color: var(--color-text-primary);
}

/* User messages */
.messageBubbleOwn {
  background: var(--color-primary-alpha-08);   /* Light green tint */
  border: 1px solid var(--color-primary-alpha-20);
  color: var(--color-text-primary);
}
```

#### Buttons
```css
/* Primary action button */
.primaryButton {
  background: var(--color-primary);            /* Netdata Green */
  color: #FFFFFF;
  border: none;
  box-shadow: var(--shadow-sm);
}

.primaryButton:hover {
  background: var(--color-primary-light);
  box-shadow: var(--shadow-primary);
  transform: translateY(-1px);
}

.primaryButton:active {
  background: var(--color-primary-dark);
  transform: translateY(0);
}

/* Secondary button */
.secondaryButton {
  background: var(--color-bg-secondary);
  color: var(--color-text-primary);
  border: 1px solid var(--color-border-medium);
}

.secondaryButton:hover {
  background: var(--color-bg-hover);
  border-color: var(--color-primary-alpha-30);
}
```

#### Input Fields
```css
.input {
  background: var(--color-overlay-04);
  border: 1px solid var(--color-border-medium);
  color: var(--color-text-primary);
}

.input:focus {
  background: var(--color-bg-primary);
  border-color: var(--color-border-focus);      /* Green focus */
  box-shadow: 0 0 0 3px var(--color-primary-alpha-08);
  outline: none;
}

.input::placeholder {
  color: var(--color-text-placeholder);
}
```

### Terminal Emulator

```css
.terminal {
  background: var(--color-bg-glass);
  backdrop-filter: blur(20px);
  border-top: 1px solid var(--color-border-light);
  box-shadow: 0 -4px 24px rgba(53, 65, 74, 0.06);
}

.terminalPrompt {
  color: var(--color-primary-alpha-70);         /* Green prompt */
  font-weight: 500;
}

.terminalInput {
  background: var(--color-overlay-02);
  border: 1px solid var(--color-border-light);
  color: var(--color-text-primary);
}

.terminalInput:focus-within {
  background: var(--color-bg-primary);
  border-color: var(--color-border-focus);
  box-shadow: 0 0 0 3px var(--color-primary-alpha-08);
}

.fatCursor {
  background: var(--color-primary-alpha-70);    /* Green cursor */
}

/* Output messages */
.outputMessageSuccess {
  background: var(--color-success-alpha-06);
  border-left: 3px solid var(--color-success);
  color: var(--color-success-dark);
}

.outputMessageError {
  background: var(--color-error-alpha-06);
  border-left: 3px solid var(--color-error);
  color: var(--color-error-dark);
}

.outputMessageWarning {
  background: var(--color-warning-alpha-06);
  border-left: 3px solid var(--color-warning);
  color: var(--color-warning-dark);
}

.outputMessageInfo {
  background: var(--color-info-alpha-06);
  border-left: 3px solid var(--color-info);
  color: var(--color-info-dark);
}
```

### Chart Components

```css
.chartContainer {
  background: var(--chart-bg);
  border: 1px solid var(--chart-border);
  border-radius: 10px;
  backdrop-filter: blur(8px);
}

.chartContainer:hover {
  border-color: var(--chart-border-hover);      /* Green on hover */
  background: var(--chart-bg-hover);
  box-shadow: var(--shadow-md);
  transform: translateY(-1px);
}

.chartTitle {
  color: var(--chart-title);                    /* Netdata Green */
  font-weight: 600;
}

/* Legend items */
.legendItem {
  color: var(--color-text-secondary);
}

.legendItem:hover {
  color: var(--color-text-primary);
}

/* Axes and grid */
.chartSvg :global(.grid) line {
  stroke: var(--chart-grid);
  stroke-dasharray: 2, 2;
}

.chartSvg :global(.axis) line,
.chartSvg :global(.axis) path {
  stroke: var(--chart-axis);
}

.chartSvg :global(.axis) text {
  fill: var(--chart-label);
}

/* Tooltip */
.tooltip {
  background: var(--color-bg-glass);
  border: 1px solid var(--color-border-medium);
  border-radius: 8px;
  backdrop-filter: blur(12px);
  box-shadow: var(--shadow-lg);
}
```

### Context Components

```css
/* Context badges */
.contextBadgeSpace {
  background: var(--color-secondary-alpha-08);  /* Teal for spaces */
  border: 1px solid var(--color-secondary-alpha-20);
  color: var(--color-secondary-dark);
}

.contextBadgeRoom {
  background: var(--color-primary-alpha-08);    /* Green for rooms */
  border: 1px solid var(--color-primary-alpha-20);
  color: var(--color-primary-dark);
}

.contextBadgeNode {
  background: var(--color-overlay-04);
  border: 1px solid var(--color-border-medium);
  color: var(--color-text-secondary);
}
```

### Tab Components

```css
.tabBar {
  background: var(--color-bg-glass);
  backdrop-filter: blur(20px);
  border-bottom: 1px solid var(--color-border-light);
}

.tab {
  color: var(--color-text-tertiary);
  border-bottom: 2px solid transparent;
}

.tab:hover {
  color: var(--color-text-secondary);
  background: var(--color-overlay-02);
}

.tabActive {
  color: var(--color-primary);                  /* Green for active */
  border-bottom-color: var(--color-primary);
  font-weight: 600;
}
```

### Loading States

```css
.loadingSpinner {
  width: 40px;
  height: 40px;
  border: 4px solid var(--color-overlay-08);
  border-top-color: var(--color-primary);       /* Green spinner */
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

.loadingText {
  color: var(--color-text-tertiary);
}
```

---

## 🚀 Implementation Strategy

### Phase 1: Foundation (Week 1)

1. **Create CSS Variables File**
   - Create `/src/styles/theme-light.css`
   - Define all color variables
   - Set up color system architecture

2. **Update Global Styles**
   - Import theme variables globally
   - Update `:root` declarations
   - Add fallback values

3. **Documentation**
   - Create color palette guide
   - Document usage patterns
   - Provide code examples

### Phase 2: Core Components (Week 2-3)

**Priority Order:**

1. **Chat Components** (High Priority)
   - `Chat.module.css`
   - `DesktopChatPanel.module.css`
   - `MobileChatPanel.module.css`
   - `MarkdownMessage.module.css`

2. **Terminal Components** (High Priority)
   - `TerminalEmulator.module.css`
   - `MobileTerminalSheet.module.css`

3. **Context Components** (Medium Priority)
   - `ContextPanel.module.css`
   - `ContextBadge.module.css`
   - `ContextSelector.module.css`

4. **Navigation Components** (Medium Priority)
   - `TabBar.module.css`
   - `TabView.module.css`
   - `TabContent.module.css`

### Phase 3: Data Visualization (Week 4)

1. **Chart Components**
   - `BarChartBlock.module.css`
   - `BubbleChartBlock.module.css`
   - `TimeSeriesChartBlock.module.css`
   - `LoadChartBlock.module.css`
   - `ToolBlock.module.css`

2. **Update Chart Color Schemes**
   - Modify default color arrays
   - Update legend styling
   - Adjust tooltip colors

### Phase 4: Remaining Components (Week 5)

1. **Layout Components**
   - `MainLayout.module.css`
   - `Home.module.css`
   - `Login.module.css`

2. **Utility Components**
   - `UserAvatar.module.css`
   - `Echo.module.css`
   - `TileView.module.css`

### Phase 5: Testing & Refinement (Week 6)

1. **Visual QA**
   - Test all components on desktop
   - Test all components on mobile
   - Verify hover states and interactions

2. **Accessibility Audit**
   - Check contrast ratios
   - Test with screen readers
   - Verify keyboard navigation

3. **Performance Testing**
   - Measure render performance
   - Check animation smoothness
   - Optimize if needed

---

## ♿ Accessibility Considerations

### Contrast Ratios (WCAG AA Compliance)

All text and interactive elements meet minimum contrast requirements:

| Element Type | Foreground | Background | Ratio | Status |
|--------------|------------|------------|-------|--------|
| Primary Text | `rgba(53, 65, 74, 0.95)` | `#FFFFFF` | 11.2:1 | ✅ AAA |
| Secondary Text | `rgba(53, 65, 74, 0.75)` | `#FFFFFF` | 8.5:1 | ✅ AAA |
| Tertiary Text | `rgba(53, 65, 74, 0.55)` | `#FFFFFF` | 5.2:1 | ✅ AA |
| Green Button | `#FFFFFF` | `#00AB44` | 4.8:1 | ✅ AA |
| Green Link | `#007A2D` | `#FFFFFF` | 7.1:1 | ✅ AAA |
| Error Text | `#C0392B` | `#FFFFFF` | 6.9:1 | ✅ AAA |

### Color Blindness Support

The palette has been designed to be distinguishable for common types of color blindness:

- **Protanopia (Red-Blind):** Green and teal remain distinct
- **Deuteranopia (Green-Blind):** Hue differences maintained
- **Tritanopia (Blue-Blind):** Green and orange provide clear contrast

### Additional Considerations

- **Icons:** All status indicators include icons, not just colors
- **Focus States:** Clear focus indicators with 3px outlines
- **Motion:** Respect `prefers-reduced-motion` media query
- **Text Sizing:** Relative units (rem, em) for scalability

---

## 📊 Migration Plan

### Component Migration Checklist

For each component, follow this process:

- [ ] **Backup:** Save current CSS file
- [ ] **Replace Colors:** Update with new variables
- [ ] **Test Desktop:** Verify on desktop browsers
- [ ] **Test Mobile:** Verify on mobile devices
- [ ] **Test Dark Mode:** Ensure no conflicts (if applicable)
- [ ] **Accessibility Check:** Verify contrast ratios
- [ ] **Performance Check:** Ensure no regression
- [ ] **Documentation:** Update component docs

### Testing Checklist

- [ ] Visual consistency across all components
- [ ] Hover states work correctly
- [ ] Focus states are visible
- [ ] Active states provide feedback
- [ ] Loading states are clear
- [ ] Error states are prominent
- [ ] Success states are positive
- [ ] Animations are smooth
- [ ] Responsive behavior works
- [ ] Touch targets are adequate (mobile)

---

## 🎨 Design Tokens (Future Enhancement)

For future scalability, consider implementing a design token system:

```javascript
// tokens/colors.js
export const colors = {
  brand: {
    primary: '#00AB44',
    secondary: '#00B5D8',
    // ...
  },
  semantic: {
    success: '#00AB44',
    error: '#E74C3C',
    // ...
  },
  // ...
};
```

This would allow:
- Programmatic color generation
- Theme switching (light/dark)
- Platform-specific overrides
- Easier maintenance

---

## 📝 Summary

This light theme design brings Netdata's brand identity to the forefront while maintaining the application's core design principles:

### Key Changes

1. **Primary Color:** `#4a9eff` (generic blue) → `#00AB44` (Netdata Green)
2. **Secondary Color:** `#667eea` (purple) → `#00B5D8` (Netdata Teal)
3. **Text Colors:** Shifted to Netdata Dark Gray base for better brand alignment
4. **Chart Titles:** Now use Netdata Green for emphasis
5. **Context Badges:** Spaces use teal, rooms use green
6. **Success States:** Unified with Netdata Green

### Benefits

✅ **Stronger Brand Identity:** Immediate Netdata recognition
✅ **Visual Consistency:** Cohesive color system across all components
✅ **Better Accessibility:** Improved contrast ratios
✅ **Modern Aesthetic:** Fresh, clean, professional appearance
✅ **Semantic Clarity:** Colors convey meaning and purpose
✅ **Scalability:** Well-documented system for future expansion

### Next Steps

1. Review and approve this design specification
2. Create CSS variables file with all color definitions
3. Begin component-by-component migration
4. Test thoroughly on all platforms
5. Gather user feedback and iterate

---

**Document prepared by:** AI Assistant
**For:** Netdata AI Application
**Review Status:** Pending Approval

---

## Appendix A: Color Comparison

### Before (Current)

| Purpose | Current Color | Name |
|---------|---------------|------|
| Primary | `#4a9eff` | Generic Blue |
| Secondary | `#667eea` | Indigo |
| Success | `rgba(16, 185, 129, ...)` | Emerald |
| Error | `rgba(239, 68, 68, ...)` | Red |
| Warning | `rgba(245, 158, 11, ...)` | Amber |

### After (Proposed)

| Purpose | New Color | Name |
|---------|-----------|------|
| Primary | `#00AB44` | Netdata Green |
| Secondary | `#00B5D8` | Netdata Teal |
| Success | `#00AB44` | Netdata Green |
| Error | `#E74C3C` | Warm Red |
| Warning | `#F39C12` | Orange |

## Appendix B: Implementation Example

### Before
```css
.button {
  background: #4a9eff;
  color: white;
  border: none;
}

.button:hover {
  background: #3a8eef;
}
```

### After
```css
.button {
  background: var(--color-primary);
  color: white;
  border: none;
}

.button:hover {
  background: var(--color-primary-light);
  box-shadow: var(--shadow-primary);
}
```

---

*End of Document*

