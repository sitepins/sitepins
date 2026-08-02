import { useSyncExternalStore } from "react";

const subscribe = () => () => {};
const getClientSnapshot = () => true;
const getServerSnapshot = () => false;

/**
 * False during SSR and the first hydration pass, true afterwards. Uses
 * `useSyncExternalStore` rather than a mount effect so React resolves it in
 * the hydration render instead of committing a second one.
 */
export const useHydrated = (): boolean =>
  useSyncExternalStore(subscribe, getClientSnapshot, getServerSnapshot);
