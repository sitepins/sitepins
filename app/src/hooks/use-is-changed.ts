import { deepEqual, stripEphemeral } from "@/lib/utils/comparison";
import { TState } from "@/types";
import { RefObject, useMemo } from "react";

export const useIsChanged = ({
  data,
  storeRef,
}: {
  data: any;
  storeRef: RefObject<TState | undefined>;
}): boolean => {
  // baseline values
  const storeData = storeRef.current?.data;
  const dataStr = JSON.stringify(stripEphemeral(data || {}));
  const storeDataStr = JSON.stringify(stripEphemeral(storeData || {}));

  return useMemo(() => {
    try {
      const dataEqual = dataStr === storeDataStr || deepEqual(data, storeData);
      // Changed if content or data differ from baseline
      return !dataEqual;
    } catch (e) {
      // On any error, conservatively report changed so user can save
      return true;
    }
  }, [dataStr, storeDataStr, data, storeData]);
};
