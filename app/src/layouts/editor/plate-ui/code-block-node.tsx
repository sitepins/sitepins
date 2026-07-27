"use client";

import { Button } from "@/components/ui/button";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxTrigger,
  useComboboxAnchor,
} from "@/components/ui/combobox";
import { formatCodeBlock, isLangSupported } from "@platejs/code-block";
import { BracesIcon, CheckIcon, CopyIcon, Eye, EyeOff } from "lucide-react";
import { type TCodeBlockElement, type TCodeSyntaxLeaf, NodeApi } from "platejs";
import {
  type PlateElementProps,
  type PlateLeafProps,
  PlateElement,
  PlateLeaf,
  useEditorRef,
  useElement,
  useReadOnly,
} from "platejs/react";
import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { CodeDrawingElement } from "./code-drawing-node";

export function CodeBlockElement(props: PlateElementProps<TCodeBlockElement>) {
  const tEditorToolbar = useTranslations("editor.toolbar");
  const { editor, element } = props;

  const isShowPreview = !!element && element.lang === "mermaid";

  const [isPreview, setIsPreview] = useState(isShowPreview);

  return (
    <PlateElement
      className="py-1 **:[.hljs-addition]:bg-[#f0fff4] **:[.hljs-addition]:text-[#22863a] dark:**:[.hljs-addition]:bg-[#3c5743] dark:**:[.hljs-addition]:text-[#ceead5] **:[.hljs-attr,.hljs-attribute,.hljs-literal,.hljs-meta,.hljs-number,.hljs-operator,.hljs-selector-attr,.hljs-selector-class,.hljs-selector-id,.hljs-variable]:text-[#005cc5] dark:**:[.hljs-attr,.hljs-attribute,.hljs-literal,.hljs-meta,.hljs-number,.hljs-operator,.hljs-selector-attr,.hljs-selector-class,.hljs-selector-id,.hljs-variable]:text-[#6596cf] **:[.hljs-built\\\\_in,.hljs-symbol]:text-[#e36209] dark:**:[.hljs-built\\\\_in,.hljs-symbol]:text-[#c3854e] **:[.hljs-bullet]:text-[#735c0f] **:[.hljs-comment,.hljs-code,.hljs-formula]:text-[#6a737d] dark:**:[.hljs-comment,.hljs-code,.hljs-formula]:text-[#6a737d] **:[.hljs-deletion]:bg-[#ffeef0] **:[.hljs-deletion]:text-[#b31d28] dark:**:[.hljs-deletion]:bg-[#473235] dark:**:[.hljs-deletion]:text-[#e7c7cb] **:[.hljs-emphasis]:italic **:[.hljs-keyword,.hljs-doctag,.hljs-template-tag,.hljs-template-variable,.hljs-type,.hljs-variable.language\\\\_]:text-[#d73a49] dark:**:[.hljs-keyword,.hljs-doctag,.hljs-template-tag,.hljs-template-variable,.hljs-type,.hljs-variable.language\\\\_]:text-[#ee6960] **:[.hljs-name,.hljs-quote,.hljs-selector-tag,.hljs-selector-pseudo]:text-[#22863a] dark:**:[.hljs-name,.hljs-quote,.hljs-selector-tag,.hljs-selector-pseudo]:text-[#36a84f] **:[.hljs-regexp,.hljs-string,.hljs-meta_.hljs-string]:text-[#032f62] dark:**:[.hljs-regexp,.hljs-string,.hljs-meta_.hljs-string]:text-[#3593ff] **:[.hljs-section]:font-bold **:[.hljs-section]:text-[#005cc5] dark:**:[.hljs-section]:text-[#61a5f2] **:[.hljs-strong]:font-bold **:[.hljs-title,.hljs-title.class\\\\_,.hljs-title.class\\\\_.inherited\\\\_\\\\_,.hljs-title.function\\\\_]:text-[#6f42c1] dark:**:[.hljs-title,.hljs-title.class\\\\_,.hljs-title.class\\\\_.inherited\\\\_\\\\_,.hljs-title.function\\\\_]:text-[#a77bfa]"
      {...props}
    >
      <div
        className={`bg-muted/50 relative rounded-md ${isShowPreview && isPreview ? "grid grid-cols-[1.5fr_1fr] gap-2" : ""}`}
      >
        <pre className="overflow-x-auto p-8 pr-4 font-mono text-sm leading-[normal] tab-2 print:break-inside-avoid">
          <code>{props.children}</code>
        </pre>

        {isShowPreview && isPreview && (
          <CodeDrawingElement
            {...props}
            element={{
              ...element,
              data: {
                code: element.children
                  .map((child) => NodeApi.string(child as any))
                  .join("\n"),
                drawingType: "Mermaid",
                drawingMode: "Image",
              },
            }}
          />
        )}

        <div
          className="absolute top-2 right-2 z-10 flex items-center gap-1 select-none"
          contentEditable={false}
        >
          {isShowPreview && (
            <Button
              size="icon-xs"
              variant="outline"
              className="text-xs"
              onClick={() => {
                setIsPreview((prev) => !prev);
              }}
              title={
                isPreview
                  ? tEditorToolbar("hide_preview")
                  : tEditorToolbar("show_preview")
              }
            >
              {isPreview ? (
                <EyeOff className="text-muted-foreground size-3.5!" />
              ) : (
                <Eye className="text-muted-foreground size-3.5!" />
              )}
            </Button>
          )}

          {isLangSupported(element.lang) && (
            <Button
              size="icon-xs"
              variant="outline"
              className="text-xs"
              onClick={() => formatCodeBlock(editor, { element })}
              title={tEditorToolbar("format_code")}
            >
              <BracesIcon className="text-muted-foreground size-3.5!" />
            </Button>
          )}

          <CodeBlockCombobox />

          <CopyButton
            size="icon-xs"
            variant="outline"
            className="text-muted-foreground text-xs"
            value={() => NodeApi.string(element)}
          />
        </div>
      </div>
    </PlateElement>
  );
}

