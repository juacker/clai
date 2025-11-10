# Chat Panel Architectural Refactoring - Design Document

**Date:** 2025-11-06
**Status:** Design Phase
**Priority:** High

---

## Executive Summary

This document outlines the architectural changes needed to properly implement a chat panel that behaves differently on desktop and mobile platforms. The current implementation has a fundamental limitation: the chat panel is nested inside the TerminalEmulator component, which prevents it from taking full viewport height on desktop.

---

## Problem Statement

### Current Architecture Issues

1. **Desktop Limitation:**
   - Chat panel is nested inside TerminalEmulator component
   - TerminalEmulator has fixed position at bottom with `max-height: 50vh`
   - Chat panel cannot exceed parent's height constraints
   - Attempting to make a full-height vertical panel within a half-height horizontal bar is architecturally impossible

2. **Coupling Issues:**
   - Chat functionality is tightly coupled with terminal component
   - Violates separation of concerns principle
   - Makes platform-specific behavior difficult to implement cleanly

3. **Layout Conflicts:**
   - Desktop needs: Full-height vertical panel on right side
   - Mobile needs: Bottom sheet that expands upward
   - Current structure cannot support both paradigms elegantly

---

## Design Goals

### Functional Requirements

1. **Desktop Behavior:**
   - Chat panel must be a fixed, full-height vertical panel on the right side
   - Expands from right to left (width: 0 → 400px)
   - Takes full viewport height (0 to 100vh)
   - Independent from terminal component
   - z-index above all other content

2. **Mobile Behavior:**
   - Chat remains in the draggable bottom sheet (MobileTerminalSheet)
   - Expands from bottom to top
   - Leverages existing drag gesture functionality
   - Maximum height: 50-60vh to avoid covering entire screen

3. **Terminal Behavior:**
   - Terminal only contains chat toggle button
   - No chat rendering inside terminal component
   - Clean separation of concerns

### Non-Functional Requirements

1. **Performance:**
   - No unnecessary re-renders
   - Smooth animations on both platforms
   - Efficient state management

2. **Code Quality:**
   - Clear separation of concerns
   - Reusable components
   - Maintainable architecture

3. **User Experience:**
   - Consistent behavior within each platform
   - Smooth transitions
   - Intuitive interactions

---

## Proposed Architecture

### Component Structure

```
MainLayout (Root)
├── CommandProvider
├── SharedSpaceRoomDataProvider
├── TabManagerProvider
└── ChatManagerProvider
    ├── Desktop Mode
    │   ├── DesktopChatPanel (NEW - Fixed right panel, full height)
    │   │   └── Chat
    │   ├── TerminalEmulatorWrapper (Bottom, no chat)
    │   └── ContentArea (Main content)
    │
    └── Mobile Mode
        ├── MobileTerminalSheet (Draggable bottom sheet)
        │   ├── TerminalEmulatorWrapper (Terminal UI)
        │   └── MobileChatPanel (NEW - Inside sheet, optional)
        │       └── Chat
        └── ContentArea (Main content)
```

### Key Components

#### 1. DesktopChatPanel (NEW)
**Location:** `src/components/Chat/DesktopChatPanel.jsx`

**Purpose:** Desktop-specific chat panel container

**Responsibilities:**
- Fixed positioning on right side
- Full viewport height
- Expand/collapse animation (right to left)
- Consume ChatManagerContext for state
- Render Chat component inside

**Props:**
```javascript
{
  // No props needed - uses ChatManagerContext
}
```

**Styling Strategy:**
```css
/* Mobile-first: Hidden by default */
.desktopChatPanel {
  display: none;
}

/* Desktop: Show as fixed right panel */
@media (min-width: 769px) and (pointer: fine) {
  .desktopChatPanel {
    display: block;
    position: fixed;
    top: 0;
    right: 0;
    bottom: 0;
    width: 0;
    height: 100vh;
    background: rgba(255, 255, 255, 0.98);
    backdrop-filter: blur(20px);
    border-left: 1px solid rgba(0, 0, 0, 0.08);
    box-shadow: -4px 0 24px rgba(0, 0, 0, 0.06);
    z-index: 101;
    transition: width 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    overflow: hidden;
  }

  .desktopChatPanel.open {
    width: 400px;
  }
}

@media (min-width: 1200px) and (pointer: fine) {
  .desktopChatPanel.open {
    width: 480px;
  }
}
```

