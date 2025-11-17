/**
 * Performance Monitoring Utilities
 *
 * Phase 0: Baseline Measurement & Setup
 *
 * This module provides utilities for measuring and monitoring component performance.
 * It helps track render times, DOM node counts, and memory usage.
 */

const isDevelopment = import.meta.env.DEV;

/**
 * Performance mark for measuring component lifecycle
 */
export class PerformanceMarker {
  constructor(name) {
    this.name = name;
    this.marks = {};
  }

  /**
   * Start a performance measurement
   * @param {string} label - Label for the measurement
   */
  start(label) {
    const markName = `${this.name}-${label}-start`;
    if (typeof performance !== 'undefined') {
      performance.mark(markName);
    }
    this.marks[label] = { start: performance.now() };
  }

  /**
   * End a performance measurement and log the result
   * @param {string} label - Label for the measurement
   * @param {number} warningThreshold - Threshold in ms to trigger warning (default: 100ms)
   */
  end(label, warningThreshold = 100) {
    const markName = `${this.name}-${label}`;
    const startMarkName = `${markName}-start`;
    const endMarkName = `${markName}-end`;

    if (typeof performance !== 'undefined') {
      performance.mark(endMarkName);

      try {
        performance.measure(markName, startMarkName, endMarkName);
        const measure = performance.getEntriesByName(markName)[0];

        if (measure) {
          const duration = measure.duration;

          if (isDevelopment) {
            const logLevel = duration > warningThreshold ? 'warn' : 'log';
            console[logLevel](
              `[Performance] ${this.name} - ${label}: ${duration.toFixed(2)}ms`,
              duration > warningThreshold ? '⚠️ SLOW' : '✓'
            );
          }

          // Store the measurement
          if (this.marks[label]) {
            this.marks[label].duration = duration;
            this.marks[label].end = performance.now();
          }

          // Cleanup
          performance.clearMarks(startMarkName);
          performance.clearMarks(endMarkName);
          performance.clearMeasures(markName);

          return duration;
        }
      } catch (error) {
        if (isDevelopment) {
          console.error(`[Performance] Error measuring ${markName}:`, error);
        }
      }
    }

    return null;
  }

  /**
   * Get all measurements
   */
  getMeasurements() {
    return { ...this.marks };
  }

  /**
   * Clear all marks
   */
  clear() {
    this.marks = {};
  }
}

/**
 * Measure DOM node count for a component
 * @param {HTMLElement} element - The root element to count nodes in
 * @returns {number} Total number of DOM nodes
 */
export function measureDOMNodes(element) {
  if (!element) return 0;

  const nodeCount = element.getElementsByTagName('*').length;

  if (isDevelopment) {
    console.log(`[Performance] DOM Nodes: ${nodeCount}`);
  }

  return nodeCount;
}

/**
 * Measure memory usage (if available)
 * @returns {Object|null} Memory usage information
 */
export function measureMemory() {
  if (typeof performance !== 'undefined' && performance.memory) {
    const memory = {
      usedJSHeapSize: (performance.memory.usedJSHeapSize / 1048576).toFixed(2),
      totalJSHeapSize: (performance.memory.totalJSHeapSize / 1048576).toFixed(2),
      jsHeapSizeLimit: (performance.memory.jsHeapSizeLimit / 1048576).toFixed(2),
    };

    if (isDevelopment) {
      console.log('[Performance] Memory Usage:', memory);
    }

    return memory;
  }

  return null;
}

/**
 * Create a performance report
 * @param {string} componentName - Name of the component
 * @param {Object} measurements - Measurements object
 * @returns {Object} Performance report
 */
export function createPerformanceReport(componentName, measurements) {
  return {
    component: componentName,
    timestamp: new Date().toISOString(),
    measurements,
    memory: measureMemory(),
  };
}

/**
 * Log a performance report
 * @param {Object} report - Performance report
 */
export function logPerformanceReport(report) {
  if (isDevelopment) {
    console.group(`[Performance Report] ${report.component}`);
    console.log('Timestamp:', report.timestamp);
    console.table(report.measurements);
    if (report.memory) {
      console.log('Memory:', report.memory);
    }
    console.groupEnd();
  }
}

/**
 * React hook for performance monitoring
 * Usage:
 * const perf = usePerformanceMonitor('MyComponent');
 *
 * useEffect(() => {
 *   perf.start('render');
 *   return () => perf.end('render');
 * }, []);
 */
export function createPerformanceMonitor(componentName) {
  return new PerformanceMarker(componentName);
}

export default {
  PerformanceMarker,
  measureDOMNodes,
  measureMemory,
  createPerformanceReport,
  logPerformanceReport,
  createPerformanceMonitor,
};

