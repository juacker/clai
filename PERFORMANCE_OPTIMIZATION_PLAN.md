# Global Filter Performance Optimization Plan

## Overview
This document outlines a phased approach to optimize the rendering performance of the global filter panel in ChartsView. Each phase builds upon the previous one, allowing us to test and measure improvements incrementally.

**Alignment with Project Principles:**
- ✅ **Lightweight & Minimalistic** - Zero dependencies in phases 1-5
- ✅ **Performance First** - Systematic performance improvements
- ✅ **Mobile-First CSS** - CSS media queries as primary optimization method
- ✅ **Cross-Platform** - Desktop and mobile considerations in every phase
- ✅ **User-Centric Design** - Focus on perceived performance and usability

---

## 🎯 Success Metrics

Before starting, we'll measure:
- **Initial render time** of the global filter panel
- **Re-render time** when toggling filters
- **Number of DOM nodes** created
- **Memory usage** during interaction
- **User-perceived lag** (subjective but important)
- **Mobile performance** (tested on actual devices)
- **Touch interaction responsiveness** (mobile-specific)

**Target Goals:**
- Reduce initial render time by 70%
- Eliminate perceivable lag when toggling filters
- Support 100+ filter options per group smoothly
- Maintain 60fps scrolling on mobile devices
- Touch targets meet 44px minimum (iOS guidelines)
- Works smoothly on 6x CPU throttling (mobile simulation)

---

## 📋 Phase 0: Baseline Measurement & Setup

**Objective:** Establish current performance metrics and set up monitoring tools.

### Tasks:
- [ ] Add performance measurement logging to ChartsView
- [ ] Document current render times with various data sizes
- [ ] Create test scenarios with different filter counts (10, 50, 100, 200+ items)
- [ ] Set up React DevTools Profiler to measure component renders

### Deliverables:
- Performance baseline document
- Test data generator for stress testing

### Estimated Time: 1-2 hours
### Dependencies: None

---

## 📋 Phase 1: CSS Containment & Browser Optimizations

**Objective:** Apply zero-cost CSS optimizations for immediate performance gains.

### Why This First?
- ✅ Zero dependencies
- ✅ Zero complexity
- ✅ Immediate 10-20% performance improvement
- ✅ No code changes required
- ✅ Works alongside all future optimizations

### Tasks:
- [ ] Add `contain: layout style paint` to `.globalFilterChipsScrollable`
- [ ] Add `will-change: transform` to scrollable containers (use sparingly)
- [ ] Optimize CSS selectors for filter chips
- [ ] Add `content-visibility: auto` for filter groups (if supported)
- [ ] Test on desktop and mobile platforms

### Implementation:
```css
/* ChartsView.module.css */
.globalFilterChipsScrollable {
  contain: layout style paint;
  content-visibility: auto;
}

.globalFilterGroup {
  contain: layout style;
}
```

### Testing Criteria:
- ✅ No visual regressions
- ✅ Scrolling remains smooth
- ✅ Measurable render time improvement
- ✅ Works on all target platforms

### Estimated Time: 1 hour
### Expected Gain: 10-20%
### Risk: Very Low

---

## 📋 Phase 2: Search/Filter Functionality

**Objective:** Add search capability to reduce rendered items naturally.

### Why This Second?
- ✅ Zero dependencies
- ✅ Most effective for user experience
- ✅ 70-90% reduction in rendered items during typical usage
- ✅ Simple implementation
- ✅ Aligns with "User-Centric Design" principle

### Tasks:
- [ ] Add search input component above filter groups
- [ ] Implement client-side search/filter logic
- [ ] Add debouncing to search input (300ms)
- [ ] Highlight matching text in filter options
- [ ] Add "No results" state
- [ ] Add keyboard shortcuts (Ctrl/Cmd+F to focus search)
- [ ] Persist search state when panel is collapsed/expanded
- [ ] Test with large datasets (100+ items)

### Implementation Details:

