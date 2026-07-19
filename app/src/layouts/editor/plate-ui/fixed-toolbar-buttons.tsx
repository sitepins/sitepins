import { LinkToolbarButton } from "@/editor/plate-ui/link-toolbar-button";
import OverflowMenu from "@/editor/plate-ui/overflow-menu";
import { RawMarkdownToolbarButton } from "@/editor/plate-ui/raw-markdown-toolbar-button";
import { ToolbarGroup } from "@/editor/plate-ui/toolbar";
import {
  CONTAINER_MD_BREAKPOINT,
  FLOAT_BUTTON_WIDTH,
  HEADING_ICON_ONLY,
  HEADING_ICON_WITH_TEXT,
  RAW_ICON_ONLY,
  RAW_ICON_WITH_TEXT,
  SNIPPET_ICON_ONLY,
  SNIPPET_ICON_WITH_TEXT,
  STANDARD_ICON_WIDTH,
  type ToolbarOverrideType,
} from "@/editor/plate-ui/toolbar-overrides";
import { useMediaQuery } from "@/hooks/use-media-query";
import { useOwnerPlan } from "@/hooks/use-owner-plan";
import { useResize } from "@/hooks/use-resize";
import { useSnippets } from "@/hooks/use-snippets";
import { cn } from "@/lib/utils/cn";
import { useTranslations } from "next-intl";
import { KEYS } from "platejs";
import { useEditorRef } from "platejs/react";
import React, { useMemo, useRef, useState } from "react";
import { isActiveNode, unsupportedItemsInTable } from "../utils/plate-utils";
import { CodeBlockToolbarButton } from "./code-block-toolbar-button";
import { ExpandToolbarButton } from "./expand-editor-button";
import { HeadingsMenu } from "./headings-dropdown";
import { Icons } from "./icons";
import { ImageToolbarButton } from "./image-toolbar-button";
import {
  BulletedListToolbarButton,
  NumberedListToolbarButton,
} from "./list-toolbar-button";
import { MarkToolbarButton } from "./mark-toolbar-button";
import { QuoteToolbarButton } from "./quote-toolbar-button";
import SnippetsToolbarButton from "./snippets-toolbar-button";
import { TableToolbarButton } from "./table-toolbar-button";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Where the item sits in the toolbar layout. */
type ItemPosition = "left" | "center" | "right";

/** Props the toolbar passes into each item's render function for layout hints. */
type RenderOpts = {
  /** Remove the trailing separator (used for the last visible item before overflow). */
  noSeparator?: boolean;
  /** Extra className injected by the toolbar (e.g. `ml-auto` for first right-side item). */
  className?: string;
  /**
   * Whether an overflow menu is present. Some items (e.g. Raw Markdown) render
   * in a compact icon-only form when the overflow button is taking up space.
   */
  hasOverflow?: boolean;
  /**
   * Whether the Raw Markdown button should be in icon-only mode.
   */
  isRawNarrow?: boolean;
};

