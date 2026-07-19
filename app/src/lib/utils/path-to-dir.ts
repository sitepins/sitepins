import { TConfig, TFiles, TTree } from "@/types";
import { checkMedia } from "./check-media-file";

function normalizeDir(dir: string | undefined, defaultDir: string): string {
  if (!dir) return defaultDir;
  return dir.endsWith("/") ? dir.slice(0, -1) : dir;
}

const formatPathsIntoDir = ({
  files,
  paths,
  sha,
  type,
  repoTree,
}: {
  files: TFiles[];
  paths: string;
  sha: string | null;
  type: "media" | "content";
  repoTree: TTree[];
}) => {
  let currentLevel = files;
  const pathsArray = paths.split("/");

  for (let index = 0; index < pathsArray.length; index++) {
    const item = pathsArray[index];
    if (!item || item === ".gitkeep") continue;

    const currentPath = pathsArray.slice(0, index + 1).join("/");

    const treeItem = repoTree.find((treeItem) => treeItem.path === currentPath);

    let isDirectory: boolean;
    if (treeItem) {
      isDirectory = treeItem.type === "tree";
    } else {
      isDirectory =
        index < pathsArray.length - 1 || !/\.[a-zA-Z0-9]+$/.test(item);
    }

    const existingEntry = currentLevel.find((entry) => entry.name === item);

    if (!existingEntry) {
      const newNode: TFiles = {
        name: item,
        path: `${type}/${pathsArray.slice(0, index + 1).join("/")}`,
        sha,
        isFile: !isDirectory,
        // @ts-ignore
        isMedia: type === "media",
        size: treeItem?.size,
      };

      if (isDirectory) newNode.children = [];

      currentLevel.push(newNode);
      currentLevel = isDirectory ? newNode.children! : currentLevel;
    } else {
      currentLevel = isDirectory ? existingEntry.children! : currentLevel;
    }
  }
};

interface FilteredResult {
  contentFiles: TFiles[];
  codeFiles: TFiles[];
  mediaFiles: TFiles[];
  themeFiles: TFiles[];
}

