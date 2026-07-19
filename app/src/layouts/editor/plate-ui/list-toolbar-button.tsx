"use client";

import { ListStyleType, someList, toggleList } from "@platejs/list";
import {
  useIndentTodoToolBarButton,
  useIndentTodoToolBarButtonState,
} from "@platejs/list/react";
import { List, ListOrdered, ListTodoIcon } from "lucide-react";
import { useEditorRef, useEditorSelector } from "platejs/react";
import * as React from "react";
import { ToolbarButton } from "./toolbar";

export function BulletedListToolbarButton() {
  const editor = useEditorRef();

  const pressed = useEditorSelector(
    (editor) =>
      someList(editor, [
        ListStyleType.Disc,
        // ListStyleType.Circle,
        // ListStyleType.Square,
      ]),
    [],
  );

  return (
    <ToolbarButton
      tooltip="Bullet List"
      className="data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
      onClick={() => {
        toggleList(editor, {
          listStyleType: ListStyleType.Disc,
        });
        editor.tf.focus();
      }}
      data-state={pressed ? "on" : "off"}
    >
      <List className="size-4" />
    </ToolbarButton>
  );
}

export function NumberedListToolbarButton() {
  const editor = useEditorRef();
  // const [open, setOpen] = React.useState(false);

  const pressed = useEditorSelector(
    (editor) =>
      someList(editor, [
        ListStyleType.Decimal,
        // ListStyleType.LowerAlpha,
        // ListStyleType.UpperAlpha,
        // ListStyleType.LowerRoman,
        // ListStyleType.UpperRoman,
      ]),
    [],
  );

  return (
    <ToolbarButton
      tooltip="Num List"
      className="data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
      onClick={() => {
        toggleList(editor, {
          listStyleType: ListStyleType.Decimal,
        });
        editor.tf.focus();
      }}
      data-state={pressed ? "on" : "off"}
    >
      <ListOrdered className="size-4" />
    </ToolbarButton>
  );
}

export function TodoListToolbarButton(
  props: React.ComponentProps<typeof ToolbarButton>,
) {
  const state = useIndentTodoToolBarButtonState({ nodeType: "todo" });
  const { props: buttonProps } = useIndentTodoToolBarButton(state);

  return (
    <ToolbarButton {...props} {...buttonProps} tooltip="Todo">
      <ListTodoIcon />
    </ToolbarButton>
  );
}
