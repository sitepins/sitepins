/**
 * Deployment Status Utilities
 *
 * Shared helpers for mapping GitHub/GitLab deployment status strings
 * to UI variants (for Badge components) and CSS classes (for inline badges).
 *
 * GitHub states: error | failure | inactive | in_progress | queued | pending | success
 * GitLab states: created | running | success | failed | canceled | blocked
 */

const ERROR_STATES = ["error", "failure", "failed", "canceled", "blocked"];
const IN_PROGRESS_STATES = ["in_progress", "running"];
const PENDING_STATES = [
  "pending",
  "queued",
  "created",
  "waiting_for_resource",
  "preparing",
];

/**
 * Sentinel returned by the API layer when a repo has no CI status configured
 * at all (GitHub: total_count === 0 / GitLab: empty pipeline list).
 * It is treated as terminal (stops polling) but should NOT be displayed in the UI.
 */
export const NO_STATUS_SENTINEL = "no_status";

export const isTerminalDeploymentStatus = (
  status: string | null | undefined,
): boolean => {
  if (!status) return false;
  // Only keep polling for known active states; anything else (including
  // NO_STATUS_SENTINEL or any unrecognised string) is treated as terminal.
  if (IN_PROGRESS_STATES.includes(status)) return false;
  if (PENDING_STATES.includes(status)) return false;
  return true;
};

/**
 * Returns true only when the status is a real, known state worth showing in the UI.
 * Filters out the NO_STATUS_SENTINEL so repos with no CI don't display a badge.
 */
export const isDisplayableDeploymentStatus = (
  status: string | null | undefined,
): boolean => {
  if (!status || status === NO_STATUS_SENTINEL) return false;
  return true;
};

/**
 * Returns a Badge component variant for the given deployment status.
 * Used in components that render the `<Badge>` component.
 */
export const getDeploymentStatusVariant = (
  status: string | null | undefined,
): "success" | "warning" | "accent" | "destructive" | "muted" | "outline" => {
  if (!status) return "muted";
  if (status === "success") return "success";
  if (ERROR_STATES.includes(status)) return "destructive";
  if (IN_PROGRESS_STATES.includes(status)) return "accent";
  if (PENDING_STATES.includes(status)) return "warning";
  return "outline";
};

/**
 * Returns Tailwind CSS class strings for the given deployment status.
 * Used in components that render inline status chips (not the Badge component).
 */
export const getDeploymentStatusClass = (
  status: string | null | undefined,
): string => {
  if (!status) return "bg-muted text-muted-foreground";
  if (status === "success") return "bg-success text-success-foreground";
  if (ERROR_STATES.includes(status))
    return "bg-destructive text-destructive-foreground";
  if (IN_PROGRESS_STATES.includes(status))
    return "bg-accent text-accent-foreground";
  if (PENDING_STATES.includes(status))
    return "bg-warning text-warning-foreground";
  return "bg-accent text-accent-foreground";
};

/**
 * Returns a human-readable status label key for i18n lookup.
 * Callers should pass the result to their translation function: t(getDeploymentStatusI18nKey(status))
 */
export const getDeploymentStatusI18nKey = (
  status: string | null | undefined,
):
  | "status.no_status"
  | "status.success"
  | "status.failed"
  | "status.building"
  | "status.pending"
  | "status.inactive" => {
  if (!status) return "status.no_status";
  if (status === "success") return "status.success";
  if (ERROR_STATES.includes(status)) return "status.failed";
  if (IN_PROGRESS_STATES.includes(status)) return "status.building";
  if (PENDING_STATES.includes(status)) return "status.pending";
  return "status.inactive";
};
