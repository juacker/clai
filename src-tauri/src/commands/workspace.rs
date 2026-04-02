//! Workspace state persistence commands.
//!
//! These commands handle saving and loading the workspace state
//! (tabs, commands, layout) to/from SQLite.

use crate::db::DbPool;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use tauri::State;

/// Tab context payload.
///
/// This is intentionally schema-less on the Rust side so frontend tab context can
/// evolve without losing fields during persistence round-trips.
pub type TabContext = serde_json::Value;

/// Tile node in the layout tree
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TileNode {
    pub id: String,
    #[serde(rename = "type")]
    pub tile_type: String, // "leaf" or "split"
    #[serde(skip_serializing_if = "Option::is_none")]
    pub command_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub direction: Option<String>, // "horizontal" or "vertical"
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sizes: Option<Vec<f64>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub children: Option<Vec<TileNode>>,
}

/// Tab data structure
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Tab {
    pub id: String,
    pub title: String,
    pub created_at: i64,
    pub root_tile: TileNode,
    pub context: TabContext,
}

/// Command data structure
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Command {
    pub id: String,
    #[serde(rename = "type")]
    pub command_type: String,
    pub args: serde_json::Value,
    pub tab_id: String,
    pub tile_id: String,
    pub created_at: i64,
    pub state: serde_json::Value,
}

/// Complete workspace state
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceState {
    pub active_tab_id: Option<String>,
    #[serde(default)]
    pub tab_order: Vec<String>, // Array of tab IDs in display order
    pub tabs: HashMap<String, Tab>,
    pub commands: HashMap<String, Command>,
}

// Type aliases for SQLite query results to satisfy clippy::type_complexity
type TabRow = (String, String, String, String, Option<i64>, i64, i64);
type CommandRow = (
    String,
    String,
    String,
    String,
    Option<String>,
    Option<String>,
    i64,
    i64,
);

/// Load workspace state from SQLite
#[tauri::command]
pub async fn load_workspace_state(pool: State<'_, DbPool>) -> Result<WorkspaceState, String> {
    tracing::debug!("Loading workspace state from database");

    // Load active tab ID from meta
    let active_tab_id: Option<String> =
        sqlx::query_scalar("SELECT value FROM workspace_meta WHERE key = 'active_tab_id'")
            .fetch_optional(pool.inner())
            .await
            .map_err(|e| format!("Failed to load active tab ID: {}", e))?;

    // Load all tabs ordered by position
    let tab_rows: Vec<TabRow> = sqlx::query_as(
        "SELECT id, title, root_tile, context, position, created_at, updated_at FROM tabs ORDER BY position",
    )
    .fetch_all(pool.inner())
    .await
    .map_err(|e| format!("Failed to load tabs: {}", e))?;

    let mut tabs = HashMap::new();
    let mut tab_order = Vec::new();
    for (id, title, root_tile_json, context_json, _position, created_at, _updated_at) in tab_rows {
        let root_tile: TileNode = serde_json::from_str(&root_tile_json)
            .map_err(|e| format!("Failed to parse root_tile for tab {}: {}", id, e))?;
        let context: TabContext = serde_json::from_str(&context_json)
            .map_err(|e| format!("Failed to parse context for tab {}: {}", id, e))?;

        tab_order.push(id.clone());
        tabs.insert(
            id.clone(),
            Tab {
                id,
                title,
                created_at,
                root_tile,
                context,
            },
        );
    }

    // Load all commands
    let cmd_rows: Vec<CommandRow> = sqlx::query_as(
        "SELECT id, tab_id, tile_id, type, args, state, created_at, updated_at FROM commands",
    )
    .fetch_all(pool.inner())
    .await
    .map_err(|e| format!("Failed to load commands: {}", e))?;

    let mut commands = HashMap::new();
    for (id, tab_id, tile_id, command_type, args_json, state_json, created_at, _updated_at) in
        cmd_rows
    {
        let args: serde_json::Value = args_json
            .map(|s| {
                serde_json::from_str(&s).unwrap_or(serde_json::Value::Object(Default::default()))
            })
            .unwrap_or(serde_json::Value::Object(Default::default()));
        let state: serde_json::Value = state_json
            .map(|s| {
                serde_json::from_str(&s).unwrap_or(serde_json::Value::Object(Default::default()))
            })
            .unwrap_or(serde_json::Value::Object(Default::default()));

        commands.insert(
            id.clone(),
            Command {
                id,
                command_type,
                args,
                tab_id,
                tile_id,
                created_at,
                state,
            },
        );
    }

    tracing::debug!(
        "Loaded workspace state: {} tabs, {} commands",
        tabs.len(),
        commands.len()
    );

    Ok(WorkspaceState {
        active_tab_id,
        tab_order,
        tabs,
        commands,
    })
}

