import { BaseCaptionPlugin } from "@platejs/caption";
import {
  BaseImagePlugin,
  BaseMediaEmbedPlugin,
  BasePlaceholderPlugin,
} from "@platejs/media";
import { KEYS } from "platejs";
import { ImageElementStatic } from "./media-image-node-static";

export const BaseMediaKit = [
  BaseImagePlugin.withComponent(ImageElementStatic),
  BaseCaptionPlugin.configure({
    options: {
      query: {
        allow: [KEYS.img, KEYS.mediaEmbed],
      },
    },
  }),
  BaseMediaEmbedPlugin,
  BasePlaceholderPlugin,
];
