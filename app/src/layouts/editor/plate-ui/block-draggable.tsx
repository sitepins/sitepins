"use client";

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils/cn";
import { useDraggable, useDropLine } from "@platejs/dnd";
import { expandListItemsWithChildren } from "@platejs/list";
import { BlockSelectionPlugin } from "@platejs/selection/react";
import { GripVertical } from "lucide-react";
import { type TElement, getPluginByType, isType, KEYS } from "platejs";
import {
  type PlateEditor,
  type PlateElementProps,
  type RenderNodeWrapper,
  MemoizedChildren,
  useEditorRef,
} from "platejs/react";
import * as React from "react";
import { useDragLayer } from "react-dnd";

export function CustomDragLayer() {
  const { isDragging, item, currentOffset } = useDragLayer((monitor) => ({
    item: monitor.getItem() as {
      element?: TElement;
      editor?: PlateEditor;
      id?: string | string[];
    } | null,
    currentOffset: monitor.getClientOffset(),
    isDragging: monitor.isDragging(),
  }));

  if (!isDragging || !currentOffset || !item?.element) {
    return null;
  }

  const text = (item.element.children as Array<{ text?: string }>)
    ?.map((c) => c.text || "")
    .join("")
    .trim();

  return (
    <div className="pointer-events-none fixed inset-0 z-9999 overflow-hidden select-none">
      <div
        style={{
          transform: `translate3d(${currentOffset.x + 14}px, ${currentOffset.y + 10}px, 0)`,
        }}
        className="border-border/80 bg-background/95 text-foreground inline-flex max-w-100 items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-medium shadow-2xl backdrop-blur-md"
      >
        <GripVertical className="text-muted-foreground size-3.5 shrink-0" />
        <span className="truncate">{text || item.element.type || "Block"}</span>
      </div>
    </div>
  );
}

type ActiveDragBlock = {
  element: TElement;
  top: number;
  isDragging?: boolean;
  isInColumn?: boolean;
};

type DragHandleContextValue = {
  activeBlock: ActiveDragBlock | null;
  setActiveBlock: (block: ActiveDragBlock | null) => void;
  clearActiveBlock: () => void;
  isVisible: boolean;
  setIsVisible: (visible: boolean) => void;
  wrapperRef: React.RefObject<HTMLDivElement | null>;
};

const DragHandleContext = React.createContext<DragHandleContextValue | null>(
  null,
);

export function useDragHandleContext() {
  return React.useContext(DragHandleContext);
}

export function DragHandleProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [activeBlock, setActiveBlockState] =
    React.useState<ActiveDragBlock | null>(null);
  const [isVisible, setIsVisible] = React.useState(false);
  const hideTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapperRef = React.useRef<HTMLDivElement | null>(null);

  const clearActiveBlock = React.useCallback(() => {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => {
      setIsVisible(false);
    }, 200);
  }, []);

  const setActiveBlock = React.useCallback(
    (block: ActiveDragBlock | null) => {
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current);
        hideTimerRef.current = null;
      }
      if (block) {
        setActiveBlockState(block);
        setIsVisible(true);
      } else {
        clearActiveBlock();
      }
    },
    [clearActiveBlock],
  );

  return (
    <DragHandleContext.Provider
      value={{
        activeBlock,
        setActiveBlock,
        clearActiveBlock,
        isVisible,
        setIsVisible,
        wrapperRef,
      }}
    >
      <div
        ref={wrapperRef}
        className="relative"
        onMouseLeave={clearActiveBlock}
      >
        <FloatingDragHandle />
        {children}
      </div>
    </DragHandleContext.Provider>
  );
}

function FloatingDragHandle() {
  const ctx = useDragHandleContext();
  const activeBlock = ctx?.activeBlock;
  const isVisible = ctx?.isVisible ?? false;

  if (!activeBlock) return null;

  return (
    <div
      className={cn(
        "pointer-events-auto absolute top-0 left-0.5 z-20 touch-none select-none sm:left-1",
        "transition-transform duration-150 ease-out",
        isVisible && !activeBlock.isDragging
          ? "opacity-100"
          : "pointer-events-none opacity-0 transition-opacity duration-150",
      )}
      style={{
        transform: `translate3d(0, ${activeBlock.top}px, 0)`,
      }}
      onMouseEnter={() => {
        ctx?.setIsVisible(true);
      }}
    >
      <div className="flex h-6 w-4.5 touch-none items-center justify-center">
        <DragHandleButton element={activeBlock.element} />
      </div>
    </div>
  );
}

function DragHandleButton({ element }: { element: TElement }) {
  const editor = useEditorRef();
  const blockSelectionApi = editor.getApi(BlockSelectionPlugin).blockSelection;

  const { handleRef } = useDraggable({
    element,
    preview: { disable: true },
    onDropHandler: (_, { dragItem }) => {
      const id = (dragItem as { id: string[] | string }).id;

      if (blockSelectionApi) {
        blockSelectionApi.add(id);
      }
    },
  });

  return (
    <Button
      ref={handleRef}
      variant="ghost"
      className="h-6 w-full touch-none p-0 transition-transform duration-150 ease-out select-none hover:scale-105 hover:bg-transparent active:scale-95"
      data-plate-prevent-deselect
    >
      <DragHandleContent editor={editor} element={element} />
    </Button>
  );
}

const UNDRAGGABLE_KEYS = [KEYS.column, KEYS.tr, KEYS.td];

