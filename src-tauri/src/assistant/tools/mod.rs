pub mod registry;
pub mod router;

pub use registry::available_tools;
pub use router::execute_tool;

use crate::assistant::types::{RunId, SessionId};

/// Context for tool execution within an assistant run.
pub struct ToolExecutionContext {
    pub session_id: SessionId,
    pub run_id: RunId,
    pub tab_id: Option<String>,
    pub space_id: Option<String>,
    pub room_id: Option<String>,
}
