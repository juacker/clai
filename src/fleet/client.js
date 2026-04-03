import { invoke } from '@tauri-apps/api/core';

export async function getFleetSnapshot() {
  return invoke('fleet_get_snapshot');
}
