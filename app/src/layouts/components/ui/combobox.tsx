"use client";

import { Button } from "@/components/ui/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import { cn } from "@/lib/utils/cn";
import { Combobox as ComboboxPrimitive } from "@base-ui/react";
import {
  CheckIcon,
  ChevronDownIcon,
  Loader2,
  SearchIcon,
  XIcon,
} from "lucide-react";
import * as React from "react";

const ComboboxAnchorContext = React.createContext<
  React.RefObject<HTMLDivElement | null> | undefined
>(undefined);

function Combobox({
  children,
  ...props
}: ComboboxPrimitive.Root.Props<any, any>) {
  const anchorRef = React.useRef<HTMLDivElement>(null);
  return (
    <ComboboxPrimitive.Root {...props}>
      <ComboboxAnchorContext.Provider value={anchorRef}>
        {children}
      </ComboboxAnchorContext.Provider>
    </ComboboxPrimitive.Root>
  );
}

function ComboboxValue({ ...props }: ComboboxPrimitive.Value.Props) {
  return <ComboboxPrimitive.Value data-slot="combobox-value" {...props} />;
}

function ComboboxTrigger({
  className,
  children,
  ...props
}: ComboboxPrimitive.Trigger.Props) {
  return (
    <ComboboxPrimitive.Trigger
      data-slot="combobox-trigger"
      className={cn("w-full [&_svg:not([class*='size-'])]:size-4", className)}
      {...props}
    >
      {children}
      <ChevronDownIcon className="text-muted-foreground pointer-events-none size-4" />
    </ComboboxPrimitive.Trigger>
  );
}

function ComboboxClear({ className, ...props }: ComboboxPrimitive.Clear.Props) {
  return (
    <ComboboxPrimitive.Clear
      data-slot="combobox-clear"
      className={cn(className)}
      {...props}
      render={
        <InputGroupButton variant="ghost" size="icon-xs">
          <XIcon className="pointer-events-none" />
        </InputGroupButton>
      }
    />
  );
}

const ComboboxInput = React.forwardRef<
  HTMLDivElement,
  ComboboxPrimitive.Input.Props & {
    showTrigger?: boolean;
    showClear?: boolean;
    isLoading?: boolean;
  }
>(
  (
    {
      className,
      children,
      disabled = false,
      showTrigger = true,
      showClear = false,
      isLoading,
      ...props
    },
    propRef,
  ) => {
    const contextAnchorRef = React.useContext(ComboboxAnchorContext);
    const ref = (propRef ?? contextAnchorRef) as React.Ref<HTMLDivElement>;

    return (
      <InputGroup
        ref={ref}
        className={cn("h-9 w-full", className)}
        data-slot="input-group"
      >
        <InputGroupAddon align="inline-start" className="pl-2.5">
          {isLoading ? (
            <Loader2 className="text-muted-foreground size-4 animate-spin" />
          ) : (
            <SearchIcon className="text-muted-foreground size-4" />
          )}
        </InputGroupAddon>
        <ComboboxPrimitive.Input
          render={<InputGroupInput disabled={disabled} />}
          {...props}
        />
        <InputGroupAddon align="inline-end">
          {showTrigger && !isLoading && (
            <InputGroupButton
              size="icon-xs"
              variant="ghost"
              // render={<ComboboxTrigger />}
              data-slot="input-group-button"
              className="group-has-data-[slot=combobox-clear]/input-group:hidden data-pressed:bg-transparent"
              disabled={disabled}
            />
          )}
          {showClear && <ComboboxClear disabled={disabled} />}
        </InputGroupAddon>
        {children}
      </InputGroup>
    );
  },
);
ComboboxInput.displayName = "ComboboxInput";

function ComboboxContent({
  className,
  side = "bottom",
  sideOffset = 6,
  align = "start",
  alignOffset = 0,
  anchor,
  disablePortal = false,
  ...props
}: ComboboxPrimitive.Popup.Props &
  Pick<
    ComboboxPrimitive.Positioner.Props,
    "side" | "align" | "sideOffset" | "alignOffset" | "anchor"
  > & { disablePortal?: boolean }) {
  const [container, setContainer] = React.useState<HTMLElement | null>(null);
  const contextAnchorRef = React.useContext(ComboboxAnchorContext);
  const resolvedAnchor = anchor ?? contextAnchorRef;

  const content = (
    <ComboboxPrimitive.Positioner
      side={side}
      sideOffset={sideOffset}
      align={align}
      alignOffset={alignOffset}
      anchor={resolvedAnchor}
      className="isolate z-50"
    >
      <ComboboxPrimitive.Popup
        data-slot="combobox-content"
        data-chips={!!resolvedAnchor}
        className={cn(
          "bg-popover text-popover-foreground data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 ring-foreground/10 *:data-[slot=input-group]:bg-input/30 *:data-[slot=input-group]:border-input/30 data-[side=inline-start]:slide-in-from-right-2 data-[side=inline-end]:slide-in-from-left-2 group/combobox-content pointer-events-auto relative max-h-(--available-height) w-(--anchor-width) max-w-(--available-width) min-w-[calc(var(--anchor-width)+--spacing(7))] origin-(--transform-origin) overflow-hidden rounded-lg shadow-md ring-1 data-[chips=true]:min-w-(--anchor-width) *:data-[slot=input-group]:mx-1 *:data-[slot=input-group]:mt-1 *:data-[slot=input-group]:mb-0 *:data-[slot=input-group]:h-8 *:data-[slot=input-group]:w-[calc(100%-8px)] *:data-[slot=input-group]:shadow-none",
          className,
        )}
        onWheel={(e) => {
          e.stopPropagation();
        }}
        onTouchMove={(e) => {
          e.stopPropagation();
        }}
        {...props}
      />
    </ComboboxPrimitive.Positioner>
  );

  if (disablePortal) {
    return (
      <React.Fragment>
        <div ref={setContainer} style={{ position: "absolute" }} />
        {container && (
          <ComboboxPrimitive.Portal container={container}>
            {content}
          </ComboboxPrimitive.Portal>
        )}
      </React.Fragment>
    );
  }

  return <ComboboxPrimitive.Portal>{content}</ComboboxPrimitive.Portal>;
}