function CodeBlockCombobox() {
  const tEditorToolbar = useTranslations("editor.toolbar");
  const readOnly = useReadOnly();
  const editor = useEditorRef();
  const element = useElement<TCodeBlockElement>();
  const [open, setOpen] = useState(false);
  const value = element.lang || "plaintext";
  const anchorRef = useComboboxAnchor();

  const localizedLanguages = useMemo(
    () =>
      languages.map((lang) => ({
        ...lang,
        label: lang.labelKey
          ? tEditorToolbar(lang.labelKey as any)
          : lang.label,
      })),
    [tEditorToolbar],
  );

  if (readOnly) return null;

  return (
    <Combobox
      open={open}
      onOpenChange={setOpen}
      value={value}
      onValueChange={(val) => {
        if (!val) return;
        editor.tf.setNodes<TCodeBlockElement>({ lang: val }, { at: element });
        setOpen(false);
      }}
      items={localizedLanguages}
    >
      <div ref={anchorRef} className="-mt-0.75 w-auto">
        <ComboboxTrigger
          className="w-auto"
          render={
            <Button
              size="xs"
              variant="outline"
              className="text-muted-foreground justify-between gap-1 px-2 text-xs select-none"
            />
          }
        >
          {localizedLanguages.find((language) => language.value === value)
            ?.label ?? tEditorToolbar("plain_text")}
        </ComboboxTrigger>
      </div>
      <ComboboxContent
        className="w-50 p-0"
        align="start"
        side="bottom"
        sideOffset={4}
        anchor={anchorRef}
      >
        <ComboboxInput
          placeholder={tEditorToolbar("search_languages")}
          showTrigger={false}
        />
        <ComboboxEmpty>{tEditorToolbar("no_language_found")}</ComboboxEmpty>

        <ComboboxList>
          {(item: (typeof localizedLanguages)[number]) => (
            <ComboboxItem
              key={item.label}
              className="cursor-pointer"
              value={item.value}
            >
              {item.label}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}

function CopyButton({
  value,
  ...props
}: { value: (() => string) | string } & Omit<
  React.ComponentProps<typeof Button>,
  "value"
>) {
  const tEditorToolbar = useTranslations("editor.toolbar");
  const [hasCopied, setHasCopied] = useState(false);

  useEffect(() => {
    setTimeout(() => {
      setHasCopied(false);
    }, 2000);
  }, [hasCopied]);

  return (
    <Button
      type="button"
      onClick={(ev) => {
        ev.stopPropagation();
        void navigator.clipboard.writeText(
          typeof value === "function" ? value() : value,
        );
        setHasCopied(true);
      }}
      {...props}
    >
      <span className="sr-only">{tEditorToolbar("copy")}</span>
      {hasCopied ? (
        <CheckIcon className="size-3.5!" />
      ) : (
        <CopyIcon className="size-3.5!" />
      )}
    </Button>
  );
}

export function CodeLineElement(props: PlateElementProps) {
  return <PlateElement {...props} />;
}

export function CodeSyntaxLeaf(props: PlateLeafProps<TCodeSyntaxLeaf>) {
  const tokenClassName = props.leaf.className as string;

  return <PlateLeaf className={tokenClassName} {...props} />;
}

const languages: { label: string; value: string; labelKey?: string }[] = [
  { label: "Auto", labelKey: "auto", value: "auto" },
  { label: "Plain Text", labelKey: "plain_text", value: "plaintext" },
  { label: "ABAP", value: "abap" },
  { label: "Agda", value: "agda" },
  { label: "Arduino", value: "arduino" },
  { label: "ASCII Art", value: "ascii" },
  { label: "Assembly", value: "x86asm" },
  { label: "Bash", value: "bash" },
  { label: "BASIC", value: "basic" },
  { label: "BNF", value: "bnf" },
  { label: "C", value: "c" },
  { label: "C#", value: "csharp" },
  { label: "C++", value: "cpp" },
  { label: "Clojure", value: "clojure" },
  { label: "CoffeeScript", value: "coffeescript" },
  { label: "Coq", value: "coq" },
  { label: "CSS", value: "css" },
  { label: "Dart", value: "dart" },
  { label: "Dhall", value: "dhall" },
  { label: "Diff", value: "diff" },
  { label: "Docker", value: "dockerfile" },
  { label: "EBNF", value: "ebnf" },
  { label: "Elixir", value: "elixir" },
  { label: "Elm", value: "elm" },
  { label: "Erlang", value: "erlang" },
  { label: "F#", value: "fsharp" },
  { label: "Flow", value: "flow" },
  { label: "Fortran", value: "fortran" },
  { label: "Gherkin", value: "gherkin" },
  { label: "GLSL", value: "glsl" },
  { label: "Go", value: "go" },
  { label: "GraphQL", value: "graphql" },
  { label: "Groovy", value: "groovy" },
  { label: "Haskell", value: "haskell" },
  { label: "HCL", value: "hcl" },
  { label: "HTML", value: "html" },
  { label: "Idris", value: "idris" },
  { label: "Java", value: "java" },
  { label: "JavaScript", value: "javascript" },
  { label: "JSON", value: "json" },
  { label: "Julia", value: "julia" },
  { label: "Kotlin", value: "kotlin" },
  { label: "LaTeX", value: "latex" },
  { label: "Less", value: "less" },
  { label: "Lisp", value: "lisp" },
  { label: "LiveScript", value: "livescript" },
  { label: "LLVM IR", value: "llvm" },
  { label: "Lua", value: "lua" },
  { label: "Makefile", value: "makefile" },
  { label: "Markdown", value: "markdown" },
  { label: "Markup", value: "markup" },
  { label: "MATLAB", value: "matlab" },
  { label: "Mathematica", value: "mathematica" },
  { label: "Mermaid", value: "mermaid" },
  { label: "Nix", value: "nix" },
  { label: "Notion Formula", value: "notion" },
  { label: "Objective-C", value: "objectivec" },
  { label: "OCaml", value: "ocaml" },
  { label: "Pascal", value: "pascal" },
  { label: "Perl", value: "perl" },
  { label: "PHP", value: "php" },
  { label: "PowerShell", value: "powershell" },
  { label: "Prolog", value: "prolog" },
  { label: "Protocol Buffers", value: "protobuf" },
  { label: "PureScript", value: "purescript" },
  { label: "Python", value: "python" },
  { label: "R", value: "r" },
  { label: "Racket", value: "racket" },
  { label: "Reason", value: "reasonml" },
  { label: "Ruby", value: "ruby" },
  { label: "Rust", value: "rust" },
  { label: "Sass", value: "scss" },
  { label: "Scala", value: "scala" },
  { label: "Scheme", value: "scheme" },
  { label: "SCSS", value: "scss" },
  { label: "Shell", value: "shell" },
  { label: "Smalltalk", value: "smalltalk" },
  { label: "Solidity", value: "solidity" },
  { label: "SQL", value: "sql" },
  { label: "Swift", value: "swift" },
  { label: "TOML", value: "toml" },
  { label: "TypeScript", value: "typescript" },
  { label: "VB.Net", value: "vbnet" },
  { label: "Verilog", value: "verilog" },
  { label: "VHDL", value: "vhdl" },
  { label: "Visual Basic", value: "vbnet" },
  { label: "WebAssembly", value: "wasm" },
  { label: "XML", value: "xml" },
  { label: "YAML", value: "yaml" },
];
