# Plugin-Defined Configuration Flow

## Overview

This document describes the plugin-defined configuration flow system in CLAI. This system allows each plugin to define its own configuration steps and UI flow, making the configuration dialog completely generic and adaptable to different plugin needs.

## Problem Statement

Previously, the `PluginConfigurationDialog` assumed a fixed 3-step flow:
1. Select plugin type
2. Configure credentials (fields without `dependsOn`)
3. Configure scope (fields with `dependsOn`, with automatic context fetching)

This approach was hardcoded and assumed:
- All plugins have a credentials + scope structure
- Fields with `dependsOn` are always "scope" fields
- `fetchAvailableContexts` should always be called between steps 2 and 3

This was too rigid and specific to Netdata's needs. Other plugins might:
- Not need context fetching
- Have different configuration flows
- Not have a credentials/scope separation
- Need multiple configuration steps with different logic

## Solution

The new system allows plugins to define their configuration flow through schema metadata.

### Schema Extension

Plugins can now add UI metadata to their configuration schema to define custom flows:

```javascript
static getConfigurationSchema() {
  return {
    type: 'object',
    properties: {
      // ... field definitions
    },
    required: ['field1', 'field2'],
    // NEW: UI metadata for configuration flow
    ui: {
      steps: [
        {
          id: 'credentials',
          title: 'Configure Credentials',
          description: 'Enter your credentials',
          fields: ['token', 'baseUrl'],
          helpText: 'Optional help text shown at the bottom',
          onComplete: 'fetchContexts' // Optional action to execute
        },
        {
          id: 'scope',
          title: 'Select Scope',
          description: 'Choose what to monitor',
          fields: ['spaceId', 'roomId'],
          helpText: 'Select the space and room you want to monitor'
        }
      ]
    }
  };
}
```

### Step Definition

Each step in the configuration flow has the following properties:

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `id` | string | Yes | Unique identifier for the step |
| `title` | string | Yes | Title shown at the top of the step |
| `description` | string | No | Description shown below the title |
| `fields` | string[] | Yes | Array of field names to show in this step |
| `helpText` | string | No | Help text shown at the bottom of the step |
| `onComplete` | string | No | Action to execute when step is completed (currently only `'fetchContexts'` is supported) |

### Actions

Steps can define actions to execute when the user clicks "Next". Currently supported actions:

- **`fetchContexts`**: Calls the plugin's `fetchAvailableContexts()` method with the current configuration values. This is useful for plugins that need to fetch dynamic data (like spaces/rooms) based on credentials.

### Configuration Dialog Flow

The `PluginConfigurationDialog` now works as follows:

1. **Type Selection** (step index -1): User selects a plugin type
2. **Configuration Steps** (step index 0+): User goes through plugin-defined steps
   - For each step:
     - Show step title and description
     - Show plugin name input (first step only)
     - Show fields defined in step
     - Validate all fields are filled when user clicks "Next"
     - Execute `onComplete` action if defined
     - Move to next step
3. **Save**: On the last step, user saves the configuration

### Backward Compatibility

If a plugin doesn't define `ui.steps` in its schema, the dialog will show all fields in a single step. This ensures backward compatibility with plugins that don't need multi-step flows.

## Example: Netdata Plugin

Here's how Netdata defines its configuration flow:

```javascript
static getConfigurationSchema() {
  return {
    type: 'object',
    properties: {
      token: {
        type: 'string',
        title: 'Authentication Token',
        description: 'Netdata Cloud Bearer token',
        minLength: 1
      },
      baseUrl: {
        type: 'string',
        title: 'Base URL',
        description: 'Netdata Cloud base URL',
        default: 'https://app.netdata.cloud',
        pattern: '^https?://.+'
      },
      spaceId: {
        type: 'string',
        title: 'Space',
        description: 'Select the Netdata Cloud space',
        dynamicEnum: true
      },
      roomId: {
        type: 'string',
        title: 'Room',
        description: 'Select the room within the space',
        dependsOn: 'spaceId',
        dynamicEnum: true
      }
    },
    required: ['token', 'baseUrl', 'spaceId', 'roomId'],
    ui: {
      steps: [
        {
          id: 'credentials',
          title: 'Configure Credentials',
          description: 'Enter your Netdata Cloud credentials',
          fields: ['token', 'baseUrl'],
          helpText: '💡 After entering credentials, we\'ll fetch available spaces and rooms for you to select.',
          onComplete: 'fetchContexts'
        },
        {
          id: 'scope',
          title: 'Select Scope',
          description: 'Choose the space and room to monitor',
          fields: ['spaceId', 'roomId'],
          helpText: '💡 Select the space and room you want to monitor. You can create multiple configurations for different spaces/rooms.'
        }
      ]
    }
  };
}
```

This gives Netdata:
1. A credentials step that collects token and baseUrl
2. Automatic context fetching after credentials are entered
3. A scope step that shows dynamically-fetched spaces and rooms

## Benefits

1. **Flexibility**: Each plugin defines its own configuration flow
2. **Simplicity**: Plugins with simple needs can omit `ui.steps` and get a single-step flow
3. **Maintainability**: No hardcoded logic in the dialog component
4. **Extensibility**: Easy to add new step actions in the future
5. **User Experience**: Each plugin can provide custom help text and descriptions

## Future Enhancements

Possible future enhancements to this system:

1. **Custom Step Actions**: Allow plugins to define custom `onComplete` actions beyond `fetchContexts`
2. **Conditional Steps**: Allow steps to be shown/hidden based on previous values
3. **Custom Validation**: Allow plugins to define custom validation per step
4. **Step Progress**: Show a progress indicator for multi-step flows
5. **Custom Components**: Allow plugins to provide custom React components for complex steps

## Implementation Files

- `src/plugins/PluginInterface.js`: Base interface with schema documentation
- `src/plugins/netdata/NetdataPlugin.js`: Example implementation
- `src/components/PluginManagement/PluginConfigurationDialog.jsx`: Generic dialog that adapts to plugin schemas
- `src/components/PluginManagement/SchemaBasedForm.jsx`: Generic form renderer

## Migration Guide

For existing plugins that want to adopt this system:

1. Add `ui.steps` to your `getConfigurationSchema()` return value
2. Define steps with appropriate fields
3. Add `onComplete: 'fetchContexts'` to steps that need to fetch dynamic data
4. Test the configuration flow in the UI

For new plugins:

1. Implement `getConfigurationSchema()` with `ui.steps`
2. Implement `fetchAvailableContexts()` if you need dynamic data
3. The dialog will automatically adapt to your schema

