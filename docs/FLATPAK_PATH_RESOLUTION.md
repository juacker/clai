# Flatpak PATH Resolution

Status: analysis + recommendation (not yet implemented)

## Symptom

Inside the Flatpak build, the app fails to locate host-installed tools:

- The bash/sandbox tool reports tools missing from `PATH` (e.g. `go isn't on my PATH in the sandbox`).
- Provider detection fails to find CLIs that *are* installed on the host (e.g. `claude`).

These look like two bugs but share one root cause.

## Root cause

Inside Flatpak, the app process's environment is the **Flatpak runtime environment**, not the
user's interactive shell environment. Its `PATH` is roughly `/app/bin:/usr/bin` and its `HOME` is
the per-app sandbox home (`~/.var/app/<id>`). Nothing in the app ever recovers the user's *real*
interactive `PATH`, so both code paths below operate on the wrong `PATH`.

### 1. Provider detection — `src-tauri/src/providers/mod.rs`

`command_exists()` (`providers/mod.rs:153`) runs `which <cmd>` via `get_host_command()`, which under
Flatpak becomes `flatpak-spawn --host which <cmd>` (`providers/mod.rs:89`).

The trap: **`flatpak-spawn --host` does not start a login shell.** It executes on the host but
inherits the *sandbox's* environment, so `which` searches the container `PATH`
(`/app/bin:/usr/bin`), not the user's real `PATH`. When that lookup fails, the code falls back to
probing a hardcoded list of common install dirs (`USER_BIN_PATHS`, `providers/mod.rs:101`):

```
.local/bin, .bun/bin, .npm-global/bin, .npm/bin, .cargo/bin, go/bin, .deno/bin
```

This is why detection is hit-or-miss: it finds a tool only if it lives in one of those exact dirs,
and misses everything else.

### 2. Sandbox env — `src-tauri/src/assistant/tools/local.rs` + `sandbox/`

`sandbox_profile()` (`local.rs:629`) builds the sandbox environment with:

```rust
env: SandboxEnv::filtered_from_current(&env_home, session_bus),  // local.rs:669
```

`filtered_from_current` (`profile.rs:78`) reads `std::env::vars()` — the **Flatpak app process's**
environment — and keeps a small allowlist (`PATH`, `LANG`, `TZ`, `TERM`, `LC_*`). `bwrap_args`
(`linux_bwrap.rs:101`) then does `--clearenv` and re-injects only that filtered set via `--setenv`
(`linux_bwrap.rs:121,173`).

So the `PATH` handed to the sandbox is the container `PATH`:

- `/app/bin` **does not exist on the host** — bwrap runs on the host (via `flatpak-spawn --host
  bwrap`, `linux_bwrap.rs`) and binds the host's `/usr`, `/etc`, … So that entry resolves to
  nothing.
- Go is almost never in `/usr/bin`. The official tarball installs to `/usr/local/go/bin`, and
  `go install` writes to `~/go/bin` — **neither is on the container `PATH`.**

Hence `go` (and most host tools) are not found inside the sandbox.

A second, related defect: `env_home` (`local.rs:664`) uses `std::env::var_os("HOME")`, which under
Flatpak is the sandbox home `~/.var/app/<id>`, **not** the real host home. The project already has
`paths::real_home()` for exactly this purpose, but the sandbox profile doesn't use it — so even
`~/go/bin` would expand against the wrong `~`.

## Can the real PATH be computed without a shell?

No — not reliably. There is no static file that holds a user's interactive `PATH`. What a terminal
shows is the accumulation of:

- `/etc/environment`, `/etc/profile`, `/etc/profile.d/*`
- `~/.bash_profile` / `~/.bashrc` / `~/.zprofile` / `~/.zshrc` / `~/.profile`
  (which set is sourced depends on login vs interactive)
- **version managers** — nvm, fnm, volta, mise, asdf, pyenv — which inject `PATH` *dynamically* from
  rc-file hooks
- systemd user environment, desktop session env

The version-manager case is decisive, and it's exactly where `claude` often lives. With nvm/fnm,
node (and the globally-installed `claude`) sits at a versioned path like
`~/.nvm/versions/node/v22.x/bin/claude` — a path that cannot be enumerated or guessed. The only
component that knows it is the shell that sourced the version manager's init.

This is the well-known "resolve shell environment" problem. VS Code, and essentially every
GUI-launched developer tool, spawns the user's login+interactive shell to recover `PATH` because no
purely static method survives version managers. Static probing (the current `USER_BIN_PATHS`
approach) is always an approximation that leaves a long tail of "command not found."

## Recommendation

Treat shell resolution as the correct mechanism, with static probing as a fallback only.

1. **Resolve the host PATH once, at startup, and cache it.** Use the user's actual `$SHELL` (not a
   hardcoded `sh`) as a login + interactive shell so version-manager `PATH`s are captured. Use
   marker delimiters to extract `PATH` cleanly from any noise rc files print to stdout, and wrap the
   call in a timeout (interactive shells can be slow or hang):

   ```
   flatpak-spawn --host "$SHELL" -l -i -c 'printf "__CLAI_PATH__%s__CLAI_END__" "$PATH"'
   ```

   Outside Flatpak, return the process `$PATH` unchanged. Cache like `get_home_dir()`
   (`providers/mod.rs:119`) already does, since under Flatpak this spawns a host process.

2. **Use the resolved PATH in both places:**
   - Provider detection — feed it to the `which` lookup (or check directly against it) in
     `command_exists`.
   - Sandbox env — override the `PATH` produced by `filtered_from_current` with the resolved host
     `PATH`. Also switch `env_home` to `paths::real_home()` so `HOME`/`~` match the user's real home.

3. **Keep `USER_BIN_PATHS` as a fallback** for the rare case where the login shell returns nothing
   (headless/service contexts, broken rc files).

### Why using the real user PATH is correct

The sandbox is meant to mirror what the user could run in their own terminal. The host `/usr`,
`/etc`, etc. are already bound into the sandbox, so host `PATH` entries resolve normally, and any
entry that doesn't exist or isn't bound simply fails to resolve — harmless. Using the host
interactive `PATH` is therefore the intended behavior, not a security regression.

## Affected code

- `src-tauri/src/providers/mod.rs:89` — `get_host_command()` (no login shell)
- `src-tauri/src/providers/mod.rs:101` — `USER_BIN_PATHS` (static fallback)
- `src-tauri/src/providers/mod.rs:119` — `get_home_dir()` (cache pattern to mirror)
- `src-tauri/src/providers/mod.rs:153` — `command_exists()` (detection)
- `src-tauri/src/assistant/tools/local.rs:664` — `env_home` (uses sandbox HOME)
- `src-tauri/src/assistant/tools/local.rs:669` — sandbox profile env construction
- `src-tauri/src/assistant/sandbox/profile.rs:78` — `filtered_from_current`
- `src-tauri/src/assistant/sandbox/linux_bwrap.rs:121,173` — `--clearenv` + `--setenv`
- `src-tauri/src/paths.rs` — `real_home()` (existing host-home resolver to reuse)
</content>
</invoke>
