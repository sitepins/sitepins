"use client";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuProps,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { getBlockType, setBlockType } from "@/editor/utils/transforms";
import {
  CheckIcon,
  Heading1Icon,
  Heading2Icon,
  Heading3Icon,
  Heading4Icon,
  Heading5Icon,
  Heading6Icon,
  ListIcon,
  ListOrderedIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import type { TElement } from "platejs";
import { KEYS } from "platejs";
import { useEditorRef, useSelectionFragmentProp } from "platejs/react";
import * as React from "react";
import { Icons } from "./icons";
import { ToolbarButton, ToolbarMenuGroup } from "./toolbar";

const turnIntoItemsRaw = [
  {
    icon: <Icons.heading className="w-5" />,
    keywords: ["paragraph"],
    labelKey: "text",
    value: KEYS.p,
  },
  {
    icon: <Heading1Icon className="w-5" />,
    keywords: ["title", "h1"],
    labelKey: "heading1",
    value: "h1",
  },
  {
    icon: <Heading2Icon className="w-5" />,
    keywords: ["subtitle", "h2"],
    labelKey: "heading2",
    value: "h2",
  },
  {
    icon: <Heading3Icon className="w-5" />,
    keywords: ["subtitle", "h3"],
    labelKey: "heading3",
    value: "h3",
  },
  {
    icon: <Heading4Icon className="w-5" />,
    keywords: ["subtitle", "h4"],
    labelKey: "heading4",
    value: "h4",
  },
  {
    icon: <Heading5Icon className="w-5" />,
    keywords: ["subtitle", "h5"],
    labelKey: "heading5",
    value: "h5",
  },
  {
    icon: <Heading6Icon className="w-5" />,
    keywords: ["subtitle", "h6"],
    labelKey: "heading6",
    value: "h6",
  },
  {
    icon: <ListIcon className="w-4" />,
    keywords: ["unordered", "ul", "-"],
    labelKey: "bullet_list",
    value: KEYS.ul,
  },
  {
    icon: <ListOrderedIcon className="w-4" />,
    keywords: ["ordered", "ol", "1"],
    labelKey: "num_list",
    value: KEYS.ol,
  },
];

export function TurnIntoToolbarButton(props: DropdownMenuProps) {
  const tEditorToolbar = useTranslations("editor.toolbar");
  const editor = useEditorRef();
  const [open, setOpen] = React.useState(false);

  const turnIntoItems = React.useMemo(
    () =>
      turnIntoItemsRaw.map((item) => ({
        ...item,
        label: tEditorToolbar(item.labelKey as any),
      })),
    [tEditorToolbar],
  );

  const value = useSelectionFragmentProp({
    defaultValue: KEYS.p,
    getProp: (node) => getBlockType(node as TElement),
  });
  const selectedItem = React.useMemo(
    () =>
      turnIntoItems.find((item) => item.value === (value ?? KEYS.p)) ??
      turnIntoItems[0],
    [turnIntoItems, value],
  );

  return (
    <DropdownMenu open={open} onOpenChange={setOpen} modal={false} {...props}>
      <DropdownMenuTrigger asChild>
        <ToolbarButton
          className="min-w-31.25"
          pressed={open}
          tooltip={tEditorToolbar("turn_into")}
          isDropdown
        >
          {selectedItem.label}
        </ToolbarButton>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        className="ignore-click-outside/toolbar w-fit min-w-0"
        onCloseAutoFocus={(e) => {
          e.preventDefault();
          editor.tf.focus();
        }}
        align="start"
      >
        <ToolbarMenuGroup
          value={value}
          onValueChange={(type) => {
            setBlockType(editor, type);
          }}
          label={tEditorToolbar("turn_into")}
        >
          {turnIntoItems.map(({ icon, label, value: itemValue }) => (
            <DropdownMenuRadioItem
              key={itemValue}
              className="min-w-45 pl-2 *:first:[span]:hidden"
              value={itemValue}
            >
              <span className="pointer-events-none absolute right-2 flex size-3.5 items-center justify-center">
                {value === itemValue && <CheckIcon />}
              </span>
              <span className="flex items-center gap-2">
                {icon} {label}
              </span>
            </DropdownMenuRadioItem>
          ))}
        </ToolbarMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
