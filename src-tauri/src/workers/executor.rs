//! Worker executor.
//!
//! The executor runs worker logic through a single `run()` method,
//! providing access to APIs, AI service, and tools via `WorkerRunContext`.
//!
//! # Architecture
//!
//! ```text
//! ┌─────────────────────────────────────────────────────────────────┐
//! │                         EXECUTOR                                │
//! │                                                                 │
//! │  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐     │
//! │  │   Handler    │───▶│     run()    │───▶│    Result    │     │
//! │  │  (per type)  │    │   (logic)    │    │   (output)   │     │
//! │  └──────────────┘    └──────────────┘    └──────────────┘     │
//! │                             │                                   │
//! │                             ▼                                   │
//! │                      ┌──────────────┐                          │
//! │                      │   Context    │                          │
//! │                      │ (api/ai/tool)│                          │
//! │                      └──────────────┘                          │
//! └─────────────────────────────────────────────────────────────────┘
//! ```

use serde::{Deserialize, Serialize};
use std::sync::Arc;

use super::types::{WorkerInstance, WorkerResult};

// =============================================================================
// Tool Invocation
// =============================================================================

/// A tool invocation request from Rust to JavaScript.
///
/// When a worker needs to manipulate the UI (e.g., add a chart, create a tab),
/// it creates a `ToolInvocation` which is sent to JavaScript via Tauri events.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolInvocation {
    /// Unique ID for this invocation (for tracking responses).
    pub id: String,

    /// Tool namespace (e.g., "canvas", "tabs", "notifications").
    pub namespace: String,

    /// Method to call (e.g., "addChart", "createTab").
    pub method: String,

    /// Parameters for the method.
    pub params: serde_json::Value,

    /// Timeout in milliseconds.
    #[serde(default = "default_timeout")]
    pub timeout_ms: u64,
}

fn default_timeout() -> u64 {
    30_000 // 30 seconds
}

impl ToolInvocation {
    /// Creates a new tool invocation.
    pub fn new(namespace: &str, method: &str, params: serde_json::Value) -> Self {
        Self {
            id: uuid::Uuid::new_v4().to_string(),
            namespace: namespace.to_string(),
            method: method.to_string(),
            params,
            timeout_ms: default_timeout(),
        }
    }

    /// Sets a custom timeout.
    pub fn with_timeout(mut self, timeout_ms: u64) -> Self {
        self.timeout_ms = timeout_ms;
        self
    }
}

/// Result of a tool invocation.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolResult {
    /// ID of the invocation this is a response to.
    pub invocation_id: String,

    /// Whether the invocation succeeded.
    pub success: bool,

    /// Result data (if successful).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub result: Option<serde_json::Value>,

    /// Error message (if failed).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

impl ToolResult {
    /// Creates a successful result.
    pub fn success(invocation_id: String, result: serde_json::Value) -> Self {
        Self {
            invocation_id,
            success: true,
            result: Some(result),
            error: None,
        }
    }

    /// Creates a failure result.
    pub fn failure(invocation_id: String, error: String) -> Self {
        Self {
            invocation_id,
            success: false,
            result: None,
            error: Some(error),
        }
    }

    /// Creates a timeout result.
    pub fn timeout(invocation_id: String) -> Self {
        Self {
            invocation_id,
            success: false,
            result: None,
            error: Some("Tool invocation timed out".to_string()),
        }
    }
}

// =============================================================================
// Worker Run Context
// =============================================================================

/// Context passed to worker execution.
///
/// Provides workers with access to APIs, AI service, and tool invocation.
#[derive(Clone)]
pub struct WorkerRunContext {
    /// Space ID this worker is operating in.
    pub space_id: String,

    /// Room ID this worker is operating in.
    pub room_id: String,

    /// Callback for emitting tool invocations.
    /// In the actual app, this will emit Tauri events.
    tool_emitter: Arc<dyn Fn(ToolInvocation) + Send + Sync>,
}

