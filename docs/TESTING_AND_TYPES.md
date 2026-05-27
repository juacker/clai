# Testing & Types — Hardening Roadmap

> Living document. Update as tasks complete or new regression classes surface.

This is the punch list for finishing the FE-hardening work that started after a string of regressions (ask_user panel race, silent skill drop, scheduled-run cancellation, …) made clear that the JS↔Rust boundary needed contract guarantees and that critical state-management code needed test coverage.

## Where we are

Three commits landed:

| SHA       | Step                                | What it actually catches                                                                                                                                                |
| --------- | ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `15cf13a` | vitest + 16 seed tests              | `loadSessionData` preservation of FE-only state (the ask_user race); `clearAskUserPending` stale-id guard; event-envelope wire-format keys (`payload.pending_id`, etc.) |
| `ebc1c78` | ts-rs codegen for the event surface | Compile-time error when any Rust type in the `AssistantUiEvent` closure is renamed or has a field added/removed                                                         |
| `ce7e66b` | TS bootstrap on 4 critical files    | Exhaustiveness on the event-reducer switch; typed store interfaces; typed `assistantClient.*` and workspace client invokes                                              |

Scripts now wired:

- `npm test` / `npm run test:watch` — vitest
- `npm run typecheck` — `tsc --noEmit`
- `npm run gen:bindings` — regenerate `src/generated/bindings.ts`
- `npm run lint` — eslint over .js/.jsx/.ts/.tsx
- GitHub CI runs lint + typecheck + tests + `gen:bindings` and fails if `src/generated/bindings.ts` drifts.

## What "completely done" means

We can call this work finished when **all** of the following are true:

1. Every BE→FE plumbing surface (events + Tauri command request/response shapes that the FE actually reads) has generated bindings. Rust renames break the FE build.
2. Every file in `src/` is `.ts`/`.tsx`. `allowJs` is removed; strict mode is on.
3. Every regression we've hit has a test that would have caught it. New regressions land with a failing test before the fix.
4. CI runs `typecheck` + `test` + `gen:bindings` (and fails if bindings drift). Every push is gated.
5. The 4 highest-traffic UI surfaces (Workspace page, Fleet page, AskUserPanel, ChatMessageList) have component-level tests covering at least their happy path.

**P2-0 through P2-4 are complete as of 2026-05-27 — `src/` is 100% TypeScript** with `allowJs:false` + `noUncheckedIndexedAccess` + `noImplicitOverride`, and coverage tooling is wired (P2-3). Remaining: ratchet coverage up (P2-3), opportunistic adapter tests (P2-5, mostly already covered), and E2E (P2-6, deferred by design). **P0 and P1 complete; P1-1's skill-binding carve-out closed under P2-1b.** A **dead-code sweep (P2-0)** removed the orphaned pre-workspace tabs/tiles + command-visualization subsystem (~8800 lines / 36 files, −358KB bundle). Everything else was converted: Fleet, the full Settings cluster, ContextPanel, the terminal + workspace-task components, the app shell, the leaf utils/hooks/handlers, `api/client`, `fleet/client`, all the contexts, and finally **`TabManagerContext`** — whose conversion also carried the deferred tile-internal removal (the dead tile-grid ops + per-tab command registry, and `src/commands/` deleted; a vestigial `rootTile` leaf is kept so the persist shape still deserializes into the stubbed Rust `WorkspaceState`). The conversion caught 3 latent snake_case wire-field bugs — evidence the typing effort is worth it beyond pure hygiene. **Next: drop `allowJs` (P2-2)**, then coverage (P2-3), provider-adapter tests (P2-5), and E2E (P2-6).

## House rules in effect today

These already apply — don't wait for the roadmap to finish:

- **Regenerate bindings when Rust shapes change.** `npm run gen:bindings` and commit the diff. Anything that derives `TS` is part of the FE-visible contract.
- **Bindings drift is CI-gated.** CI runs `npm run gen:bindings` and `git diff --exit-code src/generated/bindings.ts`; if Rust `TS` shapes changed without a committed binding update, the build fails.
- **Failing test first when a regression bites.** Write a vitest case that fails on `main`, then ship the fix. The bug becomes a permanent canary.
- **Prefer `.ts`/`.tsx` for new files** in `src/`. Vite consumes either; mechanical conversion of existing `.jsx` can drift in as files are touched.
- **Never delete a failing test to ship.** If it fails, either the test is wrong (fix it) or the code is wrong (fix that). Suppressing is a smell.