export const BlockDraggable: RenderNodeWrapper = (props) => {
  const { editor, element, path } = props;

  const isEnabled = React.useMemo(() => {
    if (editor.dom.readOnly) return false;

    if (path.length === 1 && !isType(editor, element, UNDRAGGABLE_KEYS)) {
      return true;
    }
    if (path.length === 3 && !isType(editor, element, UNDRAGGABLE_KEYS)) {
      const block = editor.api.some({
        at: path,
        match: {
          type: editor.getType(KEYS.column),
        },
      });

      if (block) {
        return true;
      }
    }
    if (path.length === 4 && !isType(editor, element, UNDRAGGABLE_KEYS)) {
      const block = editor.api.some({
        at: path,
        match: {
          type: editor.getType(KEYS.table),
        },
      });

      if (block) {
        return true;
      }
    }

    return false;
  }, [editor, element, path]);

  if (!isEnabled) return;

  return Object.assign((p: PlateElementProps) => <Draggable {...p} />, {
    displayName: "DraggableComponent",
  });
};

function Draggable(props: PlateElementProps) {
  const { children, editor, element, path } = props;
  const dragHandleCtx = useDragHandleContext();

  const { isDragging, nodeRef } = useDraggable({
    element,
    preview: { disable: true },
  });

  const isInColumn = path.length === 3;
  const isInTable = path.length === 4;

  const activateBlock = () => {
    if (isInTable) return;
    if (dragHandleCtx) {
      const top = calcBlockTop(
        editor,
        element,
        dragHandleCtx.wrapperRef.current,
      );
      dragHandleCtx.setActiveBlock({
        element,
        top,
        isDragging,
        isInColumn,
      });
    }
  };

  return (
    <div
      className={cn(
        "relative",
        isDragging && "opacity-50",
        getPluginByType(editor, element.type)?.node.isContainer
          ? "group/container"
          : "group",
      )}
      onMouseEnter={activateBlock}
      onPointerDown={activateBlock}
      onTouchStart={activateBlock}
    >
      <div
        ref={nodeRef}
        className="slate-blockWrapper flow-root"
        onContextMenu={(event) =>
          editor
            .getApi(BlockSelectionPlugin)
            .blockSelection.addOnContextMenu({ element, event })
        }
      >
        <MemoizedChildren>{children}</MemoizedChildren>
        <DropLine />
      </div>
    </div>
  );
}

const DragHandleContent = React.memo(function DragHandleContent({
  editor,
  element,
}: {
  editor: PlateEditor;
  element: TElement;
}) {
  const handleStartDrag = (
    e: React.MouseEvent<HTMLElement> | React.TouchEvent<HTMLElement>,
  ) => {
    if ("button" in e && ((e.button !== 0 && e.button !== 2) || e.shiftKey)) {
      return;
    }

    const blockSelection = editor
      .getApi(BlockSelectionPlugin)
      .blockSelection.getNodes({ sort: true });

    let selectionNodes =
      blockSelection.length > 0
        ? blockSelection
        : editor.api.blocks({ mode: "highest" });

    // If current block is not in selection, use it as the starting point
    if (!selectionNodes.some(([node]) => node.id === element.id)) {
      const path = editor.api.findPath(element);

      if (path) {
        selectionNodes = [[element, path]];
      }
    }

    // Process selection nodes to include list children
    const blocks = expandListItemsWithChildren(editor, selectionNodes).map(
      ([node]) => node,
    );

    if (blockSelection.length === 0) {
      try {
        editor.tf?.blur?.();
        editor.tf?.collapse?.();
      } catch {
        // Ignore blur/collapse errors during DnD start
      }
    }

    editor
      .getApi(BlockSelectionPlugin)
      .blockSelection.set(blocks.map((block) => block.id as string));
  };

  return (
    <TooltipProvider delay={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className="text-muted-foreground/60 hover:bg-accent/80 hover:text-foreground flex size-full cursor-grab touch-none items-center justify-center rounded-sm transition-colors duration-150 select-none active:cursor-grabbing"
            onClick={(e) => {
              e.preventDefault();
              editor.getApi(BlockSelectionPlugin).blockSelection.focus();
            }}
            onMouseDown={handleStartDrag}
            onTouchStart={handleStartDrag}
            data-plate-prevent-deselect
            role="button"
          >
            <GripVertical className="size-4" />
          </div>
        </TooltipTrigger>
        <TooltipContent>Drag to move</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
});

const DropLine = React.memo(function DropLine({
  className,
  ...props
}: React.ComponentProps<"div">) {
  const { dropLine } = useDropLine();

  if (!dropLine) return null;

  return (
    <div
      {...props}
      className={cn(
        "slate-dropLine",
        "absolute inset-x-0 h-0.5 opacity-100 transition-opacity",
        "bg-accent/50",
        dropLine === "top" && "-top-px",
        dropLine === "bottom" && "-bottom-px",
        className,
      )}
    />
  );
});

const safeToDOMNode = (
  editor: PlateEditor,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  node: any,
): HTMLElement | null => {
  try {
    return editor.api.toDOMNode(node) ?? null;
  } catch {
    return null;
  }
};

const calcBlockTop = (
  editor: PlateEditor,
  element: TElement,
  providerEl: HTMLElement | null,
): number => {
  const child = safeToDOMNode(editor, element);
  if (!child) return 0;

  if (providerEl) {
    const childRect = child.getBoundingClientRect();
    const providerRect = providerEl.getBoundingClientRect();

    const style = window.getComputedStyle(child);
    const paddingTop = parseFloat(style.paddingTop) || 0;
    let lineHeight = parseFloat(style.lineHeight);
    if (isNaN(lineHeight)) {
      const fontSize = parseFloat(style.fontSize) || 16;
      lineHeight = fontSize * 1.35;
    }
    const buttonHeight = 24;
    const verticalOffset = paddingTop + (lineHeight - buttonHeight) / 2;

    return Math.round(childRect.top - providerRect.top + verticalOffset);
  }

  return (child as HTMLElement).offsetTop || 0;
};
