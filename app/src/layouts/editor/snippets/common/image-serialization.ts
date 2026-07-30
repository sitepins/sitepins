import { MdImage, MdParagraph, MdRules } from "@platejs/markdown";
import { KEYS } from "platejs";

/**
 * Serializes image Slate nodes to mdast
 * Handles caption extraction
 */
type ImageSlateNode = { caption?: { text?: string }[]; url: string };

export const serializeImage = (slateNode: ImageSlateNode): MdParagraph => {
  const caption = slateNode.caption || [];
  const url = slateNode.url;
  const image: MdImage = {
    alt: caption ? caption.map((c) => c.text || "").join("") : undefined,
    type: "image",
    url,
  };
  return { children: [image], type: "paragraph" };
};

/**
 * Markdown serialization rules for images
 *
 * Plate types `img.serialize` as returning an `Image`, but the image is wrapped
 * in a paragraph so it survives as a block; the cast records that divergence.
 */
export const imageSerializationRules = {
  [KEYS.img]: {
    serialize: serializeImage as unknown as NonNullable<
      MdRules["img"]
    >["serialize"],
  },
};