function ComboboxList({ className, ...props }: ComboboxPrimitive.List.Props) {
  return (
    <ComboboxPrimitive.List
      data-slot="combobox-list"
      className={cn(
        "pointer-events-auto max-h-72 scroll-py-1 overflow-y-auto p-1 data-empty:p-0",
        className,
      )}
      {...props}
    />
  );
}

function ComboboxItem({
  className,
  children,
  ...props
}: ComboboxPrimitive.Item.Props) {
  return (
    <ComboboxPrimitive.Item
      data-slot="combobox-item"
      className={cn(
        "data-highlighted:bg-light data-highlighted:text-text not-data-[variant=destructive]:data-highlighted:**:text-text relative flex w-full cursor-pointer items-center gap-2 rounded-md py-1 pr-8 pl-1.5 text-sm outline-hidden select-none data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      {...props}
    >
      {children}
      <ComboboxPrimitive.ItemIndicator
        render={
          <span className="pointer-events-none absolute right-2 flex size-4 items-center justify-center">
            <CheckIcon className="pointer-events-none" />
          </span>
        }
      />
    </ComboboxPrimitive.Item>
  );
}

function ComboboxGroup({ className, ...props }: ComboboxPrimitive.Group.Props) {
  return (
    <ComboboxPrimitive.Group
      data-slot="combobox-group"
      className={cn(className)}
      {...props}
    />
  );
}

function ComboboxLabel({
  className,
  ...props
}: ComboboxPrimitive.GroupLabel.Props) {
  return (
    <ComboboxPrimitive.GroupLabel
      data-slot="combobox-label"
      className={cn("text-muted-foreground px-2 py-1.5 text-xs", className)}
      {...props}
    />
  );
}

function ComboboxCollection({ ...props }: ComboboxPrimitive.Collection.Props) {
  return (
    <ComboboxPrimitive.Collection data-slot="combobox-collection" {...props} />
  );
}

function ComboboxEmpty({ className, ...props }: ComboboxPrimitive.Empty.Props) {
  return (
    <ComboboxPrimitive.Empty
      data-slot="combobox-empty"
      className={cn(
        "text-muted-foreground hidden w-full justify-center py-2 text-center text-sm group-data-empty/combobox-content:flex",
        className,
      )}
      {...props}
    />
  );
}

function ComboboxSeparator({
  className,
  ...props
}: ComboboxPrimitive.Separator.Props) {
  return (
    <ComboboxPrimitive.Separator
      data-slot="combobox-separator"
      className={cn("bg-border -mx-1 my-1 h-px", className)}
      {...props}
    />
  );
}

function ComboboxChips({
  className,
  ...props
}: React.ComponentPropsWithRef<typeof ComboboxPrimitive.Chips> &
  ComboboxPrimitive.Chips.Props) {
  const contextAnchorRef = React.useContext(ComboboxAnchorContext);

  return (
    <ComboboxPrimitive.Chips
      ref={contextAnchorRef}
      data-slot="combobox-chips"
      className={cn(
        "border-border dark:bg-input/30 text-text flex min-h-9 w-full flex-wrap items-center gap-1.5 rounded-lg border bg-transparent px-1 py-1 text-base shadow-xs focus-within:outline-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
        className,
      )}
      {...props}
    />
  );
}

function ComboboxChip({
  className,
  children,
  showRemove = true,
  ...props
}: ComboboxPrimitive.Chip.Props & {
  showRemove?: boolean;
}) {
  return (
    <ComboboxPrimitive.Chip
      data-slot="combobox-chip"
      className={cn(
        "bg-light text-text data-[highlighted=true]:bg-light flex h-7 items-center rounded-md px-2 text-xs disabled:opacity-50",
        className,
      )}
      {...props}
    >
      {children}
      {showRemove && (
        <ComboboxPrimitive.ChipRemove
          className="ml-1 opacity-50 hover:opacity-100"
          data-slot="combobox-chip-remove"
          render={
            <Button variant="ghost" size="icon-xs">
              <XIcon className="pointer-events-none" />
            </Button>
          }
        />
      )}
    </ComboboxPrimitive.Chip>
  );
}

function ComboboxChipsInput({
  className,
  ...props
}: ComboboxPrimitive.Input.Props) {
  return (
    <ComboboxPrimitive.Input
      data-slot="combobox-chip-input"
      className={cn(
        "placeholder:text-muted-foreground inline-block h-7 min-w-20 flex-1 border-none bg-transparent px-1 align-middle ring-0 outline-none focus:ring-0 focus:outline-none",
        className,
      )}
      {...props}
    />
  );
}

export function useComboboxAnchor() {
  return React.useRef<HTMLDivElement | null>(null);
}

export {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxCollection,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxGroup,
  ComboboxInput,
  ComboboxItem,
  ComboboxLabel,
  ComboboxList,
  ComboboxSeparator,
  ComboboxTrigger,
  ComboboxValue,
};
