"use client";

import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils/cn";
import { useEquationElement, useEquationInput } from "@platejs/math/react";
import { BlockSelectionPlugin } from "@platejs/selection/react";
import { CornerDownLeftIcon, RadicalIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import type { TEquationElement } from "platejs";
import type { PlateElementProps } from "platejs/react";
import {
  createPrimitiveComponent,
  PlateElement,
  useEditorRef,
  useEditorSelector,
  useElement,
  useReadOnly,
  useSelected,
} from "platejs/react";
import * as React from "react";
import TextareaAutosize, {
  type TextareaAutosizeProps,
} from "react-textarea-autosize";

export function EquationElement(props: PlateElementProps<TEquationElement>) {
  const tEditorEquation = useTranslations("editor.equation");
  const selected = useSelected();
  const [open, setOpen] = React.useState(selected);
  const katexRef = React.useRef<HTMLDivElement | null>(null);

  const lineBreakBadge = (
    props as PlateElementProps<TEquationElement> & {
      lineBreakBadge?: React.ReactNode;
    }
  ).lineBreakBadge;

  useEquationElement({
    element: props.element,
    katexRef: katexRef,
    options: {
      displayMode: true,
      errorColor: "#cc0000",
      fleqn: false,
      leqno: false,
      macros: { "\\f": "#1f(#2)" },
      output: "htmlAndMathml",
      strict: "warn",
      throwOnError: false,
      trust: false,
    },
  });

  return (
    <PlateElement className="my-1" {...props}>
      <Popover open={open} onOpenChange={setOpen} modal={false}>
        <PopoverTrigger asChild>
          <div
            className={cn(
              "group hover:bg-primary/10 data-[selected=true]:bg-primary/10 flex cursor-pointer items-center justify-center rounded-sm select-none",
              props.element.texExpression.length === 0
                ? "bg-muted p-3 pr-9"
                : "px-2 py-1",
            )}
            data-selected={selected}
            contentEditable={false}
            role="button"
          >
            {props.element.texExpression.length > 0 ? (
              <span ref={katexRef} />
            ) : (
              <div className="text-muted-foreground flex h-7 w-full items-center gap-2 text-sm whitespace-nowrap">
                <RadicalIcon className="text-muted-foreground/80 size-6" />
                <div>{tEditorEquation("add")}</div>
              </div>
            )}
            {lineBreakBadge}
          </div>
        </PopoverTrigger>

        <EquationPopoverContent
          open={open}
          placeholder={`f(x) = \\begin{cases}\n  x^2, &\\quad x > 0 \\\\\n  0, &\\quad x = 0 \\\\\n  -x^2, &\\quad x < 0\n\\end{cases}`}
          isInline={false}
          setOpen={setOpen}
        />
      </Popover>

      {props.children}
    </PlateElement>
  );
}

export function InlineEquationElement(
  props: PlateElementProps<TEquationElement>,
) {
  const tEditorEquation = useTranslations("editor.equation");
  const { element } = props;
  const katexRef = React.useRef<HTMLDivElement | null>(null);
  const selected = useSelected();
  const isCollapsed = useEditorSelector(
    (editor) => editor.api.isCollapsed(),
    [],
  );
  const [open, setOpen] = React.useState(selected && isCollapsed);

  React.useEffect(() => {
    if (selected && isCollapsed) {
      setOpen(true);
    }
  }, [selected, isCollapsed]);

  useEquationElement({
    element,
    katexRef: katexRef,
    options: {
      displayMode: true,
      errorColor: "#cc0000",
      fleqn: false,
      leqno: false,
      macros: { "\\f": "#1f(#2)" },
      output: "htmlAndMathml",
      strict: "warn",
      throwOnError: false,
      trust: false,
    },
  });

  return (
    <PlateElement
      {...props}
      className={cn(
        "mx-1 inline-block rounded-sm select-none [&_.katex-display]:my-0!",
      )}
    >
      <Popover open={open} onOpenChange={setOpen} modal={false}>
        <PopoverTrigger asChild>
          <div
            className={cn(
              'after:absolute after:inset-0 after:-top-0.5 after:-left-1 after:z-1 after:h-[calc(100%)+4px] after:w-[calc(100%+8px)] after:rounded-sm after:content-[""]',
              "h-6",
              ((element.texExpression.length > 0 && open) || selected) &&
                "after:bg-accent/15",
              element.texExpression.length === 0 &&
                "text-muted-foreground after:bg-neutral-500/10",
            )}
            contentEditable={false}
          >
            <span
              ref={katexRef}
              className={cn(
                element.texExpression.length === 0 && "hidden",
                "font-mono leading-none",
              )}
            />
            {element.texExpression.length === 0 && (
              <span>
                <RadicalIcon className="mr-1 inline-block h-4.75 w-4 py-[1.5px] align-text-bottom" />
                {tEditorEquation("new")}
              </span>
            )}
          </div>
        </PopoverTrigger>

        <EquationPopoverContent
          className="my-auto"
          open={open}
          placeholder="E = mc^2"
          setOpen={setOpen}
          isInline
        />
      </Popover>

      {props.children}
    </PlateElement>
  );
}

const EquationInput = createPrimitiveComponent(TextareaAutosize)({
  propsHook: useEquationInput,
});

const EquationPopoverContent = ({
  className,
  isInline,
  open,
  setOpen,
  ...props
}: {
  isInline: boolean;
  open: boolean;
  setOpen: (open: boolean) => void;
} & TextareaAutosizeProps) => {
  const tEditorEquation = useTranslations("editor.equation");
  const editor = useEditorRef();
  const readOnly = useReadOnly();
  const element = useElement<TEquationElement>();

  React.useEffect(() => {
    if (isInline && open) {
      setOpen(true);
    }
  }, [isInline, open, setOpen]);

  if (readOnly) return null;

  const onClose = () => {
    setOpen(false);

    if (isInline) {
      editor.tf.select(element, { focus: true, next: true });
    } else {
      editor
        .getApi(BlockSelectionPlugin)
        .blockSelection.set(element.id as string);
    }
  };

  return (
    <PopoverContent
      className="flex gap-2"
      onEscapeKeyDown={(e) => {
        e.preventDefault();
      }}
      contentEditable={false}
    >
      <EquationInput
        className={cn(
          "dark:bg-input/30 border-border focus:ring-border max-h-[50vh] grow resize-none rounded bg-transparent p-2 text-sm",
          className,
        )}
        state={{ isInline, open, onClose }}
        autoFocus
        {...props}
      />

      <Button variant="outline" className="px-3" onClick={onClose}>
        {tEditorEquation("edit")} <CornerDownLeftIcon className="size-3.5" />
      </Button>
    </PopoverContent>
  );
};
