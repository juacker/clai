import { invoke } from '@tauri-apps/api/core';

// No generated binding exists for the fleet snapshot yet; FleetContext
// shapes the result. Typed as unknown until a FleetSnapshot binding lands.
export async function getFleetSnapshot(): Promise<unknown> {
  return invoke('fleet_get_snapshot');
}

export async function fleetRunNow(agentId: string): Promise<void> {
  return invoke('fleet_run_now', { agentId });
}
