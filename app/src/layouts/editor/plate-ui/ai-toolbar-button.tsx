"use client";

import { useOwnerPlan } from "@/hooks/use-owner-plan";
import { openAiUpsellDialog } from "@/hooks/use-upgrade-dialog";
import { AIChatPlugin } from "@platejs/ai/react";
import { useEditorPlugin } from "platejs/react";
import type * as React from "react";
import { ToolbarButton } from "./toolbar";

export function AIToolbarButton(
  props: React.ComponentProps<typeof ToolbarButton>,
) {
  const { api } = useEditorPlugin(AIChatPlugin);
  const { canAccessPremiumFeatures: canAccessAi } = useOwnerPlan();

  const { onClick, onMouseDown, ...restProps } = props;

  const handleMouseDown: React.MouseEventHandler<HTMLButtonElement> = (
    event,
  ) => {
    onMouseDown?.(event);
    if (!event.defaultPrevented) {
      event.preventDefault();
    }
  };

  if (!canAccessAi) {
    return (
      <ToolbarButton
        {...restProps}
        onClick={(event) => {
          onClick?.(event);
          if (event.defaultPrevented) return;
          api.aiChat.hide();
          openAiUpsellDialog();
        }}
        onMouseDown={handleMouseDown}
      />
    );
  }

  return (
    <ToolbarButton
      {...restProps}
      onClick={(event) => {
        onClick?.(event);
        if (event.defaultPrevented) return;
        if (!localStorage.getItem("sitepins-ai-model")) {
          window.open("/dashboard/ai-agent", "_blank");
          return;
        }
        api.aiChat.show();
      }}
      onMouseDown={handleMouseDown}
    />
  );
}
