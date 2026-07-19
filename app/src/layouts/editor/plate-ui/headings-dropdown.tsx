import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuProps,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ToolbarButton } from "@/editor/plate-ui/toolbar";
import { useTranslations } from "next-intl";
import { KEYS, TElement } from "platejs";
import { useEditorRef, useSelectionFragmentProp } from "platejs/react";
import { useMemo, useState } from "react";
import { isActiveNode, unsupportedItemsInTable } from "../utils/plate-utils";
import { getBlockType, setBlockType } from "../utils/transforms";
import { Icons } from "./icons";

export function HeadingsMenu(props: DropdownMenuProps) {
  const tEditorToolbar = useTranslations("editor.toolbar");
  const editor = useEditorRef();
  const [open, setOpen] = useState(false);

  const items = useMemo(
    () => [
      {
        description: tEditorToolbar("paragraph"),
        icon: Icons.heading,
        label: tEditorToolbar("paragraph"),
        value: KEYS.p,
      },
      {
        description: tEditorToolbar("heading1"),
        icon: Icons.h1,
        label: tEditorToolbar("heading1"),
        value: KEYS.h1,
      },
      {
        description: tEditorToolbar("heading2"),
        icon: Icons.h2,
        label: tEditorToolbar("heading2"),
        value: KEYS.h2,
      },
      {
        description: tEditorToolbar("heading3"),
        icon: Icons.h3,
        label: tEditorToolbar("heading3"),
        value: KEYS.h3,
      },
      {
        description: tEditorToolbar("heading4"),
        icon: Icons.h4,
        label: tEditorToolbar("heading4"),
        value: KEYS.h4,
      },
      {
        description: tEditorToolbar("heading5"),
        icon: Icons.h5,
        label: tEditorToolbar("heading5"),
        value: KEYS.h5,
      },
      {
        description: tEditorToolbar("heading6"),
        icon: Icons.h6,
        label: tEditorToolbar("heading6"),
        value: KEYS.h6,
      },
    ],
    [tEditorToolbar],
  );

  const value = useSelectionFragmentProp({
    defaultValue: KEYS.p,
    getProp: (node) => getBlockType(node as TElement),
  });

  const selectedItem = useMemo(
    () => items.find((item) => item.value === (value ?? KEYS.p)) ?? items[0],
    [items, value],
  );

  const isTableFocused = isActiveNode(editor, KEYS.table);

  const { icon: SelectedItemIcon, label: selectedItemLabel } = selectedItem;

  return (
    <DropdownMenu modal={open} onOpenChange={setOpen} {...props}>
      <DropdownMenuTrigger asChild>
        <ToolbarButton
          // showArrow
          isDropdown
          pressed={open}
          tooltip={tEditorToolbar("headings")}
        >
          <SelectedItemIcon className="size-5" />
          <span className="hidden @md/toolbar:flex">{selectedItemLabel}</span>
        </ToolbarButton>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        onCloseAutoFocus={(e) => {
          e.preventDefault();
          editor.tf.focus();
        }}
        align="start"
        className="min-w-0"
      >
        <DropdownMenuRadioGroup
          className="flex flex-col gap-0.5"
          onValueChange={(type) => {
            setBlockType(editor, type);
          }}
          value={value}
        >
          {items
            .filter((item) => {
              if (isTableFocused) {
                // Check against English labels if unsupportedItemsInTable uses them,
                // or refactor unsupportedItemsInTable to use values.
                // Assuming it's better to use values for comparison.
                return !unsupportedItemsInTable.has(item.value);
              }
              return true;
            })
            .map(({ icon: Icon, label, value: itemValue }) => (
              <DropdownMenuRadioItem
                className="min-w-45 cursor-pointer"
                key={itemValue}
                value={itemValue}
              >
                <Icon className="mr-2 size-5" />
                {label}
              </DropdownMenuRadioItem>
            ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
