"use client";

import { useAiAccess } from "@/hooks/use-ai-access";
import { AIChatPlugin } from "@platejs/ai/react";
import { useEditorPlugin } from "platejs/react";
import type * as React from "react";
import { ToolbarButton } from "./toolbar";

export function AIToolbarButton(
  props: React.ComponentProps<typeof ToolbarButton>,
) {
  const { api } = useEditorPlugin(AIChatPlugin);
  const { checkAiAccess, isEditorAiEnabled } = useAiAccess();
  const { onClick, onMouseDown, ...restProps } = props;

  if (!isEditorAiEnabled) return null;

  const handleMouseDown: React.MouseEventHandler<HTMLButtonElement> = (
    event,
  ) => {
    onMouseDown?.(event as Parameters<NonNullable<typeof onMouseDown>>[0]);
    if (!event.defaultPrevented) {
      event.preventDefault();
    }
  };

  return (
    <ToolbarButton
      {...restProps}
      onClick={(event) => {
        onClick?.(event);
        if (event.defaultPrevented) return;
        if (!checkAiAccess()) {
          api.aiChat.hide();
          return;
        }
        api.aiChat.show();
      }}
      onMouseDown={handleMouseDown}
    />
  );
}
