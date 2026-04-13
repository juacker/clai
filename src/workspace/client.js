import { invoke } from '@tauri-apps/api/core';

export async function getWorkspaceSnapshot(workspaceId = 'default') {
  return invoke('workspace_get_snapshot', { workspaceId });
}

export async function getOrCreateWorkspaceSession(workspaceId = 'default') {
  return invoke('workspace_get_or_create_session', { workspaceId });
}

export async function readWorkspaceFile(workspaceId, path) {
  return invoke('workspace_read_file', {
    request: {
      workspaceId,
      path,
    },
  });
}

export async function writeWorkspaceFile(workspaceId, path, content) {
  return invoke('workspace_write_file', {
    request: {
      workspaceId,
      path,
      content,
    },
  });
}

export async function downloadWorkspaceFile(workspaceId, path, destination) {
  return invoke('workspace_download_file', {
    request: {
      workspaceId,
      path,
      destination,
    },
  });
}

export async function updateWorkspaceSessionMcp(workspaceId, mcpServerIds) {
  return invoke('workspace_update_session_mcp', {
    request: {
      workspaceId,
      mcpServerIds,
    },
  });
}

export async function setWorkspaceProvider(workspaceId, providerConnectionId) {
  return invoke('workspace_set_provider', { workspaceId, providerConnectionId });
}

export async function createWorkspace(title) {
  return invoke('workspace_create', { title: title || null });
}

export async function listWorkspaces() {
  return invoke('workspace_list');
}

export async function deleteWorkspace(workspaceId) {
  return invoke('workspace_delete', { workspaceId });
}
