/**
 * Metrics Component
 *
 * Displays metrics overview for the current space and room context
 */

import React from 'react';
import { useTabContext } from '../../contexts/TabContext';
import styles from './Metrics.module.css';

const Metrics = ({ command }) => {
  // Access space and room from tab context
  const { selectedSpace, selectedRoom } = useTabContext();

  return (
    <div className={styles.metricsContainer}>
      {/* Placeholder content - will be implemented later */}
      <div className={styles.metricsHeader}>
        <h2>Metrics Overview</h2>
        {selectedSpace && (
          <p className={styles.context}>
            Space: {selectedSpace.name || selectedSpace.id}
            {selectedRoom && ` / Room: ${selectedRoom.name || selectedRoom.id}`}
          </p>
        )}
      </div>
    </div>
  );
};

export default Metrics;

