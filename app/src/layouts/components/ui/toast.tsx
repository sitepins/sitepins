"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";
import { Toast as ToastPrimitive } from "@base-ui/react/toast";
import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon,
  XIcon,
} from "lucide-react";
import * as React from "react";

const toastManager = ToastPrimitive.createToastManager();

type ToastType = "success" | "error" | "warning" | "info" | "loading";

type ToastOptions = {
  description?: React.ReactNode;
  duration?: number;
  id?: string;
  onClose?: () => void;
  action?: { label: React.ReactNode; onClick: () => void };
};

function add(
  title: React.ReactNode,
  type: ToastType | undefined,
  options: ToastOptions = {},
) {
  const { description, duration, action, ...rest } = options;
  return toastManager.add({
    ...rest,
    title: title as string,
    description: description as string,
    type,
    timeout: duration,
    actionProps: action
      ? { children: action.label, onClick: action.onClick }
      : undefined,
  });
}

/** sonner-compatible facade over the Base UI toast manager */
const toast = Object.assign(
  (title: React.ReactNode, options?: ToastOptions) =>
    add(title, undefined, options),
  {
    success: (title: React.ReactNode, options?: ToastOptions) =>
      add(title, "success", options),
    error: (title: React.ReactNode, options?: ToastOptions) =>
      add(title, "error", options),
    warning: (title: React.ReactNode, options?: ToastOptions) =>
      add(title, "warning", options),
    info: (title: React.ReactNode, options?: ToastOptions) =>
      add(title, "info", options),
    loading: (title: React.ReactNode, options?: ToastOptions) =>
      add(title, "loading", options),
    dismiss: (id?: string) => toastManager.close(id),
    promise: toastManager.promise,
    add: toastManager.add,
    update: toastManager.update,
    close: toastManager.close,
  },
);

function ToastProvider({ ...props }: ToastPrimitive.Provider.Props) {
  return <ToastPrimitive.Provider {...props} />;
}

function ToastPortal({ ...props }: ToastPrimitive.Portal.Props) {
  return <ToastPrimitive.Portal data-slot="toast-portal" {...props} />;
}

function ToastViewport({ className, ...props }: ToastPrimitive.Viewport.Props) {
  return (
    <ToastPrimitive.Viewport
      data-slot="toast-viewport"
      className={cn(
        "pointer-events-none fixed inset-x-4 bottom-4 z-50 mx-auto w-auto max-w-sm outline-none sm:right-4 sm:left-auto sm:mx-0 sm:w-full",
        className,
      )}
      {...props}
    />
  );
}

function Toast({ className, ...props }: ToastPrimitive.Root.Props) {
  return (
    <ToastPrimitive.Root
      data-slot="toast"
      className={cn(
        "group/toast bg-background text-foreground border-border pointer-events-auto absolute right-0 bottom-0 z-[calc(1000-var(--toast-index))] w-full origin-bottom rounded-lg border shadow-lg will-change-transform outline-none select-none",
        "data-[type=success]:bg-success! data-[type=success]:text-success-foreground! data-[type=success]:border-success!",
        "data-[type=error]:bg-destructive! data-[type=error]:text-destructive-foreground! data-[type=error]:border-destructive!",
        "data-[type=info]:bg-accent! data-[type=info]:text-accent-foreground! data-[type=info]:border-accent!",
        "data-[type=warning]:bg-warning! data-[type=warning]:text-warning-foreground! data-[type=warning]:border-warning!",
        "[--gap:0.75rem] [--height:var(--toast-frontmost-height,var(--toast-height))] [--offset-y:calc(var(--toast-offset-y)*-1+calc(var(--toast-index)*var(--gap)*-1)+var(--toast-swipe-movement-y))] [--peek:0.75rem] [--scale:calc(max(0,1-(var(--toast-index)*0.1)))] [--shrink:calc(1-var(--scale))]",
        "h-(--height) transform-[translateX(var(--toast-swipe-movement-x))_translateY(calc(var(--toast-swipe-movement-y)-(var(--toast-index)*var(--peek))-(var(--shrink)*var(--height))))_scale(var(--scale))] [transition:transform_500ms_cubic-bezier(0.22,1,0.36,1),opacity_500ms,height_150ms]",
        "after:absolute after:top-full after:left-0 after:h-[calc(var(--gap)+1px)] after:w-full after:content-['']",
        "data-expanded:h-(--toast-height) data-expanded:transform-[translateX(var(--toast-swipe-movement-x))_translateY(var(--offset-y))]",
        "data-limited:opacity-0 data-starting-style:transform-[translateY(150%)]",
        "[&[data-ending-style]:not([data-limited]):not([data-swipe-direction])]:transform-[translateY(150%)]",
        "data-ending-style:data-[swipe-direction=down]:transform-[translateY(calc(var(--toast-swipe-movement-y)+150%))]",
        "data-ending-style:data-[swipe-direction=left]:transform-[translateX(calc(var(--toast-swipe-movement-x)-150%))_translateY(var(--offset-y))]",
        "data-ending-style:data-[swipe-direction=right]:transform-[translateX(calc(var(--toast-swipe-movement-x)+150%))_translateY(var(--offset-y))]",
        "data-ending-style:data-[swipe-direction=up]:transform-[translateY(calc(var(--toast-swipe-movement-y)-150%))]",
        className,
      )}
      {...props}
    />
  );
}

