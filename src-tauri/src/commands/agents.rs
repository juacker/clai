//! Agent management Tauri commands.
//!
//! These commands handle CRUD operations for user-defined agents
//! and their room assignments, plus on-demand agent execution.

use reqwest::Client;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, State};

use crate::agents::{cli_runner, template};
use crate::api::netdata::NetdataApi;
use crate::config::{AgentConfig, SpaceRoomPair};
use crate::mcp::bridge::JsBridge;
use crate::AppState;

// =============================================================================
// Request/Response Types
// =============================================================================

/// Request to create a new agent.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateAgentRequest {
    pub name: String,
    pub description: String,
    pub interval_minutes: u32,
}

/// Request to update an existing agent.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateAgentRequest {
    pub id: String,
    pub name: String,
    pub description: String,
    pub interval_minutes: u32,
}

/// Response for agent list operations.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentResponse {
    pub id: String,
    pub name: String,
    pub description: String,
    pub interval_minutes: u32,
    pub enabled_rooms: Vec<SpaceRoomPair>,
    pub created_at: String,
    pub updated_at: String,
    pub is_default: bool,
}

impl From<AgentConfig> for AgentResponse {
    fn from(agent: AgentConfig) -> Self {
        let is_default = agent.is_default();
        Self {
            id: agent.id,
            name: agent.name,
            description: agent.description,
            interval_minutes: agent.interval_minutes,
            enabled_rooms: agent.enabled_rooms,
            created_at: agent.created_at,
            updated_at: agent.updated_at,
            is_default,
        }
    }
}

// =============================================================================
// CRUD Commands
// =============================================================================

/// Gets all agents.
#[tauri::command]
pub fn get_agents(state: State<'_, AppState>) -> Result<Vec<AgentResponse>, String> {
    let config_manager = state
        .config_manager
        .lock()
        .map_err(|e| format!("Lock error: {}", e))?;

    let agents = config_manager
        .get_agents()
        .into_iter()
        .map(AgentResponse::from)
        .collect();

    Ok(agents)
}

/// Gets a single agent by ID.
#[tauri::command]
pub fn get_agent(id: String, state: State<'_, AppState>) -> Result<Option<AgentResponse>, String> {
    let config_manager = state
        .config_manager
        .lock()
        .map_err(|e| format!("Lock error: {}", e))?;

    let agent = config_manager.get_agent(&id).map(AgentResponse::from);

    Ok(agent)
}

/// Creates a new agent.
///
/// Returns the created agent with its generated UUID.
#[tauri::command]
pub fn create_agent(
    request: CreateAgentRequest,
    state: State<'_, AppState>,
) -> Result<AgentResponse, String> {
    let config_manager = state
        .config_manager
        .lock()
        .map_err(|e| format!("Lock error: {}", e))?;

    let agent = AgentConfig::new(request.name, request.description, request.interval_minutes);

    config_manager
        .add_agent(agent.clone())
        .map_err(|e| format!("Failed to create agent: {}", e))?;

    Ok(AgentResponse::from(agent))
}

/// Updates an existing agent.
///
/// Only updates name, description, and interval. Room assignments are
/// managed separately via enable/disable commands.
#[tauri::command]
pub fn update_agent(
    request: UpdateAgentRequest,
    state: State<'_, AppState>,
) -> Result<AgentResponse, String> {
    let config_manager = state
        .config_manager
        .lock()
        .map_err(|e| format!("Lock error: {}", e))?;

    // Verify agent exists
    if config_manager.get_agent(&request.id).is_none() {
        return Err(format!("Agent not found: {}", request.id));
    }

    config_manager
        .update_agent(&request.id, |agent| {
            agent.name = request.name.clone();
            agent.description = request.description.clone();
            agent.interval_minutes = request.interval_minutes;
        })
        .map_err(|e| format!("Failed to update agent: {}", e))?;

    // Fetch updated agent
    let agent = config_manager
        .get_agent(&request.id)
        .ok_or_else(|| "Agent not found after update".to_string())?;

    Ok(AgentResponse::from(agent))
}

