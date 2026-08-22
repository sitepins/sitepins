"use client";

import { cn } from "@/lib/utils/cn";
import { mergeProps } from "@base-ui/react/merge-props";
import { Popover as PopoverPrimitive } from "@base-ui/react/popover";
import { useRender } from "@base-ui/react/use-render";
import * as React from "react";

// Base UI has no Anchor part; the Positioner takes an `anchor` element instead.
const PopoverAnchorContext = React.createContext<{
  anchor: HTMLElement | null;
  setAnchor: (el: HTMLElement | null) => void;
} | null>(null);

type DismissHandler = (event: { preventDefault: () => void }) => void;

// Base UI moves dismissal interception to Root.onOpenChange; Content registers
// its radix-style handlers here so call sites keep working.
type DismissHandlers = {
  onEscapeKeyDown?: DismissHandler;
  onPointerDownOutside?: DismissHandler;
  onInteractOutside?: DismissHandler;
};

const PopoverDismissContext =
  React.createContext<React.RefObject<DismissHandlers> | null>(null);

function Popover({
  children,
  onOpenChange,
  ...props
}: PopoverPrimitive.Root.Props) {
  const [anchor, setAnchor] = React.useState<HTMLElement | null>(null);
  const value = React.useMemo(() => ({ anchor, setAnchor }), [anchor]);
  const handlers = React.useRef<DismissHandlers>({});

  const handleOpenChange: PopoverPrimitive.Root.Props["onOpenChange"] = (
    open,
    eventDetails,
  ) => {
    if (!open) {
      const { reason } = eventDetails;
      const event = { preventDefault: () => eventDetails.cancel() };
      if (reason === "escape-key") handlers.current.onEscapeKeyDown?.(event);
      if (reason === "outside-press") {
        handlers.current.onPointerDownOutside?.(event);
        handlers.current.onInteractOutside?.(event);
      }
      if (eventDetails.isCanceled) return;
    }
    onOpenChange?.(open, eventDetails);
  };

  return (
    <PopoverDismissContext.Provider value={handlers}>
      <PopoverAnchorContext.Provider value={value}>
        <PopoverPrimitive.Root
          data-slot="popover"
          onOpenChange={handleOpenChange}
          {...props}
        >
          {children}
        </PopoverPrimitive.Root>
      </PopoverAnchorContext.Provider>
    </PopoverDismissContext.Provider>
  );
}

function PopoverTrigger({
  asChild,
  children,
  render,
  nativeButton,
  ...props
}: PopoverPrimitive.Trigger.Props & { asChild?: boolean }) {
  return (
    <PopoverPrimitive.Trigger
      data-slot="popover-trigger"
      nativeButton={nativeButton}
      render={asChild ? (children as React.ReactElement) : render}
      {...props}
    >
      {asChild ? undefined : children}
    </PopoverPrimitive.Trigger>
  );
}

function PopoverContent({
  className,
  align = "center",
  alignOffset,
  side,
  sideOffset = 4,
  collisionPadding,
  collisionBoundary,
  sticky,
  disablePortal = false,
  asChild,
  children,
  render,
  onEscapeKeyDown,
  onPointerDownOutside,
  onInteractOutside,
  onOpenAutoFocus,
  ...props
}: PopoverPrimitive.Popup.Props &
  Pick<
    PopoverPrimitive.Positioner.Props,
    | "align"
    | "alignOffset"
    | "side"
    | "sideOffset"
    | "collisionPadding"
    | "collisionBoundary"
    | "sticky"
  > & {
    disablePortal?: boolean;
    asChild?: boolean;
    onEscapeKeyDown?: DismissHandler;
    onPointerDownOutside?: DismissHandler;
    onInteractOutside?: DismissHandler;
    onOpenAutoFocus?: DismissHandler;
  }) {
  const anchorContext = React.useContext(PopoverAnchorContext);
  const dismissHandlersRef = React.useContext(PopoverDismissContext);
  React.useEffect(() => {
    if (!dismissHandlersRef) return;
    dismissHandlersRef.current = {
      onEscapeKeyDown,
      onPointerDownOutside,
      onInteractOutside,
    };
  }, [
    dismissHandlersRef,
    onEscapeKeyDown,
    onPointerDownOutside,
    onInteractOutside,
  ]);

  const content = (
    <PopoverPrimitive.Positioner
      align={align}
      alignOffset={alignOffset}
      side={side}
      sideOffset={sideOffset}
      collisionPadding={collisionPadding}
      collisionBoundary={collisionBoundary}
      sticky={sticky}
      anchor={anchorContext?.anchor ?? undefined}
      className="isolate z-50"
    >
      <PopoverPrimitive.Popup
        data-slot="popover-content"
        initialFocus={onOpenAutoFocus ? false : undefined}
        render={asChild ? (children as React.ReactElement) : render}
        className={cn(
          "bg-popover text-popover-foreground data-open:animate-in data-closed:animate-out data-closed:fade-out-0 data-open:fade-in-0 data-closed:zoom-out-95 data-open:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 ring-foreground/10 z-50 flex w-72 origin-(--transform-origin) flex-col gap-2.5 rounded-lg p-2.5 text-sm shadow-md ring-1 outline-hidden duration-100",
          className,
        )}
        {...props}
      >
        {asChild ? undefined : children}
      </PopoverPrimitive.Popup>
    </PopoverPrimitive.Positioner>
  );

  if (disablePortal) return content;

  return <PopoverPrimitive.Portal>{content}</PopoverPrimitive.Portal>;
}

function PopoverAnchor({
  asChild,
  children,
  render,
  ...props
}: useRender.ComponentProps<"div"> & { asChild?: boolean }) {
  const anchorContext = React.useContext(PopoverAnchorContext);

  return useRender({
    defaultTagName: "div",
    render: asChild ? (children as React.ReactElement) : render,
    ref: anchorContext?.setAnchor,
    props: mergeProps<"div">(
      {
        "data-slot": "popover-anchor",
        children: asChild ? undefined : children,
      } as React.ComponentProps<"div">,
      props,
    ),
  });
}

function PopoverHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="popover-header"
      className={cn("flex flex-col gap-0.5 text-sm", className)}
      {...props}
    />
  );
}

function PopoverTitle({ className, ...props }: React.ComponentProps<"h2">) {
  return (
    <div
      data-slot="popover-title"
      className={cn("font-medium", className)}
      {...props}
    />
  );
}

function PopoverDescription({
  className,
  ...props
}: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="popover-description"
      className={cn("text-muted-foreground", className)}
      {...props}
    />
  );
}

export {
  Popover,
  PopoverAnchor,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
};
