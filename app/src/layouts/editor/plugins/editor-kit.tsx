"use client";

import { TrailingBlockPlugin, type Value } from "platejs";
import { type TPlateEditor, useEditorRef } from "platejs/react";
import {
  ShortcodeInlineKit,
  ShortcodeKit,
} from "../snippets/common/snippet-plugin";
import { HtmlBlockKit, HtmlInlineKit } from "../snippets/html/html-plugin";
import { JsxBlockKit, JsxInlineKit } from "../snippets/jsx/jsx-plugin";
import { AIKit } from "./ai-kit";
import { AlignKit } from "./align-kit";
import { AutoformatKit } from "./autoformat-kit";
import { BasicBlocksKit } from "./basic-blocks-kit";
import { BasicMarksKit } from "./basic-marks-kit";
import { BlockPlaceholderKit } from "./block-placeholder-kit";
import { BlockSelectionKit } from "./block-selection-kit";
import { CodeBlockKit } from "./code-block-kit";
import { CommentKit } from "./comment-kit";
import { CopilotKit } from "./copilot-kit";
import { CursorOverlayKit } from "./cursor-overlay-kit";
import { DndKit } from "./dnd-kit";
import { DocxKit } from "./docx-kit";
import { EmojiKit } from "./emoji-kit";
import { ExitBreakKit } from "./exit-break-kit";
import { FixedToolbarKit } from "./fixed-toolbar-kit";
import { FloatingToolbarKit } from "./floating-toolbar-kit";
import { LineHeightKit } from "./line-height-kit";
import { LinkKit } from "./link-kit";
import { ListKit } from "./list-kit";
import { MarkdownKit } from "./markdown-kit";
import { MathKit } from "./math-kit";
import { MediaKit } from "./media-kit";
import { SlashKit } from "./slash-kit";
import { SuggestionKit } from "./suggestion-kit";
import { TableKit } from "./table-kit";

export const EditorKit = [
  // AI Related plugin
  ...CopilotKit,
  ...AIKit,

  // Base Plugin
  ...BasicBlocksKit,
  ...CodeBlockKit,
  ...TableKit,
  ...MediaKit,
  ...MathKit,
  ...LinkKit,

  // Marks Plugin
  ...BasicMarksKit,

  // Block Style Plugin
  ...ListKit,
  ...AlignKit,
  ...LineHeightKit,

  // Suggestion Plugin
  ...CommentKit,
  ...SuggestionKit,

  // Editing Plugin
  ...SlashKit,
  ...AutoformatKit,
  ...CursorOverlayKit,
  ...BlockSelectionKit,
  ...DndKit,
  ...EmojiKit,
  ...ExitBreakKit,
  TrailingBlockPlugin,

  // Parsers Plugin
  ...DocxKit,
  ...MarkdownKit,
  HtmlBlockKit,
  HtmlInlineKit,
  JsxBlockKit,
  JsxInlineKit,
  ShortcodeKit,
  ShortcodeInlineKit,

  // UI Plugin
  ...BlockPlaceholderKit,
  ...FixedToolbarKit,
  ...FloatingToolbarKit,
];

export type MyEditor = TPlateEditor<Value, (typeof EditorKit)[number]>;

export const useEditor = () => useEditorRef<MyEditor>();
