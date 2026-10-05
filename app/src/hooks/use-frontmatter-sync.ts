import { CollabBase } from "@/contexts/collab-base-context";
import { TState } from "@/types";
import { Dispatch, SetStateAction, useEffect, useRef } from "react";

type StateSetter = Dispatch<SetStateAction<TState | undefined>>;

/** Shares the editor's frontmatter through the collaborative room. */
export function useFrontmatterSync(
  collab: CollabBase,
  state: TState | undefined,
  setState: StateSetter,
  setBaseline: StateSetter,
) {
  const dataRef = useRef(state?.data);

  useEffect(() => {
    dataRef.current = state?.data;
  });

  useEffect(() => {
    collab.setFrontmatterBridge({
      read: () => dataRef.current,
      apply: (data, asBaseline) => {
        setState((prev) => (prev ? { ...prev, data } : prev));
        if (asBaseline) {
          setBaseline((prev) =>
            prev ? { ...prev, data: structuredClone(data) } : prev,
          );
        }
      },
    });
    return () => collab.setFrontmatterBridge(null);
  }, [collab, setState, setBaseline]);

  useEffect(() => {
    if (state?.data) collab.pushFrontmatter(state.data);
  }, [collab, state?.data]);
}