## Remaining tasks

### P0 — Completed 2026-05-26

- [x] WorkspaceSnapshot/list/session/file bindings generated from Rust and consumed by `src/workspace/client.ts`.
- [x] CI binding-drift guard added via `npm run gen:bindings` + `git diff --exit-code src/generated/bindings.ts`.
- [x] `src-tauri/tests/prompt_build.rs` covers selected bundled skill content and the no-skill raw-description path through `workspace_agent_runtime_description(...)`.
- [x] `src/pages/Workspace.jsx` converted to `src/pages/Workspace.tsx` with typed snapshot/state/props around the Workspace page shell.

### P1 — Completed 2026-05-26

**P1-1. More Tauri command bindings.** _Done (one carve-out)._

- [x] Provider-connection request/response structs + assistant types (`AuthMode`, `ProtocolFamily`, `ProviderConnection`, `ProviderDescriptor`, `ModelInfo`). `src/assistant/client.ts` typed end-to-end.
- [x] MCP server commands (`Create/UpdateMcpServerRequest`, `McpServerAuthRequest/Response`, `McpServerResponse`, `McpServerTransport`, `McpServerIntegrationType`).
- [x] Path-grant + permission commands (`PermissionRequest`, `SegmentDecision`, `SegmentApproval`, `PathGrantRequest`, `PathGrantDecision`, `FilesystemPathAccess`). `permissions/client.ts` + `pathGrantsClient.ts` converted + typed; inline cards now use the generated types.
- [ ] **Skill catalog bindings — deferred.** `SkillSourceConfig` + `SkillDefinition` closure is heavy (`serde(flatten)` over the config struct) and the skills surface is low-regression-risk. Pick up when the skills settings screen needs hardening.

**P1-2. Convert the highest-traffic remaining components.** _Done._

- [x] `AskUserPanel.jsx`, `InlineApprovalCard.jsx`, `InlinePathGrantCard.jsx`, `WorkspaceFilePreviewPanel.jsx` → `.tsx`.
- [x] `ChatMessageList.jsx` → `.tsx` (~700 lines; discriminated-union narrowing on `ContentPart`, full prop interfaces).
- [x] `useAssistantSession.js` → `.ts`.
- Note: `MarkdownMessage`, `StreamingMarkdown`, `VirtualizedList` remain `.jsx`; consumers pin them via typed casts. Converting those three is folded into P2-1.

**P1-3. Convert `workspaceStore.js` to `.ts`.** _Done._

- [x] Tile-tree discriminated union + tab/command/store interfaces typed; `PersistedWorkspaceState` pins the Tauri boundary.

**P1-4. Component-level tests for the chat surface.** _Done._

- [x] `src/test/mockTauri.ts` shared pattern + `src/test/setup.js` `scrollIntoView` stub.
- [x] `AskUserPanel.test.tsx` (8), `ChatMessageList.test.tsx` (5), `InlineApprovalCard.test.tsx` (4). FE suite: 33 tests across 5 files.

**P1-5. BE integration test for cancel-token registration.** _Done._

- [x] Unit tests in `assistant/runtime.rs` + integration tests in `src-tauri/tests/cancel_run.rs` pinning the all-spawn-sites-use-run.id convention.

### P2 — Longer tail (multi-day, opportunistic)

**P2-0. Dead-code sweep.** _Done 2026-05-27 (commits `a3727fe`, `d14e592`, `ad46400`)._
A reachability audit from the real render roots (`MainLayout` → `TerminalEmulatorWrapper`/`Fleet`/`Workspace`) found that the entire pre-workspace **tabs/tiles + command-visualization subsystem** was orphaned when the Home page was deleted (see `Routes.jsx`). Removed ~8800 lines / 36 files and ~348KB of bundle:

