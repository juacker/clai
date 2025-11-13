# Custom Time-Series Chart Implementation Plan

## Overview
This document outlines the step-by-step implementation plan for adding a custom time-series chart visualization component using D3.js. This component will be rendered when the `custom_timeseries_chart_block` tool is received from the server, instead of the standard ToolBlock component.

## Architecture Overview

### Component Flow
```
Server SSE Stream → Chat Component → Detect Tool Type → Render Custom Component
                                    ↓
                            custom_timeseries_chart_block
                                    ↓
                        TimeSeriesChartBlock Component
                                    ↓
                            D3.js Rendering
```

## Implementation Steps

### Phase 1: Setup and Dependencies

#### Step 1.1: Install D3.js
**Task**: Add D3.js library to the project
**Files**: `package.json`
**Actions**:
- Install `d3` package (npm install d3)
- Install `@types/d3` for TypeScript support if needed

**Rationale**: D3.js is required for creating the time-series visualizations with full control over SVG rendering.

---

#### Step 1.2: Verify Current Tool Rendering Logic
**Task**: Understand how tools are currently rendered in the Chat component
**Files to Analyze**:
- `src/components/Chat/Chat.jsx`
- `src/components/Chat/ToolBlock.jsx`
- `src/components/Chat/MarkdownMessage.jsx`

**Questions to Answer**:
- Where does the tool rendering logic live?
- How are tool_use blocks identified and rendered?
- How is tool_result associated with tool_use?
- What props are passed to ToolBlock?

---

### Phase 2: Create the TimeSeriesChartBlock Component

#### Step 2.1: Create Component Structure
**Task**: Create the new TimeSeriesChartBlock component with basic structure
**Files to Create**:
- `src/components/Chat/TimeSeriesChartBlock.jsx`
- `src/components/Chat/TimeSeriesChartBlock.module.css`

**Component Structure**:
```jsx
import React, { useRef, useEffect, useState } from 'react';
import * as d3 from 'd3';
import styles from './TimeSeriesChartBlock.module.css';

const TimeSeriesChartBlock = ({ toolInput, toolResult }) => {
  const svgRef = useRef(null);
  const containerRef = useRef(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

  // Props from toolInput:
  // - title
  // - chart_type ('line' | 'area')
  // - stacked (boolean)
  // - unit (string)
  // - datasets (array)
  // - x_axis_label
  // - y_axis_label

  return (
    <div ref={containerRef} className={styles.chartContainer}>
      <div className={styles.chartHeader}>
        <h3>{toolInput?.title}</h3>
      </div>
      <svg ref={svgRef} className={styles.chartSvg}></svg>
    </div>
  );
};

export default TimeSeriesChartBlock;
```

---

#### Step 2.2: Implement Responsive Container
**Task**: Add resize observer to handle dynamic resizing
**File**: `src/components/Chat/TimeSeriesChartBlock.jsx`

**Key Features**:
- Use ResizeObserver to detect container size changes
- Update chart dimensions state
- Trigger re-render of D3 chart on resize
- Clean up observer on unmount

**Implementation Approach**:
```jsx
useEffect(() => {
  if (!containerRef.current) return;

  const resizeObserver = new ResizeObserver((entries) => {
    for (let entry of entries) {
      const { width, height } = entry.contentRect;
      setDimensions({ width, height: height || 400 });
    }
  });

  resizeObserver.observe(containerRef.current);

  return () => {
    resizeObserver.disconnect();
  };
}, []);
```

---

#### Step 2.3: Implement D3.js Chart Rendering Core
**Task**: Create the main D3 rendering logic
**File**: `src/components/Chat/TimeSeriesChartBlock.jsx`

**Sub-tasks**:
1. **Data Parsing & Validation**
   - Parse ISO 8601 timestamps
   - Validate data structure
   - Handle missing or invalid data gracefully

2. **Scale Creation**
   - X-axis: Time scale (d3.scaleTime)
   - Y-axis: Linear scale (d3.scaleLinear)
   - Calculate proper domains from data

3. **Axis Rendering**
   - X-axis with time formatting
   - Y-axis with unit formatting
   - Grid lines for better readability
   - Axis labels

4. **Line Chart Implementation**
   - Use d3.line() generator
   - Smooth curves (d3.curveMonotoneX)
   - Multiple series support
   - Color coding per dataset

5. **Area Chart Implementation**
   - Use d3.area() generator
   - Support for stacked areas (d3.stack())
   - Semi-transparent fills
   - Stroke outlines

6. **Legend**
   - Display dataset labels
   - Color indicators
   - Interactive hover effects (optional)

---

