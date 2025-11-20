import React, { useEffect } from 'react';
import { BrowserRouter as Router } from 'react-router-dom';
import AppRoutes from './Routes';
import { usePlatform } from './hooks/usePlatform';

function App() {
  const { os } = usePlatform();

  useEffect(() => {
    // Apply desktop platform class to the document root
    console.log('🔍 Platform Detection Results:', { os, type: 'desktop' });

    document.documentElement.setAttribute('data-platform', os);
    document.documentElement.setAttribute('data-device-type', 'desktop');

    // Also add as classes for easier CSS targeting
    document.documentElement.classList.add(`platform-${os}`);
    document.documentElement.classList.add('device-desktop');

    console.log('✅ Applied classes to <html>:', {
      classes: document.documentElement.className,
      'data-platform': document.documentElement.getAttribute('data-platform'),
      'data-device-type': document.documentElement.getAttribute('data-device-type')
    });
  }, [os]);

  return (
    <Router>
      <AppRoutes />
    </Router>
  );
}

export default App;
