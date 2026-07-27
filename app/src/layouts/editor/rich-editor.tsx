import { useDebouncedCallback } from "@/hooks/use-debounce-callback";
import useMounted from "@/hooks/use-mounted";
import { authClient } from "@/lib/auth/auth-client";
import { setCursorOffset, setRawMode } from "@/redux/features/config/slice";
import { useAppDispatch, useAppSelector } from "@/redux/store";
import { MarkdownPlugin } from "@platejs/markdown";
import { YjsPlugin } from "@platejs/yjs/react";
import { useTranslations } from "next-intl";
import { usePathname } from "next/navigation";
import { TElement } from "platejs";
import { Plate, usePlateEditor } from "platejs/react";
import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { AiUpgrade } from "./plate-ui/ai-upgrade";
import { Editor, EditorContainer } from "./plate-ui/editor";
import { EditorKit, MyEditor } from "./plugins/editor-kit";
import { YjsKit } from "./plugins/yjs.kit";
import { RichTextType } from "./utils/plate-types";

const CURSOR_MARKER = "\uE000"; // Private Use Area character as a marker

type RichEditorProps = RichTextType & {
  onUpdateMarkdown: (content: string) => void;
  markdownContent: string;
  isMobile?: boolean;
  onUpdateContentRef: (content: string) => void;
};

const colors = [
  "#f87171",
  "#fb923c",
  "#fbbf24",
  "#a3e635",
  "#4ade80",
  "#2dd4bf",
  "#22d3ee",
  "#38bdf8",
  "#818cf8",
  "#a78bfa",
  "#c084fc",
  "#e879f9",
  "#f472b6",
  "#fb7185",
];

const getColor = () => {
  return colors[Math.floor(Math.random() * colors.length)];
};

