"use client";

import { CodeBlockRules } from "@platejs/code-block";
import {
  CodeBlockPlugin,
  CodeLinePlugin,
  CodeSyntaxPlugin,
} from "@platejs/code-block/react";
import { all, createLowlight } from "lowlight";
import {
  CodeBlockElement,
  CodeLineElement,
  CodeSyntaxLeaf,
} from "../plate-ui/code-block-node";

// register all supported lang
const lowlight = createLowlight(all);
// Register mermaid as a supported language to avoid console warnings
lowlight.register("mermaid", () => ({ name: "mermaid", contains: [] }));

// Register only the languages you need
// lowlight.register("html", html);

export const CodeBlockKit = [
  CodeBlockPlugin.configure({
    inputRules: [CodeBlockRules.markdown({ on: "match" })],
    node: { component: CodeBlockElement },
    options: { lowlight, defaultLanguage: "javascript" },
    shortcuts: { toggle: { keys: "mod+alt+8" } },
  }),
  CodeLinePlugin.withComponent(CodeLineElement),
  CodeSyntaxPlugin.withComponent(CodeSyntaxLeaf),
];
