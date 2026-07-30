import type {
  DeserializeMdOptions,
  MdDecoration,
  SerializeMdOptions,
} from "@platejs/markdown";
import { describe, expect, it } from "vitest";
import {
  KEY_JSX_BLOCK,
  KEY_JSX_INLINE,
  KEY_SHORTCODE,
  KEY_SHORTCODE_INLINE,
} from "./snippet-keys";
import { deserializeShortcode, serializeShortcode } from "./hugo/hugo-serialization";
import { parseJsxString } from "./jsx/jsx-parser";
import {
  deserializeJsx,
  deserializeJsxFromShortcode,
  isJsxComponent,
  serializeJsx,
  type JsxSlateElement,
} from "./jsx/jsx-serialization";

// These rules are the mdast <-> Slate boundary the editor crosses on every
// open and save. The cases below stay on the paths that do not recurse into
// Plate's own node converters, so they run without a live editor.

const deco = {} as MdDecoration;
const deserializeOptions = {} as DeserializeMdOptions;
const serializeOptions = {} as SerializeMdOptions;

describe("parseJsxString", () => {
  it("extracts the component name", () => {
    expect(parseJsxString("<Notice />").name).toBe("Notice");
  });

  it("extracts quoted attributes", () => {
    expect(parseJsxString('<Notice type="warn" title="Hi" />').attributes).toEqual(
      { type: "warn", title: "Hi" },
    );
  });

  it("keeps an attribute value containing an angle bracket", () => {
    expect(parseJsxString('<Notice label="a > b" />').attributes).toMatchObject({
      label: "a > b",
    });
  });

  it("returns an empty name for a lowercase tag", () => {
    expect(parseJsxString("<div />").name).toBe("");
  });

  it("ignores zero-width characters around the tag", () => {
    expect(parseJsxString("<Notice​ />").name).toBe("Notice");
  });
});

describe("isJsxComponent", () => {
  it("is true when the shortcode carries the JSX flag", () => {
    expect(
      isJsxComponent({
        data: { shortcode: { definitionIndex: 0, isJsxComponent: true } },
      }),
    ).toBe(true);
  });

  it("is false for a plain hugo shortcode", () => {
    expect(
      isJsxComponent({ data: { shortcode: { definitionIndex: 1 } } }),
    ).toBe(false);
  });

  it("is false when there is no data at all", () => {
    expect(isJsxComponent({})).toBe(false);
  });
});

describe("deserializeJsxFromShortcode", () => {
  it("rebuilds an inline component from its stored tag", () => {
    const node = deserializeJsxFromShortcode(
      {
        content: "<Badge />",
        data: {
          shortcode: {
            definitionIndex: 0,
            startContent: "<Badge />",
            isJsxComponent: true,
          },
        },
      },
      deco,
      deserializeOptions,
    );

    expect(node.type).toBe(KEY_JSX_INLINE);
    expect(node.name).toBe("Badge");
    expect(node.isSelfClosing).toBe(true);
    expect(node.children).toEqual([{ text: "" }]);
  });

  it("recovers attributes from the stored tag", () => {
    const node = deserializeJsxFromShortcode(
      {
        content: '<Notice type="warn" />',
        data: {
          shortcode: {
            definitionIndex: 0,
            startContent: '<Notice type="warn" />',
            isJsxComponent: true,
          },
        },
      },
      deco,
      deserializeOptions,
    );

    expect(node.attributes).toMatchObject({ type: "warn" });
  });

  it("marks a block component when the meta says so", () => {
    const node = deserializeJsxFromShortcode(
      {
        content: "<Notice>",
        data: {
          shortcode: {
            definitionIndex: 0,
            startContent: "<Notice>",
            isBlock: true,
            isJsxComponent: true,
          },
        },
      },
      deco,
      deserializeOptions,
    );

    expect(node.type).toBe(KEY_JSX_BLOCK);
    expect(node.isSelfClosing).toBe(false);
  });
});

describe("deserializeJsx", () => {
  it("keeps a self-closing node self-closing", () => {
    const node = deserializeJsx(
      { content: "<Badge />", isSelfClosing: true },
      deco,
      deserializeOptions,
      KEY_JSX_INLINE,
    );

    expect(node.isSelfClosing).toBe(true);
    expect(node.children).toEqual([{ text: "" }]);
  });

  it("prefers attributes parsed from the tag over stored ones", () => {
    const node = deserializeJsx(
      {
        content: '<Notice type="parsed" />',
        attributes: { type: "stored", extra: "kept" },
        isSelfClosing: true,
      },
      deco,
      deserializeOptions,
      KEY_JSX_INLINE,
    );

    expect(node.attributes).toMatchObject({ type: "parsed", extra: "kept" });
  });
});