#### 2. MobileChatPanel (NEW - Optional)
**Location:** `src/components/Chat/MobileChatPanel.jsx`

**Purpose:** Mobile-specific chat panel wrapper inside MobileTerminalSheet

**Responsibilities:**
- Wrapper for Chat component on mobile
- Handle mobile-specific layout
- Integrate with MobileTerminalSheet's drag system

**Alternative:** We might not need this if Chat component can be directly rendered in MobileTerminalSheet. Decision depends on how much mobile-specific logic is needed.

#### 3. TerminalEmulator (MODIFIED)
**Changes:**
- Remove chat panel rendering
- Keep only chat toggle button
- Simplify structure

**Before:**
```jsx
<div className={styles.terminal}>
  <ContextPanel />
  <div className={styles.chatPanel}>  {/* REMOVE */}
    <Chat />
  </div>
  <div className={styles.terminalContent}>
    <input />
    <button onClick={toggleChat} />
  </div>
</div>
```

**After:**
```jsx
<div className={styles.terminal}>
  <ContextPanel />
  <div className={styles.terminalContent}>
    <input />
    <button onClick={toggleChat} />  {/* KEEP ONLY THIS */}
  </div>
</div>
```

#### 4. MainLayout (MODIFIED)
**Changes:**
- Add DesktopChatPanel for desktop mode
- Keep MobileTerminalSheet structure for mobile

**Implementation:**
```jsx
<ChatManagerProvider>
  <div className={styles.mainLayout}>
    {/* Desktop Mode */}
    {isDesktop && (
      <>
        <DesktopChatPanel />  {/* NEW */}
        <TerminalEmulatorWrapper userInfo={userInfo} />
        <div className={styles.contentArea}>
          <Outlet context={{ userInfo }} />
        </div>
      </>
    )}

    {/* Mobile Mode */}
    {isMobile && (
      <>
        <MobileTerminalSheet>
          <TerminalEmulatorWrapper userInfo={userInfo} />
          {/* Chat can be added here or inside TerminalEmulator */}
        </MobileTerminalSheet>
        <div className={styles.contentArea}>
          <Outlet context={{ userInfo }} />
        </div>
      </>
    )}
  </div>
</ChatManagerProvider>
```

#### 5. MobileTerminalSheet (MODIFIED - Optional)
**Potential Changes:**
- Add chat panel inside the sheet (if needed)
- Integrate chat with drag system
- Adjust height calculations to accommodate chat

**Decision Point:** Should chat be inside MobileTerminalSheet or remain in TerminalEmulator on mobile?

**Option A:** Chat inside MobileTerminalSheet (Recommended)
- Better separation of concerns
- Chat and terminal share the same draggable container
- More consistent with desktop architecture

**Option B:** Chat inside TerminalEmulator on mobile
- Less refactoring needed
- Existing structure mostly works on mobile
- Simpler migration path

---

## Implementation Phases

### Phase 1: Create DesktopChatPanel Component
**Goal:** Build the new desktop chat panel component

**Tasks:**
1. Create `src/components/Chat/DesktopChatPanel.jsx`
2. Create `src/components/Chat/DesktopChatPanel.module.css`
3. Implement basic structure with ChatManagerContext integration
4. Add animations (right-to-left expansion)
5. Test in isolation

**Files to Create:**
- `src/components/Chat/DesktopChatPanel.jsx`
- `src/components/Chat/DesktopChatPanel.module.css`

**Success Criteria:**
- Component renders correctly on desktop
- Expands/collapses smoothly
- Takes full viewport height
- Respects z-index stacking

---

