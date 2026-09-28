"use client";

import { cn } from "@/lib/utils/cn";
import {
  CSSProperties,
  MouseEvent as ReactMouseEvent,
  useEffect,
  useRef,
  useState,
} from "react";

type TagLinePropName = "opening" | "closing" | "inline";

export interface EditableTagLineTheme {
  text: string;
  tagText: string;
}

// execCommand("insertText", "\n") inserts a <br>, which textContent drops.
function insertNewline(root: HTMLElement) {
  const sel = window.getSelection();
  if (!sel?.rangeCount) return;
  const range = sel.getRangeAt(0);
  range.deleteContents();
  const node = document.createTextNode("\n");
  range.insertNode(node);
  // A trailing newline renders no line, so the caret would snap back.
  const after = document.createRange();
  after.setStartAfter(node);
  after.setEnd(root, root.childNodes.length);
  if (!after.toString()) node.after(document.createElement("br"));
  range.setStartAfter(node);
  range.collapse(true);
  sel.removeAllRanges();
  sel.addRange(range);
}

export const ContentEditableSpan = ({
  value,
  onChange,
  onBlur,
  className,
  onFocus,
  style,
  multiline = false,
}: {
  value: string;
  onChange: (val: string) => void;
  onBlur?: () => void;
  className?: string;
  onFocus?: () => void;
  style?: CSSProperties;
  multiline?: boolean;
}) => {
  const ref = useRef<HTMLSpanElement>(null);
  const isFocusedRef = useRef(false);

  useEffect(() => {
    if (
      ref.current &&
      ref.current.textContent !== value &&
      !isFocusedRef.current
    ) {
      ref.current.textContent = value;
    }
  }, [value]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (onFocus) {
      // Auto-focus if mounted in edit mode
      el.focus();
      // Move cursor to end
      const range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(false);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
    }

    const stopPropagation = (e: Event) => {
      e.stopPropagation();
    };

    el.addEventListener("beforeinput", stopPropagation);
    return () => {
      el.removeEventListener("beforeinput", stopPropagation);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Mount-time value only — later updates go through the effect above so the
  // caret doesn't jump on re-render.
  const [initialValue] = useState(value);

  return (
    <span
      ref={ref}
      className={cn("block min-w-1.25 outline-none", className)}
      style={style}
      contentEditable
      suppressContentEditableWarning
      spellCheck={false}
      onInput={(e) => {
        e.stopPropagation();
        const newValue = e.currentTarget.textContent || "";
        onChange(newValue);
      }}
      onBlur={(e) => {
        e.stopPropagation();
        isFocusedRef.current = false;
        onBlur?.();
      }}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter") {
          e.preventDefault();
          if (multiline) {
            insertNewline(e.currentTarget);
            onChange(e.currentTarget.textContent || "");
          }
        }
      }}
      onKeyUp={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
      }}
      onMouseDown={(e) => e.stopPropagation()}
      onFocus={(e) => {
        e.stopPropagation();
        isFocusedRef.current = true;
        onFocus?.();
      }}
    >
      {initialValue}
    </span>
  );
};

const FallbackEditableTagLine = ({
  text,
  onChange,
  inline,
  theme,
}: {
  text: string;
  onChange: (val: string) => void;
  inline: boolean;
  theme: EditableTagLineTheme;
}) => {
  const [value, setValue] = useState(text);
  const [syncedText, setSyncedText] = useState(text);
  if (syncedText !== text) {
    setSyncedText(text);
    setValue(text);
  }

  return (
    <span
      className={cn(
        "max-w-full align-baseline",
        inline ? "inline-block" : "block",
      )}
      dir="ltr"
      contentEditable={false}
    >
      <ContentEditableSpan
        value={value}
        onChange={(val) => {
          setValue(val);
          onChange(val);
        }}
        className={cn(
          "font-mono wrap-anywhere whitespace-pre-wrap",
          !inline && "text-sm",
          theme.text,
        )}
      />
    </span>
  );
};

// --- Attribute Parsing Logic ---

interface AttrToken {
  type: "key" | "eq" | "value" | "whitespace" | "other";
  text: string;
}

