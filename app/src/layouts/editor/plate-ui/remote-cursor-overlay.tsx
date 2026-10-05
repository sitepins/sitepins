"use client";

import { YjsPlugin } from "@platejs/yjs/react";
import {
  type CursorOverlayData,
  useRemoteCursorOverlayPositions,
} from "@slate-yjs/react";
import { usePluginOption, useValueVersion } from "platejs/react";
import * as React from "react";

export function RemoteCursorOverlay() {
  const isSynced = usePluginOption(YjsPlugin, "_isSynced");
  const valueVersion = useValueVersion();

  if (!isSynced) {
    return null;
  }

  return (
    <CaretBoundary resetKey={valueVersion}>
      <RemoteCursorOverlayContent />
    </CaretBoundary>
  );
}

/**
 * A caret can briefly point past the end of text that just changed, and
 * slate-yjs throws while measuring it. Skip the carets until the next change
 * rather than take the editor down.
 */
class CaretBoundary extends React.Component<
  { resetKey: unknown; children?: React.ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidUpdate(previous: { resetKey: unknown }) {
    if (this.state.failed && previous.resetKey !== this.props.resetKey) {
      this.setState({ failed: false });
    }
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}

function RemoteCursorOverlayContent() {
  const valueVersion = useValueVersion();
  // Carets are laid out in Plate's inner wrapper, not the padded editor
  // container, so measure against whatever element actually positions them.
  const [layoutElement, setLayoutElement] =
    React.useState<HTMLDivElement | null>(null);
  const anchorRef = React.useCallback((node: HTMLDivElement | null) => {
    setLayoutElement((node?.offsetParent as HTMLDivElement | null) ?? null);
  }, []);
  // The hook skips measuring while `current` is null.
  const layoutRef = React.useMemo(
    () => ({ current: layoutElement }) as React.RefObject<HTMLDivElement>,
    [layoutElement],
  );
  const [cursors, refresh] = useRemoteCursorOverlayPositions<CursorData>({
    containerRef: layoutRef,
  });

  React.useEffect(() => {
    refresh();
  }, [refresh, valueVersion]);

  return (
    <>
      <div
        ref={anchorRef}
        aria-hidden
        className="pointer-events-none absolute"
      />
      {cursors.map((cursor) => (
        <RemoteSelection key={cursor.clientId} {...cursor} />
      ))}
    </>
  );
}

function RemoteSelection({
  caretPosition,
  data,
  selectionRects,
}: CursorOverlayData<CursorData>) {
  if (!data) {
    return null;
  }

  const selectionStyle: React.CSSProperties = {
    // Add a opacity to the background color
    backgroundColor: addAlpha(data.color, 0.5),
  };

  return (
    <>
      {selectionRects.map((position, i) => (
        <div
          key={i}
          className="pointer-events-none absolute"
          style={{ ...selectionStyle, ...position }}
        />
      ))}
      {caretPosition && <Caret data={data} caretPosition={caretPosition} />}
    </>
  );
}

type CursorData = {
  color: string;
  name: string;
};

const cursorOpacity = 0.7;
const hoverOpacity = 1;

function Caret({
  caretPosition,
  data,
}: Pick<CursorOverlayData<CursorData>, "caretPosition" | "data">) {
  const [isHover, setIsHover] = React.useState(false);

  const handleMouseEnter = () => {
    setIsHover(true);
  };
  const handleMouseLeave = () => {
    setIsHover(false);
  };
  const caretStyle: React.CSSProperties = {
    ...caretPosition,
    background: data?.color,
    opacity: cursorOpacity,
    transition: "opacity 0.2s",
  };
  const caretStyleHover = { ...caretStyle, opacity: hoverOpacity };

  const labelStyle: React.CSSProperties = {
    background: data?.color,
    opacity: cursorOpacity,
    transform: "translateY(-100%)",
    transition: "opacity 0.2s",
  };
  const labelStyleHover = { ...labelStyle, opacity: hoverOpacity };

  return (
    <div
      className="absolute w-0.5"
      style={isHover ? caretStyleHover : caretStyle}
    >
      <div
        className="absolute top-0 rounded rounded-bl-none px-1.5 py-0.5 text-xs whitespace-nowrap text-white"
        style={isHover ? labelStyleHover : labelStyle}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        {data?.name}
      </div>
    </div>
  );
}

function addAlpha(hexColor: string, opacity: number): string {
  const normalized = Math.round(Math.min(Math.max(opacity, 0), 1) * 255);

  return hexColor + normalized.toString(16).padStart(2, "0").toUpperCase();
}
