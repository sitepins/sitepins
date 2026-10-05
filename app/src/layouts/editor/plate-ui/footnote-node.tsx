"use client";

import { cn } from "@/lib/utils/cn";
import { FootnoteReferencePlugin } from "@platejs/footnote/react";
import { useTranslations } from "next-intl";
import type { TComboboxInputElement, TElement } from "platejs";
import type { PlateEditor, PlateElementProps } from "platejs/react";
import { PlateElement, useEditorSelector } from "platejs/react";
import {
  InlineCombobox,
  InlineComboboxContent,
  InlineComboboxEmpty,
  InlineComboboxInput,
  InlineComboboxItem,
} from "./inline-combobox";

type TFootnoteElement = TElement & { identifier?: string };

const footnoteApi = (editor: PlateEditor) =>
  editor.getApi(FootnoteReferencePlugin).footnote;

const footnoteTransforms = (editor: PlateEditor) =>
  editor.getTransforms(FootnoteReferencePlugin).footnote;

export function FootnoteReferenceElement(
  props: PlateElementProps<TFootnoteElement>,
) {
  const t = useTranslations("editor.footnote");
  const { editor, element } = props;
  const identifier = element.identifier ?? "";
  const note = useEditorSelector(
    (current) =>
      footnoteApi(current as PlateEditor).definitionText({ identifier }),
    [identifier],
  );

  return (
    <PlateElement {...props} as="sup" className="mx-px">
      <span
        contentEditable={false}
        role="button"
        tabIndex={-1}
        title={note || t("missing")}
        className={cn(
          "cursor-pointer text-xs font-medium select-none hover:underline",
          note === undefined ? "text-destructive" : "text-primary",
        )}
        onMouseDown={(event) => {
          event.preventDefault();
          footnoteTransforms(editor).focusDefinition({ identifier });
        }}
      >
        [{identifier}]
      </span>
      {props.children}
    </PlateElement>
  );
}

export function FootnoteDefinitionElement(
  props: PlateElementProps<TFootnoteElement>,
) {
  const t = useTranslations("editor.footnote");
  const { editor, element } = props;
  const identifier = element.identifier ?? "";

  return (
    <PlateElement
      {...props}
      className="border-border text-muted-foreground my-1 flex gap-2 border-s-2 ps-3 text-sm"
    >
      <span
        contentEditable={false}
        role="button"
        tabIndex={-1}
        title={t("back_to_reference")}
        className="text-primary shrink-0 cursor-pointer font-medium select-none hover:underline"
        onMouseDown={(event) => {
          event.preventDefault();
          footnoteTransforms(editor).focusReference({ identifier });
        }}
      >
        [{identifier}]
      </span>
      <div className="min-w-0 flex-1">{props.children}</div>
    </PlateElement>
  );
}

/** Drops the `[` that opened the picker, so the reference replaces `[^`. */
const removeOpeningBracket = (editor: PlateEditor) => {
  const point = editor.selection?.anchor;
  if (!point) return;
  const before = editor.api.before(point);
  if (before && editor.api.string({ anchor: before, focus: point }) === "[") {
    editor.tf.delete({ at: { anchor: before, focus: point } });
  }
};

export function FootnoteInputElement(
  props: PlateElementProps<TComboboxInputElement>,
) {
  const t = useTranslations("editor.footnote");
  const { editor, element } = props;
  const identifiers = footnoteApi(editor).identifiers();

  const insert = (identifier?: string) => {
    removeOpeningBracket(editor);
    editor
      .getTransforms(FootnoteReferencePlugin)
      .insert.footnote(
        identifier ? { identifier, focusDefinition: false } : undefined,
      );
  };

  return (
    <PlateElement {...props} as="span">
      <InlineCombobox element={element} trigger="^">
        <InlineComboboxInput className="border-border w-40 ring-0" />

        <InlineComboboxContent>
          <InlineComboboxEmpty>{t("no_results")}</InlineComboboxEmpty>

          <InlineComboboxItem
            value="new"
            label={t("new")}
            keywords={["new", "footnote"]}
            onClick={() => insert()}
          >
            {t("new")}
          </InlineComboboxItem>

          {identifiers.map((identifier) => {
            const label = t("existing", { id: identifier });
            return (
              <InlineComboboxItem
                key={identifier}
                value={identifier}
                label={label}
                onClick={() => insert(identifier)}
              >
                {label}
                <span className="text-muted-foreground ms-2 truncate text-xs">
                  {footnoteApi(editor).definitionText({ identifier })}
                </span>
              </InlineComboboxItem>
            );
          })}
        </InlineComboboxContent>
      </InlineCombobox>

      {props.children}
    </PlateElement>
  );
}
