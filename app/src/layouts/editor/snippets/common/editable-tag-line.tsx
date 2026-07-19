"use client";

import { cn } from "@/lib/utils/cn";
import { CSSProperties, useEffect, useRef, useState } from "react";

type TagLinePropName = "opening" | "closing" | "inline";

export interface EditableTagLineTheme {
  text: string;
  tagText: string;
}

export const ContentEditableSpan = ({
  value,
  onChange,
  onBlur,
  className,
  onFocus,
  style,
}: {
  value: string;
  onChange: (val: string) => void;
  onBlur?: () => void;
  className?: string;
  onFocus?: () => void;
  style?: CSSProperties;
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

  const initialValue = useRef(value);

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
      {initialValue.current}
    </span>
  );
};

const FallbackEditableTagLine = ({
  text,
  onChange,
}: {
  text: string;
  onChange: (val: string) => void;
}) => {
  const [value, setValue] = useState(text);

  useEffect(() => {
    setValue(text);
  }, [text]);

  return (
    <div className="inline-block" contentEditable={false}>
      <ContentEditableSpan
        value={value}
        onChange={(val) => {
          setValue(val);
          onChange(val);
        }}
        className="text-text-dark font-mono text-xs"
      />
    </div>
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

export const HighlightedAttributes = ({
  text,
  theme,
}: {
  text: string;
  theme: EditableTagLineTheme;
}) => {
  const tokens = parseAttributes(text);

  return (
    <>
      {tokens.map((token, i) => {
        let className = "";
        switch (token.type) {
          case "key":
            // Use a brighter/lighter color for keys
            className = "text-yellow-600 dark:text-yellow-400 font-medium";
            break;
          case "value":
            // Use a string-like color for values
            className = "text-emerald-600 dark:text-emerald-400";
            break;
          case "eq":
            className = "text-slate-400 dark:text-slate-500";
            break;
          default:
            className = "";
        }
        return (
          <span key={i} className={className}>
            {token.text}
          </span>
        );
      })}
    </>
  );
};

const EditableTagLineContent = ({
  prefix,
  attributes,
  suffix,
  text,
  onChange,
  theme,
}: {
  prefix: string;
  attributes: string;
  suffix: string;
  text: string;
  onChange: (val: string) => void;
  theme: EditableTagLineTheme;
}) => {
  const [attrValue, setAttrValue] = useState(attributes);

  useEffect(() => {
    setAttrValue(attributes);
  }, [attributes]);

  return (
    <div
      className={cn("min-w-0 font-mono text-sm", theme.text)}
      contentEditable={false}
    >
      <span
        className={cn(
          "font-semibold whitespace-nowrap select-none",
          theme.tagText,
        )}
      >
        {prefix}
      </span>

      {/* CSS Grid overlay: both children share the same cell so they always align */}
      <span
        className="inline-grid min-w-1.25 align-top"
        style={{ gridTemplateColumns: "1fr" }}
      >
        <span
          className="pointer-events-none z-0 wrap-break-word whitespace-pre-wrap select-none"
          aria-hidden="true"
          style={{ gridArea: "1/1" }}
        >
          {attrValue ? (
            <HighlightedAttributes text={attrValue} theme={theme} />
          ) : (
            <span>&nbsp;</span>
          )}
        </span>

        <ContentEditableSpan
          value={attrValue}
          onChange={(val) => {
            setAttrValue(val);
            onChange(`${prefix}${val}${suffix}`);
          }}
          className="relative z-10 wrap-break-word whitespace-pre-wrap text-transparent caret-stone-900 outline-none dark:caret-stone-100"
          style={{ gridArea: "1/1" }}
        />
      </span>

      <span
        className={cn(
          "font-semibold whitespace-nowrap select-none",
          theme.tagText,
        )}
      >
        {suffix}
      </span>
    </div>
  );
};

export interface EditableTagLineProps {
  text: string;
  propName: TagLinePropName;
  theme: EditableTagLineTheme;
  onChange: (val: string) => void;
  className?: string;
}

export const EditableTagLine = ({
  text,
  propName,
  theme,
  onChange,
  className,
}: EditableTagLineProps) => {
  if (propName === "closing") {
    return (
      <div
        className={cn(
          "font-mono text-sm font-semibold select-none",
          theme.tagText,
          className,
        )}
        contentEditable={false}
      >
        {text}
      </div>
    );
  }

  let prefix = "";
  let suffix = "";
  let attributes = "";

  const jsxMatch = text.match(/^(<[\w-]+)([\s\S]*)(>)$/);
  const jsxSelfClosingMatch = text.match(/^(<[\w-]+)([\s\S]*)(\/>)$/);
  const hugoMatch = text.match(/^(\{\{[<%]\s*[\w-]+)([\s\S]*)([>%]\}\})$/);

  if (jsxSelfClosingMatch) {
    prefix = jsxSelfClosingMatch[1];
    attributes = jsxSelfClosingMatch[2];
    suffix = jsxSelfClosingMatch[3];
  } else if (jsxMatch) {
    prefix = jsxMatch[1];
    attributes = jsxMatch[2];
    suffix = jsxMatch[3];
  } else if (hugoMatch) {
    prefix = hugoMatch[1];
    attributes = hugoMatch[2];
    suffix = hugoMatch[3];
  } else {
    return <FallbackEditableTagLine text={text} onChange={onChange} />;
  }

  return (
    <div className={className}>
      <EditableTagLineContent
        prefix={prefix}
        attributes={attributes}
        suffix={suffix}
        text={text}
        onChange={onChange}
        theme={theme}
      />
    </div>
  );
};
