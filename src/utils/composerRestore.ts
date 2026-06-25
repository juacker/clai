/**
 * Decide what to put back in the composer after a send fails.
 *
 * When a message fails to send (no credits, provider error, network), the
 * composer was already cleared optimistically on submit. We restore the failed
 * prompt so the user can retry without retyping — mirroring claude.ai.
 *
 * The send is async, so the user may have started typing a *new* message while
 * it was in flight. In that case we must NOT clobber their new text: restore
 * the failed prompt only when the composer is still effectively empty.
 *
 * Kept as a pure function so the "don't clobber new typing" rule is unit-
 * testable without a DOM.
 *
 * @param current      the composer's value right now (may be what the user
 *                     typed after the optimistic clear).
 * @param failedPrompt the prompt that failed to send (original, untrimmed).
 * @returns the value the composer should hold.
 */
export function restoreFailedPrompt(current: string, failedPrompt: string): string {
  return current.trim() === '' ? failedPrompt : current;
}
