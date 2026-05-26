use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};

use tokio_util::sync::CancellationToken;

type ActiveRuns = HashMap<String, CancellationToken>;

static ACTIVE_RUNS: OnceLock<Mutex<ActiveRuns>> = OnceLock::new();

fn active_runs() -> &'static Mutex<ActiveRuns> {
    ACTIVE_RUNS.get_or_init(|| Mutex::new(HashMap::new()))
}

pub fn register_run(run_id: &str) -> CancellationToken {
    let token = CancellationToken::new();
    active_runs()
        .lock()
        .unwrap()
        .insert(run_id.to_string(), token.clone());
    token
}

pub fn cancel_run(run_id: &str) -> bool {
    if let Some(token) = active_runs().lock().unwrap().get(run_id).cloned() {
        token.cancel();
        return true;
    }

    false
}

pub fn unregister_run(run_id: &str) {
    active_runs().lock().unwrap().remove(run_id);
}

#[cfg(test)]
mod tests {
    use super::*;

    // Use unique ids per test so parallel execution of `cargo test`
    // doesn't share state through the static `ACTIVE_RUNS` map.
    // The unique-id approach is simpler than gating on a global mutex
    // and matches how the engine assigns run ids in production.

    #[test]
    fn register_then_cancel_propagates_to_token() {
        let id = "runtime-test-register-then-cancel";
        let token = register_run(id);
        assert!(!token.is_cancelled(), "fresh token must start uncancelled");

        let was_found = cancel_run(id);
        assert!(was_found, "cancel_run must report success for a known id");
        assert!(token.is_cancelled(), "the original token handle must observe the cancel");

        unregister_run(id);
    }

    #[test]
    fn cancel_unknown_run_returns_false() {
        // Defends the assistant_cancel_run code path: when a run isn't
        // active anymore (e.g. it terminated before the user clicked
        // Stop), cancel_run must return false so the caller falls back
        // to marking the DB row Cancelled directly.
        let was_found = cancel_run("runtime-test-nonexistent-id");
        assert!(!was_found, "cancel_run must return false for unknown id");
    }

    #[test]
    fn unregister_removes_from_active_set() {
        let id = "runtime-test-unregister-removes";
        let _token = register_run(id);
        unregister_run(id);

        let was_found = cancel_run(id);
        assert!(!was_found, "unregistered ids must no longer be cancellable");
    }

    #[test]
    fn re_register_same_id_replaces_token_handle() {
        // Defensive: the engine's spawn_run_task and the scheduler
        // runner both register under run.id. If somehow the same
        // run.id were reused (it shouldn't be — UUIDs), the latest
        // registration wins. Pin the behavior so a future refactor
        // doesn't accidentally start de-duping or asserting.
        let id = "runtime-test-double-register";
        let first = register_run(id);
        let second = register_run(id);

        // Cancelling now should signal the second (current) token.
        assert!(cancel_run(id));
        assert!(second.is_cancelled());
        // The first token is orphaned — no longer in the map, so
        // cancel_run never reaches it.
        assert!(!first.is_cancelled());

        unregister_run(id);
    }
}