/// Deletes an agent.
///
/// Also removes any scheduler instances for this agent.
#[tauri::command]
pub async fn delete_agent(id: String, state: State<'_, AppState>) -> Result<(), String> {
    // Scope the config_manager lock to avoid holding it across await
    {
        let config_manager = state
            .config_manager
            .lock()
            .map_err(|e| format!("Lock error: {}", e))?;

        let removed = config_manager
            .remove_agent(&id)
            .map_err(|e| format!("Failed to delete agent: {}", e))?;

        if !removed {
            return Err(format!("Agent not found: {}", id));
        }
    }

    // Remove scheduler instances for this agent
    let mut scheduler = state.scheduler.lock().await;
    scheduler.remove_instances_for_agent(&id);

    Ok(())
}

// =============================================================================
// Room Assignment Commands
// =============================================================================

/// Enables an agent for a specific space/room.
#[tauri::command]
pub async fn enable_agent_for_room(
    agent_id: String,
    space_id: String,
    room_id: String,
    state: State<'_, AppState>,
) -> Result<AgentResponse, String> {
    // Scope the config_manager lock to avoid holding it across await
    let (agent, definition) = {
        let config_manager = state
            .config_manager
            .lock()
            .map_err(|e| format!("Lock error: {}", e))?;

        // Verify agent exists
        if config_manager.get_agent(&agent_id).is_none() {
            return Err(format!("Agent not found: {}", agent_id));
        }

        config_manager
            .enable_agent_for_room(&agent_id, &space_id, &room_id)
            .map_err(|e| format!("Failed to enable agent: {}", e))?;

        // Get agent config to create instance
        let agent = config_manager
            .get_agent(&agent_id)
            .ok_or_else(|| "Agent not found".to_string())?;

        // Create agent definition from config and register instance
        let definition = crate::agents::AgentDefinition::new(
            &agent.id,
            &agent.name,
            (agent.interval_minutes as u64) * 60 * 1000, // Convert minutes to milliseconds
        )
        .with_description(&agent.description)
        .with_prompt(&agent.generate_prompt())
        .with_tools(agent.required_tools());

        (agent, definition)
    };

    // Create scheduler instance
    let mut scheduler = state.scheduler.lock().await;

    // Register definition if not already registered
    scheduler.register_definition(definition);

    // Create instance for this space/room
    scheduler.create_instance(&agent_id, &space_id, &room_id);

    Ok(AgentResponse::from(agent))
}

/// Disables an agent for a specific space/room.
#[tauri::command]
pub async fn disable_agent_for_room(
    agent_id: String,
    space_id: String,
    room_id: String,
    state: State<'_, AppState>,
) -> Result<AgentResponse, String> {
    // Scope the config_manager lock to avoid holding it across await
    let agent = {
        let config_manager = state
            .config_manager
            .lock()
            .map_err(|e| format!("Lock error: {}", e))?;

        // Verify agent exists
        let agent = config_manager
            .get_agent(&agent_id)
            .ok_or_else(|| format!("Agent not found: {}", agent_id))?;

        config_manager
            .disable_agent_for_room(&agent_id, &space_id, &room_id)
            .map_err(|e| format!("Failed to disable agent: {}", e))?;

        // Return updated agent
        config_manager.get_agent(&agent_id).unwrap_or(agent)
    };

    // Remove scheduler instance
    let mut scheduler = state.scheduler.lock().await;
    let instance_id = format!("{}:{}:{}", agent_id, space_id, room_id);
    scheduler.remove_instance(&instance_id);

    Ok(AgentResponse::from(agent))
}

/// Gets all agents enabled for a specific space/room.
#[tauri::command]
pub fn get_agents_for_room(
    space_id: String,
    room_id: String,
    state: State<'_, AppState>,
) -> Result<Vec<AgentResponse>, String> {
    let config_manager = state
        .config_manager
        .lock()
        .map_err(|e| format!("Lock error: {}", e))?;

    let agents = config_manager
        .get_agents_for_room(&space_id, &room_id)
        .into_iter()
        .map(AgentResponse::from)
        .collect();

    Ok(agents)
}

