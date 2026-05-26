import '@testing-library/jest-dom/vitest';
import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

// Reset DOM + every module-level mock between tests so cross-file state
// (zustand store, listeners, timers) can't leak.
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