function ToastContent({ className, ...props }: ToastPrimitive.Content.Props) {
  return (
    <ToastPrimitive.Content
      data-slot="toast-content"
      className={cn(
        "group-data-[type=success]/toast:text-success-foreground! group-data-[type=error]/toast:text-destructive-foreground! group-data-[type=info]/toast:text-accent-foreground! group-data-[type=warning]/toast:text-warning-foreground! flex h-full items-center gap-3 overflow-hidden p-4 transition-opacity duration-250 data-behind:opacity-0 data-expanded:opacity-100",
        className,
      )}
      {...props}
    />
  );
}

function ToastTitle({ className, ...props }: ToastPrimitive.Title.Props) {
  return (
    <ToastPrimitive.Title
      data-slot="toast-title"
      className={cn(
        "group-data-[type=success]/toast:text-success-foreground! group-data-[type=error]/toast:text-destructive-foreground! group-data-[type=info]/toast:text-accent-foreground! group-data-[type=warning]/toast:text-warning-foreground! text-sm font-medium",
        className,
      )}
      {...props}
    />
  );
}

function ToastDescription({
  className,
  ...props
}: ToastPrimitive.Description.Props) {
  return (
    <ToastPrimitive.Description
      data-slot="toast-description"
      className={cn(
        "group-data-[type=default]/toast:text-muted-foreground group-data-[type=success]/toast:text-success-foreground! group-data-[type=error]/toast:text-destructive-foreground! group-data-[type=info]/toast:text-accent-foreground! group-data-[type=warning]/toast:text-warning-foreground! text-sm opacity-90",
        className,
      )}
      {...props}
    />
  );
}

function ToastAction({
  className,
  render = <Button variant="outline" size="sm" />,
  ...props
}: ToastPrimitive.Action.Props) {
  return (
    <ToastPrimitive.Action
      data-slot="toast-action"
      render={render}
      className={cn("shrink-0", className)}
      {...props}
    />
  );
}

function ToastClose({
  className,
  children,
  render = <Button variant="ghost" size="icon-sm" />,
  ...props
}: ToastPrimitive.Close.Props) {
  return (
    <ToastPrimitive.Close
      data-slot="toast-close"
      aria-label="Close toast"
      render={render}
      className={cn(
        "relative shrink-0 opacity-70 after:absolute after:-inset-2 after:content-[''] hover:opacity-100",
        className,
      )}
      {...props}
    >
      {children ?? <XIcon aria-hidden="true" />}
    </ToastPrimitive.Close>
  );
}

function ToastIcon({ type }: { type: string | undefined }) {
  const icon = {
    success: <CircleCheckIcon className="size-4" />,
    info: <InfoIcon className="size-4" />,
    warning: <TriangleAlertIcon className="size-4" />,
    error: <OctagonXIcon className="size-4" />,
    loading: <Loader2Icon className="size-4 animate-spin" />,
  }[type ?? ""];

  if (!icon) return null;

  return (
    <span
      data-slot="toast-icon"
      className="shrink-0 [&_svg]:pointer-events-none"
    >
      {icon}
    </span>
  );
}

function ToastList() {
  const { toasts } = ToastPrimitive.useToastManager();

  return toasts.map((toastItem) => (
    <Toast
      key={toastItem.id}
      toast={toastItem}
      data-type={toastItem.type ?? "default"}
    >
      <ToastContent>
        <ToastIcon type={toastItem.type} />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <ToastTitle />
          <ToastDescription />
        </div>
        <ToastAction />
        <ToastClose />
      </ToastContent>
    </Toast>
  ));
}

function Toaster({
  children,
  toastManager: manager = toastManager,
  ...props
}: ToastPrimitive.Provider.Props) {
  return (
    <ToastProvider toastManager={manager} {...props}>
      {children}
      <ToastPortal>
        <ToastViewport>
          <ToastList />
        </ToastViewport>
      </ToastPortal>
    </ToastProvider>
  );
}

export {
  Toast,
  toast,
  ToastAction,
  ToastClose,
  ToastContent,
  ToastDescription,
  Toaster,
  toastManager,
  ToastPortal,
  ToastProvider,
  ToastTitle,
  ToastViewport,
};
