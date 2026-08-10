"use client";

import { cn } from "@/lib/utils/cn";
import { Select as SelectPrimitive } from "@base-ui/react/select";
import { CheckIcon, ChevronDownIcon, ChevronUpIcon } from "lucide-react";
import * as React from "react";

type ItemRegistry = {
  register: (value: unknown, label: React.ReactNode) => void;
  unregister: (value: unknown) => void;
  /** Merge without notifying — safe to call during render */
  seed: (entries: Map<unknown, React.ReactNode>) => void;
  /** Notify subscribers if a seed changed anything */
  flush: () => void;
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => Map<unknown, React.ReactNode>;
};

const SelectRegistryContext = React.createContext<ItemRegistry | null>(null);

function extractItemsFromChildren(
  children: React.ReactNode,
  map: Map<unknown, React.ReactNode> = new Map(),
): Map<unknown, React.ReactNode> {
  React.Children.forEach(children, (child) => {
    if (!React.isValidElement(child)) return;

    const props = child.props as {
      value?: unknown;
      label?: React.ReactNode;
      children?: React.ReactNode;
    };

    if (props && props.value !== undefined) {
      const displayLabel = props.label ?? props.children;
      if (displayLabel !== undefined && !map.has(props.value)) {
        map.set(props.value, displayLabel);
      }
    }

    if (props && props.children) {
      extractItemsFromChildren(props.children, map);
    }
  });

  return map;
}

function useItemRegistry(initialChildren?: React.ReactNode) {
  const [registry] = React.useState<ItemRegistry>(() => {
    let items = extractItemsFromChildren(initialChildren);
    let dirty = false;
    const listeners = new Set<() => void>();
    const emit = () => listeners.forEach((l) => l());
    const set = (value: unknown, label: React.ReactNode) => {
      if (items.get(value) === label) return false;
      items = new Map(items).set(value, label);
      return true;
    };

    return {
      register(value: unknown, label: React.ReactNode) {
        if (set(value, label)) emit();
      },
      unregister(value: unknown) {
        if (!items.has(value)) return;
        items = new Map(items);
        items.delete(value);
        emit();
      },
      seed(entries: Map<unknown, React.ReactNode>) {
        entries.forEach((label, value) => {
          if (set(value, label)) dirty = true;
        });
      },
      flush() {
        if (!dirty) return;
        dirty = false;
        emit();
      },
      subscribe(listener: () => void) {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      },
      getSnapshot() {
        return items;
      },
    };
  });

  // Seeding during render must not notify; that would be a setState on
  // SelectValue while Select is still rendering.
  React.useMemo(() => {
    if (initialChildren)
      registry.seed(extractItemsFromChildren(initialChildren));
  }, [initialChildren, registry]);

  React.useEffect(() => {
    registry.flush();
  }, [initialChildren, registry]);

  return registry;
}

type SelectRootProps<Value> = Omit<
  SelectPrimitive.Root.Props<Value>,
  "onValueChange"
> & {
  // Base UI widens this to `Value | null`; radix never emitted null, so the
  // wrapper keeps the narrower contract the call sites were written against.
  onValueChange?: (
    value: Value,
    eventDetails: SelectPrimitive.Root.ChangeEventDetails,
  ) => void;
};

function Select<Value>({
  onValueChange,
  children,
  ...props
}: SelectRootProps<Value>) {
  const registry = useItemRegistry(children);

  return (
    <SelectRegistryContext.Provider value={registry}>
      <SelectPrimitive.Root
        data-slot="select"
        onValueChange={
          onValueChange as SelectPrimitive.Root.Props<Value>["onValueChange"]
        }
        {...props}
      >
        {children}
      </SelectPrimitive.Root>
    </SelectRegistryContext.Provider>
  );
}

function SelectGroup({ className, ...props }: SelectPrimitive.Group.Props) {
  return (
    <SelectPrimitive.Group
      data-slot="select-group"
      className={cn("scroll-my-1 p-1", className)}
      {...props}
    />
  );
}

const emptyMap = new Map<unknown, React.ReactNode>();

function SelectValue({
  children,
  placeholder,
  ...props
}: SelectPrimitive.Value.Props) {
  const registry = React.useContext(SelectRegistryContext);
  const itemsMap = React.useSyncExternalStore(
    registry ? registry.subscribe : () => () => {},
    registry ? registry.getSnapshot : () => emptyMap,
    registry ? registry.getSnapshot : () => emptyMap,
  );

  return (
    <SelectPrimitive.Value
      data-slot="select-value"
      placeholder={placeholder}
      {...props}
    >
      {(selectedValue: unknown) => {
        if (typeof children === "function") {
          return children(selectedValue);
        }
        if (children != null) {
          return children;
        }
        if (
          selectedValue != null &&
          selectedValue !== "" &&
          itemsMap.has(selectedValue)
        ) {
          return itemsMap.get(selectedValue);
        }
        if (placeholder != null) {
          return placeholder;
        }
        return selectedValue as React.ReactNode;
      }}
    </SelectPrimitive.Value>
  );
}