// =============================================================================
// Bulk Toggle Command (for AutoPilotBadge)
// =============================================================================

/// Result of toggling agents for a room.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ToggleAgentsResult {
    /// Whether agents are now enabled or disabled.
    pub enabled: bool,

    /// Number of agents affected.
    pub affected_count: usize,

    /// Total number of agents available.
    pub total_agents: usize,
}

/// Toggles all agents on/off for a specific space/room.
///
/// Used by the AutoPilotBadge to enable/disable all agents at once.
#[tauri::command]
pub async fn toggle_agents_for_room(
    space_id: String,
    room_id: String,
    enabled: bool,
    state: State<'_, AppState>,
) -> Result<ToggleAgentsResult, String> {
    // Collect all config changes first, then apply scheduler changes
    // This avoids holding the config lock across the await

    // Structure to hold what scheduler actions we need to take
    struct SchedulerAction {
        agent_id: String,
        definition: Option<crate::agents::AgentDefinition>,
    }

    let (actions, total_agents, affected_count) = {
        let config_manager = state
            .config_manager
            .lock()
            .map_err(|e| format!("Lock error: {}", e))?;

        let agents = config_manager.get_agents();
        let total_agents = agents.len();

        if agents.is_empty() {
            return Err("No agents configured. Create an agent in Settings first.".to_string());
        }

        // Check provider is configured when enabling
        if enabled && config_manager.get_ai_provider().is_none() {
            return Err("No AI provider configured. Set a provider in Settings first.".to_string());
        }

        let mut affected_count = 0;
        let mut actions: Vec<SchedulerAction> = Vec::new();

        for agent in &agents {
            if enabled {
                // Enable agent for this room
                let was_enabled = config_manager
                    .enable_agent_for_room(&agent.id, &space_id, &room_id)
                    .map_err(|e| format!("Failed to enable agent: {}", e))?;

                if was_enabled {
                    affected_count += 1;

                    // Create agent definition for scheduler
                    let definition = crate::agents::AgentDefinition::new(
                        &agent.id,
                        &agent.name,
                        (agent.interval_minutes as u64) * 60 * 1000,
                    )
                    .with_description(&agent.description)
                    .with_prompt(&agent.generate_prompt())
                    .with_tools(agent.required_tools());

                    actions.push(SchedulerAction {
                        agent_id: agent.id.clone(),
                        definition: Some(definition),
                    });
                }
            } else {
                // Disable agent for this room
                let was_disabled = config_manager
                    .disable_agent_for_room(&agent.id, &space_id, &room_id)
                    .map_err(|e| format!("Failed to disable agent: {}", e))?;

                if was_disabled {
                    affected_count += 1;
                    actions.push(SchedulerAction {
                        agent_id: agent.id.clone(),
                        definition: None,
                    });
                }
            }
        }

        (actions, total_agents, affected_count)
    };

    // Now apply scheduler changes without holding config lock
    let mut scheduler = state.scheduler.lock().await;

    for action in actions {
        if let Some(definition) = action.definition {
            // Enable: register definition and create instance
            scheduler.register_definition(definition);
            scheduler.create_instance(&action.agent_id, space_id.clone(), room_id.clone());
        } else {
            // Disable: remove instance
            let instance_id = format!("{}:{}:{}", action.agent_id, space_id, room_id);
            scheduler.remove_instance(&instance_id);
        }
    }

    Ok(ToggleAgentsResult {
        enabled,
        affected_count,
        total_agents,
    })
}

// =============================================================================
// On-Demand Agent Execution
// =============================================================================

/// Default timeout for on-demand agent execution (in seconds).
const ON_DEMAND_TIMEOUT_SECS: u64 = 5 * 60; // 5 minutes

/// Payload for agent execution start event.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct OnDemandStartPayload {
    tab_id: String,
    query: String,
}

