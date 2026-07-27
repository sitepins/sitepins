"use client";

import { RawEditor } from "@/editor/raw-editor";
import { RichEditor } from "@/editor/rich-editor";
import { selectConfig } from "@/redux/features/config/slice";
import { useAppSelector } from "@/redux/store";

export default function ContentEditor({
  shouldShowEditor,
  isMobile,
  markdownContent,
  onUpdateMarkdown,
  onUpdateContentRef,
}: {
  shouldShowEditor: boolean;
  isMobile: boolean;
  onUpdateMarkdown: (content: string) => void;
  markdownContent: string;
  onUpdateContentRef: (content: string) => void;
}) {
  const { isRawMode } = useAppSelector(selectConfig);

  if (!shouldShowEditor) return null;

  return (
    <div className="size-full">
      <div style={{ display: !isRawMode ? "block" : "none" }}>
        <RichEditor
          markdownContent={markdownContent}
          onUpdateMarkdown={onUpdateMarkdown}
          isMobile={isMobile}
          onUpdateContentRef={onUpdateContentRef}
        />
      </div>
      <div style={{ display: isRawMode ? "block" : "none" }}>
        <RawEditor
          isMobile={isMobile}
          markdownContent={markdownContent}
          onUpdateMarkdown={onUpdateMarkdown}
        />
      </div>
    </div>
  );
}
