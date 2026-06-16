import { useEffect } from 'react';
import { BrowserRouter as Router, Link } from 'react-router-dom';
import AppRoutes from './Routes';
import { usePlatform } from './hooks/usePlatform';

function App() {
  const { os } = usePlatform();

  useEffect(() => {
    // Apply desktop platform class to the document root
    document.documentElement.setAttribute('data-platform', os);
    document.documentElement.setAttribute('data-device-type', 'desktop');

    // Also add as classes for easier CSS targeting
    document.documentElement.classList.add(`platform-${os}`);
    document.documentElement.classList.add('device-desktop');
  }, [os]);

  return (
    <Router>
      <AppRoutes />
      {/* ponytail: TEMPORARY Phase-1 spike affordance — remove before merge.
          A Tauri window has no address bar, so this floating link is the only
          way to reach the unlinked /_terminal-spike test route. */}
      <Link
        to="/_terminal-spike"
        title="Open the Phase 1 terminal perf spike"
        style={{
          position: 'fixed',
          bottom: 12,
          right: 12,
          zIndex: 99999,
          padding: '6px 10px',
          borderRadius: 8,
          background: '#0b0e14',
          color: '#7ee787',
          border: '1px solid #30363d',
          font: '12px ui-monospace, Menlo, monospace',
          textDecoration: 'none',
          opacity: 0.85,
        }}
      >
        🧪 Terminal spike
      </Link>
    </Router>
  );
}

export default App;
