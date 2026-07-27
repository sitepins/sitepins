"use client";

import { CopilotPlugin } from "@platejs/ai/react";
import { useEditorRef, useElement, usePluginOption } from "platejs/react";

export function GhostText() {
  const element = useElement();
  const editor = useEditorRef();

  const isSuggested = usePluginOption(
    CopilotPlugin,
    "isSuggested",
    element.id as string,
  );

  if (!isSuggested) return null;

  // Check if the cursor is actually in this element
  const { selection } = editor;
  if (!selection) return null;

  // Get the block element at the current selection
  const currentBlock = editor.api.block({ at: selection });

  // Only render ghost text if this element is the current block
  if (!currentBlock || currentBlock[0] !== element) {
    return null;
  }

  return <GhostTextContent />;
}

function GhostTextContent() {
  const suggestionText = usePluginOption(CopilotPlugin, "suggestionText");

  return (
    <span
      className="text-muted-foreground/70 pointer-events-none max-sm:hidden"
      contentEditable={false}
    >
      {suggestionText && suggestionText}
    </span>
  );
}
