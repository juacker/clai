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