### Phase 2: Integrate DesktopChatPanel into MainLayout
**Goal:** Mount the desktop chat panel at the layout level

**Tasks:**
1. Import DesktopChatPanel in MainLayout
2. Add conditional rendering for desktop mode
3. Ensure proper z-index stacking
4. Test with existing chat functionality
5. Verify toggle button works

**Files to Modify:**
- `src/layouts/MainLayout.jsx`
- `src/layouts/MainLayout.module.css` (if needed)

**Success Criteria:**
- Desktop chat panel appears on right side
- Toggle button in terminal controls chat panel
- No layout conflicts
- Smooth transitions

---

### Phase 3: Clean Up TerminalEmulator
**Goal:** Remove chat rendering from terminal component

**Tasks:**
1. Remove chat panel JSX from TerminalEmulator
2. Keep only the toggle button
3. Remove chat-related CSS from TerminalEmulator.module.css
4. Update component structure
5. Test on desktop and mobile

**Files to Modify:**
- `src/components/TerminalEmulator/TerminalEmulator.jsx`
- `src/components/TerminalEmulator/TerminalEmulator.module.css`

**Success Criteria:**
- Terminal is cleaner and simpler
- Toggle button still works
- No visual regressions on mobile
- Desktop uses new DesktopChatPanel

---

### Phase 4: Mobile Chat Integration (Decision Required)
**Goal:** Decide and implement mobile chat strategy

**Option A Tasks (Chat in MobileTerminalSheet):**
1. Create MobileChatPanel component (if needed)
2. Add chat to MobileTerminalSheet structure
3. Integrate with drag system
4. Adjust sheet height calculations
5. Test drag interactions

**Option B Tasks (Chat stays in TerminalEmulator on mobile):**
1. Add platform detection in TerminalEmulator
2. Keep chat rendering on mobile only
3. Ensure desktop doesn't render chat
4. Test both platforms

**Files to Modify (Option A):**
- `src/components/TerminalEmulator/MobileTerminalSheet.jsx`
- `src/components/TerminalEmulator/MobileTerminalSheet.module.css`
- `src/components/Chat/MobileChatPanel.jsx` (NEW)
- `src/components/Chat/MobileChatPanel.module.css` (NEW)

**Files to Modify (Option B):**
- `src/components/TerminalEmulator/TerminalEmulator.jsx`
- `src/components/TerminalEmulator/TerminalEmulator.module.css`

**Success Criteria:**
- Mobile chat works as expected
- Draggable bottom sheet behavior preserved
- No regressions in mobile UX
- Clean code architecture

---

### Phase 5: Testing & Polish
**Goal:** Comprehensive testing and refinements

**Tasks:**
1. Test desktop chat panel behavior
2. Test mobile chat behavior
3. Test toggle button on both platforms
4. Verify animations and transitions
5. Test edge cases (rapid toggling, resize, etc.)
6. Performance testing
7. Accessibility testing
8. Polish animations and timing

**Success Criteria:**
- All functionality works on both platforms
- Smooth animations
- No performance issues
- No visual glitches
- Passes accessibility checks

---

## Technical Decisions

### Decision 1: Mobile Chat Location
**Question:** Should mobile chat be in MobileTerminalSheet or TerminalEmulator?

**Recommendation:** **Option A - Chat in MobileTerminalSheet**

**Rationale:**
- Better separation of concerns
- Consistent architecture across platforms
- Terminal becomes truly platform-agnostic
- Easier to maintain long-term

**Trade-offs:**
- More refactoring work
- Need to integrate with drag system
- Potentially more complex state management

---

### Decision 2: Chat Component Reusability
**Question:** Should we have separate chat components for desktop and mobile?

**Recommendation:** **Reuse existing Chat component**

**Rationale:**
- Chat component itself is platform-agnostic
- Only the container/panel needs platform-specific behavior
- Reduces code duplication
- Easier maintenance

**Implementation:**
- `Chat.jsx` - Core chat component (unchanged)
- `DesktopChatPanel.jsx` - Desktop container
- `MobileChatPanel.jsx` - Mobile container (if needed)

