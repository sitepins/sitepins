"use client";

import { selectMediaInfo, setMedia } from "@/redux/features/media/slice";
import { useAppDispatch } from "@/redux/store";
import { TFiles } from "@/types";
import { forwardRef, useEffect } from "react";
import { useSelector } from "react-redux";
import GridView from "./media-grid-view";
import ListView from "./media-list-view";

const MediaManager = forwardRef<
  HTMLDivElement,
  {
    gitMeta?: any;
    trees: TFiles[];
  }
>(({ trees }, ref) => {
  const dispatch = useAppDispatch();
  const { media, view } = useSelector(selectMediaInfo);

  useEffect(() => {
    // Only dispatch if trees has actually changed to prevent infinite loops
    // A simple length and path check should suffice for most cases
    const isDifferent =
      trees.length !== media.length ||
      trees.some((file, i) => file.path !== media[i]?.path);

    if (isDifferent) {
      dispatch(setMedia(trees));
    }
  }, [trees, dispatch, media]);

  if (view === "list" && media.length > 0) {
    return <ListView items={media} />;
  }

  return <GridView items={media} />;
});

export default MediaManager;