**Component Structure:**
```jsx
// Add to FilterPanelContent
const [searchQuery, setSearchQuery] = useState('');
const debouncedSearch = useMemo(() => debounce(setSearchQuery, 300), []);

// Filter logic
const filteredOptions = useMemo(() => {
  if (!searchQuery) return { groupByOptions, filterOptions };

  // Filter groupBy options
  const filteredGroupBy = groupByOptions.filter(opt =>
    opt.displayName.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Filter filterBy options
  const filteredFilters = {};
  Object.entries(filterOptions).forEach(([key, options]) => {
    const filtered = options.filter(opt =>
      opt.displayName.toLowerCase().includes(searchQuery.toLowerCase())
    );
    if (filtered.length > 0) {
      filteredFilters[key] = filtered;
    }
  });

  return { groupByOptions: filteredGroupBy, filterOptions: filteredFilters };
}, [searchQuery, groupByOptions, filterOptions]);
```

**CSS (Mobile-First):**
```css
/* Default (Desktop) */
.globalFilterSearch {
  margin-bottom: 16px;
  padding: 8px 12px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  font-size: 14px;
}

/* Mobile adjustments */
@media (max-width: 768px) {
  .globalFilterSearch {
    font-size: 16px; /* Prevent zoom on iOS */
    padding: 12px 16px;
  }
}

@media (pointer: coarse) {
  .globalFilterSearch {
    min-height: 44px; /* Touch target size */
  }
}
```

### Testing Criteria:
- ✅ Search responds within 300ms
- ✅ No lag when typing
- ✅ Results are accurate
- ✅ Works on mobile (no zoom on iOS)
- ✅ Keyboard shortcuts work
- ✅ Handles edge cases (empty results, special characters)

### Estimated Time: 3-4 hours
### Expected Gain: 70-90% (during typical usage)
### Risk: Low

---

## 📋 Phase 3: Lazy Rendering with "Show More"

**Objective:** Limit initial render to 20 items per group, with expandable sections.

### Why This Third?
- ✅ Zero dependencies
- ✅ Complements search functionality
- ✅ 60-80% reduction in initial render time
- ✅ Good UX for browsing
- ✅ Simple state management

### Tasks:
- [ ] Add "Show More" / "Show Less" buttons to filter groups
- [ ] Set initial visible limit to 20 items per group
- [ ] Expand to show all when clicked
- [ ] Persist expanded state per group
- [ ] Add "Expand All" / "Collapse All" buttons
- [ ] Ensure search overrides show more (shows all matching results)
- [ ] Test with groups of varying sizes

### Implementation Details:

**State Management:**
```jsx
// Add to ChartsView or FilterPanelContent
const [expandedGroups, setExpandedGroups] = useState({});

const toggleGroupExpansion = useCallback((groupKey) => {
  setExpandedGroups(prev => ({
    ...prev,
    [groupKey]: !prev[groupKey]
  }));
}, []);

const INITIAL_VISIBLE_COUNT = 20;
```

**Rendering Logic:**
```jsx
// In FilterPanelContent
{Object.entries(filterOptions).map(([filterLabel, options]) => {
  const isExpanded = expandedGroups[filterLabel] || searchQuery; // Always show all when searching
  const visibleOptions = isExpanded ? options : options.slice(0, INITIAL_VISIBLE_COUNT);
  const hasMore = options.length > INITIAL_VISIBLE_COUNT;

  return (
    <div key={filterLabel} className={styles.globalFilterGroup}>
      <div className={styles.globalFilterGroupTitle}>{filterLabel}</div>
      <div className={styles.globalFilterChipsScrollable}>
        {visibleOptions.map(option => (
          <FilterChip key={option.value} ... />
        ))}
      </div>
      {hasMore && !searchQuery && (
        <button
          className={styles.showMoreButton}
          onClick={() => toggleGroupExpansion(filterLabel)}
        >
          {isExpanded ? `Show Less` : `Show More (${options.length - INITIAL_VISIBLE_COUNT} more)`}
        </button>
      )}
    </div>
  );
})}
```

### Testing Criteria:
- ✅ Initial render shows 20 items max per group
- ✅ "Show More" expands smoothly
- ✅ Search shows all matching results regardless of expansion state
- ✅ State persists when collapsing/expanding panel
- ✅ No layout shift when expanding
- ✅ Works well on mobile (touch targets)