---

### Decision 3: Animation Strategy
**Question:** How should we handle animations?

**Recommendation:** **CSS transitions with cubic-bezier easing**

**Rationale:**
- Better performance (GPU-accelerated)
- Smoother animations
- Consistent with existing codebase
- Easier to maintain

**Implementation:**
```css
transition: width 0.3s cubic-bezier(0.4, 0, 0.2, 1);
```

---

## State Management

### ChatManagerContext
**Current State:**
```javascript
{
  activeSpaceId: string | null,
  activeRoomId: string | null,
  isChatOpen: boolean,
  chatInstances: Map<string, ChatInstance>
}
```

**No changes needed** - existing context works for new architecture

**Usage:**
- DesktopChatPanel: `const { isCurrentChatOpen, toggleChat, getCurrentChatInstance } = useChatManager()`
- TerminalEmulator: `const { toggleChat } = useChatManager()`

---

## CSS Architecture

### Mobile-First Approach
Following project guidelines, use mobile-first CSS with media queries:

```css
/* 1. Default (Mobile) */
.chatPanel {
  /* Mobile styles */
  display: none; /* Hidden on mobile if in DesktopChatPanel */
}

/* 2. Desktop override */
@media (min-width: 769px) and (pointer: fine) {
  .chatPanel {
    display: block;
    position: fixed;
    /* Desktop styles */
  }
}
```

### Z-Index Hierarchy
```
100 - Terminal (bottom bar)
101 - Desktop Chat Panel (right side)
102 - Modal overlays (if any)
```

---

## Migration Strategy

### Backward Compatibility
- Keep existing functionality working during migration
- Use feature flags if needed
- Test each phase thoroughly before proceeding

### Rollback Plan
- Git branches for each phase
- Ability to revert to previous working state
- Document any breaking changes

---

## Testing Strategy

### Unit Tests
- DesktopChatPanel component
- MobileChatPanel component (if created)
- Toggle functionality

### Integration Tests
- Chat toggle on desktop
- Chat toggle on mobile
- State synchronization
- Context provider integration

### E2E Tests
- Full user flow on desktop
- Full user flow on mobile
- Cross-platform consistency

### Manual Testing Checklist
- [ ] Desktop: Chat panel appears on right side
- [ ] Desktop: Chat panel takes full viewport height
- [ ] Desktop: Chat expands from right to left
- [ ] Desktop: Toggle button works
- [ ] Desktop: Smooth animations
- [ ] Mobile: Chat in bottom sheet
- [ ] Mobile: Draggable behavior works
- [ ] Mobile: Toggle button works
- [ ] Mobile: Smooth animations
- [ ] Both: State persists across toggles
- [ ] Both: Multiple chat instances work
- [ ] Both: No memory leaks
- [ ] Both: Responsive to window resize

---

## Performance Considerations

### Optimization Strategies
1. **Lazy Loading:** Load chat content only when opened
2. **Memoization:** Use React.memo for Chat component
3. **Virtualization:** For long chat histories (if needed)
4. **CSS Animations:** Use transform and opacity for GPU acceleration
5. **State Updates:** Batch updates to minimize re-renders

### Metrics to Monitor
- Time to open/close chat panel
- Animation frame rate (target: 60fps)
- Memory usage
- Re-render count

---

## Accessibility

### Requirements
- Keyboard navigation support
- ARIA labels for toggle button
- Focus management when opening/closing
- Screen reader announcements
- Respect prefers-reduced-motion

### Implementation
```jsx
<button
  onClick={toggleChat}
  aria-label={isChatOpen ? 'Close chat' : 'Open chat'}
  aria-expanded={isChatOpen}
  aria-controls="chat-panel"
>
  💬
</button>

<div
  id="chat-panel"
  role="complementary"
  aria-label="Chat panel"
  hidden={!isChatOpen}
>
  <Chat />
</div>
```

---

## Open Questions

