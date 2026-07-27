import { MdImage } from "@platejs/markdown";
import { KEYS } from "platejs";

/**
 * Serializes image Slate nodes to mdast
 * Handles caption extraction
 */
export const serializeImage = (slateNode: any) => {
  const caption = (slateNode.caption || []) as { text?: string }[];
  const url = slateNode.url as string;
  const image: MdImage = {
    alt: caption ? caption.map((c) => c.text || "").join("") : undefined,
    type: "image",
    url,
  };
  return { children: [image], type: "paragraph" } as any;
};

/**
 * Markdown serialization rules for images
 */
export const imageSerializationRules = {
  [KEYS.img]: {
    serialize: serializeImage,
  },
};
