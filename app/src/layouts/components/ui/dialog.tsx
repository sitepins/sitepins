"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { XIcon } from "lucide-react";
import * as React from "react";

type DismissHandler = (event: { preventDefault: () => void }) => void;

// Base UI moves dismissal interception to Root.onOpenChange; Content registers
// its radix-style handlers here so call sites keep working.
type DismissHandlers = {
  onEscapeKeyDown?: DismissHandler;
  onPointerDownOutside?: DismissHandler;
  onInteractOutside?: DismissHandler;
};

const DialogDismissContext =
  React.createContext<React.RefObject<DismissHandlers> | null>(null);

function Dialog({
  onOpenChange,
  children,
  ...props
}: DialogPrimitive.Root.Props) {
  const handlers = React.useRef<DismissHandlers>({});

  const handleOpenChange: DialogPrimitive.Root.Props["onOpenChange"] = (
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
    <DialogDismissContext.Provider value={handlers}>
      <DialogPrimitive.Root
        data-slot="dialog"
        onOpenChange={handleOpenChange}
        {...props}
      >
        {children}
      </DialogPrimitive.Root>
    </DialogDismissContext.Provider>
  );
}

function DialogTrigger({
  asChild,
  children,
  render,
  nativeButton,
  ...props
}: DialogPrimitive.Trigger.Props & { asChild?: boolean }) {
  return (
    <DialogPrimitive.Trigger
      data-slot="dialog-trigger"
      nativeButton={nativeButton}
      render={asChild ? (children as React.ReactElement) : render}
      {...props}
    >
      {asChild ? undefined : children}
    </DialogPrimitive.Trigger>
  );
}

function DialogPortal({ ...props }: DialogPrimitive.Portal.Props) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />;
}

function DialogClose({
  asChild,
  children,
  render,
  nativeButton,
  ...props
}: DialogPrimitive.Close.Props & { asChild?: boolean }) {
  return (
    <DialogPrimitive.Close
      data-slot="dialog-close"
      nativeButton={nativeButton}
      render={asChild ? (children as React.ReactElement) : render}
      {...props}
    >
      {asChild ? undefined : children}
    </DialogPrimitive.Close>
  );
}

function DialogOverlay({
  className,
  ...props
}: DialogPrimitive.Backdrop.Props) {
  return (
    <DialogPrimitive.Backdrop
      data-slot="dialog-overlay"
      className={cn(
        "data-open:animate-in data-closed:animate-out data-closed:fade-out-0 data-open:fade-in-0 fixed inset-0 isolate z-50 bg-black/10 duration-100 supports-backdrop-filter:backdrop-blur-xs",
        className,
      )}
      {...props}
    />
  );
}

function DialogContent({
  className,
  children,
  showCloseButton = true,
  onEscapeKeyDown,
  onPointerDownOutside,
  onInteractOutside,
  onOpenAutoFocus,
  ...props
}: DialogPrimitive.Popup.Props & {
  showCloseButton?: boolean;
  onEscapeKeyDown?: DismissHandler;
  onPointerDownOutside?: DismissHandler;
  onInteractOutside?: DismissHandler;
  onOpenAutoFocus?: DismissHandler;
}) {
  const dismissHandlersRef = React.useContext(DialogDismissContext);
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

  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Popup
        data-slot="dialog-content"
        className={cn(
          "bg-background data-open:animate-in data-closed:animate-out data-closed:fade-out-0 data-open:fade-in-0 data-closed:zoom-out-95 data-open:zoom-in-95 ring-foreground/10 fixed top-1/2 left-1/2 z-50 grid w-full max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 gap-4 rounded-xl p-4 text-sm ring-1 duration-100 outline-none sm:max-w-sm md:max-w-2xl md:p-6",
          className,
        )}
        finalFocus={false}
        initialFocus={onOpenAutoFocus ? false : undefined}
        onKeyDown={(e) => {
          e.stopPropagation();
        }}
        {...props}
      >
        {children}
        {showCloseButton && (
          <DialogPrimitive.Close
            data-slot="dialog-close"
            render={
              <Button
                variant="ghost"
                className="absolute inset-e-2 top-2"
                size="icon"
              />
            }
          >
            <XIcon />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Popup>
    </DialogPortal>
  );
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-header"
      className={cn("flex flex-col gap-2", className)}
      {...props}
    />
  );
}

function DialogFooter({
  className,
  showCloseButton = false,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  showCloseButton?: boolean;
}) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        "bg-muted/50 border-border -mx-4 -mb-4 flex flex-col-reverse gap-2 rounded-b-xl border-t p-4 sm:flex-row sm:justify-end md:-mx-6 md:-mb-6 md:px-6",
        className,
      )}
      {...props}
    >
      {children}
      {showCloseButton && (
        <DialogPrimitive.Close render={<Button variant="outline" />}>
          Close
        </DialogPrimitive.Close>
      )}
    </div>
  );
}

function DialogTitle({ className, ...props }: DialogPrimitive.Title.Props) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn("text-base leading-none font-medium", className)}
      {...props}
    />
  );
}

function DialogDescription({
  className,
  ...props
}: DialogPrimitive.Description.Props) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn(
        "text-muted-foreground *:[a]:hover:text-foreground text-sm *:[a]:underline *:[a]:underline-offset-3",
        className,
      )}
      {...props}
    />
  );
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
};