impl WorkerRunContext {
    /// Creates a new worker run context.
    pub fn new(
        space_id: String,
        room_id: String,
        tool_emitter: Arc<dyn Fn(ToolInvocation) + Send + Sync>,
    ) -> Self {
        Self {
            space_id,
            room_id,
            tool_emitter,
        }
    }

    /// Invokes a tool and returns the invocation ID.
    pub fn invoke_tool(&self, namespace: &str, method: &str, params: serde_json::Value) -> String {
        let invocation = ToolInvocation::new(namespace, method, params);
        let id = invocation.id.clone();
        (self.tool_emitter)(invocation);
        id
    }

    /// Helper: Add a chart to the canvas.
    pub fn add_chart(&self, chart_id: &str, title: &str) -> String {
        self.invoke_tool(
            "canvas",
            "addChart",
            serde_json::json!({
                "chartId": chart_id,
                "title": title,
            }),
        )
    }

    /// Helper: Send a notification.
    pub fn notify(&self, title: &str, message: &str) -> String {
        self.invoke_tool(
            "notifications",
            "show",
            serde_json::json!({
                "title": title,
                "message": message,
            }),
        )
    }
}

impl std::fmt::Debug for WorkerRunContext {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("WorkerRunContext")
            .field("space_id", &self.space_id)
            .field("room_id", &self.room_id)
            .finish()
    }
}

// =============================================================================
// Worker Handler Trait
// =============================================================================

/// Trait for worker logic implementations.
///
/// Each worker type (e.g., anomaly-investigator) implements this trait
/// to define its behavior in a single `run()` method.
#[async_trait::async_trait]
pub trait WorkerHandler: Send + Sync {
    /// Returns the worker ID this handler is for.
    fn worker_id(&self) -> &str;

    /// Executes the worker logic.
    ///
    /// The worker should:
    /// 1. Fetch any data it needs (observe)
    /// 2. Analyze the data (optionally using AI)
    /// 3. Take actions (using context.invoke_tool)
    /// 4. Return a result indicating success/failure
    async fn run(&self, instance: &WorkerInstance, ctx: &WorkerRunContext) -> WorkerResult;
}

// =============================================================================
// Executor
// =============================================================================

/// The worker executor.
///
/// Coordinates running worker logic by finding the right handler
/// and executing it with the appropriate context.
pub struct Executor {
    /// Registered worker handlers.
    handlers: std::collections::HashMap<String, Arc<dyn WorkerHandler>>,
}

impl Executor {
    /// Creates a new executor.
    pub fn new() -> Self {
        Self {
            handlers: std::collections::HashMap::new(),
        }
    }

    /// Registers a worker handler.
    pub fn register_handler(&mut self, handler: Arc<dyn WorkerHandler>) {
        self.handlers
            .insert(handler.worker_id().to_string(), handler);
    }

    /// Executes a worker instance.
    pub async fn execute(
        &self,
        instance: &WorkerInstance,
        ctx: &WorkerRunContext,
    ) -> WorkerResult {
        let handler = match self.handlers.get(&instance.worker_id) {
            Some(h) => h,
            None => {
                return WorkerResult::failure(format!(
                    "No handler registered for worker: {}",
                    instance.worker_id
                ));
            }
        };

        handler.run(instance, ctx).await
    }

    /// Checks if a handler is registered for a worker type.
    pub fn has_handler(&self, worker_id: &str) -> bool {
        self.handlers.contains_key(worker_id)
    }

    /// Gets the registered handler IDs.
    pub fn handler_ids(&self) -> Vec<&str> {
        self.handlers.keys().map(|s| s.as_str()).collect()
    }
}

impl Default for Executor {
    fn default() -> Self {
        Self::new()
    }
}

// =============================================================================
// Tests
// =============================================================================

#[cfg(test)]
mod tests {
    use super::*;
    use crate::workers::types::WorkerDefinition;

    #[test]
    fn test_tool_invocation_creation() {
        let invocation = ToolInvocation::new(
            "canvas",
            "addChart",
            serde_json::json!({"chartId": "chart1"}),
        );

        assert_eq!(invocation.namespace, "canvas");
        assert_eq!(invocation.method, "addChart");
        assert!(!invocation.id.is_empty());
        assert_eq!(invocation.timeout_ms, 30_000);
    }

