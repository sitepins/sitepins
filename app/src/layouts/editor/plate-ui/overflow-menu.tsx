import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import React, { useState } from "react";
import { Icons } from "./icons";
import { ToolbarButton } from "./toolbar";

type OverflowMenuProps = {
  [key: string]: any;
  children: React.ReactNode[];
};
export default function OverflowMenu({
  children,
  ...props
}: OverflowMenuProps) {
  const [open, setOpen] = useState(false);

  return (
    <DropdownMenu modal={false} open={open} onOpenChange={setOpen} {...props}>
      <DropdownMenuTrigger asChild>
        <ToolbarButton
          showArrow={false}
          data-testid="rich-text-editor-overflow-menu-button"
          isDropdown
          pressed={open}
          tooltip="More options"
        >
          <Icons.overflow className="size-5" />
        </ToolbarButton>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="end"
        className="flex max-w-[calc(100vw-2rem)] min-w-fit flex-row"
      >
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
