"use client";

import { KEYS, type Path } from "platejs";
import { BlockPlaceholderPlugin } from "platejs/react";

export const BlockPlaceholderKit = [
  BlockPlaceholderPlugin.configure({
    options: {
      className:
        "before:absolute before:cursor-text before:text-muted-foreground/80 before:content-[attr(placeholder)]",
      placeholders: {
        [KEYS.p]: "Type something...",
      },
      query: ({ path }: { path: Path }) => {
        return path.length === 1;
      },
    },
  }),
];
