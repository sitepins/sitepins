"use client";

import { logger } from "@/lib/logger";
import { cn } from "@/lib/utils/cn";
import { useOwnerPlan } from "@/hooks/use-owner-plan";
import { useSnippets } from "@/hooks/use-snippets";
import { MarkdownPlugin } from "@platejs/markdown";
import { Plus, Trash } from "lucide-react";
import type { TElement } from "platejs";
import { useEditorRef } from "platejs/react";
import { useMemo, useState } from "react";
import { SnippetSaveDialog } from "./snippet-save-dialog";

interface SnippetControlsProps {
  element: TElement & { code?: string };
  onDelete?: () => void;
  isBlock?: boolean;
  className?: string;
  code?: string;
  extraControls?: React.ReactNode;
}

export function SnippetControls({
  element,
  onDelete,
  isBlock = true,
  className = "",
  code: codeProp,
  extraControls,
}: SnippetControlsProps) {
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const { snippets } = useSnippets();
  const editor = useEditorRef();
  const { canAccessProFeatures } = useOwnerPlan();

  // Determine the content/code of the current element
  const code = useMemo(() => {
    if (codeProp !== undefined) return codeProp;
    if (typeof element.code === "string" && element.code) return element.code;

    try {
      const api = editor.getApi(MarkdownPlugin);
      // Serialize just this node to get its markdown representation
      const serialized = api.markdown.serialize({ value: [element] });
      return serialized;
    } catch (e) {
      logger.error("Failed to serialize snippet node:", e);
      const fallback = element.value ?? element.content;
      return typeof fallback === "string" ? fallback : "";
    }
  }, [codeProp, element, editor]);

  // Check if this code already exists in snippets
  // We compare normalized strings to avoid whitespace issues if possible
  const normalizeCode = (str: string) => {
    return str
      .replace(/[\u200B-\u200D\uFEFF]/g, "") // Remove zero-width spaces and other invisible chars
      .trim()
      .replace(/\r\n/g, "\n")
      .replace(/[ \t]+/g, " ") // Normalize horizontal whitespace
      .replace(/\n+/g, "\n"); // Collapse multiple newlines
  };

  const getTag = (str: string) => {
    const trimmed = str.trim();
    // Hugo: {{< tag ... >}} or {{% tag ... %}}
    const hugoMatch = trimmed.match(/^\{\{[<%]\s*([a-zA-Z0-9_-]+)/);
    if (hugoMatch) return hugoMatch[1];

    // JSX/HTML: <tag ... >
    const htmlMatch = trimmed.match(/^<([a-zA-Z0-9_-]+)/);
    if (htmlMatch) return htmlMatch[1];

    return null;
  };

  const exists = snippets.some((s) => {
    const normalizedTarget = normalizeCode(code || "");
    const normalizedSnippet = normalizeCode(s.code);

    if (normalizedTarget === normalizedSnippet) return true;

    const targetTag = getTag(normalizedTarget);
    const snippetTag = getTag(normalizedSnippet);

    if (targetTag && snippetTag && targetTag === snippetTag) return true;

    return false;
  });

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onDelete) {
      onDelete();
      return;
    }

    const path = editor.api.findPath(element);
    if (path) {
      editor.tf.removeNodes({ at: path });
    }
  };

  return (
    <div
      className={cn(
        "flex shrink-0 items-center gap-0.5",
        isBlock
          ? // Sits in the block header row, so it never covers the tag text.
            "ms-auto -me-1"
          : // Floats above the inline chip; revealed on hover, focus or selection.
            "bg-background border-border invisible absolute inset-e-0 bottom-full z-20 mb-1 rounded-md border p-0.5 opacity-0 shadow-sm transition-opacity group-focus-within/snippet:visible group-focus-within/snippet:opacity-100 group-hover/snippet:visible group-hover/snippet:opacity-100 group-data-[selected=true]/snippet:visible group-data-[selected=true]/snippet:opacity-100 after:absolute after:inset-x-0 after:top-full after:h-1.5 after:content-['']",
        className,
      )}
      contentEditable={false}
    >
      {extraControls}
      {canAccessProFeatures && !exists && code && (
        <>
          <button
            type="button"
            aria-label="Save as snippet"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              setShowSaveDialog(true);
            }}
            className="text-muted-foreground hover:bg-primary/10 hover:text-primary rounded-sm p-1 transition-colors"
          >
            <Plus className="size-3.5" />
          </button>
          <SnippetSaveDialog
            open={showSaveDialog}
            onOpenChange={setShowSaveDialog}
            code={code}
            onSuccess={() => setShowSaveDialog(false)}
          />
        </>
      )}

      <button
        type="button"
        aria-label="Delete block"
        onMouseDown={(e) => e.stopPropagation()}
        onClick={handleDelete}
        className="text-muted-foreground hover:bg-destructive hover:text-destructive-foreground rounded-sm p-1 transition-colors"
      >
        <Trash className="size-3.5" />
      </button>
    </div>
  );
}
