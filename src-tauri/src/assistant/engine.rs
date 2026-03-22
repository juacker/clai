#![allow(dead_code)]

use thiserror::Error;

use crate::assistant::types::{AssistantRun, RunTrigger, SessionId};

#[derive(Debug, Clone)]
pub struct RunTurnInput {
    pub session_id: SessionId,
    pub user_message: Option<String>,
    pub trigger: RunTrigger,
}

#[derive(Debug, Error)]
pub enum AssistantEngineError {
    #[error("assistant engine is not implemented yet")]
    NotImplemented,
}

pub struct AssistantEngine;

impl AssistantEngine {
    pub async fn run_session_turn(
        &self,
        _input: RunTurnInput,
    ) -> Result<AssistantRun, AssistantEngineError> {
        Err(AssistantEngineError::NotImplemented)
    }
}
