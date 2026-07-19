"use client";

import {
  BoldIcon,
  Code2Icon,
  ItalicIcon,
  WandSparklesIcon,
} from "lucide-react";
import { KEYS } from "platejs";
import { useEditorReadOnly, useEditorSelector } from "platejs/react";
import { useTranslations } from "next-intl";
import { AIToolbarButton } from "./ai-toolbar-button";
import { LinkToolbarButton } from "./link-toolbar-button";
import { MarkToolbarButton } from "./mark-toolbar-button";
import { ToolbarGroup } from "./toolbar";
import { TurnIntoToolbarButton } from "./turn-into-toolbar-button";

export function FloatingToolbarButtons() {
  const tEditorToolbar = useTranslations("editor.toolbar");
  const readOnly = useEditorReadOnly();
  const isRootBlock = useEditorSelector((editor: any) => {
    if (!editor.selection) return false;
    const blockEntry = editor.api.block({ at: editor.selection });
    return blockEntry ? blockEntry[1].length === 1 : false;
  }, []);

  return (
    <>
      {!readOnly && (
        <>
          {isRootBlock && (
            <ToolbarGroup>
              <AIToolbarButton tooltip={tEditorToolbar("ai_commands")}>
                <WandSparklesIcon />
                {tEditorToolbar("ask_ai")}
              </AIToolbarButton>
            </ToolbarGroup>
          )}

          <ToolbarGroup>
            <TurnIntoToolbarButton />

            <MarkToolbarButton
              nodeType={KEYS.bold}
              tooltip={tEditorToolbar("bold_tooltip")}
            >
              <BoldIcon />
            </MarkToolbarButton>

            <MarkToolbarButton
              nodeType={KEYS.italic}
              tooltip={tEditorToolbar("italic_tooltip")}
            >
              <ItalicIcon />
            </MarkToolbarButton>

            <MarkToolbarButton
              nodeType={KEYS.code}
              tooltip={tEditorToolbar("code_tooltip")}
            >
              <Code2Icon />
            </MarkToolbarButton>
            <LinkToolbarButton />
          </ToolbarGroup>
        </>
      )}
    </>
  );
}