describe("serializeJsx", () => {
  const base = {
    type: KEY_JSX_BLOCK,
    name: "Notice",
    attributes: {},
    content: "",
    isSelfClosing: true,
    children: [{ text: "" }],
  } as JsxSlateElement;

  it("emits a shortcode node flagged as JSX", () => {
    const out = serializeJsx(base, serializeOptions);

    expect(out.type).toBe("shortcode");
    expect(out.data.shortcode.isJsxComponent).toBe(true);
  });

  it("builds a self-closing tag with attributes", () => {
    const out = serializeJsx(
      { ...base, attributes: { type: "warn" } },
      serializeOptions,
    );

    expect(out.data.shortcode.startContent).toBe('<Notice type="warn"/>');
  });

  it("renders a valueless attribute as a bare key", () => {
    const out = serializeJsx(
      { ...base, attributes: { dismissible: true } },
      serializeOptions,
    );

    expect(out.data.shortcode.startContent).toBe("<Notice dismissible/>");
  });

  it("records the block/inline kind so a reopen restores it", () => {
    expect(serializeJsx(base, serializeOptions).data.shortcode.isBlock).toBe(
      true,
    );
    expect(
      serializeJsx({ ...base, type: KEY_JSX_INLINE }, serializeOptions).data
        .shortcode.isBlock,
    ).toBe(false);
  });

  it("keeps the stored tag text as content when present", () => {
    const out = serializeJsx(
      { ...base, content: "<Notice   />" },
      serializeOptions,
    );

    expect(out.content).toBe("<Notice   />");
  });
});

describe("deserializeShortcode", () => {
  it("routes a JSX-flagged shortcode to the JSX deserializer", () => {
    const node = deserializeShortcode(
      {
        content: "<Badge />",
        data: {
          shortcode: {
            definitionIndex: 0,
            startContent: "<Badge />",
            isJsxComponent: true,
          },
        },
      },
      deco,
      deserializeOptions,
    );

    expect(node.type).toBe(KEY_JSX_INLINE);
  });

  it("builds an inline shortcode from its raw content", () => {
    const node = deserializeShortcode(
      {
        content: "{{< badge >}}",
        data: {
          shortcode: {
            definitionIndex: 1,
            startContent: "{{< badge >}}",
          },
        },
      },
      deco,
      deserializeOptions,
    );

    expect(node.type).toBe(KEY_SHORTCODE_INLINE);
    expect(node.children).toEqual([{ text: "{{< badge >}}" }]);
  });

  it("treats a shortcode with a closing tag as a block", () => {
    const node = deserializeShortcode(
      {
        content: "{{< note >}}",
        data: {
          shortcode: {
            definitionIndex: 1,
            startContent: "{{< note >}}",
            closingContent: "{{< /note >}}",
          },
        },
      },
      deco,
      deserializeOptions,
    );

    expect(node.type).toBe(KEY_SHORTCODE);
    expect(node).toMatchObject({
      opening: "{{< note >}}",
      closing: "{{< /note >}}",
      isBlock: true,
    });
  });
});

describe("serializeShortcode", () => {
  it("uses the child text as the tag for an inline shortcode", () => {
    const out = serializeShortcode(
      {
        type: KEY_SHORTCODE_INLINE,
        opening: "",
        closing: "",
        isBlock: false,
        children: [{ text: "{{< badge >}}" }],
      },
      serializeOptions,
    );

    expect(out.content).toBe("{{< badge >}}");
    expect(out.children).toEqual([]);
  });

  it("falls back to the stored opening when there is no child text", () => {
    const out = serializeShortcode(
      {
        type: KEY_SHORTCODE_INLINE,
        opening: "{{< badge >}}",
        closing: "",
        isBlock: false,
        children: [{ text: "" }],
      },
      serializeOptions,
    );

    expect(out.content).toBe("{{< badge >}}");
  });

  it("drops the closing tag for an inline shortcode", () => {
    const out = serializeShortcode(
      {
        type: KEY_SHORTCODE_INLINE,
        opening: "{{< badge >}}",
        closing: "{{< /badge >}}",
        isBlock: false,
        children: [{ text: "" }],
      },
      serializeOptions,
    );

    expect(out.data.shortcode).toMatchObject({
      startContent: "{{< badge >}}",
      closingContent: "",
      isBlock: false,
    });
  });
});
