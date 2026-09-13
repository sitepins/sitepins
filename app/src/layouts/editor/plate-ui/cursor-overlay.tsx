"use client";

import { cn } from "@/lib/utils/cn";
import { AIChatPlugin } from "@platejs/ai/react";
import {
  type CursorData,
  type CursorOverlayState,
  useCursorOverlay,
} from "@platejs/selection/react";
import { RangeApi } from "platejs";
import { useEditorRef, usePluginOption } from "platejs/react";
import * as React from "react";

export function CursorOverlay() {
  const { cursors } = useCursorOverlay();
  const [containerEl, setContainerEl] = React.useState<HTMLDivElement | null>(
    null,
  );

  if (!cursors || cursors.length === 0) return null;

  return (
    <div
      ref={setContainerEl}
      className="pointer-events-none absolute inset-0 z-10 overflow-visible"
    >
      {cursors.map((cursor) => (
        <Cursor key={cursor.id} containerEl={containerEl} {...cursor} />
      ))}
    </div>
  );
}

function Cursor({
  id,
  caretPosition,
  containerEl,
  data,
  selection,
  selectionRects,
}: CursorOverlayState<CursorData> & {
  containerEl: HTMLDivElement | null;
}) {
  const editor = useEditorRef();
  const streaming = usePluginOption(AIChatPlugin, "streaming");
  const { style, selectionStyle = style } = data ?? ({} as CursorData);
  const isCursor = RangeApi.isCollapsed(selection);

  const [version, setVersion] = React.useState(0);

  React.useEffect(() => {
    const handleUpdate = () => {
      setVersion((v) => v + 1);
    };

    window.addEventListener("scroll", handleUpdate, true);
    window.addEventListener("resize", handleUpdate);

    return () => {
      window.removeEventListener("scroll", handleUpdate, true);
      window.removeEventListener("resize", handleUpdate);
    };
  }, []);

  const exactRects = React.useMemo(() => {
    void version;
    if (!selection || isCursor || !containerEl) {
      return null;
    }

    try {
      const domRange = editor.api.toDOMRange(selection);
      if (!domRange) return null;

      const clientRects = domRange.getClientRects();
      if (!clientRects || clientRects.length === 0) return null;

      const containerRect = containerEl.getBoundingClientRect();
      const calculated: Array<{
        left: number;
        top: number;
        width: number;
        height: number;
      }> = [];

      for (let i = 0; i < clientRects.length; i++) {
        const r = clientRects.item(i);
        if (!r || r.width <= 0 || r.height <= 0) continue;

        calculated.push({
          left: r.left - containerRect.left,
          top: r.top - containerRect.top,
          width: r.width,
          height: r.height,
        });
      }

      return calculated.length > 0 ? calculated : null;
    } catch {
      return null;
    }
  }, [editor, selection, isCursor, containerEl, version]);

  if (streaming) return null;

  const rectsToRender = exactRects ?? selectionRects;

  return (
    <>
      {rectsToRender.map((position, i) => {
        return (
          <div
            key={i}
            className={cn(
              "pointer-events-none absolute z-10",
              id === "selection" && "bg-accent/25",
              id === "selection" && isCursor && "bg-primary",
            )}
            style={{
              ...selectionStyle,
              ...position,
            }}
          />
        );
      })}
      {caretPosition && (
        <div
          className={cn(
            "pointer-events-none absolute z-10 w-0.5",
            id === "drag" && "bg-accent w-px",
          )}
          style={{ ...caretPosition, ...style }}
        />
      )}
    </>
  );
}
