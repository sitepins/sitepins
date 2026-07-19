import React, { useEffect } from "react";

export const useResize = (
  ref: React.RefObject<any>,
  callback: (entry: ResizeObserverEntry) => void,
) => {
  useEffect(() => {
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        callback(entry);
      }
    });
    if (ref.current) {
      resizeObserver.observe(ref.current);
    }

    return () => resizeObserver.disconnect();
  }, [callback, ref]);
};