### Estimated Time: 3-4 hours
### Expected Gain: 60-80% (initial render)
### Risk: Low

---

## 📋 Phase 4: Memoization & Re-render Optimization

**Objective:** Further optimize React re-renders and state updates.

### Why This Fourth?
- ✅ Builds on existing optimizations
- ✅ Eliminates unnecessary re-renders
- ✅ Improves interaction responsiveness
- ✅ Zero dependencies

### Tasks:
- [ ] Audit component re-renders with React DevTools Profiler
- [ ] Add `useMemo` for expensive computations
- [ ] Optimize `useCallback` dependencies
- [ ] Split large components into smaller memoized parts
- [ ] Use `React.memo` with custom comparison functions where needed
- [ ] Implement stable keys for list items
- [ ] Batch state updates where possible

### Implementation Details:

**Custom Comparison for FilterChip:**
```jsx
const FilterChip = React.memo(({ option, filterLabel, isChecked, onFilterChange }) => {
  // ... component code
}, (prevProps, nextProps) => {
  // Custom comparison to prevent unnecessary re-renders
  return (
    prevProps.isChecked === nextProps.isChecked &&
    prevProps.option.value === nextProps.option.value &&
    prevProps.filterLabel === nextProps.filterLabel
  );
});
```

**Stable Keys:**
```jsx
// Use stable, unique keys
key={`${filterLabel}-${option.value}`}
// Instead of just
key={option.value}
```

**Batch State Updates:**
```jsx
// Use React 18's automatic batching or explicit batching
import { unstable_batchedUpdates } from 'react-dom';

const handleMultipleFiltersChange = (updates) => {
  unstable_batchedUpdates(() => {
    updates.forEach(({ filterLabel, value, checked }) => {
      handleGlobalFilterChange(filterLabel, value, checked);
    });
  });
};
```

### Testing Criteria:
- ✅ Reduced re-render count in React DevTools
- ✅ No perceivable lag when toggling filters
- ✅ Smooth scrolling and interaction
- ✅ No visual regressions

### Estimated Time: 2-3 hours
### Expected Gain: 20-30% (interaction responsiveness)
### Risk: Low-Medium

---

## 📋 Phase 5: Performance Monitoring & Metrics

**Objective:** Add production-ready performance monitoring.

### Why This Fifth?
- ✅ Validates all previous optimizations
- ✅ Helps identify regressions
- ✅ Provides data for future optimizations
- ✅ Lightweight implementation

### Tasks:
- [ ] Add performance marks for key operations
- [ ] Log render times in development mode
- [ ] Add warning thresholds for slow renders
- [ ] Create performance dashboard (optional)
- [ ] Document performance best practices

### Implementation Details:

**Performance Marks:**
```jsx
// In ChartsView
useEffect(() => {
  if (isGlobalPanelOpen) {
    performance.mark('filter-panel-open-start');
  }
}, [isGlobalPanelOpen]);

useLayoutEffect(() => {
  if (isGlobalPanelOpen) {
    performance.mark('filter-panel-open-end');
    performance.measure(
      'filter-panel-render',
      'filter-panel-open-start',
      'filter-panel-open-end'
    );

    const measure = performance.getEntriesByName('filter-panel-render')[0];
    if (measure.duration > 100) {
      console.warn(`Slow filter panel render: ${measure.duration}ms`);
    }

    performance.clearMarks();
    performance.clearMeasures();
  }
}, [isGlobalPanelOpen]);
```

### Testing Criteria:
- ✅ Performance marks are logged correctly
- ✅ Warnings appear for slow renders
- ✅ No impact on production performance
- ✅ Metrics are actionable

### Estimated Time: 2-3 hours
### Expected Gain: N/A (monitoring only)
### Risk: Very Low

---

## 📋 Phase 6: Virtual Scrolling (If Needed)

**Objective:** Implement virtual scrolling as a last resort for extreme cases (200+ items).

### Why This Last?
- ❌ Adds external dependency
- ❌ Increases complexity
- ❌ Only needed if previous phases insufficient
- ✅ Scales to thousands of items

