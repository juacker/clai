# Plugin-Defined Configuration Implementation

## Summary

This document describes the implementation of the plugin-defined configuration flow system, which allows each plugin to define its own configuration steps and UI flow.

## Changes Made

### 1. PluginInterface.js

**Location**: `src/plugins/PluginInterface.js`

**Changes**:
- Enhanced documentation for `getConfigurationSchema()` method
- Added detailed explanation of the `ui.steps` metadata structure
- Documented the step properties and actions

**Impact**: Provides clear guidance for plugin developers on how to define custom configuration flows.

### 2. NetdataPlugin.js

**Location**: `src/plugins/netdata/NetdataPlugin.js`

**Changes**:
- Added `ui` metadata to the configuration schema
- Defined two configuration steps:
  1. **Credentials Step**: Collects `token` and `baseUrl`
  2. **Scope Step**: Collects `spaceId` and `roomId`
- Added `onComplete: 'fetchContexts'` action to the credentials step
- Added helpful descriptions and help text for each step

**Before**:
```javascript
static getConfigurationSchema() {
  return {
    type: 'object',
    properties: { ... },
    required: ['token', 'baseUrl', 'spaceId', 'roomId']
  };
}
```

**After**:
```javascript
static getConfigurationSchema() {
  return {
    type: 'object',
    properties: { ... },
    required: ['token', 'baseUrl', 'spaceId', 'roomId'],
    ui: {
      steps: [
        {
          id: 'credentials',
          title: 'Configure Credentials',
          description: 'Enter your Netdata Cloud credentials',
          fields: ['token', 'baseUrl'],
          helpText: '💡 After entering credentials...',
          onComplete: 'fetchContexts'
        },
        {
          id: 'scope',
          title: 'Select Scope',
          description: 'Choose the space and room to monitor',
          fields: ['spaceId', 'roomId'],
          helpText: '💡 Select the space and room...'
        }
      ]
    }
  };
}
```

### 3. PluginConfigurationDialog.jsx

**Location**: `src/components/PluginManagement/PluginConfigurationDialog.jsx`

**Changes**: Complete refactoring to be generic and plugin-agnostic.

#### State Changes
- Changed `step` (1, 2, 3) to `currentStepIndex` (-1, 0, 1, ...)
  - `-1` = type selection step
  - `0+` = plugin-defined configuration steps
- Added `configSteps` derived from `configSchema?.ui?.steps || []`

#### Logic Changes

**Before**: Hardcoded 3-step flow
```javascript
// Step 1: Type selection
// Step 2: Credentials (fields without dependsOn)
// Step 3: Scope (fields with dependsOn) + fetch contexts
```

**After**: Dynamic flow based on plugin schema
```javascript
// Step -1: Type selection (if not editing)
// Step 0+: Plugin-defined steps from schema.ui.steps
// - Each step shows its defined fields
// - Each step can trigger actions (e.g., fetchContexts)
```

#### handleNext() Changes

**Before**:
```javascript
const handleNext = async () => {
  if (step === 1 && selectedType) {
    setStep(2);
  } else if (step === 2) {
    // Hardcoded logic to separate credential fields
    const credentialFields = Object.keys(configSchema.properties).filter(
      (key) => !configSchema.properties[key].dependsOn
    );
    // Validate and fetch contexts
    await fetchAvailableContexts(selectedType, configuration);
    setStep(3);
  }
};
```

**After**:
```javascript
const handleNext = async () => {
  // Type selection step
  if (currentStepIndex === -1) {
    if (!selectedType) {
      setError('Please select a plugin type');
      return;
    }
    setCurrentStepIndex(0);
    return;
  }

  // Get current step from plugin schema
  const currentStep = configSteps[currentStepIndex];

  // Validate step fields
  const missingFields = currentStep.fields.filter(
    (fieldName) => !configuration[fieldName]
  );
  if (missingFields.length > 0) {
    setError(`Please fill in all required fields...`);
    return;
  }

  // Execute step action if defined
  if (currentStep.onComplete === 'fetchContexts') {
    await fetchAvailableContexts(selectedType, configuration);
  }

  // Move to next step
  setCurrentStepIndex(currentStepIndex + 1);
};
```