- [x] Render tree: `TabView`, `TabBar`, `TabContent`, `TileView`, `DesktopChatPanel`, `AssistantChat` wrapper (kept `ChatMessageList`), `ToolBlock`.
- [x] Visualization components: `Dashboard`, `Canvas`+nodes, `Anomalies`, `ChartsView/ContextChart`, `common/DashboardPicker`, `common/NetdataSpinner`, `Echo`, `Help`.
- [x] Emptied `utils/commandRegistry.js` (`COMMAND_COMPONENTS`/`getCommandComponent` were only used by `TileView`); kept `isCommandSupported`.
- [x] Utils/hooks: `tileCommandHandler`, `canvasElementValidator`, `dashboardElementValidator`, `performance/*`, `useCommandRegistration`, `useWorkspaceSelectors`.
- [x] `CommandMessagingContext` + its `MainLayout` provider; the dead `/tile` command branch in `TabManagerContext`.
- [x] **Internal untangle — done under P2-1 (commit `2ea1b65`).** When `TabManagerContext` was converted to `.tsx`, the dead tile state (`activeTileId`, `splitTile/closeTile/resizeTile`, tile-tree helpers, per-tab `CommandRegistry`, the `currentCommand` effect, `executeCommand('help')` init) was removed with the compiler guarding the live `/tab`//`/ctx` paths — verified first that none of those methods had a live consumer. `src/commands/` (the CommandRegistry class) deleted. A vestigial `rootTile` leaf is still created per tab so the persist shape deserializes into the Rust `WorkspaceState` — note that `save_workspace_state`/`load_workspace_state` are **already stubbed** (vestigial), so no real persistence migration was needed; fully ripping out `rootTile`/`commands` from `workspaceStore` + the Rust struct is a separate, optional cleanup. (Known minor fallout: the terminal's `/help` hint points to a removed command.)

**P2-1. Convert the remaining `.jsx` files.** _Done 2026-05-27 — `src/` is 100% TypeScript (only `src/test/setup.js` stays JS)._ Dead-code sweep (P2-0) deleted most of the original queue; the rest was converted:

- [x] Pinned leaf components: `MarkdownMessage`, `StreamingMarkdown`, `VirtualizedList` (`<T,>` generic, `memo(Inner) as typeof Inner` export). Casts removed from consumers.
- [x] Trivial leaves: `utils/openExternal`, `hooks/useDebounce`, `hooks/usePlatform`, and pure re-export indexes.
- [x] `src/pages/Fleet.jsx` → `.tsx`.
- [x] `src/components/Settings/*` — **9 of 9 done**. Surfaced + fixed 3 latent snake_case bugs (`has_secret` ×2, `local_path` ×1).
- [x] `src/components/ContextPanel/*` (ContextBadge, ContextPanel, McpServerAvatar, McpServerSelector) — typed against `McpServerResponse`/`ProviderConnection`.
- [x] Leaf components: `NotFound`, `ConfirmDialog`, `Echo`, `Help`, `TabView`.
- [x] Leaf utils/hooks: `commandTypes`, `commandParser`, `commandRegistry`, `contextCommandHandler`, `tabCommandHandler`, `fleet/client`, `usePermissionAttention`, `useFleetActivity`, `useKeyboardShortcuts`.
- [x] `src/api/client.js` → `.ts` (typed against bindings; deleted dead getData/getContexts).
- [x] App shell: `main`, `Routes`, `App`, `MainLayout` (+ `index.html` entry).
- [x] Contexts: `FleetContext`, `TabContext`, `ChatManagerContext`, `CommandContext`.
- [x] Terminal + workspace-task: `TerminalEmulator`, `TerminalEmulatorWrapper`, `WorkspaceTaskNotifications`, `WorkspaceTaskTranscriptPanel`, `WorkspaceContextBar`.

- [x] Contexts: `CommandContext` (CommandRecord/CommandContextValue typed).
- [x] **`TabManagerContext` → `.tsx`** (commit `2ea1b65`) with the P2-0 tile-internal removal; `src/commands/` deleted; `useTabManager` casts removed from the terminal components. **This was the last `.jsx`.**

Optional follow-ups (not blocking 100%-TS):

- `src/test/setup.js` stays `.js`; rename remaining `.test.js` → `.test.ts` (mechanical).
- Fully remove `rootTile`/`TileNode`/`commands` from `workspaceStore.ts` + the Rust `WorkspaceState` struct (the persistence is already stubbed/vestigial, so this is pure cleanup, not a migration).
- Fix the terminal's stale `/help` hint copy.

**P2-1b. Skill-catalog bindings.** _Done 2026-05-26._

- [x] `SkillSourceKind/Config`, `SkillDefinition`, `SkillSourceDiagnostic`, and the `skills.rs` request/response structs derive `TS`. `#[ts(flatten)]` added alongside `#[serde(flatten)]` on `SkillSourceResponse`. Consumer typing (`api/client.js` skill commands) lands when that file is converted under P2-1.