export const RichEditor = ({
  markdownContent,
  isMobile,
  onUpdateMarkdown,
  onUpdateContentRef,
}: RichEditorProps) => {
  const tEditorRich = useTranslations("editor.rich");
  const dispatch = useAppDispatch();
  const { cursorOffset, isRawMode } = useAppSelector((state) => state.config);
  const mounted = useMounted();
  const pathname = usePathname();
  const { data: session } = authClient.useSession();
  const selectionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isAliveRef = useRef(true);

  useEffect(() => {
    isAliveRef.current = true;
    return () => {
      isAliveRef.current = false;
      if (selectionTimerRef.current) {
        clearTimeout(selectionTimerRef.current);
        selectionTimerRef.current = null;
      }
      if (scrollTimerRef.current) {
        clearTimeout(scrollTimerRef.current);
        scrollTimerRef.current = null;
      }
    };
  }, []);

  const editor = usePlateEditor({
    plugins: [
      ...EditorKit,
      ...YjsKit({
        name: session?.user?.full_name || "Anonymous",
        color: getColor(),
        document_id: pathname,
      }),
    ],
    value: (editorRef: any) => {
      try {
        const plateContent = editorRef
          .getApi(MarkdownPlugin)
          .markdown.deserialize(markdownContent);
        return plateContent.length > 0
          ? plateContent
          : [
              {
                children: [{ text: "" }],
                type: "p",
              },
            ];
      } catch (error) {
        toast.error(tEditorRich("error_parsing"));
        dispatch(setRawMode(true));
        return [
          {
            children: [{ text: "" }],
            type: "p",
          },
        ];
      }
    },
    // skipInitialization: true,
  });

  useEffect(() => {
    // Ensure component is mounted and editor is ready
    if (!mounted) return;

    const documentId = pathname || "";
    const initialValue = editor
      .getApi(MarkdownPlugin)
      .markdown.deserialize(markdownContent);

    // Initialize Yjs connection, sync document, and set initial editor state
    editor.getApi(YjsPlugin).yjs.init({
      id: documentId, // Unique identifier for the Yjs document
      value: initialValue, // Initial content if the Y.Doc is empty
    });

    // Clean up: Destroy connection when component unmounts
    return () => {
      editor.getApi(YjsPlugin).yjs.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, mounted, pathname]);

  const isRemoteUpdate = useRef(false);
  // Track actual raw→rich transitions; initialized to current value so the
  // initial mount run (and StrictMode's double-invoke) never triggers a sync.
  const prevIsRawMode = useRef(isRawMode);

  // Sync cursor from Redux to Plate — only on genuine raw → rich transitions
  useEffect(() => {
    const wasRawMode = prevIsRawMode.current;
    prevIsRawMode.current = isRawMode;

    // Guard: only run when actually switching FROM raw TO rich
    if (!(wasRawMode === true && !isRawMode)) return;
    if (!editor || cursorOffset === undefined) return;

    // 1. Insert marker in markdown to find cursor position
    const mdWithMarker =
      markdownContent.slice(0, cursorOffset) +
      CURSOR_MARKER +
      markdownContent.slice(cursorOffset);

    try {
      const nodesWithMarker = editor
        .getApi(MarkdownPlugin)
        .markdown.deserialize(mdWithMarker);

      const cleanNodes = editor
        .getApi(MarkdownPlugin)
        .markdown.deserialize(markdownContent);

      const newChildren =
        cleanNodes.length > 0
          ? cleanNodes
          : [{ children: [{ text: "" }], type: "p" }];

      // 2. Replace content using proper Slate transforms so internal state
      //    (WeakMaps, normalization, etc.) stays consistent. Direct mutation
      //    of editor.children corrupts Slate internals and breaks selections.
      isRemoteUpdate.current = true;

      editor.tf.withoutNormalizing(() => {
        // Remove all existing nodes (in reverse to keep indices valid)
        for (let i = editor.children.length - 1; i >= 0; i--) {
          editor.tf.removeNodes({ at: [i] });
        }
        // Insert new nodes
        newChildren.forEach((node: any, i: number) => {
          editor.tf.insertNodes(node, { at: [i] });
        });
      });

      // 3. Find marker in the nodes-with-marker tree
      let markerOffset = 0;
      const findMarker = (nodes: any[], path: number[]): number[] | null => {
        for (let i = 0; i < nodes.length; i++) {
          const node = nodes[i];
          const currentPath = [...path, i];
          if (node.text && node.text.includes(CURSOR_MARKER)) {
            markerOffset = node.text.indexOf(CURSOR_MARKER);
            return currentPath;
          }
          if (node.children) {
            const found = findMarker(node.children, currentPath);
            if (found) return found;
          }
        }
        return null;
      };

      const markerPath = findMarker(nodesWithMarker, []);

      // Validate path exists in new editor children
      let isValidPath = false;
      if (markerPath) {
        isValidPath = true;
        let currentNode: any = { children: editor.children };
        for (const index of markerPath) {
          // Guard: leaf text nodes have no .children; stop traversal here
          if (!currentNode || !currentNode.children) {
            // We've reached a leaf — if index is 0 it's still valid (text node)
            isValidPath = false;
            break;
          }
          if (!currentNode.children[index]) {
            isValidPath = false;
            break;
          }
          currentNode = currentNode.children[index];
        }
        // Final node must be a text leaf for the path to be usable
        if (isValidPath && typeof currentNode.text !== "string") {
          isValidPath = false;
        }
      }

      // 4. Restore cursor position after DOM reconciliation
      if (selectionTimerRef.current) {
        clearTimeout(selectionTimerRef.current);
      }

      selectionTimerRef.current = setTimeout(() => {
        if (!isAliveRef.current) {
          isRemoteUpdate.current = false;
          return;
        }

        try {
          if (markerPath && isValidPath) {
            editor.tf.select({
              anchor: { path: markerPath, offset: markerOffset },
              focus: { path: markerPath, offset: markerOffset },
            });
          } else {
            editor.tf.select(editor.api.end([]));
          }

          if (cursorOffset > 0) {
            editor.tf.focus();
          }

          // Scroll cursor into view
          if (scrollTimerRef.current) {
            clearTimeout(scrollTimerRef.current);
          }

          scrollTimerRef.current = setTimeout(() => {
            if (!isAliveRef.current) return;
            const selection = window.getSelection();
            if (selection && selection.rangeCount > 0) {
              const range = selection.getRangeAt(0);
              const node = range.startContainer.parentElement;
              if (node) {
                node.scrollIntoView({ block: "center", behavior: "smooth" });
              }
            }
          }, 50);
        } catch (selectErr) {
          console.error(
            "Failed to restore selection in Rich Editor",
            selectErr,
          );
        }

        isRemoteUpdate.current = false;
      }, 50);
    } catch (e) {
      console.error("Failed to sync cursor to Rich Editor", e);
      isRemoteUpdate.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRawMode]);

  const recursiveFilter = (nodes: any[]): any[] => {
    return nodes
      .filter((n) => n.type !== "slash_input")
      .map((n) =>
        n.children ? { ...n, children: recursiveFilter(n.children) } : n,
      );
  };

  const onSerialize = useDebouncedCallback(
    (editor: MyEditor, value: TElement[]) => {
      // 1. Recursively remove internal nodes like slash_input
      const filteredValue = recursiveFilter(value);

      // 2. Clean up "spacer" paragraphs
      const cleanValue = filteredValue.filter((node: any) => {
        if (node.type === "p" || node.type === "paragraph") {
          // If the paragraph has ANY non-text children (like JSX inlines or images),
          // we MUST keep it even if its text content appears empty.
          const hasNonTextChildren = (node.children || []).some(
            (c: any) => !c.text && c.type !== "text",
          );
          if (hasNonTextChildren) return true;

          const text = (node.children || [])
            .map((c: any) => c.text || "")
            .join("");
          // Only strip if it's pure text AND that text is just whitespace/ZWSP.
          return (
            text.replace(/[\u200B\u200C\u200D\uFEFF]/g, "").trim().length > 0
          );
        }
        return true;
      });

      const mdContent = editor
        .getApi(MarkdownPlugin)
        .markdown.serialize({ value: cleanValue }) as string;

      // Strip the cursor marker if it somehow leaked in
      const cleanMd = mdContent.replaceAll(CURSOR_MARKER, "");
      onUpdateMarkdown(cleanMd);
      onUpdateContentRef(cleanMd);
    },
    200,
  );

  const onSyncCursor = useDebouncedCallback((editor: MyEditor) => {
    if (!editor.selection || isRawMode || isRemoteUpdate.current) return;

    try {
      // 1. Deep clone the children to avoid mutating the actual editor
      const childrenClone = JSON.parse(JSON.stringify(editor.children));
      const { selection } = editor;

      // 2. Find the node at the selection path in the clone
      let targetNode: any = { children: childrenClone };
      const path = selection.focus.path;

      // Traverse to the parent of the text node
      for (let i = 0; i < path.length; i++) {
        const index = path[i];
        if (
          !targetNode ||
          !targetNode.children ||
          !targetNode.children[index]
        ) {
          targetNode = null;
          break;
        }
        targetNode = targetNode.children[index];
      }

      if (targetNode && typeof targetNode.text === "string") {
        const marker = CURSOR_MARKER;
        const offset = selection.focus.offset;

        // 3. Insert marker in the clone
        targetNode.text =
          targetNode.text.slice(0, offset) +
          marker +
          targetNode.text.slice(offset);

        // 4. Filter out internal nodes (recursive) before serialization
        const filteredClone = recursiveFilter(childrenClone);

        // 5. Serialize the clone
        const mdWithMarker = editor.getApi(MarkdownPlugin).markdown.serialize({
          value: filteredClone,
        }) as string;

        const markerOffset = mdWithMarker.indexOf(marker);
        if (markerOffset !== -1) {
          dispatch(setCursorOffset(markerOffset));
        }
      }
    } catch (e) {
      console.error("Failed to sync cursor", e);
    }
  }, 300);

  return (
    <>
      <Plate
        onChange={(options) => {
          const { editor } = options;

          // Track cursor position if selection changed
          if (editor.selection) {
            onSyncCursor(editor);
          }

          if (isRemoteUpdate.current) return;

          onSerialize(editor, options.value);
          // @LOG: this is log for debugging
          // console.log(mdContent);
          // console.log(options.value);
        }}
        editor={editor}
      >
        <EditorContainer
          className={`border-border relative rounded border border-t-0 ${isMobile ? "h-[calc(100vh-170px)]" : "h-[calc(100vh-110px)]"}`}
        >
          <Editor
            className={`relative min-h-[calc(100%-42px)] p-4 pb-20 lg:p-6`}
            variant="none"
            placeholder={tEditorRich("placeholder")}
          />
        </EditorContainer>
      </Plate>
      <AiUpgrade />
    </>
  );
};
