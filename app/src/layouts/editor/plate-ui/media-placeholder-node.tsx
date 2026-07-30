"use client";

import { logger } from "@/lib/logger";
import {
  generatePath,
  generateUniqueFileName,
  sanitizedPath,
} from "@/lib/utils/common";
import { slugifyFilename } from "@/lib/utils/text-converter";
import { getGitProviderAdapter } from "@/redux/features/git/provider-adapter";
import { store } from "@/redux/store";
import type { TFiles } from "@/types";
import { PlaceholderPlugin, PlaceholderProvider } from "@platejs/media/react";
import type { TPlaceholderElement } from "platejs";
import { KEYS } from "platejs";
import type { PlateElementProps } from "platejs/react";
import { PlateElement, useEditorPlugin, withHOC } from "platejs/react";
import { useCallback, useEffect, useRef } from "react";

export const PlaceholderElement = withHOC(
  PlaceholderProvider,
  function PlaceholderElement(props: PlateElementProps<TPlaceholderElement>) {
    const { editor, element } = props;

    const { api } = useEditorPlugin(PlaceholderPlugin);

    const config = store.getState().config;
    const trees = getGitProviderAdapter(config.provider).selectCachedTree(
      store.getState(),
    );

    const replaceCurrentPlaceholder = useCallback(
      (file: File) => {
        if (element.mediaType === KEYS.img) {
          const reader = new FileReader();
          reader.onload = () => {
            const url = reader.result as string;
            const path = editor.api.findPath(element);

            editor.tf.withoutSaving(() => {
              editor.tf.removeNodes({ at: path });
              try {
                // Create image element
                const node = {
                  children: [{ text: "" }],
                  type: KEYS.img,
                  url,
                  isPasted: true,
                  name: slugifyFilename(file.name),
                  data_url: url,
                };

                // Generate a unique file path for the image
                const { fileName: filepath } = generateUniqueFileName(
                  trees?.trees?.find((t: TFiles) => t.name === "media")
                    ?.children ?? [],
                  sanitizedPath(config.media, node.name),
                );

                node.url =
                  "/" + generatePath(config.media, filepath, config.public); // Set the file path in the image element

                // insert node
                editor.tf.insertNodes(node, { at: path });

                // Create image item for the store
                const imageItem = {
                  path: filepath,
                  content: extractBase64(node.data_url), // base64 content
                };

                window.dispatchEvent(
                  new CustomEvent("image-pasted", {
                    detail: imageItem,
                  }),
                );

                return;
              } catch (error) {
                logger.error("Error handling pasted image:", error);
              }
            });
          };
          reader.readAsDataURL(file);
          return;
        }
        api.placeholder.addUploadingFile(element.id as string, file);
      },
      [
        element,
        api.placeholder,
        editor.api,
        editor.tf,
        trees?.trees,
        config.media,
        config.public,
      ],
    );

    // React dev mode will call React.useEffect twice
    const isReplaced = useRef(false);

    /** Paste and drop */
    useEffect(() => {
      if (isReplaced.current) return;

      isReplaced.current = true;
      const currentFiles = api.placeholder.getUploadingFile(
        element.id as string,
      );

      if (!currentFiles) return;

      replaceCurrentPlaceholder(currentFiles);

      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isReplaced]);

    return (
      <PlateElement className="my-1" {...props}>
        {props.children}
      </PlateElement>
    );
  },
);

export const extractBase64 = (dataUrl: string): string => {
  const index = dataUrl.indexOf(",");
  if (index === -1) return ""; // no comma = invalid data URL
  return dataUrl.slice(index + 1);
};
