/** True when a site-creation failure is a plan / quota business rule. */
export function isSiteCreationPlanLimitError(message: string): boolean {
  return /private site limit|maximum number of active private|maximum number of active projects|quota limit/i.test(
    message,
  );
}
