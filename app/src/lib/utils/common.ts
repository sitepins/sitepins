import { slugify } from "@/lib/utils/text-converter";
import { TArrangement, TConfig, TFiles } from "@/types";
const path = {
  join: (...args: string[]) => {
    const res = args
      .filter(Boolean)
      .join("/")
      .replace(/\/{2,}/g, "/");
    if (res === "./") return ".";
    return res.replace(/^\.\//, "").replace(/\/\.$/, "");
  },
  dirname: (p: string) => {
    const parts = p.split("/");
    parts.pop();
    return parts.length > 0 ? parts.join("/") : ".";
  },
  parse: (p: string) => {
    const base = p.split("/").pop() || "";
    const dot = base.lastIndexOf(".");
    if (dot > 0) {
      return { name: base.substring(0, dot), ext: base.substring(dot) };
    }
    return { name: base, ext: "" };
  },
};
import { cache } from "react";

export function sanitizedPath(root: string, ...paths: string[]): string {
  const sanitizedRoot = root.replace(/^\/|\/$/g, ""); // Remove leading and trailing slashes
  const sanitizedPaths = paths.map((p) => p.replace(/^\/|\/$/g, "")); // Remove leading and trailing slashes from each path
  return path.join(sanitizedRoot, ...sanitizedPaths);
}

/**
 * Smartly joins the media root with a file path, preventing duplication
 * if the file path already starts with the media root's basename.
 */
export function cleanMediaPath(mediaRoot: string, filePath: string): string {
  if (!filePath) return "";

  // 1. If the filePath contains the full mediaRoot, strip it first to get the relative part
  //    This handles cases where we are passed a full repo path
  let relativePart = filePath.split(mediaRoot).pop()!;

  // 2. Get the basename of the media root (e.g. "images" from "assets/images")
  //    Handle potential trailing slashes
  const mediaBasename = mediaRoot.replace(/\/+$/, "").split("/").pop();

  // 3. Prepare the file path (strip leading slashes)
  relativePart = relativePart.replace(/^\/+/, "");

  // 4. If relativePart starts with "images/", strip it to avoid duplication
  //    when we later join it with "assets/images"
  if (mediaBasename && relativePart.startsWith(mediaBasename + "/")) {
    relativePart = relativePart.substring(mediaBasename.length + 1);
  }

  // 5. Return the joined full path
  return sanitizedPath(mediaRoot, relativePart);
}

export function verifyColor(colorCode: string) {
  let regColorCode = /^(#)?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
  return regColorCode.test(colorCode);
}

export const generatePath = (
  mediaPath: string,
  filePath: string,
  publicPath?: string,
) => {
  // Remove leading/trailing slashes
  const sanitizedMedia = mediaPath.replace(/^\/|\/$/g, "");
  let sanitizedFile = filePath.replace(/^\/|\/$/g, "");
  const sanitizedPublic = publicPath?.replace(/^\/|\/$/g, "");

  // If filePath starts with mediaPath, remove it to avoid duplication
  if (sanitizedFile.startsWith(sanitizedMedia)) {
    sanitizedFile = sanitizedFile
      .substring(sanitizedMedia.length)
      .replace(/^\//, "");
  }

  // Split media path into folders: ["exampleSite", "assets", "images"]
  const mediaFolders = sanitizedMedia.split("/");

  // Get the last folder from media path (e.g., "images")
  const lastMediaFolder = mediaFolders[mediaFolders.length - 1];

  // If no public path is provided, use only the last folder from media
  if (!sanitizedPublic) {
    return sanitizedPath(lastMediaFolder, sanitizedFile);
  }

  // Split public path into folders
  const publicFolders = sanitizedPublic.split("/");
  const lastPublicFolder = publicFolders[publicFolders.length - 1];

  // Check if the last public folder matches any folder in the media path
  const matchIndex = mediaFolders.indexOf(lastPublicFolder);

  if (matchIndex !== -1) {
    // If public matches a folder in media, use folders after the match
    const foldersAfterMatch = mediaFolders.slice(matchIndex + 1);

    if (foldersAfterMatch.length > 0) {
      return sanitizedPath(foldersAfterMatch.join("/"), sanitizedFile);
    } else {
      // If the match is at the end, just use the file path
      return sanitizedFile;
    }
  }

  // If public doesn't match any folder in media, use only the last folder
  return sanitizedPath(lastMediaFolder, sanitizedFile);
};

export const getFileNameAndExtension = (filename: string) => {
  const { name, ext: extension } = path.parse(filename);
  return [name, extension.replace(".", "") || "txt"];
};

export const findFileByPath = cache(
  (files: TFiles[], targetPath: string): TFiles | undefined => {
    for (const file of files) {
      if (file.path === targetPath) {
        return file;
      }
      if (file.children) {
        const found = findFileByPath(file.children, targetPath);
        if (found) {
          return found;
        }
      }
    }
    return undefined;
  },
);

export const mergePatterns = ({
  include,
  exclude,
}: {
  include?: string;
  exclude?: string;
}): { patterns: string[]; includes: string[]; excludes: string[] } => {
  const includes = (include || "").split(",").reduce<string[]>((acc, curr) => {
    if (curr.trim()) return [...acc, curr.trim()];
    return acc;
  }, []);

  const excludes = (exclude || "").split(",").reduce<string[]>((acc, curr) => {
    const trimValue = curr.trim();
    if (trimValue) {
      return trimValue.includes("!")
        ? [...acc, curr.replace("!", "")]
        : [...acc, `${curr}`];
    }
    return acc;
  }, []);

  return {
    patterns: includes.concat(excludes),
    includes: includes.length ? includes : ["*"],
    excludes,
  };
};

export const excludeFile = (trees: TFiles[], path: string) => {
  return trees.filter((tree) => {
    if (tree.path === path) {
      return false;
    }

    if (tree.children) {
      tree.children = excludeFile(tree.children, path);
    }
    return true;
  });
};

type MatchType = "includes" | "startsWith" | "endsWith";

interface SearchOptions {
  key?: keyof TFiles; // Field to search by, default = "path"
  caseSensitive?: boolean; // Whether the search is case sensitive
  matchType?: MatchType; // Type of string match
  maxDepth?: number; // Limit depth for recursion
  matcher?: (value: string, search: string) => boolean; // Custom matcher
}

export function searchByPath(
  files: TFiles[],
  searchText: string,
  options: SearchOptions = {},
): TFiles[] {
  const {
    key = "path",
    caseSensitive = false,
    matchType = "includes",
    maxDepth,
    matcher,
  } = options;

  const normalizedSearch = caseSensitive
    ? searchText
    : searchText.toLowerCase();

  const matchedFiles: TFiles[] = [];

  function match(value: string): boolean {
    const val = caseSensitive ? value : value.toLowerCase();
    if (matcher) return matcher(val, normalizedSearch);

    switch (matchType) {
      case "startsWith":
        return val.startsWith(normalizedSearch);
      case "endsWith":
        return val.endsWith(normalizedSearch);
      case "includes":
      default:
        return val.includes(normalizedSearch);
    }
  }

  function recurse(fileList: TFiles[], depth: number = 0) {
    for (const file of fileList) {
      const value = String(file[key] || "");

      if (match(value)) {
        matchedFiles.push(file);
      }

      if (file.children && (!maxDepth || depth < maxDepth)) {
        recurse(file.children, depth + 1);
      }
    }
  }

  recurse(files);

  return matchedFiles;
}

type InputArrangement = {
  [key: string]: {
    [groupName: string]: {
      weight?: number;
      include?: string;
      exclude?: string;
      type?: string;
    };
  };
};

export function convertArrangement(
  input: InputArrangement,
): Array<Omit<TArrangement, "id">> {
  return Object.entries(input).map(
    ([path_, config]): Omit<TArrangement, "id"> => {
      const [groupName, settings] = Object.entries(config)[0];
      // Determine if the groupName has an extension
      const hasExtension = path.parse(path_).ext !== "";

      // For headings, ensure targetPath is empty and use original path as groupName
      //@ts-ignore
      if (settings === "heading") {
        return {
          type: "heading",
          targetPath: "",
          groupName: path_,
        };
      }

      // For files
      if (hasExtension) {
        return {
          type: "file",
          targetPath: path_,
          groupName,
        };
      }

      // For folders
      return {
        type: "folder",
        targetPath: path_,
        groupName,
        // @ts-ignore
        include: settings.include ?? "",
        exclude: settings.exclude ?? "",
      };
    },
  );
}

export const generateUniqueFileName = (
  trees: TFiles[],
  originalFileName: string,
): {
  fileName: string;
  number: number;
  isAlreadyExist: boolean;
} => {
  const targetFolderPath = path.join("media", path.dirname(originalFileName));
  const mediaRoot = trees.find((f) => f.name === "media");

  const targetFolder =
    targetFolderPath === "media"
      ? mediaRoot
      : findFileByPath(trees, targetFolderPath);

  if (!targetFolder?.children) {
    const [fileName, extension] = getFileNameAndExtension(originalFileName);
    return {
      fileName: path.join(
        path.dirname(originalFileName),
        `${fileName}.${extension}`,
      ),
      number: 0,
      isAlreadyExist: false,
    };
  }

  // Check if file already exists
  const isAlreadyExist = targetFolder.children.some((file) =>
    file.path.includes(originalFileName),
  );

  const [fileName, extension] = getFileNameAndExtension(originalFileName);
  const baseDir = path.dirname(originalFileName);

  if (!isAlreadyExist) {
    return {
      fileName: path.join(baseDir, `${fileName}.${extension}`),
      number: 0,
      isAlreadyExist: false,
    };
  }

  // Escape special characters for regex
  const escapedBaseFileName = fileName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // Match filenames like og-image_copy(1).png or og-image-copy(1).png
  const regex = new RegExp(
    `^${escapedBaseFileName}(_|-)copy(?:\\((\\d+)\\))?$`,
  );

  // Find the highest copy number
  let maxNumber = 0;
  for (const curr of targetFolder.children) {
    if (!curr.name) continue;
    const [currFileName] = getFileNameAndExtension(curr.path);

    const match = currFileName.match(regex);
    if (match) {
      const numStr = match[2];
      const extractedNumber = numStr ? parseInt(numStr, 10) : 0;
      if (extractedNumber > maxNumber) {
        maxNumber = extractedNumber;
      }
    }
  }

  return {
    number: maxNumber,
    isAlreadyExist,
    fileName: path.join(
      baseDir,
      `${fileName}_copy(${maxNumber + 1}).${extension}`,
    ),
  };
};

/**
 * Resolves the actual repository path from a potential URL path that might contain
 * arranged folder names (group names) instead of actual directory names.
 *
 * @param urlPath The path from the URL (e.g. "blog/test")
 * @param config The configuration object containing arrangements
 * @returns The resolved repository path (e.g. "exampleSite/content/english/blog/test")
 */
export const resolveRepoPath = (urlPath: string, config: TConfig): string => {
  if (!urlPath) return "";
  const arrangements = config?.arrangement ?? [];
  if (!arrangements.length) return urlPath;

  // Normalize and split path
  const segments = urlPath.split("/").filter(Boolean);
  if (segments.length === 0) return urlPath;

  // We want to match segments against arrangements.
  // If the first segment is the literal "content" but our content root in repo is also "content",
  // we need to be careful.
  const firstSeg = segments[0];
  const firstSegSlug = slugify(firstSeg);
  const { name: firstSegName } = path.parse(firstSeg);
  const firstSegNameSlug = slugify(firstSegName);

  for (const arr of arrangements) {
    if (arr.type !== "folder" && arr.type !== "file") continue;

    const groupSlug = slugify(arr.groupName);
    const targetPath = arr.targetPath || "";
    const targetSlug = slugify(targetPath);
    const { name: targetName } = path.parse(targetPath);
    const targetNameSlug = slugify(targetName);

    // Try all reasonable matching candidates
    const isMatch = [
      groupSlug === firstSegSlug,
      groupSlug === firstSegNameSlug,
      targetSlug === firstSegSlug,
      targetSlug === firstSegNameSlug,
      targetNameSlug === firstSegSlug,
      targetNameSlug === firstSegNameSlug,
      arr.groupName === firstSeg,
      arr.groupName === firstSegName,
      targetPath === firstSeg,
      targetPath === firstSegName,
    ].some(Boolean);

    if (isMatch) {
      const rest = segments.slice(1).join("/");
      return rest ? path.join(targetPath, rest) : targetPath;
    }
  }

  return urlPath;
};