#### Step 2.4: Implement Stacking Logic
**Task**: Add support for stacked area charts
**File**: `src/components/Chat/TimeSeriesChartBlock.jsx`

**Approach**:
- Transform data using d3.stack() when `stacked=true` and `chart_type='area'`
- Adjust Y-axis domain to accommodate cumulative values
- Render areas in proper order (bottom to top)

---

#### Step 2.5: Add Interactivity
**Task**: Add interactive features for better UX
**File**: `src/components/Chat/TimeSeriesChartBlock.jsx`

**Features**:
- **Tooltip on Hover**:
  - Show timestamp, value, and series name
  - Position tooltip near cursor
  - Highlight active data point

- **Crosshair**:
  - Vertical line following cursor
  - Snap to nearest data point

- **Zoom/Pan** (Optional for Phase 3):
  - Allow zooming into time ranges
  - Pan across timeline

---

#### Step 2.6: Style the Component
**Task**: Create comprehensive CSS styling
**File**: `src/components/Chat/TimeSeriesChartBlock.module.css`

**Styling Requirements**:
- Mobile-first responsive design
- Match existing app design system
- Clean, minimalistic appearance
- Proper spacing and padding
- Responsive font sizes
- Dark/light theme support (if applicable)

**Key CSS Classes**:
```css
.chartContainer {
  /* Responsive container */
}

.chartHeader {
  /* Title and metadata */
}

.chartSvg {
  /* SVG element styling */
}

.tooltip {
  /* Tooltip styling */
}

.legend {
  /* Legend styling */
}

/* Mobile-specific adjustments */
@media (max-width: 768px) {
  /* Adjust font sizes, spacing */
}
```

---

### Phase 3: Integration with Chat Component

#### Step 3.1: Modify Chat Component Rendering Logic
**Task**: Update Chat.jsx to conditionally render TimeSeriesChartBlock
**File**: `src/components/Chat/Chat.jsx`

**Implementation**:
- Detect when tool name is `custom_timeseries_chart_block`
- Render TimeSeriesChartBlock instead of ToolBlock
- Pass toolInput and toolResult as props

**Pseudo-code**:
```jsx
// In message rendering logic
if (toolUse.name === 'custom_timeseries_chart_block') {
  return (
    <TimeSeriesChartBlock
      toolInput={toolUse.input}
      toolResult={toolResult}
    />
  );
} else {
  return (
    <ToolBlock
      toolUse={toolUse}
      toolResult={toolResult}
    />
  );
}
```

---

#### Step 3.2: Handle Tool Result
**Task**: Ensure tool result is properly associated
**File**: `src/components/Chat/Chat.jsx`

**Considerations**:
- Tool result will be simple "OK" from server
- May want to show loading state while waiting for result
- Handle error states if tool execution fails

---

### Phase 4: Testing and Refinement

#### Step 4.1: Create Test Data
**Task**: Create sample data for testing
**File**: Create `src/samples/timeseries_chart_sample.json`

**Sample Structure**:
```json
{
  "title": "CPU Usage Over Time",
  "chart_type": "area",
  "stacked": false,
  "unit": "%",
  "datasets": [
    {
      "label": "User CPU",
      "color": "#3B82F6",
      "data": [
        { "dt": "2025-11-13T10:00:00Z", "v": 45.2 },
        { "dt": "2025-11-13T10:01:00Z", "v": 52.8 }
      ]
    }
  ],
  "x_axis_label": "Time",
  "y_axis_label": "CPU Usage (%)"
}
```

---

#### Step 4.2: Manual Testing
**Task**: Test component with various configurations

**Test Cases**:
1. Single line chart
2. Multiple line charts
3. Single area chart
4. Multiple area charts (non-stacked)
5. Multiple area charts (stacked)
6. Different time ranges (minutes, hours, days)
7. Different data densities (sparse vs dense)
8. Edge cases (empty data, single point, etc.)
9. Responsive behavior (resize window)
10. Mobile view

---

#### Step 4.3: Performance Optimization
**Task**: Optimize rendering performance

**Optimizations**:
- Debounce resize events
- Memoize expensive calculations
- Use React.memo if needed
- Optimize D3 selections
- Limit number of data points rendered (sampling for large datasets)

---

### Phase 5: Documentation and Polish

#### Step 5.1: Add Code Documentation
**Task**: Document component API and usage
**Files**:
- Add JSDoc comments to TimeSeriesChartBlock.jsx
- Update this implementation plan with final notes

---

#### Step 5.2: Accessibility
**Task**: Ensure component is accessible

**Requirements**:
- Proper ARIA labels
- Keyboard navigation support
- Screen reader friendly
- Color contrast compliance
- Alternative text for visual data

