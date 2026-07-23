"use client";

import { insertBlock } from "@/editor/utils/transforms";
import { useOwnerPlan } from "@/hooks/use-owner-plan";
import { AIChatPlugin } from "@platejs/ai/react";
import {
  Code2,
  Heading1Icon,
  Heading2Icon,
  Heading3Icon,
  ListIcon,
  ListOrdered,
  PilcrowIcon,
  Quote,
  SparklesIcon,
  Table,
} from "lucide-react";
import { useAiSlashUpsellItem } from "./ai-slash-upsell";
import { type TComboboxInputElement, KEYS } from "platejs";
import type { PlateEditor, PlateElementProps } from "platejs/react";
import { PlateElement } from "platejs/react";
import { useTranslations } from "next-intl";
import * as React from "react";
import { useEffect } from "react";
import {
  InlineCombobox,
  InlineComboboxContent,
  InlineComboboxEmpty,
  InlineComboboxGroup,
  InlineComboboxGroupLabel,
  InlineComboboxInput,
  InlineComboboxItem,
} from "./inline-combobox";

type Group = {
  group: string;
  items: {
    icon: React.ReactNode;
    value: string;
    onSelect: (editor: PlateEditor, value: string) => void;
    className?: string;
    focusEditor?: boolean;
    keywords?: string[];
    label: string;
  }[];
};

const groups: Group[] = [
  {
    group: "ai",
    items: [
      {
        focusEditor: false,
        icon: <SparklesIcon />,
        label: "ai",
        value: "AI",
        onSelect: (editor) => {
          if (!localStorage.getItem("sitepins-ai-model")) {
            window.open("/dashboard/ai-agent", "_blank");
            return;
          }

          const aiChat = editor.getApi(AIChatPlugin).aiChat;

          // Force focus before showing chat
          // editor.tf.focus();

          aiChat.show();
        },
      },
    ],
  },
  {
    group: "basic_blocks",
    items: [
      {
        icon: <PilcrowIcon />,
        keywords: ["paragraph"],
        label: "text",
        value: KEYS.p,
      },
      {
        icon: <Heading1Icon />,
        keywords: ["title", "h1"],
        label: "h1",
        value: KEYS.h1,
      },
      {
        icon: <Heading2Icon />,
        keywords: ["subtitle", "h2"],
        label: "h2",
        value: KEYS.h2,
      },
      {
        icon: <Heading3Icon />,
        keywords: ["subtitle", "h3"],
        label: "h3",
        value: KEYS.h3,
      },
      {
        icon: <ListIcon />,
        keywords: ["unordered", "ul", "-"],
        label: "bullet_list",
        value: KEYS.ul,
      },
      {
        icon: <ListOrdered />,
        keywords: ["ordered", "ol", "1"],
        label: "num_list",
        value: KEYS.ol,
      },
      {
        icon: <Code2 />,
        keywords: ["```"],
        label: "code_block",
        value: KEYS.codeBlock,
      },
      {
        icon: <Table />,
        label: "table",
        value: KEYS.table,
      },
      {
        icon: <Quote />,
        keywords: ["citation", "blockquote", "quote", ">"],
        label: "blockquote",
        value: KEYS.blockquote,
      },
    ].map((item) => ({
      ...item,
      onSelect: (editor, value) => {
        insertBlock(editor, value, { upsert: true });
      },
    })),
  },
];

export function SlashInputElement(
  props: PlateElementProps<TComboboxInputElement>,
) {
  const tEditorSlash = useTranslations("editor.slash");
  const { editor, element } = props;
  const { canAccessProFeatures: canAccessAi } = useOwnerPlan();
  const aiUpsellItem = useAiSlashUpsellItem();

  const displayGroups =
    !canAccessAi && aiUpsellItem
      ? groups.map((group) => {
          if (group.group === "ai") {
            return {
              ...group,
              items: [aiUpsellItem],
            };
          }
          return group;
        })
      : groups;

  return (
    <PlateElement {...props} as="span">
      <InlineCombobox element={element} trigger="/">
        <InlineComboboxInput className="border-border w-50 ring-0" />

        <InlineComboboxContent>
          <InlineComboboxEmpty>
            {tEditorSlash("no_results")}
          </InlineComboboxEmpty>

          {displayGroups.map(({ group, items }) => (
            <InlineComboboxGroup key={group} className="">
              <InlineComboboxGroupLabel>
                {tEditorSlash(group as any)}
              </InlineComboboxGroupLabel>

              {items.map((item) => {
                const { focusEditor, keywords, label, value, onSelect } = item;
                // cloud upsell items carry a pre-translated label
                const text =
                  (item as { labelText?: string }).labelText ??
                  tEditorSlash(label as any);
                return (
                  <InlineComboboxItem
                    key={value}
                    value={value}
                    onClick={() => onSelect(editor, value)}
                    label={text}
                    focusEditor={focusEditor}
                    group={group}
                    keywords={keywords}
                  >
                    {text}
                  </InlineComboboxItem>
                );
              })}
            </InlineComboboxGroup>
          ))}
        </InlineComboboxContent>
      </InlineCombobox>

      {props.children}
    </PlateElement>
  );
}
