import { deepEqual, stripEphemeral } from "@/lib/utils/comparison";
import { TFrontmatterData, TState } from "@/types";
import { useMemo } from "react";

/**
 * Whether `data` differs from the last saved baseline. Errors report changed,
 * so a comparison failure never blocks a save.
 */
export const isChangedFrom = (
  data: TFrontmatterData | undefined,
  baseline: TState | undefined,
): boolean => {
  const storeData = baseline?.data;
  try {
    const dataStr = JSON.stringify(stripEphemeral(data || {}));
    const storeDataStr = JSON.stringify(stripEphemeral(storeData || {}));
    return !(dataStr === storeDataStr || deepEqual(data, storeData));
  } catch {
    return true;
  }
};

export const useIsChanged = ({
  data,
  baseline,
}: {
  data: TFrontmatterData | undefined;
  /** Last saved state. Held as state, not a ref, so a save re-renders. */
  baseline: TState | undefined;
}): boolean => {
  const storeData = baseline?.data;
  const dataStr = JSON.stringify(stripEphemeral(data || {}));
  const storeDataStr = JSON.stringify(stripEphemeral(storeData || {}));

  return useMemo(
    () => isChangedFrom(data, baseline),
    // The stringified forms are the real inputs: they change when a nested
    // value changes but the object identity does not.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dataStr, storeDataStr, data, storeData],
  );
};
