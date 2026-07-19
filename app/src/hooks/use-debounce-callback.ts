import { useCallback, useEffect, useRef } from "react";

export function useDebouncedCallback<Args extends any[]>(
  callback: (...args: Args) => void,
  delay: number,
) {
  const callbackRef = useRef(callback);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // always keep latest callback (no stale closure)
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  // clears timer
  const clear = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // debounced callback
  const debounced = useCallback(
    (...args: Args) => {
      clear();
      timerRef.current = setTimeout(() => {
        callbackRef.current(...args);
      }, delay);
    },
    [delay, clear],
  );

  // cleanup on unmount
  useEffect(() => clear, [clear]);

  return debounced;
}
