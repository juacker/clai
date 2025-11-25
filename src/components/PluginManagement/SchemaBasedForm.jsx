/**
 * SchemaBasedForm Component
 *
 * Generic form renderer that creates form fields based on a JSON Schema.
 * Supports dynamic field resolution (e.g., fetching dependent options).
 *
 * Used by:
 * - PluginConfigurationDialog (NEW single-level configuration)
 * - ConfigureInstancePanel (DEPRECATED two-level configuration)
 */

import React from 'react';
import styles from './SchemaBasedForm.module.css';

/**
 * FormField Component
 * Renders a single form field based on its schema definition
 */
const FormField = ({
  name,
  schema,
  value,
  onChange,
  allValues,
  availableContexts,
  disabled
}) => {
  // Handle dependent fields (fields that depend on other field values)
  if (schema.dependsOn) {
    const dependencyValue = allValues[schema.dependsOn];

    // Don't show this field until dependency is set
    if (!dependencyValue) {
      return null;
    }

    // Handle Netdata-specific dependency: roomId depends on spaceId
    if (name === 'roomId' && schema.dependsOn === 'spaceId') {
      const selectedSpace = availableContexts?.spaces?.find(
        (s) => s.id === dependencyValue
      );
      const rooms = selectedSpace?.rooms || [];

      return (
        <div className={styles.formGroup}>
          <label htmlFor={name}>{schema.title}</label>
          <select
            id={name}
            className={styles.select}
            value={value || ''}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
          >
            <option value="">Select {schema.title.toLowerCase()}</option>
            {rooms.map((room) => (
              <option key={room.id} value={room.id}>
                {room.name}
              </option>
            ))}
          </select>
          {schema.description && (
            <small className={styles.fieldDescription}>{schema.description}</small>
          )}
        </div>
      );
    }

    // Generic dependent field (for future plugins)
    // Just show it as a text input after dependency is set
    return (
      <div className={styles.formGroup}>
        <label htmlFor={name}>{schema.title}</label>
        <input
          id={name}
          type="text"
          className={styles.input}
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder={schema.description}
          disabled={disabled}
        />
      </div>
    );
  }

  // Dynamic enum field (populated from availableContexts)
  if (schema.dynamicEnum && name === 'spaceId' && availableContexts?.spaces) {
    const spaces = availableContexts.spaces || [];
    return (
      <div className={styles.formGroup}>
        <label htmlFor={name}>{schema.title}</label>
        <select
          id={name}
          className={styles.select}
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
        >
          <option value="">Select {schema.title.toLowerCase()}</option>
          {spaces.map((space) => (
            <option key={space.id} value={space.id}>
              {space.name}
            </option>
          ))}
        </select>
        {schema.description && (
          <small className={styles.fieldDescription}>{schema.description}</small>
        )}
      </div>
    );
  }

  // Enum field (dropdown/select)
  if (schema.enum && schema.enum.length > 0) {
    return (
      <div className={styles.formGroup}>
        <label htmlFor={name}>{schema.title}</label>
        <select
          id={name}
          className={styles.select}
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
        >
          <option value="">Select {schema.title.toLowerCase()}</option>
          {schema.enum.map((enumValue, idx) => (
            <option key={enumValue} value={enumValue}>
              {schema.enumNames?.[idx] || enumValue}
            </option>
          ))}
        </select>
        {schema.description && (
          <small className={styles.fieldDescription}>{schema.description}</small>
        )}
      </div>
    );
  }

  // Number field
  if (schema.type === 'number' || schema.type === 'integer') {
    return (
      <div className={styles.formGroup}>
        <label htmlFor={name}>{schema.title}</label>
        <input
          id={name}
          type="number"
          className={styles.input}
          value={value || ''}
          onChange={(e) => onChange(Number(e.target.value))}
          placeholder={schema.description}
          disabled={disabled}
        />
        {schema.description && (
          <small className={styles.fieldDescription}>{schema.description}</small>
        )}
      </div>
    );
  }

  // Boolean field (checkbox)
  if (schema.type === 'boolean') {
    return (
      <div className={styles.formGroup}>
        <label className={styles.checkboxLabel}>
          <input
            type="checkbox"
            checked={value || false}
            onChange={(e) => onChange(e.target.checked)}
            disabled={disabled}
          />
          <span>{schema.title}</span>
        </label>
        {schema.description && (
          <small className={styles.fieldDescription}>{schema.description}</small>
        )}
      </div>
    );
  }

  // String field (default)
  if (schema.type === 'string') {
    // Check if this is a password field (format: "password" or field name contains "password"/"token")
    const isPassword = schema.format === 'password' ||
                       name.toLowerCase().includes('password') ||
                       name.toLowerCase().includes('token');

    return (
      <div className={styles.formGroup}>
        <label htmlFor={name}>{schema.title}</label>
        <input
          id={name}
          type={isPassword ? 'password' : 'text'}
          className={styles.input}
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder={schema.description}
          disabled={disabled}
        />
        {schema.description && (
          <small className={styles.fieldDescription}>{schema.description}</small>
        )}
      </div>
    );
  }

  // Unsupported field type
  console.warn(`[SchemaBasedForm] Unsupported field type for ${name}:`, schema.type);
  return null;
};

/**
 * SchemaBasedForm Component
 * Renders a complete form based on a JSON Schema
 */
const SchemaBasedForm = ({
  schema,
  values,
  onChange,
  availableContexts,
  disabled = false
}) => {
  if (!schema || !schema.properties) {
    return null;
  }

  const handleFieldChange = (fieldName, fieldValue) => {
    onChange({
      ...values,
      [fieldName]: fieldValue
    });
  };

  return (
    <div className={styles.schemaForm}>
      {Object.entries(schema.properties).map(([fieldName, fieldSchema]) => (
        <FormField
          key={fieldName}
          name={fieldName}
          schema={fieldSchema}
          value={values[fieldName]}
          onChange={(value) => handleFieldChange(fieldName, value)}
          allValues={values}
          availableContexts={availableContexts}
          disabled={disabled}
        />
      ))}
    </div>
  );
};

export default SchemaBasedForm;