/// Payload for agent execution end event.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct OnDemandEndPayload {
    tab_id: String,
    success: bool,
    error: Option<String>,
}

/// Result of running an on-demand agent.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RunOnDemandResult {
    pub success: bool,
    pub tab_id: String,
    pub error: Option<String>,
}

/// Runs an on-demand agent with the user's query.
///
/// This command is called from the terminal when the user types a natural language
/// query (not a command). It:
/// 1. Gets the AI provider from config
/// 2. Generates a Clai prompt with the user's query
/// 3. Sets up the agent tab for the bridge
/// 4. Runs the AI CLI
/// 5. Emits execution events for the UI
///
/// # Arguments
/// * `query` - The user's question or request
/// * `space_id` - The Netdata space ID for context
/// * `room_id` - The Netdata room ID for context
/// * `tab_id` - The tab ID where the agent's output should appear
#[tauri::command]
pub async fn run_on_demand_agent(
    query: String,
    space_id: String,
    room_id: String,
    tab_id: String,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<RunOnDemandResult, String> {
    tracing::info!(
        query = %query,
        space_id = %space_id,
        room_id = %room_id,
        tab_id = %tab_id,
        "Starting on-demand agent"
    );

    // Get token
    let token = state
        .token_storage
        .get_token()
        .ok()
        .flatten()
        .ok_or_else(|| "Not authenticated. Please log in first.".to_string())?;

    // Get AI provider from config
    let provider = {
        let config = state.config_manager.lock().unwrap();
        config.get().ai_provider.clone()
    }
    .ok_or_else(|| "No AI provider configured. Set a provider in Settings first.".to_string())?;

    // Get base URL
    let base_url = {
        let url = state.base_url.lock().unwrap();
        url.clone()
    };

    // Emit execution start event
    let _ = app.emit(
        "agent:execution:start",
        OnDemandStartPayload {
            tab_id: tab_id.clone(),
            query: query.clone(),
        },
    );

    // Create API client
    let client = Client::new();
    let api = std::sync::Arc::new(NetdataApi::new(client, base_url, token));

    // Create JS bridge for UI tools
    let bridge = JsBridge::new(app.clone());

    // Set the tab for this agent (uses "clai" as agent_id)
    // This is different from scheduled agents - we use the provided tab_id directly
    bridge
        .set_agent_tab("clai", "Clai", &space_id, &room_id, &tab_id)
        .await
        .map_err(|e| format!("Failed to set agent tab: {}", e))?;

    // Generate Clai prompt with user's query
    let prompt = template::generate_clai_prompt(&query, &space_id, &room_id);

    tracing::debug!(provider = ?provider, "Starting CLI for on-demand agent");

    // Run the AI CLI
    let result = cli_runner::run_ai_cli(
        &provider,
        &prompt,
        api,
        "clai", // agent_id is always "clai" for on-demand
        &space_id,
        &room_id,
        Some(bridge),
        ON_DEMAND_TIMEOUT_SECS,
    )
    .await;

    // Process result
    let (success, error) = match &result {
        Ok(run_result) => {
            if run_result.success {
                tracing::info!(tab_id = %tab_id, "On-demand agent completed successfully");
                (true, None)
            } else {
                let err_msg = if !run_result.stderr.is_empty() {
                    run_result.stderr.clone()
                } else {
                    format!("Agent exited with code {:?}", run_result.exit_code)
                };
                tracing::warn!(tab_id = %tab_id, error = %err_msg, "On-demand agent failed");
                (false, Some(err_msg))
            }
        }
        Err(e) => {
            let err_msg = e.to_string();
            tracing::error!(tab_id = %tab_id, error = %err_msg, "On-demand agent execution error");
            (false, Some(err_msg))
        }
    };

    // Emit execution end event
    let _ = app.emit(
        "agent:execution:end",
        OnDemandEndPayload {
            tab_id: tab_id.clone(),
            success,
            error: error.clone(),
        },
    );

    Ok(RunOnDemandResult {
        success,
        tab_id,
        error,
    })
}