1. **Mobile Chat Location:** Should mobile chat be in MobileTerminalSheet or stay in TerminalEmulator?
   - **Recommendation:** MobileTerminalSheet for consistency

2. **MobileChatPanel Component:** Do we need a separate mobile chat panel component?
   - **Recommendation:** Evaluate during Phase 4

3. **Animation Timing:** What's the optimal duration for expand/collapse animations?
   - **Recommendation:** 300ms (0.3s) - standard for this type of interaction

4. **Desktop Panel Width:** Should the width be fixed or adjustable?
   - **Current:** Fixed (400px / 480px)
   - **Future:** Consider resizable panel (drag to resize)

5. **Mobile Sheet Height:** How much of the screen should chat occupy when expanded?
   - **Current:** 50vh
   - **Recommendation:** Keep as-is, or make it adjustable based on content

---

## Success Metrics

### Functional
- ✅ Desktop chat panel takes full viewport height
- ✅ Chat expands from right to left on desktop
- ✅ Mobile chat works in bottom sheet
- ✅ Toggle button works on both platforms
- ✅ No layout conflicts

### Performance
- ✅ Animations run at 60fps
- ✅ No unnecessary re-renders
- ✅ Fast open/close times (<300ms)

### Code Quality
- ✅ Clean separation of concerns
- ✅ Reusable components
- ✅ Maintainable architecture
- ✅ Well-documented code

### User Experience
- ✅ Smooth, polished animations
- ✅ Intuitive interactions
- ✅ Platform-appropriate behavior
- ✅ Accessible to all users

---

## Timeline Estimate

### Phase 1: Create DesktopChatPanel
**Estimated Time:** 2-3 hours
- Component creation: 1 hour
- Styling: 1 hour
- Testing: 30 minutes

### Phase 2: Integrate into MainLayout
**Estimated Time:** 1-2 hours
- Integration: 45 minutes
- Testing: 45 minutes

### Phase 3: Clean Up TerminalEmulator
**Estimated Time:** 1-2 hours
- Code removal: 30 minutes
- CSS cleanup: 30 minutes
- Testing: 30 minutes

### Phase 4: Mobile Chat Integration
**Estimated Time:** 2-4 hours (depends on approach)
- Implementation: 2-3 hours
- Testing: 1 hour

### Phase 5: Testing & Polish
**Estimated Time:** 2-3 hours
- Comprehensive testing: 1.5 hours
- Polish and refinements: 1 hour

**Total Estimated Time:** 8-14 hours

---

## Next Steps

1. **Review this design document** and provide feedback
2. **Make decisions** on open questions (especially mobile chat location)
3. **Approve the approach** before starting implementation
4. **Begin Phase 1** once approved
5. **Iterate** based on findings during implementation

---

## Appendix

### File Structure
```
src/
├── components/
│   ├── Chat/
│   │   ├── Chat.jsx (existing)
│   │   ├── Chat.module.css (existing)
│   │   ├── DesktopChatPanel.jsx (NEW)
│   │   ├── DesktopChatPanel.module.css (NEW)
│   │   ├── MobileChatPanel.jsx (NEW - optional)
│   │   └── MobileChatPanel.module.css (NEW - optional)
│   ├── TerminalEmulator/
│   │   ├── TerminalEmulator.jsx (MODIFY)
│   │   ├── TerminalEmulator.module.css (MODIFY)
│   │   ├── MobileTerminalSheet.jsx (MODIFY - optional)
│   │   └── MobileTerminalSheet.module.css (MODIFY - optional)
├── layouts/
│   ├── MainLayout.jsx (MODIFY)
│   └── MainLayout.module.css (MODIFY - optional)
└── contexts/
    └── ChatManagerContext.jsx (existing - no changes)
```

### Related Documentation
- `PROJECT.md` - Project overview and guidelines
- `PLATFORM_STYLING.md` - Platform-specific styling guide
- `AGENTS.md` - Agent operations history (if exists)

---

**Document Version:** 1.0
**Last Updated:** 2025-11-06
**Author:** AI Assistant
**Status:** Awaiting Review