const parseAttributes = (text: string): AttrToken[] => {
  const tokens: AttrToken[] = [];

  const regex = /(\s+)|([a-zA-Z0-9-_:]+)|(=)|(".*?"|'.*?'|`.*?`)|([^"\s=]+)/y;

  let lastIndex = 0;
  while (lastIndex < text.length) {
    regex.lastIndex = lastIndex;
    const match = regex.exec(text);

    if (!match) {
      // Consume one char as 'other' to prevent infinite loop if no match
      tokens.push({ type: "other", text: text[lastIndex] });
      lastIndex++;
      continue;
    }

    const [fullMatch, space, key, eq, quotedVal, unquotedVal] = match;
    lastIndex += fullMatch.length;

    if (space) {
      tokens.push({ type: "whitespace", text: space });
    } else if (key) {
      tokens.push({ type: "key", text: key });
    } else if (eq) {
      tokens.push({ type: "eq", text: eq });
    } else if (quotedVal) {
      tokens.push({ type: "value", text: quotedVal });
    } else if (unquotedVal) {
      tokens.push({ type: "value", text: unquotedVal });
    }
  }

  return tokens;
};

const ATTR_CLASS: Record<AttrToken["type"], string> = {
  key: "text-yellow-600 dark:text-yellow-400 font-medium",
  value: "text-emerald-600 dark:text-emerald-400",
  eq: "text-slate-400 dark:text-slate-500",
  whitespace: "",
  other: "",
};

export const HighlightedAttributes = ({
  text,
  theme: _theme,
}: {
  text: string;
  theme: EditableTagLineTheme;
}) => {
  const tokens = parseAttributes(text);

  return (
    <>
      {tokens.map((token, i) => (
        <span key={i} className={ATTR_CLASS[token.type]}>
          {token.text}
        </span>
      ))}
    </>
  );
};

function focusAttributes(e: ReactMouseEvent<HTMLSpanElement>) {
  const editable = e.currentTarget.querySelector<HTMLElement>(
    '[contenteditable="true"]',
  );
  if (!editable || editable.contains(e.target as Node)) return;
  e.preventDefault();
  e.stopPropagation();
  editable.focus();
  const range = document.createRange();
  range.selectNodeContents(editable);
  range.collapse(false);
  const sel = window.getSelection();
  sel?.removeAllRanges();
  sel?.addRange(range);
}

export function splitTagLine(
  text: string,
): { prefix: string; attributes: string; suffix: string } | null {
  const match =
    text.match(/^(<[\w-]+)([\s\S]*)(\/>)$/) ??
    text.match(/^(<[\w-]+)([\s\S]*)(>)$/) ??
    text.match(/^(\{\{[<%]\s*[\w-]+)([\s\S]*)([>%]\}\})$/);
  return match
    ? { prefix: match[1], attributes: match[2], suffix: match[3] }
    : null;
}

export function splitTagPrefix(prefix: string) {
  const [, delimiter = "", name = ""] =
    prefix.match(/^(<\/?|\{\{[<%]\s*)(.*)$/) ?? [];
  return { delimiter, name };
}

// The tag name is editable with the attributes; only the delimiters are fixed.
export function inlineTagEditor(
  prefix: string,
  attributes: string,
  suffix: string,
) {
  const { delimiter, name } = splitTagPrefix(prefix);
  return {
    delimiter,
    editable: name + attributes,
    commit: (typed: string) => delimiter + typed + suffix,
  };
}

export function inlineTagTokens(
  text: string,
): { type: AttrToken["type"] | "name"; text: string }[] {
  const [name = ""] = text.match(/^\S*/) ?? [];
  return [
    { type: "name", text: name },
    ...parseAttributes(text.slice(name.length)),
  ];
}

// Highlighting is painted only while unfocused, so React never fights the caret.
const InlineTagContent = ({
  prefix,
  attributes,
  suffix,
  onChange,
  theme,
}: {
  prefix: string;
  attributes: string;
  suffix: string;
  onChange: (val: string) => void;
  theme: EditableTagLineTheme;
}) => {
  const ref = useRef<HTMLSpanElement>(null);
  const focused = useRef(false);
  const { delimiter, editable, commit } = inlineTagEditor(
    prefix,
    attributes,
    suffix,
  );
  const tagClass = cn("font-semibold", theme.tagText);

  const paint = (text: string) => {
    ref.current?.replaceChildren(
      ...inlineTagTokens(text).map((token) => {
        const span = document.createElement("span");
        span.className =
          token.type === "name" ? tagClass : ATTR_CLASS[token.type];
        span.textContent = token.text;
        return span;
      }),
    );
  };

  useEffect(() => {
    if (!focused.current) paint(editable);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editable]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const stop = (e: Event) => e.stopPropagation();
    el.addEventListener("beforeinput", stop);
    return () => el.removeEventListener("beforeinput", stop);
  }, []);

  return (
    <span
      className={cn("cursor-text wrap-anywhere whitespace-nowrap", theme.text)}
      dir="ltr"
      contentEditable={false}
      onMouseDown={focusAttributes}
    >
      <span className={cn(tagClass, "select-none")}>{delimiter}</span>
      <span
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        spellCheck={false}
        className="whitespace-pre-wrap caret-stone-900 outline-none dark:caret-stone-100"
        onInput={(e) => {
          e.stopPropagation();
          onChange(commit(e.currentTarget.textContent ?? ""));
        }}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Enter") e.preventDefault();
        }}
        onKeyUp={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        onFocus={(e) => {
          e.stopPropagation();
          focused.current = true;
        }}
        onBlur={(e) => {
          e.stopPropagation();
          focused.current = false;
          paint(e.currentTarget.textContent ?? "");
        }}
      />
      <span className={cn(tagClass, "select-none")}>{suffix}</span>
    </span>
  );
};

const EditableTagLineContent = ({
  prefix,
  attributes,
  suffix,
  text: _text,
  onChange,
  theme,
  inline,
}: {
  prefix: string;
  attributes: string;
  suffix: string;
  text: string;
  onChange: (val: string) => void;
  theme: EditableTagLineTheme;
  inline: boolean;
}) => {
  const [attrValue, setAttrValue] = useState(attributes);
  const [syncedAttributes, setSyncedAttributes] = useState(attributes);
  if (inline) {
    return (
      <InlineTagContent
        prefix={prefix}
        attributes={attributes}
        suffix={suffix}
        onChange={onChange}
        theme={theme}
      />
    );
  }
  if (syncedAttributes !== attributes) {
    setSyncedAttributes(attributes);
    setAttrValue(attributes);
  }

  const tagClass = cn(
    "font-semibold whitespace-nowrap select-none",
    theme.tagText,
  );

  // Highlighted copy underneath, transparent editable text on top.
  return (
    <span
      className={cn(
        "max-w-full min-w-0 cursor-text font-mono",
        "grid text-sm",
        theme.text,
      )}
      style={{ gridTemplateColumns: "minmax(0, 1fr)" }}
      dir="ltr"
      contentEditable={false}
      onMouseDown={focusAttributes}
    >
      <span
        className="pointer-events-none wrap-anywhere whitespace-pre-wrap select-none"
        aria-hidden="true"
        style={{ gridArea: "1/1" }}
      >
        <span className={tagClass}>{prefix}</span>
        <HighlightedAttributes text={attrValue} theme={theme} />
        <span className={tagClass}>{suffix}</span>
      </span>

      <span
        className="relative z-10 wrap-anywhere whitespace-pre-wrap text-transparent"
        style={{ gridArea: "1/1" }}
      >
        <span
          className={cn(tagClass, "pointer-events-none")}
          aria-hidden="true"
        >
          {prefix}
        </span>
        <ContentEditableSpan
          value={attrValue}
          onChange={(val) => {
            setAttrValue(val);
            onChange(`${prefix}${val}${suffix}`);
          }}
          className="inline caret-stone-900 outline-none dark:caret-stone-100"
        />
        <span
          className={cn(tagClass, "pointer-events-none")}
          aria-hidden="true"
        >
          {suffix}
        </span>
      </span>
    </span>
  );
};

export interface EditableTagLineProps {
  text: string;
  propName: TagLinePropName;
  theme: EditableTagLineTheme;
  onChange: (val: string) => void;
  className?: string;
  inline?: boolean;
}

export const EditableTagLine = ({
  text,
  propName,
  theme,
  onChange,
  className,
  inline = propName === "inline",
}: EditableTagLineProps) => {
  const Wrapper = inline ? "span" : "div";
  const wrapperClass = className;

  if (propName === "closing") {
    return (
      <Wrapper
        className={cn(
          "font-mono font-semibold wrap-anywhere select-none",
          !inline && "text-sm",
          theme.tagText,
          wrapperClass,
        )}
        dir="ltr"
        contentEditable={false}
      >
        {text}
      </Wrapper>
    );
  }

  const parts = splitTagLine(text);
  if (!parts) {
    return (
      <Wrapper className={wrapperClass}>
        <FallbackEditableTagLine
          text={text}
          onChange={onChange}
          inline={inline}
          theme={theme}
        />
      </Wrapper>
    );
  }

  return (
    <Wrapper className={wrapperClass}>
      <EditableTagLineContent
        prefix={parts.prefix}
        attributes={parts.attributes}
        suffix={parts.suffix}
        text={text}
        onChange={onChange}
        theme={theme}
        inline={inline}
      />
    </Wrapper>
  );
};
