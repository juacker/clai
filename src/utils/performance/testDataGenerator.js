/**
 * Test Data Generator for Performance Testing
 *
 * Phase 0: Baseline Measurement & Setup
 *
 * This module generates test data for stress testing the ChartsView component
 * with various filter counts (10, 50, 100, 200+ items).
 */

/**
 * Generate test filter options for stress testing
 * @param {number} count - Number of filter options to generate
 * @param {string} prefix - Prefix for the filter names
 * @returns {Array} Array of filter option objects
 */
export function generateFilterOptions(count, prefix = 'Filter') {
  return Array.from({ length: count }, (_, i) => ({
    value: `${prefix.toLowerCase()}_${i + 1}`,
    displayName: `${prefix} ${i + 1}`,
    count: Math.floor(Math.random() * 1000) + 1,
  }));
}

/**
 * Generate test groupBy options
 * @param {number} count - Number of groupBy options to generate
 * @returns {Array} Array of groupBy option objects
 */
export function generateGroupByOptions(count = 20) {
  const categories = [
    'Node',
    'Service',
    'Instance',
    'Region',
    'Zone',
    'Cluster',
    'Namespace',
    'Pod',
    'Container',
    'Host',
  ];

  return Array.from({ length: count }, (_, i) => ({
    value: `group_${i + 1}`,
    displayName:
      i < categories.length
        ? categories[i]
        : `${categories[i % categories.length]} ${Math.floor(i / categories.length) + 1}`,
    count: Math.floor(Math.random() * 500) + 1,
  }));
}

/**
 * Generate test filter groups with multiple categories
 * @param {Object} config - Configuration for generating filter groups
 * @returns {Object} Object with filterBy categories
 */
export function generateFilterGroups(config = {}) {
  const {
    nodeCount = 50,
    serviceCount = 30,
    statusCount = 10,
    regionCount = 15,
    customGroups = [],
  } = config;

  const filterOptions = {
    Node: generateFilterOptions(nodeCount, 'Node'),
    Service: generateFilterOptions(serviceCount, 'Service'),
    Status: generateFilterOptions(statusCount, 'Status'),
    Region: generateFilterOptions(regionCount, 'Region'),
  };

  // Add custom groups if provided
  customGroups.forEach((group) => {
    filterOptions[group.name] = generateFilterOptions(group.count, group.name);
  });

  return filterOptions;
}

/**
 * Generate complete test data for ChartsView
 * @param {string} scenario - Test scenario ('small', 'medium', 'large', 'extreme')
 * @returns {Object} Complete test data with groupBy and filterBy options
 */
export function generateTestData(scenario = 'medium') {
  const scenarios = {
    small: {
      groupByCount: 10,
      nodeCount: 10,
      serviceCount: 5,
      statusCount: 3,
      regionCount: 5,
    },
    medium: {
      groupByCount: 20,
      nodeCount: 50,
      serviceCount: 30,
      statusCount: 10,
      regionCount: 15,
    },
    large: {
      groupByCount: 30,
      nodeCount: 100,
      serviceCount: 60,
      statusCount: 15,
      regionCount: 25,
    },
    extreme: {
      groupByCount: 50,
      nodeCount: 200,
      serviceCount: 150,
      statusCount: 30,
      regionCount: 50,
      customGroups: [
        { name: 'Environment', count: 20 },
        { name: 'Team', count: 40 },
        { name: 'Application', count: 100 },
      ],
    },
  };

  const config = scenarios[scenario] || scenarios.medium;

  return {
    groupByOptions: generateGroupByOptions(config.groupByCount),
    filterOptions: generateFilterGroups(config),
  };
}

/**
 * Log test data statistics
 * @param {Object} testData - Test data object
 */
export function logTestDataStats(testData) {
  const { groupByOptions, filterOptions } = testData;

  const totalFilterOptions = Object.values(filterOptions).reduce(
    (sum, options) => sum + options.length,
    0
  );

  const stats = {
    groupByCount: groupByOptions.length,
    filterGroups: Object.keys(filterOptions).length,
    totalFilterOptions,
    filterGroupBreakdown: Object.entries(filterOptions).map(([key, options]) => ({
      name: key,
      count: options.length,
    })),
  };

  console.group('[Test Data Generator] Statistics');
  console.log('GroupBy Options:', stats.groupByCount);
  console.log('Filter Groups:', stats.filterGroups);
  console.log('Total Filter Options:', stats.totalFilterOptions);
  console.table(stats.filterGroupBreakdown);
  console.groupEnd();

  return stats;
}

/**
 * Create a performance test suite
 * @param {Function} testFunction - Function to test
 * @param {Array} scenarios - Array of scenario names to test
 * @returns {Promise<Array>} Array of test results
 */
export async function runPerformanceTestSuite(testFunction, scenarios = ['small', 'medium', 'large']) {
  const results = [];

  for (const scenario of scenarios) {
    console.log(`\n[Performance Test] Running scenario: ${scenario}`);
    const testData = generateTestData(scenario);
    logTestDataStats(testData);

    const startTime = performance.now();
    await testFunction(testData);
    const endTime = performance.now();

    const result = {
      scenario,
      duration: endTime - startTime,
      testData: testData,
    };

    results.push(result);

    console.log(`[Performance Test] ${scenario} completed in ${result.duration.toFixed(2)}ms`);
  }

  console.group('[Performance Test] Summary');
  console.table(
    results.map((r) => ({
      scenario: r.scenario,
      duration: `${r.duration.toFixed(2)}ms`,
    }))
  );
  console.groupEnd();

  return results;
}

export default {
  generateFilterOptions,
  generateGroupByOptions,
  generateFilterGroups,
  generateTestData,
  logTestDataStats,
  runPerformanceTestSuite,
};

