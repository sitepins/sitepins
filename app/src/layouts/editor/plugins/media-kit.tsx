"use client";

import {
  generatePath,
  generateUniqueFileName,
  sanitizedPath,
} from "@/lib/utils/common";
import { isGitLabProvider } from "@/lib/utils/provider-checker";
import { slugify } from "@/lib/utils/text-converter";
import { githubContentApi } from "@/redux/features/github";
import { gitlabApi } from "@/redux/features/gitlab";
import { store } from "@/redux/store";
import { CaptionPlugin } from "@platejs/caption/react";
import { ImagePlugin, PlaceholderPlugin } from "@platejs/media/react";
import { KEYS, PathApi } from "platejs";
import { toast } from "sonner";
import { extractBase64, ImageElement } from "../plate-ui/media-image-node";
import { PlaceholderElement } from "../plate-ui/media-placeholder-node";
import { MediaPreviewDialog } from "../plate-ui/media-preview-dialog";
import { getBlockType } from "../utils/transforms";

export const MediaKit = [
  ImagePlugin.configure({
    options: {
      disableUploadInsert: true,
      disableEmbedInsert: true,
    },
    render: { afterEditable: MediaPreviewDialog, node: ImageElement },
    parsers: {
      html: {
        deserializer: {
          rules: [
            {
              validNodeName: "IMG",
            },
          ],
          parse: ({ element, type, editor }) => {
            const img = new Image();
            img.crossOrigin = "anonymous"; // must be before src

            img.onload = () => {
              try {
                const canvas = document.createElement("canvas");
                canvas.width = img.naturalWidth;
                canvas.height = img.naturalHeight;
                const ctx = canvas.getContext("2d")!;
                ctx.drawImage(img, 0, 0);
                const base64 = canvas.toDataURL("image/png");

                const config = store.getState().config;
                const ghTrees =
                  githubContentApi.endpoints.getGitHubTrees.select({
                    owner: config.owner,
                    repo: config.repoName,
                    tree_sha: config.branch,
                    recursive: "1",
                    config: config,
                  })(store.getState());

                const glTrees = gitlabApi.endpoints.getGitLabRepoTree.select({
                  projectId: config.repoName
                    ? `${config.owner}/${config.repoName}`
                    : config.owner,
                  ref: config.branch,
                  recursive: true,
                })(store.getState());

                const trees = isGitLabProvider(config.provider)
                  ? glTrees?.data
                  : ghTrees?.data;

                // extract extension from base64
                const mime = base64.slice(5, base64.indexOf(";"));
                const ext = mime.split("/")[1];

                const url = extractBase64(base64);

                const file_name = slugify(
                  element.getAttribute("alt") || "web image" + Date.now(),
                );

                const node = {
                  children: [{ text: "" }],
                  type: KEYS.img,
                  url,
                  isPasted: true,
                  name: file_name + "." + ext,
                };

                // Generate a unique file path for the image
                const { fileName: filepath } = generateUniqueFileName(
                  trees?.trees?.find((t: any) => t.name === "media")?.children!,
                  sanitizedPath(config.media, node.name),
                );

                node.url =
                  "/" + generatePath(config.media, filepath, config.public); // Set the file path in the image element

                // insert node
                editor.tf.withoutNormalizing(() => {
                  const block = editor.api.block();

                  if (!block) return;

                  const [currentNode, path] = block;
                  const isCurrentBlockEmpty = editor.api.isEmpty(currentNode);
                  const currentBlockType = getBlockType(currentNode);

                  const isSameBlockType = type === currentBlockType;

                  if (isCurrentBlockEmpty && isSameBlockType) {
                    return;
                  }

                  editor.tf.insertNodes(node, {
                    at: PathApi.next(path),
                    select: true,
                  });

                  if (!isSameBlockType) {
                    editor.tf.removeNodes({ previousEmptyBlock: true });
                  }
                });

                // Create image item for the store
                const imageContent = {
                  path: filepath,
                  content: url, // base64 content
                };

                window.dispatchEvent(
                  new CustomEvent("image-pasted", {
                    detail: imageContent,
                  }),
                );
              } catch {
                toast.error("Error copying the image");
              }
            };
            img.src = (element as HTMLImageElement).src;
            return;
          },
        },
      },
    },
  }),
  PlaceholderPlugin.configure({
    options: { disableEmptyPlaceholder: true },
    render: { node: PlaceholderElement },
  }),
  CaptionPlugin.configure({
    options: {
      query: {
        allow: [KEYS.img],
      },
    },
  }),
];