    #[test]
    fn test_tool_invocation_with_timeout() {
        let invocation = ToolInvocation::new("tabs", "createTab", serde_json::json!({}))
            .with_timeout(5_000);

        assert_eq!(invocation.timeout_ms, 5_000);
    }

    #[test]
    fn test_tool_result_success() {
        let result = ToolResult::success(
            "inv-123".to_string(),
            serde_json::json!({"tabId": "tab-456"}),
        );

        assert!(result.success);
        assert!(result.result.is_some());
        assert!(result.error.is_none());
    }

    #[test]
    fn test_tool_result_failure() {
        let result = ToolResult::failure("inv-123".to_string(), "Permission denied".to_string());

        assert!(!result.success);
        assert!(result.result.is_none());
        assert_eq!(result.error, Some("Permission denied".to_string()));
    }

    #[test]
    fn test_tool_result_timeout() {
        let result = ToolResult::timeout("inv-123".to_string());

        assert!(!result.success);
        assert!(result.error.unwrap().contains("timed out"));
    }

    #[test]
    fn test_executor_creation() {
        let executor = Executor::new();
        assert!(!executor.has_handler("test-worker"));
        assert!(executor.handler_ids().is_empty());
    }

    #[test]
    fn test_worker_run_context_creation() {
        let ctx = WorkerRunContext::new(
            "space1".to_string(),
            "room1".to_string(),
            Arc::new(|_| {}),
        );

        assert_eq!(ctx.space_id, "space1");
        assert_eq!(ctx.room_id, "room1");
    }

    #[test]
    fn test_context_invoke_tool() {
        use std::sync::atomic::{AtomicBool, Ordering};

        let called = Arc::new(AtomicBool::new(false));
        let called_clone = called.clone();

        let ctx = WorkerRunContext::new(
            "space1".to_string(),
            "room1".to_string(),
            Arc::new(move |inv| {
                assert_eq!(inv.namespace, "canvas");
                assert_eq!(inv.method, "addChart");
                called_clone.store(true, Ordering::SeqCst);
            }),
        );

        let _id = ctx.invoke_tool("canvas", "addChart", serde_json::json!({"chartId": "c1"}));
        assert!(called.load(Ordering::SeqCst));
    }

    // Test executor with a mock handler
    struct MockHandler;

    #[async_trait::async_trait]
    impl WorkerHandler for MockHandler {
        fn worker_id(&self) -> &str {
            "mock-worker"
        }

        async fn run(&self, _instance: &WorkerInstance, _ctx: &WorkerRunContext) -> WorkerResult {
            WorkerResult::success_with_actions("Mock completed", 1)
        }
    }

    #[tokio::test]
    async fn test_executor_with_handler() {
        let mut executor = Executor::new();
        executor.register_handler(Arc::new(MockHandler));

        assert!(executor.has_handler("mock-worker"));
        assert!(!executor.has_handler("other-worker"));

        let definition = WorkerDefinition::new("mock-worker", "Mock Worker", 60_000);
        let instance = WorkerInstance::new(&definition, "space1".to_string(), "room1".to_string());
        let ctx = WorkerRunContext::new(
            "space1".to_string(),
            "room1".to_string(),
            Arc::new(|_| {}),
        );

        let result = executor.execute(&instance, &ctx).await;
        assert!(result.success);
        assert_eq!(result.actions_count, 1);
    }

    #[tokio::test]
    async fn test_executor_missing_handler() {
        let executor = Executor::new();

        let definition = WorkerDefinition::new("unknown-worker", "Unknown", 60_000);
        let instance = WorkerInstance::new(&definition, "space1".to_string(), "room1".to_string());
        let ctx = WorkerRunContext::new(
            "space1".to_string(),
            "room1".to_string(),
            Arc::new(|_| {}),
        );

        let result = executor.execute(&instance, &ctx).await;
        assert!(!result.success);
        assert!(result.message.contains("No handler registered"));
    }
}
