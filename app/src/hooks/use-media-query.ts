import { useCallback, useEffect, useState } from "react";
type UseMediaQueryOptions = {
  defaultValue?: boolean;
  initializeWithValue?: boolean;
};
const IS_SERVER = typeof window === "undefined";
export function useMediaQuery(
  query: string,
  {
    defaultValue = false,
    initializeWithValue = true,
  }: UseMediaQueryOptions = {},
): boolean {
  const getMatches = useCallback(
    (query: string): boolean => {
      if (IS_SERVER) {
        return defaultValue;
      }
      return window.matchMedia(query).matches;
    },
    [defaultValue],
  );
  const [matches, setMatches] = useState<boolean>(() => {
    if (initializeWithValue) {
      return getMatches(query);
    }
    return defaultValue;
  });
  useEffect(() => {
    // Handles the change event of the media query.
    function handleChange() {
      setMatches(getMatches(query));
    }
    const matchMedia = window.matchMedia(query);
    // Triggered at the first client-side load and if query changes
    handleChange();
    matchMedia.addEventListener("change", handleChange);
    return () => {
      matchMedia.removeEventListener("change", handleChange);
    };
  }, [query, getMatches]);
  return matches;
}
export type { UseMediaQueryOptions };