### Decision Criteria:
Implement **ONLY IF**:
- Previous phases don't achieve target performance
- Users consistently have 200+ items per filter group
- Render time still exceeds 200ms with optimizations

### Tasks:
- [ ] Evaluate: Do we really need this?
- [ ] If yes: Choose library (`react-window` recommended)
- [ ] Implement virtual scrolling for filter groups
- [ ] Adjust layout for vertical scrolling
- [ ] Test thoroughly on all platforms
- [ ] Document trade-offs

### Implementation Details:

**Using react-window:**
```jsx
import { FixedSizeList } from 'react-window';

// In FilterPanelContent
<FixedSizeList
  height={400}
  itemCount={visibleOptions.length}
  itemSize={36}
  width="100%"
>
  {({ index, style }) => (
    <div style={style}>
      <FilterChip
        option={visibleOptions[index]}
        filterLabel={filterLabel}
        isChecked={globalFilterBy[filterLabel]?.includes(visibleOptions[index].value)}
        onFilterChange={onFilterChange}
      />
    </div>
  )}
</FixedSizeList>
```

### Testing Criteria:
- ✅ Renders 1000+ items smoothly
- ✅ Scrolling is smooth
- ✅ Works on mobile
- ✅ Search still functions correctly
- ✅ No layout issues

### Estimated Time: 4-6 hours
### Expected Gain: 90%+ (for extreme cases)
### Risk: Medium
### Dependency: `react-window` (~30KB)

---

## 📊 Testing Strategy

### After Each Phase:

1. **Automated Testing:**
   - Run existing test suite
   - Add new tests for new functionality
   - Performance regression tests

2. **Manual Testing:**
   - Test with 10, 50, 100, 200 filter items
   - Test on desktop (Windows, macOS, Linux)
   - Test on mobile (Android, iOS if possible)
   - Test with slow network (throttling)
   - Test with CPU throttling (6x slowdown)

3. **Performance Measurement:**
   - Initial render time
   - Re-render time
   - Memory usage
   - DOM node count
   - User-perceived lag

4. **User Experience:**
   - Is it smooth?
   - Is it intuitive?
   - Does it feel fast?
   - Any visual glitches?

### Rollback Criteria:

Rollback a phase if:
- ❌ Performance degrades
- ❌ Introduces bugs
- ❌ Breaks existing functionality
- ❌ Poor mobile experience
- ❌ Violates design principles

---

## 🎯 Success Criteria

### Overall Goals:

- ✅ **Initial render time:** < 100ms for 100 items
- ✅ **Re-render time:** < 50ms for filter toggle
- ✅ **Memory usage:** No significant increase
- ✅ **User experience:** Feels instant and smooth
- ✅ **Code quality:** Maintainable and well-documented
- ✅ **Zero regressions:** All existing functionality works
- ✅ **Cross-platform:** Works on desktop and mobile

### Phase Completion:

Each phase is complete when:
1. All tasks are finished
2. All testing criteria are met
3. Performance metrics show improvement
4. Code is reviewed and documented
5. No regressions detected

---

## 📝 Notes

### Best Practices:
- Always measure before and after
- Test on real devices, not just desktop
- Consider mobile performance (lower CPU/memory)
- Document any trade-offs made
- Keep code simple and maintainable

### Future Considerations:
- Web Workers for heavy computations
- IndexedDB for caching filter options
- Server-side filtering for very large datasets
- Pagination for extreme cases

---

## 🚀 Getting Started

### Next Steps:
1. Review and approve this plan
2. Start with **Phase 0** (Baseline Measurement)
3. Implement phases sequentially
4. Test thoroughly after each phase
5. Document results and learnings

### Questions to Answer Before Starting:
- What's the typical number of filter options users have?
  - tens of them
- What's the maximum we expect?
  - for kubernetes we can easily have hundreds of values per label
- What platforms are priority? (Desktop vs Mobile)
  - on mobile we should probably have only the search option, and reduce as much as possible the rendered items
- What's the acceptable performance threshold?
  - i think 50ms should be acceptable for rendering the filters menu

---

**Document Version:** 1.0
**Created:** 2025-11-17
**Status:** Ready for Review
**Next Review:** After Phase 3 completion

