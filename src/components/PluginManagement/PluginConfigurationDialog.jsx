/**
 * PluginConfigurationDialog Component
 *
 * Generic dialog for configuring a plugin with FULL configuration.
 * This is the NEW single-level configuration system with plugin-defined flows.
 *
 * Flow:
 * 1. User selects a plugin type
 * 2. User goes through plugin-defined configuration steps
 *    - Each plugin defines its own steps via schema.ui.steps
 *    - Steps can trigger actions like fetchContexts
 * 3. User provides a name for this configuration
 * 4. Save as a fully-configured plugin instance
 *
 * The dialog adapts to each plugin's configuration needs based on the schema.
 *
 * Phase 4: Plugin-Defined Configuration UI
 */

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { usePlugin } from '../../contexts/PluginContext';
import SchemaBasedForm from './SchemaBasedForm';
import styles from './PluginConfigurationDialog.module.css';

const PluginConfigurationDialog = ({ isOpen, onClose, instanceId = null }) => {
  const {
    getAvailablePluginTypes,
    createPluginInstance,
    updatePluginConfig,
    getPluginInstance,
    getPluginClass,
  } = usePlugin();

  // Dialog state
  const [currentStepIndex, setCurrentStepIndex] = useState(0); // Index in the steps array (-1 = type selection)
  const [selectedType, setSelectedType] = useState(null);
  const [instanceName, setInstanceName] = useState('');
  const [configuration, setConfiguration] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const [isFetchingContexts, setIsFetchingContexts] = useState(false);
  const [error, setError] = useState(null);
  const [availableContexts, setAvailableContexts] = useState(null);
  const [configSchema, setConfigSchema] = useState(null);

  const isEditMode = !!instanceId;
  const availableTypes = getAvailablePluginTypes();

  // Get configuration steps from schema
  const configSteps = configSchema?.ui?.steps || [];

  // Initialize form when editing
  useEffect(() => {
    if (isOpen && instanceId) {
      const instance = getPluginInstance(instanceId);
      if (instance) {
        setSelectedType(instance.type);
        setInstanceName(instance.name);
        setConfiguration(instance.config);
        setCurrentStepIndex(0); // Start at first config step when editing

        // Load schema for this plugin type
        const PluginClass = getPluginClass(instance.type);
        if (PluginClass) {
          const schema = PluginClass.getConfigurationSchema();
          setConfigSchema(schema);

          // Fetch available contexts with current credentials if needed
          const steps = schema?.ui?.steps || [];
          const needsContexts = steps.some(step => step.onComplete === 'fetchContexts');
          if (needsContexts) {
            fetchAvailableContexts(instance.type, instance.config);
          }
        }
      }
    } else if (isOpen) {
      // Reset form for new configuration
      setCurrentStepIndex(-1); // -1 means "type selection" step
      setSelectedType(null);
      setInstanceName('');
      setConfiguration({});
      setError(null);
      setAvailableContexts(null);
      setConfigSchema(null);
    }
  }, [isOpen, instanceId, getPluginInstance, getPluginClass]);

  // Handle type selection
  const handleTypeSelect = (typeId) => {
    setSelectedType(typeId);

    // Load configuration schema for selected plugin
    const PluginClass = getPluginClass(typeId);
    if (PluginClass) {
      const schema = PluginClass.getConfigurationSchema();
      setConfigSchema(schema);
    }
  };

  // Fetch available contexts (spaces/rooms) using provided credentials
  const fetchAvailableContexts = async (typeId, config) => {
    const PluginClass = getPluginClass(typeId);
    if (!PluginClass || !PluginClass.fetchAvailableContexts) {
      console.warn('[PluginConfigurationDialog] Plugin does not support fetchAvailableContexts');
      return;
    }

    try {
      setIsFetchingContexts(true);
      setError(null);

      // Pass the config to the plugin to extract credentials
      const contexts = await PluginClass.fetchAvailableContexts(config);
      setAvailableContexts(contexts);
    } catch (err) {
      console.error('[PluginConfigurationDialog] Failed to fetch contexts:', err);
      setError(err.message || 'Failed to fetch available contexts. Please check your credentials.');
    } finally {
      setIsFetchingContexts(false);
    }
  };

  // Handle next step
  const handleNext = async () => {
    // If we're on type selection step (-1), move to first config step
    if (currentStepIndex === -1) {
      if (!selectedType) {
        setError('Please select a plugin type');
        return;
      }
      setCurrentStepIndex(0);
      setError(null);
      return;
    }

    // Get current step
    const currentStep = configSteps[currentStepIndex];
    if (!currentStep) return;

    // Validate current step fields are filled
    const missingFields = currentStep.fields.filter((fieldName) => !configuration[fieldName]);
    if (missingFields.length > 0) {
      setError(`Please fill in all required fields: ${missingFields.map(f => configSchema.properties[f]?.title || f).join(', ')}`);
      return;
    }

    setError(null);

    // Execute onComplete action if defined
    if (currentStep.onComplete === 'fetchContexts') {
      await fetchAvailableContexts(selectedType, configuration);
    }

    // Move to next step
    setCurrentStepIndex(currentStepIndex + 1);
  };

  // Handle back
  const handleBack = () => {
    if (currentStepIndex > 0) {
      // Go back to previous config step
      setCurrentStepIndex(currentStepIndex - 1);
      setError(null);
    } else if (currentStepIndex === 0 && !isEditMode) {
      // Go back to type selection
      setCurrentStepIndex(-1);
      setConfiguration({});
      setInstanceName('');
      setError(null);
      setAvailableContexts(null);
    }
  };

  // Handle configuration change
  const handleConfigChange = (newConfig) => {
    setConfiguration(newConfig);
  };

  // Handle save
  const handleSave = async () => {
    if (!instanceName) {
      setError('Please provide a name for this plugin');
      return;
    }

    // Validate configuration
    const PluginClass = getPluginClass(selectedType);
    if (PluginClass && PluginClass.validateConfiguration) {
      const validationResult = PluginClass.validateConfiguration(configuration, availableContexts);
      if (!validationResult.valid) {
        setError(validationResult.error || 'Invalid configuration');
        return;
      }
    }

    try {
      setIsLoading(true);
      setError(null);

      if (isEditMode) {
        // Update existing instance
        await updatePluginConfig(instanceId, configuration, instanceName);
      } else {
        // Create new instance
        await createPluginInstance(selectedType, configuration, instanceName);
      }

      onClose();
    } catch (err) {
      console.error('[PluginConfigurationDialog] Failed to save configuration:', err);
      setError(err.message || 'Failed to save configuration. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  // Get selected plugin type details
  const selectedPluginType = availableTypes.find((t) => t.id === selectedType);

  // Get current step
  const currentStep = currentStepIndex >= 0 ? configSteps[currentStepIndex] : null;
  const isLastStep = currentStepIndex >= 0 && currentStepIndex === configSteps.length - 1;
  const isTypeSelectionStep = currentStepIndex === -1;

  // Build schema for current step's fields
  const currentStepSchema = currentStep && configSchema
    ? {
        ...configSchema,
        properties: Object.fromEntries(
          Object.entries(configSchema.properties).filter(
            ([key]) => currentStep.fields.includes(key)
          )
        ),
      }
    : null;

  const dialogContent = (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.dialog} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <h2>{isEditMode ? 'Edit Plugin Configuration' : 'Configure Plugin'}</h2>
          <button className={styles.closeButton} onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <div className={styles.content}>
          {/* Type Selection Step */}
          {isTypeSelectionStep && !isEditMode && (
            <div className={styles.step}>
              <h3>Select Plugin Type</h3>
              <div className={styles.typeList}>
                {availableTypes.map((type) => (
                  <div
                    key={type.id}
                    className={`${styles.typeItem} ${
                      selectedType === type.id ? styles.selected : ''
                    }`}
                    onClick={() => handleTypeSelect(type.id)}
                  >
                    <div className={styles.typeIcon}>
                      {type.name.charAt(0).toUpperCase()}
                    </div>
                    <div className={styles.typeInfo}>
                      <div className={styles.typeName}>{type.name}</div>
                      <div className={styles.typeDescription}>{type.description}</div>
                    </div>
                    {selectedType === type.id && (
                      <div className={styles.checkmark}>✓</div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Configuration Steps */}
          {currentStep && selectedPluginType && (
            <div className={styles.step}>
              <h3>{currentStep.title}</h3>
              {currentStep.description && (
                <p className={styles.stepDescription}>{currentStep.description}</p>
              )}

              {error && <div className={styles.error}>{error}</div>}

              {/* Plugin Name (show in first step only) */}
              {currentStepIndex === 0 && (
                <div className={styles.formGroup}>
                  <label htmlFor="instanceName">Plugin Name</label>
                  <input
                    id="instanceName"
                    type="text"
                    className={styles.input}
                    value={instanceName}
                    onChange={(e) => setInstanceName(e.target.value)}
                    placeholder="e.g., Production Monitoring"
                    disabled={isLoading}
                  />
                </div>
              )}

              {/* Show loading state if fetching contexts */}
              {isFetchingContexts ? (
                <div className={styles.loading}>
                  <div className={styles.spinner}></div>
                  <p>Fetching available contexts...</p>
                </div>
              ) : (
                <>
                  {/* Fields for current step */}
                  <SchemaBasedForm
                    schema={currentStepSchema}
                    values={configuration}
                    onChange={handleConfigChange}
                    availableContexts={availableContexts}
                    disabled={isLoading}
                  />

                  {/* Help text */}
                  {currentStep.helpText && (
                    <div className={styles.helpText}>{currentStep.helpText}</div>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        <div className={styles.footer}>
          {isTypeSelectionStep && !isEditMode ? (
            <>
              <button className={styles.cancelButton} onClick={onClose} disabled={isLoading}>
                Cancel
              </button>
              <button
                className={styles.nextButton}
                onClick={handleNext}
                disabled={!selectedType || isLoading}
              >
                Next
              </button>
            </>
          ) : isLastStep ? (
            <>
              <button className={styles.backButton} onClick={handleBack} disabled={isLoading}>
                Back
              </button>
              <button className={styles.cancelButton} onClick={onClose} disabled={isLoading}>
                Cancel
              </button>
              <button
                className={styles.saveButton}
                onClick={handleSave}
                disabled={!instanceName || isLoading}
              >
                {isLoading ? 'Saving...' : isEditMode ? 'Update' : 'Save'}
              </button>
            </>
          ) : (
            <>
              {!isEditMode && currentStepIndex > 0 && (
                <button className={styles.backButton} onClick={handleBack} disabled={isLoading}>
                  Back
                </button>
              )}
              <button className={styles.cancelButton} onClick={onClose} disabled={isLoading}>
                Cancel
              </button>
              <button
                className={styles.nextButton}
                onClick={handleNext}
                disabled={isLoading || isFetchingContexts}
              >
                {isFetchingContexts ? 'Loading...' : 'Next'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(dialogContent, document.body);
};

export default PluginConfigurationDialog;

