"use client";

import { useDebouncedCallback } from "@/hooks/use-debounce-callback";
import { useIsMobile } from "@/hooks/use-mobile";
import type {
  CodeDrawingType,
  TCodeDrawingElement,
} from "@platejs/code-drawing";
import {
  DEFAULT_MIN_HEIGHT,
  RENDER_DEBOUNCE_DELAY,
  renderCodeDrawing,
} from "@platejs/code-drawing";
import mermaid from "mermaid";
import type { PlateElementProps } from "platejs/react";
import * as React from "react";

async function validateMermaidSyntax(code: string): Promise<boolean> {
  try {
    await mermaid.parse(code);
    return true;
  } catch {
    return false;
  }
}

function useCodeDrawingElement({ element }: { element: TCodeDrawingElement }) {
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [image, setImage] = React.useState<string>("");

  const lastRequestRef = React.useRef(0);

  // Debounced render when code or type changes
  const debouncedRender = useDebouncedCallback(
    async (code: string | undefined, drawingType: string | undefined) => {
      lastRequestRef.current += 1;
      const requestId = lastRequestRef.current;

      if (!code || !code.trim() || !drawingType) {
        setImage("");
        setLoading(false);
        setError(null);
        return;
      }

      const isValid = await validateMermaidSyntax(code);
      if (!isValid) {
        setError("Invalid Mermaid syntax");
        setLoading(false);
        return; // Don't render — prevents the body injection html error
      }

      setLoading(true);
      setError(null);

      try {
        const imageData = await renderCodeDrawing(
          drawingType as CodeDrawingType,
          code,
        );

        // Only update if this is still the latest request
        if (lastRequestRef.current === requestId) {
          setImage(imageData);
          setError(null);
        }
      } catch (err) {
        console.log({ debug: err });
        if (lastRequestRef.current === requestId) {
          setError(err instanceof Error ? err.message : "Rendering failed");
          setImage("");
        }
      } finally {
        if (lastRequestRef.current === requestId) {
          setLoading(false);
        }
      }
    },
    RENDER_DEBOUNCE_DELAY,
  );

  React.useEffect(() => {
    debouncedRender(element.data?.code, element.data?.drawingType);
  }, [element.data?.code, element.data?.drawingType, debouncedRender]);

  return {
    loading,
    error,
    image,
  };
}

export function CodeDrawingElement(
  props: PlateElementProps<TCodeDrawingElement> & {
    element: TCodeDrawingElement;
  },
) {
  const isMobile = useIsMobile();
  const element = props.element;
  const { image, loading, error } = useCodeDrawingElement({ element });

  const code = element.data?.code ?? "";

  if (error) return null;

  return (
    <div contentEditable={false} className="mt-6">
      <CodeDrawingPreview
        code={code}
        image={image}
        loading={loading}
        isMobile={isMobile}
      />
    </div>
  );
}

function CodeDrawingPreview({
  code,
  image,
  loading,
  isMobile = false,
}: {
  code: string;
  image: string;
  loading: boolean;
  isMobile?: boolean;
}) {
  return (
    <div
      className={`flex ${isMobile ? "flex-col-reverse" : "flex-col"} group bg-muted/50 border-border my-4 w-full items-stretch border md:flex-row`}
      style={{
        minHeight: `${DEFAULT_MIN_HEIGHT}px`,
      }}
    >
      <CodeDrawingPreviewArea
        image={image}
        loading={loading}
        code={code}
        isMobile={isMobile}
      />
    </div>
  );
}

function CodeDrawingPreviewArea({
  image,
  loading,
  code,
  isMobile = false,
}: {
  image: string;
  loading: boolean;
  code: string;
  isMobile?: boolean;
}) {
  return (
    <div
      className={`border-border flex min-w-0 flex-1 flex-col ${isMobile ? "" : "relative"} ${
        isMobile ? "border-b" : ""
      }`}
    >
      <div
        className={
          "bg-muted/30 flex flex-1 items-center justify-center rounded-md p-4"
        }
      >
        {loading && <div className="text-muted-foreground">Loading...</div>}
        {!loading && image && (
          <img
            src={image}
            alt="Code drawing"
            className="max-h-full max-w-full object-contain"
          />
        )}
        {!loading && !image && (
          <div className="text-muted-foreground">
            {code.trim() ? "Rendering..." : "Preview will appear here"}
          </div>
        )}
      </div>
    </div>
  );
}