#### Rendering Changes

**Before**: Hardcoded step rendering
```javascript
{step === 1 && /* Type selection */}
{step === 2 && /* Credentials */}
{step === 3 && /* Scope */}
```

**After**: Dynamic step rendering
```javascript
{isTypeSelectionStep && !isEditMode && /* Type selection */}
{currentStep && selectedPluginType && (
  <div className={styles.step}>
    <h3>{currentStep.title}</h3>
    {currentStep.description && <p>{currentStep.description}</p>}

    {/* Show fields for current step */}
    <SchemaBasedForm
      schema={currentStepSchema}  // Only fields from current step
      values={configuration}
      onChange={handleConfigChange}
      availableContexts={availableContexts}
      disabled={isLoading}
    />

    {currentStep.helpText && <div>{currentStep.helpText}</div>}
  </div>
)}
```

#### Footer Changes

**Before**: Hardcoded button logic for steps 1, 2, 3

**After**: Dynamic button logic
```javascript
{isTypeSelectionStep && !isEditMode ? (
  // Cancel + Next
) : isLastStep ? (
  // Back + Cancel + Save
) : (
  // Back (if not first step) + Cancel + Next
)}
```

### 4. Documentation

**Location**: `docs/PLUGIN_DEFINED_CONFIG_FLOW.md`

**Content**:
- Overview of the problem and solution
- Detailed schema extension documentation
- Step definition reference
- Example implementation (Netdata)
- Benefits and future enhancements
- Migration guide for existing and new plugins

## Benefits

1. **Generic Dialog**: The configuration dialog is now completely generic and adapts to any plugin's schema
2. **Plugin Control**: Each plugin has full control over its configuration flow
3. **No Hardcoded Logic**: No more assumptions about credentials vs scope, or field dependencies
4. **Better UX**: Plugins can provide custom titles, descriptions, and help text for each step
5. **Maintainable**: Adding new plugins or modifying existing ones doesn't require changes to the dialog
6. **Backward Compatible**: Plugins without `ui.steps` still work (single-step flow)

## Testing Recommendations

1. **New Plugin Configuration**:
   - Open the configuration dialog
   - Select Netdata plugin
   - Verify step 1 shows "Configure Credentials" with token and baseUrl fields
   - Fill in credentials and click Next
   - Verify it fetches contexts (loading spinner)
   - Verify step 2 shows "Select Scope" with space and room dropdowns
   - Select space and room
   - Click Save and verify plugin is created

2. **Edit Plugin Configuration**:
   - Edit an existing Netdata plugin
   - Verify it starts at step 1 (not type selection)
   - Verify contexts are pre-fetched
   - Modify configuration and save
   - Verify changes are applied

3. **Backward Compatibility**:
   - If you have other plugins without `ui.steps`, verify they still work
   - They should show all fields in a single step

## Future Considerations

1. **Custom Step Actions**: Currently only `fetchContexts` is supported. We could add more actions like:
   - `validateCredentials`: Test credentials before proceeding
   - `custom`: Allow plugins to define custom actions

2. **Conditional Steps**: Allow steps to be shown/hidden based on configuration values

3. **Step Validation**: Allow plugins to define custom validation logic per step

4. **Progress Indicator**: Show a visual progress indicator for multi-step flows

5. **Custom Components**: For very complex plugins, allow them to provide custom React components for specific steps

## Conclusion

This implementation successfully decouples the configuration dialog from plugin-specific logic. The dialog is now a generic component that adapts to each plugin's needs based on its schema definition. This makes the system more maintainable, extensible, and provides better UX through custom step descriptions and help text.

