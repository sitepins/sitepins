"use client";

import {
  FootnoteDefinitionPlugin,
  FootnoteInputPlugin,
  FootnoteReferencePlugin,
} from "@platejs/footnote/react";
import { KEYS } from "platejs";
import {
  FootnoteDefinitionElement,
  FootnoteInputElement,
  FootnoteReferenceElement,
} from "../plate-ui/footnote-node";

export const FootnoteKit = [
  // `[^` opens the footnote picker, except inside code.
  FootnoteReferencePlugin.configure({
    node: { component: FootnoteReferenceElement },
    options: {
      triggerQuery: (editor) =>
        !editor.api.some({
          match: { type: editor.getType(KEYS.codeBlock) },
        }),
    },
  }),
  FootnoteDefinitionPlugin.withComponent(FootnoteDefinitionElement),
  FootnoteInputPlugin.withComponent(FootnoteInputElement),
];