/// Save workspace state to SQLite
#[tauri::command]
pub async fn save_workspace_state(
    workspace_state: WorkspaceState,
    pool: State<'_, DbPool>,
) -> Result<(), String> {
    tracing::debug!(
        "Saving workspace state: {} tabs, {} commands",
        workspace_state.tabs.len(),
        workspace_state.commands.len()
    );

    let now = chrono::Utc::now().timestamp_millis();

    // Start a transaction
    let mut tx = pool
        .inner()
        .begin()
        .await
        .map_err(|e| format!("Failed to start transaction: {}", e))?;

    // Save active tab ID to meta
    if let Some(ref active_tab_id) = workspace_state.active_tab_id {
        sqlx::query(
            "INSERT OR REPLACE INTO workspace_meta (key, value) VALUES ('active_tab_id', ?)",
        )
        .bind(active_tab_id)
        .execute(&mut *tx)
        .await
        .map_err(|e| format!("Failed to save active tab ID: {}", e))?;
    } else {
        sqlx::query("DELETE FROM workspace_meta WHERE key = 'active_tab_id'")
            .execute(&mut *tx)
            .await
            .map_err(|e| format!("Failed to clear active tab ID: {}", e))?;
    }

    // Get existing tab IDs to detect deletions
    let existing_tab_ids: Vec<String> = sqlx::query_scalar("SELECT id FROM tabs")
        .fetch_all(&mut *tx)
        .await
        .map_err(|e| format!("Failed to get existing tab IDs: {}", e))?;

    // Delete tabs that are no longer in the state
    for existing_id in &existing_tab_ids {
        if !workspace_state.tabs.contains_key(existing_id) {
            // Commands will be deleted via CASCADE
            sqlx::query("DELETE FROM tabs WHERE id = ?")
                .bind(existing_id)
                .execute(&mut *tx)
                .await
                .map_err(|e| format!("Failed to delete tab {}: {}", existing_id, e))?;
        }
    }

    // Upsert tabs using tab_order for position (fall back to HashMap iteration if tab_order is empty)
    let tab_ids: Vec<&String> = if workspace_state.tab_order.is_empty() {
        workspace_state.tabs.keys().collect()
    } else {
        workspace_state.tab_order.iter().collect()
    };

    for (position, id) in tab_ids.iter().enumerate() {
        let tab = match workspace_state.tabs.get(*id) {
            Some(t) => t,
            None => continue, // Skip if tab_order contains an ID not in tabs
        };

        let root_tile_json = serde_json::to_string(&tab.root_tile)
            .map_err(|e| format!("Failed to serialize root_tile: {}", e))?;
        let context_json = serde_json::to_string(&tab.context)
            .map_err(|e| format!("Failed to serialize context: {}", e))?;

        sqlx::query(
            r#"
            INSERT INTO tabs (id, title, root_tile, context, position, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                title = excluded.title,
                root_tile = excluded.root_tile,
                context = excluded.context,
                position = excluded.position,
                updated_at = excluded.updated_at
            "#,
        )
        .bind(*id)
        .bind(&tab.title)
        .bind(&root_tile_json)
        .bind(&context_json)
        .bind(position as i64)
        .bind(tab.created_at)
        .bind(now)
        .execute(&mut *tx)
        .await
        .map_err(|e| format!("Failed to upsert tab {}: {}", id, e))?;
    }

    // Get existing command IDs to detect deletions
    let existing_cmd_ids: Vec<String> = sqlx::query_scalar("SELECT id FROM commands")
        .fetch_all(&mut *tx)
        .await
        .map_err(|e| format!("Failed to get existing command IDs: {}", e))?;

    // Delete commands that are no longer in the state
    for existing_id in &existing_cmd_ids {
        if !workspace_state.commands.contains_key(existing_id) {
            sqlx::query("DELETE FROM commands WHERE id = ?")
                .bind(existing_id)
                .execute(&mut *tx)
                .await
                .map_err(|e| format!("Failed to delete command {}: {}", existing_id, e))?;
        }
    }

    // Upsert commands
    for (id, cmd) in &workspace_state.commands {
        let args_json = serde_json::to_string(&cmd.args)
            .map_err(|e| format!("Failed to serialize args: {}", e))?;
        let state_json = serde_json::to_string(&cmd.state)
            .map_err(|e| format!("Failed to serialize state: {}", e))?;

        sqlx::query(
            r#"
            INSERT INTO commands (id, tab_id, tile_id, type, args, state, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                tab_id = excluded.tab_id,
                tile_id = excluded.tile_id,
                type = excluded.type,
                args = excluded.args,
                state = excluded.state,
                updated_at = excluded.updated_at
            "#,
        )
        .bind(id)
        .bind(&cmd.tab_id)
        .bind(&cmd.tile_id)
        .bind(&cmd.command_type)
        .bind(&args_json)
        .bind(&state_json)
        .bind(cmd.created_at)
        .bind(now)
        .execute(&mut *tx)
        .await
        .map_err(|e| format!("Failed to upsert command {}: {}", id, e))?;
    }

    // Commit transaction
    tx.commit()
        .await
        .map_err(|e| format!("Failed to commit transaction: {}", e))?;

    tracing::debug!("Workspace state saved successfully");
    Ok(())
}
