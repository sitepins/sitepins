export function hasTrialHistory(value: unknown): boolean {
  if (!value) {
    return false;
  }

  if (Array.isArray(value)) {
    return value.length > 0;
  }

  if (typeof value === "object") {
    const record = value as Record<string, unknown>;

    if (Object.prototype.hasOwnProperty.call(record, "result")) {
      return hasTrialHistory(record.result);
    }

    return Object.keys(record).length > 0;
  }

  return false;
}
