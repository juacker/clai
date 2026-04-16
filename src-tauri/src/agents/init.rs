//! Agent initialization.
//!
//! This module handles initializing the scheduler with automation definitions
//! and managing one runtime instance per enabled automation.

use crate::agents::{AgentDefinition, SharedScheduler};
use crate::auth::TokenStorage;
use crate::config::{AgentConfig, ConfigManager};

fn agent_config_to_definition(config: &AgentConfig) -> AgentDefinition {
    AgentDefinition::new(
        &config.id,
        &config.name,
        (config.interval_minutes as u64) * 60 * 1000,
    )
    .with_description(&config.description)
    .with_tools(config.required_tools())
}

/// Initializes the scheduler with agent definitions and restores one instance
/// for each enabled automation.
pub fn initialize_scheduler(
    scheduler: &SharedScheduler,
    config_manager: &ConfigManager,
    _token_storage: &TokenStorage,
) {
    let mut scheduler = scheduler.blocking_lock();

    let config = config_manager.get();
    for agent_config in &config.agents {
        if !agent_config.schedule_enabled {
            continue;
        }
        let definition = agent_config_to_definition(agent_config);
        scheduler.register_definition(definition);
    }

    for agent_config in &config.agents {
        if !agent_config.enabled || !agent_config.schedule_enabled {
            continue;
        }

        scheduler.create_instance(&agent_config.id, "", "");
    }
}

/// Restores agent instances from config.
pub async fn restore_instances_from_config(
    scheduler: &SharedScheduler,
    config: crate::config::ClaiConfig,
) {
    let mut scheduler = scheduler.lock().await;

    for agent_config in &config.agents {
        if !agent_config.schedule_enabled {
            continue;
        }
        let definition = agent_config_to_definition(agent_config);
        scheduler.register_definition(definition);

        if !agent_config.enabled {
            continue;
        }

        scheduler.create_instance(&agent_config.id, "", "");
    }
}

/// Clears all agent instances.
pub async fn clear_all_instances(scheduler: &SharedScheduler) {
    let mut scheduler = scheduler.lock().await;

    let instance_ids: Vec<String> = scheduler
        .all_instances()
        .map(|i| i.instance_id.clone())
        .collect();

    for instance_id in instance_ids {
        scheduler.remove_instance(&instance_id);
    }
}

/// Creates a scheduler instance for a specific agent.
#[allow(dead_code)]
pub async fn create_instance_for_agent(scheduler: &SharedScheduler, agent_id: &str) {
    let mut scheduler = scheduler.lock().await;
    scheduler.create_instance(agent_id, "", "");
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::agents::create_shared_scheduler;
    use crate::config::types::DEFAULT_AGENT_ID;

    fn create_test_agent_config() -> AgentConfig {
        AgentConfig::new("Test Agent".to_string(), "Test description".to_string(), 5)
    }

    #[test]
    fn test_agent_config_to_definition() {
        let agent = create_test_agent_config();
        let definition = agent_config_to_definition(&agent);

        assert_eq!(definition.id, agent.id);
        assert_eq!(definition.name, "Test Agent");
        assert_eq!(definition.interval_ms, 5 * 60 * 1000);
        assert_eq!(
            definition.required_tools,
            vec!["netdata", "dashboard", "tabs", "fs"]
        );
    }

    #[test]
    fn test_default_agent_to_definition() {
        let agent = AgentConfig::default_agent();
        let definition = agent_config_to_definition(&agent);

        assert_eq!(definition.id, DEFAULT_AGENT_ID);
        assert_eq!(definition.name, "Infrastructure Health Monitor");
        assert_eq!(definition.interval_ms, 5 * 60 * 1000);
    }

    #[tokio::test]
    async fn test_create_and_remove_instance_for_agent() {
        let scheduler = create_shared_scheduler();

        let agent = create_test_agent_config();
        {
            let mut s = scheduler.lock().await;
            s.register_definition(agent_config_to_definition(&agent));
        }

        create_instance_for_agent(&scheduler, &agent.id).await;

        {
            let s = scheduler.lock().await;
            assert_eq!(s.instance_count(), 1);
            let instance_id = format!("{}::", agent.id);
            let instance = s.get_instance(&instance_id);
            assert!(instance.is_some());
        }

        {
            let mut s = scheduler.lock().await;
            s.remove_instances_for_agent(&agent.id);
        }

        {
            let s = scheduler.lock().await;
            assert_eq!(s.instance_count(), 0);
        }
    }

    #[tokio::test]
    async fn test_clear_all_instances() {
        let scheduler = create_shared_scheduler();

        let agent = create_test_agent_config();
        {
            let mut s = scheduler.lock().await;
            s.register_definition(agent_config_to_definition(&agent));
        }

        create_instance_for_agent(&scheduler, &agent.id).await;

        {
            let s = scheduler.lock().await;
            assert_eq!(s.instance_count(), 1);
        }

        clear_all_instances(&scheduler).await;

        {
            let s = scheduler.lock().await;
            assert_eq!(s.instance_count(), 0);
        }
    }
}
