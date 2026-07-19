"use client";

import { KEYS } from "platejs";
import {
  useEditorRef,
  useMarkToolbarButton,
  useMarkToolbarButtonState,
} from "platejs/react";
import { insertBlock } from "../utils/transforms";
import { ToolbarButton } from "./toolbar";

export function CodeBlockToolbarButton({
  clear,
  nodeType,
  ...props
}: React.ComponentProps<typeof ToolbarButton> & {
  nodeType: string;
  clear?: string[] | string;
}) {
  const editor = useEditorRef();
  const state = useMarkToolbarButtonState({ clear, nodeType });
  const { props: buttonProps } = useMarkToolbarButton(state);

  const handleInsertBlock = () => {
    buttonProps.onClick();
    insertBlock(editor, KEYS.codeBlock);
    if (!editor.api.isFocused()) {
      editor.tf.focus();
    }
  };

  return (
    <ToolbarButton
      pressed={buttonProps.pressed}
      {...props}
      onClick={handleInsertBlock}
      onMouseDown={buttonProps.onMouseDown}
    />
  );
}