---

#### Step 5.3: Error Handling
**Task**: Add comprehensive error handling

**Error Scenarios**:
- Invalid data format
- Missing required fields
- Parsing errors
- Rendering failures
- Display user-friendly error messages

---

## Technical Considerations

### D3.js Best Practices
1. **Separate Concerns**: Keep D3 rendering logic in separate functions
2. **Declarative Rendering**: Use D3's enter/update/exit pattern
3. **Performance**: Minimize DOM manipulations
4. **Memory Management**: Clean up event listeners and observers

### React + D3 Integration
1. **Refs for DOM Access**: Use refs to access SVG elements
2. **useEffect for Rendering**: Trigger D3 rendering in useEffect
3. **State for Data**: Keep chart data in React state
4. **Props for Configuration**: Pass configuration via props

### Responsive Design
1. **Mobile-First CSS**: Start with mobile styles, enhance for desktop
2. **Touch-Friendly**: Ensure touch interactions work on mobile
3. **Adaptive Layouts**: Adjust chart elements based on screen size
4. **Font Scaling**: Use relative units for text

### Cross-Platform Compatibility
1. **Desktop**: Full feature set, hover interactions
2. **Mobile**: Touch-optimized, simplified interactions
3. **Platform Detection**: Use existing usePlatform hook if needed

---

## Future Enhancements (Phase 6+)

### Advanced Features
1. **Brush Selection**: Allow users to select time ranges
2. **Zoom Controls**: Add zoom in/out buttons
3. **Export**: Export chart as PNG/SVG
4. **Data Download**: Download chart data as CSV
5. **Annotations**: Add markers for significant events
6. **Real-time Updates**: Support streaming data updates
7. **Multiple Y-Axes**: Support different units on same chart
8. **Comparison Mode**: Compare multiple time periods

### Additional Chart Types
1. **Bar Charts**: For discrete time intervals
2. **Scatter Plots**: For correlation analysis
3. **Heatmaps**: For time-series matrices
4. **Candlestick Charts**: For financial data

---

## Dependencies

### Required Packages
- `d3` (^7.8.5 or latest)

### Optional Packages
- `d3-tip` (for advanced tooltips)
- `date-fns` (for date formatting, if not using d3)

---

## File Structure

```
src/
├── components/
│   └── Chat/
│       ├── TimeSeriesChartBlock.jsx          (NEW)
│       ├── TimeSeriesChartBlock.module.css   (NEW)
│       ├── Chat.jsx                          (MODIFY)
│       ├── ToolBlock.jsx                     (REFERENCE)
│       └── more_block_components.txt         (EXISTING)
├── samples/
│   └── timeseries_chart_sample.json          (NEW - for testing)
└── utils/
    └── chartHelpers.js                       (NEW - optional helper functions)
```

---

## Success Criteria

### Functional Requirements
✅ Component renders line charts correctly
✅ Component renders area charts correctly
✅ Stacking works for area charts
✅ Chart is responsive and adapts to container size
✅ Multiple datasets are displayed with distinct colors
✅ Axes are properly labeled with units
✅ Time formatting is correct and readable
✅ Tooltips show accurate data on hover
✅ Component integrates seamlessly with Chat component

### Non-Functional Requirements
✅ Performance: Chart renders in < 100ms for typical datasets
✅ Responsive: Adapts smoothly to window resizing
✅ Accessible: Meets WCAG 2.1 AA standards
✅ Mobile-friendly: Works on touch devices
✅ Error handling: Gracefully handles invalid data
✅ Code quality: Well-documented and maintainable

---

## Questions to Resolve Before Implementation

1. **Theme Support**: Does the app have a dark/light theme system we need to integrate with?
2. **Color Palette**: Is there a predefined color palette for charts?
3. **Animation**: Should chart transitions be animated?
4. **Data Limits**: What's the maximum number of data points we should support?
5. **Time Zones**: Should we display times in user's local timezone or UTC?
6. **Number Formatting**: Any specific formatting requirements for numbers (decimals, thousands separators)?

---

## Estimated Timeline

- **Phase 1**: 1-2 hours (setup and analysis)
- **Phase 2**: 6-8 hours (component creation)
- **Phase 3**: 2-3 hours (integration)
- **Phase 4**: 3-4 hours (testing)
- **Phase 5**: 2-3 hours (polish)

**Total**: ~15-20 hours

---

## Next Steps

1. Review this plan and answer outstanding questions
2. Install D3.js dependencies
3. Analyze current Chat component structure
4. Begin Phase 2.1: Create component structure
5. Implement step-by-step, testing after each phase


