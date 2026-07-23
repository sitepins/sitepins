"use client";

import { useOwnerPlan } from "@/hooks/use-owner-plan";
import { useSnippets } from "@/hooks/use-snippets";
import { MarkdownPlugin } from "@platejs/markdown";
import { Plus, Trash } from "lucide-react";
import { useEditorRef } from "platejs/react";
import { useMemo, useState } from "react";
import { SnippetSaveDialog } from "./snippet-save-dialog";

interface SnippetControlsProps {
  element: any;
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
    if (element.code) return element.code;

    try {
      const api = editor.getApi(MarkdownPlugin);
      // Serialize just this node to get its markdown representation
      const serialized = api.markdown.serialize({ value: [element] });
      return serialized;
    } catch (e) {
      console.error("Failed to serialize snippet node:", e);
      return element.value || element.content || "";
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
      className={`bg-light absolute z-50 flex items-center gap-1 rounded-sm p-1 transition-colors ${
        isBlock ? "top-3 right-3" : "-top-8 right-0"
      } ${className}`}
      contentEditable={false}
      style={{ pointerEvents: "all" }}
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
            className="hover:bg-primary/20 text-primary rounded-sm p-1 transition-colors"
          >
            <Plus className={isBlock ? "size-4" : "size-3"} />
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
        className="hover:bg-destructive hover:text-destructive-foreground text-primary rounded-sm p-1 transition-colors"
      >
        <Trash className={isBlock ? "size-4" : "size-3"} />
      </button>
    </div>
  );
}
