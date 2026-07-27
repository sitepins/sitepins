import { RefObject, useEffect, useState } from "react";

interface Options {
  once?: boolean;
  amount?: number;
  rootMargin?: number;
}

export const useInView = (
  ref: RefObject<HTMLElement | null>,
  { once, amount, rootMargin }: Options = {},
) => {
  const [isInView, setIsInView] = useState(false);

  useEffect(() => {
    const handleIntersection = (entries: IntersectionObserverEntry[]) => {
      const isIntersecting = entries.some((entry) => entry.isIntersecting);

      if (isIntersecting) {
        setIsInView(true);

        if (once) {
          observer.disconnect();
        }
      } else {
        setIsInView(false);
      }
    };

    const observer = new IntersectionObserver(handleIntersection, {
      root: null, // observe intersections in the viewport
      threshold: amount !== undefined ? amount : 0,
      rootMargin: (rootMargin ? rootMargin : 0) + "px",
    });

    if (ref && ref.current) {
      observer.observe(ref.current);
    }

    // Cleanup function
    return () => {
      observer.disconnect();
    };
  }, [ref, once, amount, rootMargin]);

  return isInView;
};