**P2-2. Drop `allowJs`; tighten compiler.** _Done 2026-05-27._

- [x] `allowJs: false`; include glob restricted to `.ts`/`.tsx` (a stray `.js` under `src/` no longer escapes type-checking). `checkJs` can't coexist with `allowJs:false`, so it's omitted.
- [x] `noImplicitOverride` (0 errors).
- [x] `noUncheckedIndexedAccess` — **enabled; fixed 126 sites** across ~18 files (`!` only where provably in-bounds; real guards / `?? null` / typed defaults where genuinely nullable). The highest-value flag here.
- [x] `exactOptionalPropertyTypes` — **evaluated, intentionally left OFF.** It surfaced ~24 errors that were all "widen an optional prop to `| undefined`" (modelling React's `prop={cond ? v : undefined}` idiom, not real bugs). Poor cost/benefit; revisit only if a concrete undefined-vs-absent bug motivates it.

**P2-3. Coverage tracking.** _Tooling done 2026-05-27; ratcheting is ongoing._

- [x] `@vitest/coverage-v8` + `npm run test:coverage` + coverage config (v8; text/html/json-summary; excludes generated/tests/barrels/entrypoint). `coverage/` gitignored.
- Baseline with the current 5-file suite: **~7% overall, ~36% `src/assistant/`**. No failing threshold yet.
- [ ] Ratchet a gate up (assistant/ first → 80%) as tests are added. CI gate: fail if coverage drops >2%.

**P2-4. Convert FE test files to `.ts`.** _Done 2026-05-27._

- [x] `setup.ts` + `sessionStore.test.ts` + `useAssistantEvents.test.ts`; vitest `setupFiles` updated; typed fixtures via cast helpers.

**P2-5. Provider adapter tests.** _Largely already covered — original "zero coverage" claim was stale._
The Anthropic / OpenAI stream parsers in `src-tauri/src/assistant/providers/` **already have ~5 unit tests each**, including `parse_sse_frame` coverage and the critical `sse_stream_handles_split_utf8_across_transport_chunks` edge case (the exact catastrophic-regression class this task worried about). Remaining opportunistic work:

- [ ] `cli.rs` (Claude Code adapter) has no tests yet — add a few.
- [ ] Broaden event-sequence assertions (full message lifecycle, tool-call frames) if a parser regression ever slips through.

**P2-6. End-to-end smoke tests.** _Deferred (per this section's own guidance)._
Defer unless P0-P2 stops catching regressions — and P0-P2 still is (the typing migration caught 3 wire-field bugs). Tauri-driver + Playwright on the dev build is 1-2 days + ongoing maintenance. Cover just the golden path when picked up: open workspace → send message → see streaming → see ask_user panel → submit answer.

## Vestigial workspace persistence (optional cleanup)

`workspaceStore.ts` still carries `rootTile`/`TileNode`/`commands` and `TabManagerContext` creates a minimal `rootTile` leaf, purely so the persist payload deserializes into the Rust `WorkspaceState`. Both `save_workspace_state` and `load_workspace_state` are **stubbed** (load returns `default()`, save ignores its arg) — nothing actually persists. Fully removing `rootTile`/`commands` is a **cross-stack** change (the Rust `WorkspaceState`/`Tab`/`Command` structs + `workspace_virtual_artifacts`/`command_to_virtual_artifact`/`tab_agent_id`), so it's left as coherent-but-vestigial: harmless, and not worth the cross-stack churn for stubbed code.

## Out of scope (explicitly deferred)

- **Visual regression / screenshot diffing.** None of our regressions have been visual. Setup cost (Percy / Chromatic) outweighs payoff at our current size.
- **Full `tauri-specta` instead of `ts-rs`.** ts-rs gives us what we need (typed shapes). tauri-specta's additional value (typed `invoke` wrappers) is nice but not urgent; revisit if invoke-shape drift becomes a recurring bug.
- **Storybook.** Component-level vitest tests cover the same need with less infrastructure.
- **Performance / bundle-size regression gates.** Not the class of bug we've been hitting.

## When in doubt

If you're picking up this roadmap mid-stream:

1. Check the top of the file for any tasks marked `[in progress]` or `[blocked]`.
2. Default to P0 → P1 → P2 ordering. Skip a P0 only if blocked.
3. One task per commit; each task should leave the tree green (typecheck + test + build).
4. Update this file in the same commit that completes a task — strike through the bullet or remove it.