type ToolbarItemDef = {
  key: ToolbarOverrideType;
  label: string;
  position: ItemPosition;
  /**
   * Returns the pixel width this item occupies.
   * - `isWide`      — true when the toolbar exceeds CONTAINER_MD_BREAKPOINT.
   * - `isNarrowHint` — true when layout is testing narrow fallback for items like Raw.
   */
  getWidth: (isWide: boolean, isNarrowHint?: boolean) => number;
  /** Renders the item. Accepts optional layout hints from the toolbar. */
  render: (opts?: RenderOpts) => React.ReactNode;
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function FixedToolbarButtons() {
  const tEditorToolbar = useTranslations("editor.toolbar");
  const { snippets } = useSnippets();
  const { canAccessPremiumFeatures } = useOwnerPlan();
  const isMobileMediaQuery = useMediaQuery("(max-width: 1536px)");
  const editor = useEditorRef();
  const toolbarRef = useRef<HTMLDivElement>(null);

  const isTableFocused = isActiveNode(editor, KEYS.table);

  /**
   * Keys of labels that collapse into the overflow menu on small screens (<640 px)
   * regardless of available space.
   */
  const MOBILE_OVERFLOW_KEYS = useMemo(
    () => new Set(["code", "quote", "code_block"]),
    [],
  );

  const TOOLBAR_ITEMS: ToolbarItemDef[] = useMemo(
    () => [
      // ── Left-pinned ──────────────────────────────────────────────────────────
      {
        key: "heading",
        label: tEditorToolbar("headings"),
        position: "left",
        getWidth: (isWide) =>
          isWide ? HEADING_ICON_WITH_TEXT : HEADING_ICON_ONLY,
        render: ({ noSeparator, className } = {}) => (
          <ToolbarGroup noSeparator={noSeparator} className={className}>
            <HeadingsMenu />
          </ToolbarGroup>
        ),
      },

      // ── Centre (overflow candidates) ─────────────────────────────────────────
      {
        key: "link",
        label: tEditorToolbar("link"),
        position: "center",
        getWidth: () => STANDARD_ICON_WIDTH,
        render: ({ noSeparator, className } = {}) => (
          <ToolbarGroup noSeparator={noSeparator} className={className}>
            <LinkToolbarButton />
          </ToolbarGroup>
        ),
      },
      {
        key: "image",
        label: tEditorToolbar("image"),
        position: "center",
        getWidth: () => STANDARD_ICON_WIDTH,
        render: ({ noSeparator, className } = {}) => (
          <ToolbarGroup noSeparator={noSeparator} className={className}>
            <ImageToolbarButton />
          </ToolbarGroup>
        ),
      },
      {
        key: "quote",
        label: tEditorToolbar("quote"),
        position: "center",
        getWidth: () => STANDARD_ICON_WIDTH,
        render: ({ noSeparator, className } = {}) => (
          <ToolbarGroup noSeparator={noSeparator} className={className}>
            <QuoteToolbarButton
              tooltip={tEditorToolbar("quote_tooltip")}
              nodeType={KEYS.blockquote}
            >
              <Icons.quote />
            </QuoteToolbarButton>
          </ToolbarGroup>
        ),
      },
      {
        key: "ul",
        label: tEditorToolbar("ul"),
        position: "center",
        getWidth: () => STANDARD_ICON_WIDTH,
        render: ({ noSeparator, className } = {}) => (
          <ToolbarGroup noSeparator={noSeparator} className={className}>
            <BulletedListToolbarButton />
          </ToolbarGroup>
        ),
      },
      {
        key: "ol",
        label: tEditorToolbar("ol"),
        position: "center",
        getWidth: () => STANDARD_ICON_WIDTH,
        render: ({ noSeparator, className } = {}) => (
          <ToolbarGroup noSeparator={noSeparator} className={className}>
            <NumberedListToolbarButton />
          </ToolbarGroup>
        ),
      },
      {
        key: "bold",
        label: tEditorToolbar("bold"),
        position: "center",
        getWidth: () => STANDARD_ICON_WIDTH,
        render: ({ noSeparator, className } = {}) => (
          <ToolbarGroup noSeparator={noSeparator} className={className}>
            <MarkToolbarButton
              tooltip={tEditorToolbar("bold_tooltip")}
              nodeType={KEYS.bold}
            >
              <Icons.bold />
            </MarkToolbarButton>
          </ToolbarGroup>
        ),
      },
      {
        key: "italic",
        label: tEditorToolbar("italic"),
        position: "center",
        getWidth: () => STANDARD_ICON_WIDTH,
        render: ({ noSeparator, className } = {}) => (
          <ToolbarGroup noSeparator={noSeparator} className={className}>
            <MarkToolbarButton
              tooltip={tEditorToolbar("italic_tooltip")}
              nodeType={KEYS.italic}
            >
              <Icons.italic />
            </MarkToolbarButton>
          </ToolbarGroup>
        ),
      },
      {
        key: "code",
        label: tEditorToolbar("code"),
        position: "center",
        getWidth: () => STANDARD_ICON_WIDTH,
        render: ({ noSeparator, className } = {}) => (
          <ToolbarGroup noSeparator={noSeparator} className={className}>
            <MarkToolbarButton
              tooltip={tEditorToolbar("code_tooltip")}
              nodeType={KEYS.code}
            >
              <Icons.code />
            </MarkToolbarButton>
          </ToolbarGroup>
        ),
      },
      {
        key: "code_block",
        label: tEditorToolbar("code_block"),
        position: "center",
        getWidth: () => STANDARD_ICON_WIDTH,
        render: ({ noSeparator, className } = {}) => (
          <ToolbarGroup noSeparator={noSeparator} className={className}>
            <CodeBlockToolbarButton
              tooltip={tEditorToolbar("code_block_tooltip")}
              nodeType={KEYS.codeBlock}
            >
              <Icons.codeBlock />
            </CodeBlockToolbarButton>
          </ToolbarGroup>
        ),
      },
      {
        key: "table",
        label: tEditorToolbar("table"),
        position: "center",
        getWidth: () => STANDARD_ICON_WIDTH,
        render: ({ noSeparator, className } = {}) => (
          <ToolbarGroup noSeparator={noSeparator} className={className}>
            <TableToolbarButton />
          </ToolbarGroup>
        ),
      },
      {
        key: "embed",
        label: tEditorToolbar("snippets"),
        position: "center",
        getWidth: (isWide) =>
          isWide ? SNIPPET_ICON_WITH_TEXT : SNIPPET_ICON_ONLY,
        render: ({ noSeparator, className } = {}) => (
          <ToolbarGroup noSeparator={noSeparator} className={className}>
            <SnippetsToolbarButton />
          </ToolbarGroup>
        ),
      },

      // ── Right-pinned ──────────────────────────────────────────────────────────
      {
        key: "raw",
        label: tEditorToolbar("raw"),
        position: "right",
        getWidth: (isWide, isNarrowHint) =>
          isWide && !isNarrowHint ? RAW_ICON_WITH_TEXT : RAW_ICON_ONLY,
        render: ({ noSeparator, className, isRawNarrow } = {}) => (
          <ToolbarGroup
            nonce=""
            noSeparator={noSeparator}
            className={cn("py-0", className)}
          >
            <RawMarkdownToolbarButton iconOnly={isRawNarrow} />
          </ToolbarGroup>
        ),
      },
      {
        key: "expand",
        label: tEditorToolbar("expand_tooltip"),
        position: "right",
        getWidth: () => STANDARD_ICON_WIDTH,
        render: ({ noSeparator, className } = {}) => (
          <ToolbarGroup
            nonce=""
            noSeparator={noSeparator}
            className={className}
          >
            <ExpandToolbarButton />
          </ToolbarGroup>
        ),
      },
    ],
    [tEditorToolbar],
  );

  // ── 1. Filter items based on runtime context ────────────────────────────
  const filteredItems = useMemo(() => {
    return TOOLBAR_ITEMS.filter((item) => {
      if (isTableFocused && unsupportedItemsInTable.has(item.key)) return false;
      if (
        item.key === "embed" &&
        (snippets.length === 0 || !canAccessPremiumFeatures)
      )
        return false;
      if (item.key === "expand" && isMobileMediaQuery) return false;
      return true;
    });
  }, [
    isTableFocused,
    snippets.length,
    canAccessPremiumFeatures,
    isMobileMediaQuery,
    TOOLBAR_ITEMS,
  ]);

  // ── 2. Split into positional buckets ────────────────────────────────────
  const leftItems = useMemo(
    () => filteredItems.filter((i) => i.position === "left"),
    [filteredItems],
  );
  const centerItems = useMemo(
    () => filteredItems.filter((i) => i.position === "center"),
    [filteredItems],
  );
  const rightItems = useMemo(
    () => filteredItems.filter((i) => i.position === "right"),
    [filteredItems],
  );

  // ── 3. Resize → how many centre items fit + whether overflow exists ────────
  const [layout, setLayout] = useState({
    fitCount: 11,
    isSmallScreen: false,
    hasOverflow: false,
    isRawNarrow: false,
  });

  useResize(toolbarRef, (entry) => {
    const width = entry.target.getBoundingClientRect().width;
    const small = width < 640;
    const isWide = width > CONTAINER_MD_BREAKPOINT;

    // Center items eligible to appear on this screen size.
    const eligible = centerItems.filter(
      (item) => !(small && MOBILE_OVERFLOW_KEYS.has(item.key)),
    );
    const hasMobileHidden =
      small && centerItems.some((item) => MOBILE_OVERFLOW_KEYS.has(item.key));

    /**
     * Core fit algorithm.
     * @param isNarrowHint — the assumed narrow state fed into getWidth.
     */
    const computeFit = (isNarrowHint: boolean) => {
      // Fixed budget: left-pinned + right-pinned items (Raw's width varies by hint).
      const fixedWidth = [...leftItems, ...rightItems].reduce(
        (sum, item) => sum + item.getWidth(isWide, isNarrowHint),
        0,
      );

      let count = 0;
      let usedWidth = fixedWidth;
      let willOverflow = hasMobileHidden;

      for (let i = 0; i < eligible.length; i++) {
        const itemWidth = eligible[i].getWidth(isWide);
        const isLast = i === eligible.length - 1;

        // Reserve space for the overflow button whenever more items follow or
        // we already know some items will be hidden.
        const needed =
          !isLast || willOverflow
            ? usedWidth + itemWidth + FLOAT_BUTTON_WIDTH
            : usedWidth + itemWidth;

        if (needed <= width) {
          usedWidth += itemWidth;
          count++;
        } else {
          willOverflow = true;
          break;
        }
      }

      // Safety pop: ensure the overflow button itself fits.
      if (willOverflow) {
        while (count > 0 && usedWidth + FLOAT_BUTTON_WIDTH > width) {
          usedWidth -= eligible[count - 1].getWidth(isWide);
          count--;
        }
      }

      return { count, willOverflow };
    };

    // Pass 1 — optimistic (no overflow assumed).
    let { count, willOverflow } = computeFit(false);
    let hasOverflow = willOverflow;
    let isRawNarrow = false;

    if (willOverflow) {
      // Pass 2 — Raw shrinks to icon-only; recompute with the freed space.
      const pass2 = computeFit(true);
      isRawNarrow = true;

      count = pass2.count;
      hasOverflow = pass2.willOverflow;
    }

    setLayout({
      fitCount: count,
      isSmallScreen: small,
      hasOverflow,
      isRawNarrow,
    });
  });

  // ── 4. Derive visible vs overflow centre items ──────────────────────────
  const { fitCount, isSmallScreen, hasOverflow, isRawNarrow } = layout;

  const eligibleCenter = centerItems.filter(
    (item) => !(isSmallScreen && MOBILE_OVERFLOW_KEYS.has(item.key)),
  );
  const mobileOverflow = isSmallScreen
    ? centerItems.filter((item) => MOBILE_OVERFLOW_KEYS.has(item.key))
    : [];

  const centerVisible = eligibleCenter.slice(0, fitCount);
  const centerOverflow = [...eligibleCenter.slice(fitCount), ...mobileOverflow];

  // ── 5. Final visual order ────────────────────────────────────────────────
  const visibleItems = [...leftItems, ...centerVisible, ...rightItems];
  const firstRightIndex = leftItems.length + centerVisible.length;

  return (
    <div className="@container/toolbar w-full overflow-hidden" ref={toolbarRef}>
      <div
        className="mx-1.5 flex min-h-10"
        style={{ transform: "translateX(calc(-1px))" }}
      >
        {visibleItems.map((item, index) => (
          <React.Fragment key={item.key}>
            {item.render({
              className: index === firstRightIndex ? "ml-auto" : undefined,
              noSeparator: index === visibleItems.length - 1 && hasOverflow,
              hasOverflow,
              isRawNarrow,
            })}
          </React.Fragment>
        ))}

        {hasOverflow && (
          <div
            className={cn("self-center", rightItems.length === 0 && "ml-auto")}
          >
            <OverflowMenu>
              {centerOverflow.map((item) => (
                <React.Fragment key={item.key}>{item.render()}</React.Fragment>
              ))}
            </OverflowMenu>
          </div>
        )}
      </div>
    </div>
  );
}