export function convertRepoTreeToTFiles(
  repoTree: TTree[],
  contentDir: string,
  mediaDir?: string,
  themeConfig: string[] = [],
): FilteredResult {
  const contentFiles: TFiles[] = [];
  const codeFiles: TFiles[] = [];
  const mediaFiles: TFiles[] = [];
  const themeFiles: TFiles[] = [];

  const normalizedContentDir = normalizeDir(contentDir, "src/content");
  const normalizedMediaDir = mediaDir ? normalizeDir(mediaDir, "") : undefined;

  const filteredTree = repoTree.filter((item) => {
    const isInContent =
      item.path!.startsWith(normalizedContentDir + "/") ||
      item.path === normalizedContentDir;

    const isInMedia =
      normalizedMediaDir &&
      (item.path!.startsWith(normalizedMediaDir + "/") ||
        item.path === normalizedMediaDir);

    const isInTheme = themeConfig.some(
      (themePath) =>
        item.path === themePath || item.path?.startsWith(themePath + "/"),
    );

    return isInContent || isInMedia || isInTheme;
  });

  // For code files: everything NOT in content or media folders
  const codeTree = repoTree.filter((item) => {
    // Exclude hidden files and .sitepins folder
    if (item.path?.startsWith(".")) return false;

    // Filter out media files from Code section
    if (item.type === "blob" && checkMedia(item.path!)) {
      return false;
    }

    const isInContent =
      item.path!.startsWith(normalizedContentDir + "/") ||
      item.path === normalizedContentDir;

    const isInMedia =
      normalizedMediaDir &&
      (item.path!.startsWith(normalizedMediaDir + "/") ||
        item.path === normalizedMediaDir);

    const isInTheme = themeConfig.some(
      (themePath) =>
        item.path === themePath || item.path?.startsWith(themePath + "/"),
    );

    // Include everything that is NOT in content, media, or theme
    return !isInContent && !isInMedia && !isInTheme;
  });

  for (const item of filteredTree) {
    const isTheme = themeConfig.some(
      (themePath) =>
        item.path === themePath || item.path?.startsWith(themePath + "/"),
    );

    if (isTheme) {
      formatPathsIntoDir({
        files: themeFiles,
        paths: item.path!,
        sha: item.sha!,
        type: "content",
        repoTree,
      });
      continue;
    }
    // path is in content directory
    const isInContentDir =
      item.path!.startsWith(normalizedContentDir + "/") ||
      item.path === normalizedContentDir;

    if (isInContentDir) {
      formatPathsIntoDir({
        files: contentFiles,
        paths: item.path!,
        sha: item.sha!,
        type: "content",
        repoTree,
      });
      continue;
    }

    const isInMediaDir =
      normalizedMediaDir &&
      (item.path!.startsWith(normalizedMediaDir + "/") ||
        item.path === normalizedMediaDir);

    if (isInMediaDir) {
      formatPathsIntoDir({
        files: mediaFiles,
        paths: item.path!,
        sha: item.sha!,
        type: 'media',
        repoTree,
      });
      continue;
    }

    const isMediaByCheck =
      !normalizedMediaDir && item.type === "blob" && checkMedia(item.path!);

    if (isMediaByCheck) {
      formatPathsIntoDir({
        files: mediaFiles,
        paths: item.path!,
        sha: item.sha!,
        type: 'media',
        repoTree,
      });
      continue;
    }

    formatPathsIntoDir({
      files: contentFiles,
      paths: item.path!,
      sha: item.sha!,
      type: "content",
      repoTree,
    });
  }

  // Process code files (everything except content/media/theme)
  for (const item of codeTree) {
    formatPathsIntoDir({
      files: codeFiles,
      paths: item.path!,
      sha: item.sha!,
      type: "content",
      repoTree,
    });
  }

  return { contentFiles, codeFiles, mediaFiles, themeFiles };
}

const pruneEmptyFolders = (files: TFiles[]): TFiles[] => {
  return files
    .map((file) => ({
      ...file,
      children: file.children ? pruneEmptyFolders(file.children) : undefined,
    }))
    .filter((file) => {
      if (file.isFile || file.type === "heading") return true;
      if (file.children && file.children.length > 0) return true;
      return false;
    });
};

export const pathToDir = (repoFiles: TTree[], config: TConfig): TFiles[] => {
  const contentUrl = normalizeDir(config?.content, "");
  const mediaUrl = normalizeDir(config.media, "");
  const themeConfig = config.configs;

  const convertedFiles = convertRepoTreeToTFiles(
    repoFiles,
    contentUrl,
    mediaUrl,
    themeConfig,
  );

  return [
    {
      name: "root",
      sha: null,
      path: "content",
      isFile: false,
      children: (() => {
        const segments = contentUrl.split("/").filter(Boolean);
        if (segments.length === 1) {
          const first = convertedFiles.contentFiles[0];
          return convertedFiles.contentFiles.length === 1 &&
            first?.name === segments[0] &&
            Array.isArray(first.children)
            ? first.children!
            : convertedFiles.contentFiles;
        }

        let nodes = convertedFiles.contentFiles;
        let foundAll = true;
        for (const seg of segments) {
          const next = nodes.find((n) => n.name === seg);
          if (!next || !next.children) {
            foundAll = false;
            break;
          }
          nodes = next.children;
        }
        return foundAll ? nodes : convertedFiles.contentFiles;
      })(),
    },

    {
      name: "media",
      sha: null,
      path: "media",
      isFile: false,
      children: convertedFiles.mediaFiles,
    },
    {
      name: "theme",
      sha: null,
      path: "theme",
      isFile: false,
      children: convertedFiles.themeFiles,
    },
    {
      name: "code",
      sha: null,
      path: "code",
      isFile: false,
      children: pruneEmptyFolders(convertedFiles.codeFiles),
    },
  ];
};
