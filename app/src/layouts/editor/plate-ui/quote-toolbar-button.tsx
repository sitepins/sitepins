"use client";

import { KEYS, TElement } from "platejs";
import { useEditorRef, useSelectionFragmentProp } from "platejs/react";
import { getBlockType, setBlockType } from "../utils/transforms";
import { ToolbarButton } from "./toolbar";

export function QuoteToolbarButton({
  nodeType,
  ...props
}: React.ComponentProps<typeof ToolbarButton> & {
  nodeType: string;
}) {
  const editor = useEditorRef();

  const value = useSelectionFragmentProp({
    defaultValue: KEYS.p,
    getProp: (node) => getBlockType(node as TElement),
  });

  const selectedItem = value === KEYS.blockquote;

  const handleInsertBlock = () => {
    if (selectedItem) {
      setBlockType(editor, KEYS.p);
    } else {
      setBlockType(editor, KEYS.blockquote);
    }
  };

  return (
    <ToolbarButton
      pressed={selectedItem}
      {...props}
      onClick={handleInsertBlock}
    />
  );
}
