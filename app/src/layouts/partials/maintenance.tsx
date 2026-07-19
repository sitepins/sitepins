// Maintenance mode is managed by the hosted cloud edition, which overrides
// this module (maintenance.cloud.tsx). Never rendered in the open-source
// build (config.maintenance.enabled is always false here).
export default function MaintenanceScreen() {
  return null;
}
