import React, { useEffect } from 'react';
import { BrowserRouter as Router } from 'react-router-dom';
import AppRoutes from './Routes';
import { usePlatform } from './hooks/usePlatform';

function App() {
  const { os, type, isLoading } = usePlatform();

  useEffect(() => {
    // Apply platform-specific classes to the document root
    // This allows CSS to target specific platforms/device types
    if (!isLoading) {
      console.log('🔍 Platform Detection Results:', { os, type, isLoading });

      document.documentElement.setAttribute('data-platform', os);
      document.documentElement.setAttribute('data-device-type', type);

      // Also add as classes for easier CSS targeting
      document.documentElement.classList.add(`platform-${os}`);
      document.documentElement.classList.add(`device-${type}`);

      console.log('✅ Applied classes to <html>:', {
        classes: document.documentElement.className,
        'data-platform': document.documentElement.getAttribute('data-platform'),
        'data-device-type': document.documentElement.getAttribute('data-device-type')
      });
    }
  }, [os, type, isLoading]);

  return (
    <Router>
      <AppRoutes />
    </Router>
  );
}

export default App;
