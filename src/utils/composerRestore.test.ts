import { describe, it, expect } from 'vitest';
import { restoreFailedPrompt } from './composerRestore';

describe('restoreFailedPrompt', () => {
  it('restores the failed prompt when the composer is empty', () => {
    expect(restoreFailedPrompt('', 'hello world')).toBe('hello world');
  });

  it('restores when the composer holds only whitespace', () => {
    expect(restoreFailedPrompt('   \n  ', 'retry me')).toBe('retry me');
  });

  it('preserves text the user typed while the send was in flight', () => {
    expect(restoreFailedPrompt('a new message', 'the failed one')).toBe('a new message');
  });

  it('does not clobber a new message even if it matches after trim', () => {
    expect(restoreFailedPrompt('  new draft  ', 'failed')).toBe('  new draft  ');
  });

  it('preserves the failed prompt verbatim, including trailing whitespace', () => {
    expect(restoreFailedPrompt('', 'line1\nline2  ')).toBe('line1\nline2  ');
  });
});
