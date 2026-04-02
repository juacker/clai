//! Agent management Tauri commands.
//!
//! These commands handle CRUD operations for user-defined agents
//! and their room assignments.

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, State};

use crate::assistant::{providers as assistant_providers, repository as assistant_repository};
use crate::config::{AgentConfig, SpaceRoomPair};
use crate::db::DbPool;
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
    #[serde(default)]
    pub selected_mcp_server_ids: Vec<String>,
}

/// Request to update an existing agent.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateAgentRequest {
    pub id: String,
    pub name: String,
    pub description: String,
    pub interval_minutes: u32,
    #[serde(default)]
    pub selected_mcp_server_ids: Vec<String>,
}

/// Request to enable/disable an agent globally.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SetAgentEnabledRequest {
    pub id: String,
    pub enabled: bool,
}

/// Response for agent list operations.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentResponse {
    pub id: String,
    pub name: String,
    pub description: String,
    pub interval_minutes: u32,
    pub enabled: bool,
    pub enabled_rooms: Vec<SpaceRoomPair>,
    pub selected_mcp_server_ids: Vec<String>,
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
            enabled: agent.enabled,
            enabled_rooms: agent.enabled_rooms,
            selected_mcp_server_ids: agent.selected_mcp_server_ids,
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

    validate_mcp_server_ids(
        &config_manager,
        &request.selected_mcp_server_ids,
        "create agent",
    )?;

    let mut agent = AgentConfig::new(request.name, request.description, request.interval_minutes);
    agent.selected_mcp_server_ids = request.selected_mcp_server_ids;

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

    validate_mcp_server_ids(
        &config_manager,
        &request.selected_mcp_server_ids,
        "update agent",
    )?;

    config_manager
        .update_agent(&request.id, |agent| {
            agent.name = request.name.clone();
            agent.description = request.description.clone();
            agent.interval_minutes = request.interval_minutes;
            agent.selected_mcp_server_ids = request.selected_mcp_server_ids.clone();
        })
        .map_err(|e| format!("Failed to update agent: {}", e))?;

    // Fetch updated agent
    let agent = config_manager
        .get_agent(&request.id)
        .ok_or_else(|| "Agent not found after update".to_string())?;

    Ok(AgentResponse::from(agent))
}

#[tauri::command]
pub async fn set_agent_enabled(
    request: SetAgentEnabledRequest,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<AgentResponse, String> {
    if request.enabled {
        let pool = app.try_state::<DbPool>().ok_or_else(|| {
            "Assistant database is not ready yet. Try again in a moment.".to_string()
        })?;
        let default_model = {
            let config_manager = state
                .config_manager
                .lock()
                .map_err(|e| format!("Lock error: {}", e))?;
            config_manager.get_assistant_default_model()
        };
        let provider_info =
            load_assistant_provider_info(pool.inner(), default_model.as_deref()).await?;
        if !provider_info.configured {
            return Err(
                "Configure the assistant provider and default model in Settings first.".to_string(),
            );
        }
    }

    let agent = {
        let config_manager = state
            .config_manager
            .lock()
            .map_err(|e| format!("Lock error: {}", e))?;

        if config_manager.get_agent(&request.id).is_none() {
            return Err(format!("Agent not found: {}", request.id));
        }

        config_manager
            .set_agent_enabled(&request.id, request.enabled)
            .map_err(|e| format!("Failed to update agent enabled state: {}", e))?;

        config_manager
            .get_agent(&request.id)
            .ok_or_else(|| "Agent not found after update".to_string())?
    };

    sync_agent_scheduler(&state, &agent).await;

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
    let agent = {
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
        agent
    };

    sync_agent_scheduler(&state, &agent).await;

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

    sync_agent_scheduler(&state, &agent).await;

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
    pool: State<'_, DbPool>,
) -> Result<ToggleAgentsResult, String> {
    if enabled {
        let default_model = {
            let config_manager = state
                .config_manager
                .lock()
                .map_err(|e| format!("Lock error: {}", e))?;
            config_manager.get_assistant_default_model()
        };
        let provider_info =
            load_assistant_provider_info(pool.inner(), default_model.as_deref()).await?;
        if !provider_info.configured {
            return Err(
                "Configure the assistant provider and default model in Settings first.".to_string(),
            );
        }
    }

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

async fn load_assistant_provider_info(
    pool: &DbPool,
    default_model: Option<&str>,
) -> Result<crate::config::ProviderInfo, String> {
    let provider_session = assistant_repository::list_provider_sessions(pool)
        .await?
        .into_iter()
        .next();

    let has_model = default_model
        .map(|value| !value.trim().is_empty())
        .unwrap_or(false);
    let configured = provider_session.is_some() && has_model;
    let name = provider_session.as_ref().map(|session| {
        assistant_providers::get_provider_descriptor(&session.provider_id)
            .map(|descriptor| descriptor.display_name)
            .unwrap_or_else(|| session.provider_id.clone())
    });

    Ok(crate::config::ProviderInfo {
        configured,
        name,
        provider: None,
    })
}

fn build_agent_definition(agent: &AgentConfig) -> crate::agents::AgentDefinition {
    crate::agents::AgentDefinition::new(
        &agent.id,
        &agent.name,
        (agent.interval_minutes as u64) * 60 * 1000,
    )
    .with_description(&agent.description)
    .with_prompt(&agent.generate_prompt())
    .with_tools(agent.required_tools())
}

async fn sync_agent_scheduler(state: &State<'_, AppState>, agent: &AgentConfig) {
    let mut scheduler = state.scheduler.lock().await;
    scheduler.remove_instances_for_agent(&agent.id);
    scheduler.register_definition(build_agent_definition(agent));

    if !agent.enabled {
        return;
    }

    if let Some(scope) = agent.assigned_room() {
        scheduler.create_instance(&agent.id, &scope.space_id, &scope.room_id);
    } else {
        scheduler.create_instance(&agent.id, "", "");
    }
}

fn validate_mcp_server_ids(
    config_manager: &crate::config::ConfigManager,
    server_ids: &[String],
    action: &str,
) -> Result<(), String> {
    let missing: Vec<String> = server_ids
        .iter()
        .filter(|server_id| config_manager.get_mcp_server(server_id).is_none())
        .cloned()
        .collect();

    if missing.is_empty() {
        return Ok(());
    }

    Err(format!(
        "Cannot {}: unknown MCP server IDs: {}",
        action,
        missing.join(", ")
    ))
}
