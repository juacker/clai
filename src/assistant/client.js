/**
 * Assistant Engine Client
 *
 * Thin wrapper around Tauri invoke calls for the assistant engine.
 */

import { invoke } from '@tauri-apps/api/core';

export async function createSession(params) {
  return invoke('assistant_create_session', { request: params });
}

export async function getSession(sessionId) {
  return invoke('assistant_get_session', { sessionId });
}

export async function listSessions(tabId = null) {
  return invoke('assistant_list_sessions', { tabId });
}

export async function deleteSession(sessionId) {
  return invoke('assistant_delete_session', { sessionId });
}

export async function loadSessionMessages(sessionId) {
  return invoke('assistant_load_session_messages', { sessionId });
}

export async function sendMessage(sessionId, message) {
  return invoke('assistant_send_message', { sessionId, message });
}

export async function listRuns(sessionId) {
  return invoke('assistant_list_runs', { sessionId });
}

export async function listToolCalls(sessionId, runId = null) {
  return invoke('assistant_list_tool_calls', {
    request: {
      sessionId,
      runId,
    },
  });
}

export async function retryRun(runId) {
  return invoke('assistant_retry_run', { runId });
}

export async function cancelRun(runId) {
  return invoke('assistant_cancel_run', { runId });
}

export async function listProviderSessions() {
  return invoke('provider_list_sessions');
}

export async function getActiveProviderSession() {
  return invoke('provider_get_active_session');
}

export async function listProviderModels(providerId) {
  return invoke('provider_list_models', { providerId });
}

export async function getDefaultModel() {
  return invoke('assistant_get_default_model');
}

export async function setDefaultModel(modelId) {
  return invoke('assistant_set_default_model', {
    request: {
      modelId,
    },
  });
}