function SelectTrigger({
  className,
  size = "default",
  children,
  ...props
}: SelectPrimitive.Trigger.Props & {
  size?: "sm" | "default";
}) {
  return (
    <SelectPrimitive.Trigger
      data-slot="select-trigger"
      data-size={size}
      className={cn(
        "border-border data-placeholder:text-muted-foreground hover:bg-input/50 aria-invalid:border-destructive flex w-full items-center justify-between gap-1.5 rounded-lg border py-2 pr-2 pl-2.5 text-sm whitespace-nowrap transition-colors outline-none select-none disabled:cursor-not-allowed disabled:opacity-50 data-disabled:cursor-not-allowed data-disabled:opacity-50 data-[size=default]:h-9 data-[size=sm]:h-7 data-[size=sm]:rounded-[min(var(--radius-md),10px)] *:data-[slot=select-value]:line-clamp-1 *:data-[slot=select-value]:flex *:data-[slot=select-value]:items-center *:data-[slot=select-value]:gap-1.5 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon
        render={
          <ChevronDownIcon className="text-muted-foreground pointer-events-none size-4" />
        }
      />
    </SelectPrimitive.Trigger>
  );
}

function SelectContent({
  className,
  children,
  position = "item-aligned",
  align = "center",
  alignOffset,
  side,
  sideOffset,
  ...props
}: SelectPrimitive.Popup.Props &
  Pick<
    SelectPrimitive.Positioner.Props,
    "align" | "alignOffset" | "side" | "sideOffset"
  > & {
    position?: "item-aligned" | "popper";
  }) {
  const alignItemWithTrigger = position === "item-aligned";

  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Positioner
        align={align}
        alignOffset={alignOffset}
        side={side}
        sideOffset={sideOffset}
        alignItemWithTrigger={alignItemWithTrigger}
        className="isolate z-50"
      >
        <SelectPrimitive.Popup
          data-slot="select-content"
          data-align-trigger={alignItemWithTrigger}
          className={cn(
            "bg-background text-text data-open:animate-in data-closed:animate-out data-closed:fade-out-0 data-open:fade-in-0 data-closed:zoom-out-95 data-open:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 ring-foreground/10 relative z-50 max-h-(--available-height) w-(--anchor-width) min-w-36 origin-(--transform-origin) overflow-x-hidden overflow-y-auto rounded-lg shadow-md ring-1 duration-100 data-[align-trigger=true]:animate-none",
            position === "popper" &&
              "data-[side=bottom]:translate-y-1 data-[side=left]:-translate-x-1 data-[side=right]:translate-x-1 data-[side=top]:-translate-y-1",
            className,
          )}
          {...props}
        >
          <SelectScrollUpButton />
          <SelectPrimitive.List
            data-position={position}
            className={cn(
              "data-[position=popper]:h-(--anchor-height) data-[position=popper]:w-full data-[position=popper]:min-w-(--anchor-width)",
            )}
          >
            {children}
          </SelectPrimitive.List>
          <SelectScrollDownButton />
        </SelectPrimitive.Popup>
      </SelectPrimitive.Positioner>
    </SelectPrimitive.Portal>
  );
}

function SelectLabel({
  className,
  ...props
}: SelectPrimitive.GroupLabel.Props) {
  return (
    <SelectPrimitive.GroupLabel
      data-slot="select-label"
      className={cn("text-muted-foreground px-1.5 py-1 text-xs", className)}
      {...props}
    />
  );
}

function SelectItem({
  className,
  children,
  value,
  label,
  ...props
}: SelectPrimitive.Item.Props) {
  const registry = React.useContext(SelectRegistryContext);
  const displayLabel = label ?? children;

  React.useEffect(() => {
    if (registry && value !== undefined) {
      registry.register(value, displayLabel);
      return () => {
        registry.unregister(value);
      };
    }
  }, [registry, value, displayLabel]);

  return (
    <SelectPrimitive.Item
      data-slot="select-item"
      value={value}
      label={typeof displayLabel === "string" ? displayLabel : label}
      className={cn(
        "data-highlighted:bg-light data-highlighted:text-text not-data-[variant=destructive]:data-highlighted:**:text-text relative flex w-full cursor-pointer items-center gap-1.5 rounded-md py-1 pr-8 pl-1.5 text-sm outline-hidden select-none data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 *:[span]:last:flex *:[span]:last:items-center *:[span]:last:gap-2",
        className,
      )}
      {...props}
    >
      <span className="pointer-events-none absolute right-2 flex size-4 items-center justify-center">
        <SelectPrimitive.ItemIndicator>
          <CheckIcon className="pointer-events-none" />
        </SelectPrimitive.ItemIndicator>
      </span>
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
    </SelectPrimitive.Item>
  );
}

function SelectSeparator({
  className,
  ...props
}: SelectPrimitive.Separator.Props) {
  return (
    <SelectPrimitive.Separator
      data-slot="select-separator"
      className={cn("bg-border pointer-events-none -mx-1 my-1 h-px", className)}
      {...props}
    />
  );
}

function SelectScrollUpButton({
  className,
  ...props
}: SelectPrimitive.ScrollUpArrow.Props) {
  return (
    <SelectPrimitive.ScrollUpArrow
      data-slot="select-scroll-up-button"
      className={cn(
        "bg-popover z-10 flex cursor-default items-center justify-center py-1 [&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      {...props}
    >
      <ChevronUpIcon />
    </SelectPrimitive.ScrollUpArrow>
  );
}

function SelectScrollDownButton({
  className,
  ...props
}: SelectPrimitive.ScrollDownArrow.Props) {
  return (
    <SelectPrimitive.ScrollDownArrow
      data-slot="select-scroll-down-button"
      className={cn(
        "bg-popover z-10 flex cursor-default items-center justify-center py-1 [&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      {...props}
    >
      <ChevronDownIcon />
    </SelectPrimitive.ScrollDownArrow>
  );
}

export {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectScrollDownButton,
  SelectScrollUpButton,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
};
