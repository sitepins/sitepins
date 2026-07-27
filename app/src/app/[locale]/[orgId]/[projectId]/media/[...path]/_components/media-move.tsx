import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { GITHUB_API_VERSION, GITLAB_API_VERSION } from "@/lib/constant";
import { checkMedia } from "@/lib/utils/check-media-file";
import { cn } from "@/lib/utils/cn";
import { findFileByPath, searchByPath } from "@/lib/utils/common";
import { toBase64 } from "@/lib/utils/git-utils";
import {
  isGitHubProvider,
  isGitLabProvider,
} from "@/lib/utils/provider-checker";
import { selectConfig } from "@/redux/features/config/slice";
import {
  useGetGitHubTreesQuery,
  useUpdateGitHubFilesMutation,
} from "@/redux/features/github";
import {
  useGetGitLabTreesQuery,
  useUpdateGitLabFilesMutation,
} from "@/redux/features/gitlab";
import { selectMediaInfo, setMedia } from "@/redux/features/media/slice";
import { useAppDispatch } from "@/redux/store";
import { TFiles } from "@/types";
import {
  ChevronDown,
  ChevronRight,
  Folder,
  FolderOpen,
  Home,
  Search,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import path from "path";
import { useRef, useState } from "react";
import { useSelector } from "react-redux";
import { toast } from "sonner";

export default function MediaMove({
  selectedItemsDir,
  open: controlledOpen,
  onOpenChange: setControlledOpen,
}: {
  selectedItemsDir: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen !== undefined ? controlledOpen : internalOpen;
  const setOpen = setControlledOpen || setInternalOpen;
  const router = useRouter();
  const dialogCloseButton = useRef<HTMLButtonElement>(null);

  const dispatch = useAppDispatch();
  const config = useSelector(selectConfig);
  const { media: medias } = useSelector(selectMediaInfo);
  const [moveItems, { isLoading: isGhLoading }] =
    useUpdateGitHubFilesMutation();
  const [moveGitLabItems, { isLoading: isGlLoading }] =
    useUpdateGitLabFilesMutation();

  const tMedia = useTranslations("media");
  const tCommon = useTranslations("common");

  const isLoading = isGitLabProvider(config.provider)
    ? isGlLoading
    : isGhLoading;
  const [searchQuery, setSearchQuery] = useState("");
  const mediaRoot = config.media; // e.g., 'public/images'
  const { data: ghData } = useGetGitHubTreesQuery(
    {
      owner: config.owner,
      repo: config.repoName,
      tree_sha: config.branch,
      recursive: "1",
      config: config,
    },
    {
      skip:
        !config.owner ||
        !config.repoName ||
        !config.branch ||
        !config.token ||
        !isGitHubProvider(config.provider),
    },
  );

  const { data: glData } = useGetGitLabTreesQuery(
    {
      id: config.repoName ? `${config.owner}/${config.repoName}` : config.owner,
      ref: config.branch,
      recursive: true,
      config: config,
    },
    {
      skip:
        !config.repoName ||
        !config.branch ||
        !config.token ||
        !isGitLabProvider(config.provider),
    },
  );

  const data = isGitLabProvider(config.provider) ? glData : ghData;

  const mediaFolder = data?.trees?.find((f) => f.name === "media");
  const childrenFile = findFileByPath(
    mediaFolder?.children || [],
    `media/${mediaRoot}`,
  );

  const trees = (
    searchQuery
      ? searchByPath(childrenFile?.children || [], searchQuery, {
          matchType: "includes",
          caseSensitive: false,
          key: "name",
        })
      : childrenFile?.children || []
  ).filter((item) => item.name !== ".well-known");

  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(
    new Set([config.media]),
  );
  const [selectedDestination, setSelectedDestination] = useState<string>("");
  const [currentPath, setCurrentPath] = useState<string[]>(["images"]);

  const selectDestination = (folderId: string, folderPath: string[]) => {
    setSelectedDestination(folderId);
    setCurrentPath(folderPath);
  };

  const buildFolderPath = (treePath: string): string[] => {
    if (treePath === config.media) return ["images"];

    // Remove the full media root prefix (media/public/images) and split by /
    const fullMediaRoot = `media/${mediaRoot}`;
    let relativePath = treePath;

    if (treePath.startsWith(fullMediaRoot)) {
      relativePath = treePath.substring(fullMediaRoot.length);
      // Remove leading slash if present
      if (relativePath.startsWith("/")) {
        relativePath = relativePath.substring(1);
      }
    }

    if (!relativePath) return ["images"];

    const pathParts = relativePath.split("/").filter((part) => part.length > 0);
    return ["images", ...pathParts];
  };

  const toggleFolder = (folderId: string) => {
    setExpandedFolders((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(folderId)) {
        newSet.delete(folderId);
      } else {
        newSet.add(folderId);
      }
      return newSet;
    });
  };

  const renderFolderTree = (trees: TFiles[]) => {
    return trees.map((tree, index) => {
      const isExpanded = expandedFolders.has(tree.path);
      const isSelected = selectedDestination === tree.path;
      const isValid = true;
      const hasChildren =
        tree.children?.some((child) => !child.isFile) || false;

      if (tree.isFile) {
        return null; // Skip files, only render folders
      }

      return (
        <div key={index} className="space-y-1">
          <div
            className={cn(
              "flex cursor-pointer items-center gap-2 rounded-lg p-2 transition-colors",
              "hover:bg-light/50",
              isSelected && "bg-primary/10 border-primary/20 border",
              !isValid && "cursor-not-allowed opacity-50",
            )}
            onClick={() => {
              if (isValid) {
                const folderPath = buildFolderPath(tree.path);
                selectDestination(tree.path, folderPath);
              }
            }}
          >
            {hasChildren && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  toggleFolder(tree.path);
                }}
                className="hover:bg-light rounded p-1"
              >
                {isExpanded ? (
                  <ChevronDown className="h-3 w-3" />
                ) : (
                  <ChevronRight className="h-3 w-3" />
                )}
              </button>
            )}

            {!hasChildren && <div className="w-5" />}

            {isExpanded ? (
              <FolderOpen className="text-primary size-4" />
            ) : (
              <Folder className="text-primary size-4" />
            )}

            <div className="flex-1">
              <p
                className={cn(
                  "text-sm font-medium",
                  !isValid && "text-muted-foreground",
                )}
              >
                {tree.name || tMedia("unnamed_folder")}
              </p>
            </div>

            {isSelected && (
              <Badge variant="default" className="text-xs">
                {tMedia("selected")}
              </Badge>
            )}

            {!isValid && (
              <Badge variant="muted" className="text-xs">
                {tMedia("invalid")}
              </Badge>
            )}
          </div>

          {isExpanded && hasChildren && (
            <div className="ml-6 space-y-1">
              {renderFolderTree(
                tree.children?.filter(
                  (child) => !child.isFile && child.name !== ".well-known",
                ) || [],
              )}
            </div>
          )}
        </div>
      );
    });
  };

  const handleMoveItem = async () => {
    const currentDestination = selectedDestination || config.media;
    const newPath =
      currentDestination.replace("media/", "") +
      "/" +
      path.basename(selectedItemsDir);

    try {
      // Fetch file content properly based on file type
      const isMedia = checkMedia(selectedItemsDir);
      let content: string;

      if (isGitLabProvider(config.provider)) {
        // GitLab API always returns base64 encoded content
        const response = await fetch(
          `https://gitlab.com/api/${GITLAB_API_VERSION}/projects/${encodeURIComponent(config.repoName ? `${config.owner}/${config.repoName}` : config.owner)}/repository/files/${encodeURIComponent(selectedItemsDir)}?ref=${config.branch}`,
          {
            headers: {
              Authorization: `Bearer ${config.currentLoginUserToken || config.token}`,
            },
          },
        );

        if (!response.ok) {
          throw new Error(`Failed to fetch ${selectedItemsDir} from GitLab`);
        }

        const data = await response.json();
        // GitLab API returns base64 encoded content - use as-is
        content = data.content;
      } else {
        // GitHub
        if (isMedia) {
          // For media files, get base64 content from GitHub API
          const response = await fetch(
            `https://api.github.com/repos/${config.owner}/${config.repoName}/contents/${selectedItemsDir}?ref=${config.branch}`,
            {
              headers: {
                Authorization: `token ${config.currentLoginUserToken || config.token}`,
                Accept: "application/vnd.github+json",
                "X-GitHub-Api-Version": GITHUB_API_VERSION,
              },
            },
          );

          if (!response.ok) {
            throw new Error(`Failed to fetch ${selectedItemsDir}`);
          }

          const data = await response.json();
          // GitHub API returns base64 encoded content for binary files
          content = data.content.replace(/\n/g, ""); // Remove newlines from base64
        } else {
          // For text files, get raw content and convert to base64
          const response = await fetch(
            `https://api.github.com/repos/${config.owner}/${config.repoName}/contents/${selectedItemsDir}?ref=${config.branch}`,
            {
              headers: {
                Authorization: `token ${config.currentLoginUserToken || config.token}`,
                Accept: "application/vnd.github.raw+json",
                "X-GitHub-Api-Version": GITHUB_API_VERSION,
              },
            },
          );

          if (!response.ok) {
            throw new Error(`Failed to fetch ${selectedItemsDir}`);
          }

          const rawText = await response.text();
          // Convert text content to base64 for the mutation
          content = toBase64(rawText);
        }
      }

      if (isGitLabProvider(config.provider)) {
        await moveGitLabItems({
          id: config.repoName
            ? `${config.owner}/${config.repoName}`
            : config.owner,
          branch: config.branch,
          message: `Move item to ${currentPath.join("/")}`,
          files: [
            {
              path: selectedItemsDir,
              delete: true,
            },
            {
              path: newPath,
              content: content,
            },
          ],
        }).unwrap();
      } else {
        await moveItems({
          owner: config.owner,
          repo: config.repoName,
          message: `Move item to ${currentPath.join("/")}`,
          tree: config.branch,
          files: [
            {
              path: selectedItemsDir,
              delete: true,
            },
            {
              path: newPath,
              content: content,
            },
          ],
        }).unwrap();
      }

      dispatch(
        setMedia(medias.filter((item) => item.path !== selectedItemsDir)),
      );

      router.refresh();

      toast.success(tMedia("move_successful", { path: currentPath.join("/") }));

      dialogCloseButton.current?.click();
    } catch (error) {
      console.error("Move error:", error);
      toast.error(tMedia("error_moving"));
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-h-[80vh] sm:max-w-125">
        <DialogHeader>
          <DialogTitle>{tMedia("move_item")}</DialogTitle>
          <DialogDescription className="text-text-dark/70">
            {tMedia("move_item_desc")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Current destination path */}
          {selectedDestination && (
            <div className="border-primary/20 bg-primary/5 rounded-lg border p-3">
              <div className="flex items-center gap-2">
                <Home className="text-primary size-4" />
                <span className="text-sm font-medium">
                  {tMedia("destination")}:
                </span>
                <span className="text-primary text-sm">
                  {currentPath.join(" / ")}
                </span>
              </div>
            </div>
          )}

          {/* Search */}
          <div className="relative">
            <Search className="text-muted-foreground absolute top-2.5 left-2 size-4" />
            <Input
              placeholder={tMedia("search_folders")}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8"
            />
          </div>

          <div className="border-border max-h-75 overflow-y-auto rounded-lg border p-2">
            {/* Root folder option */}
            <div className="mb-2 space-y-1">
              <div
                className={cn(
                  "flex cursor-pointer items-center gap-2 rounded-lg p-2 transition-colors",
                  selectedDestination === config.media &&
                    "bg-primary/10 border-primary/20 border",
                )}
                onClick={() => selectDestination(config.media, ["images"])}
              >
                <Home className="text-primary size-4" />
                <div className="flex-1">
                  <p className="text-sm font-medium">{tMedia("images")}</p>
                </div>
                {selectedDestination === config.media && (
                  <Badge variant="default" className="text-xs">
                    {tMedia("selected")}
                  </Badge>
                )}
              </div>
            </div>

            {trees.length > 0 ? (
              renderFolderTree(trees)
            ) : searchQuery ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <Folder className="text-muted-foreground mb-3 size-12" />
                <p className="text-muted-foreground text-sm">
                  {tMedia("no_folders_found", { query: searchQuery })}
                </p>
                <p className="text-muted-foreground mt-1 text-xs">
                  {tMedia("try_adjusting_search")}
                </p>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <Folder className="text-muted-foreground mb-3 size-12" />
                <p className="text-muted-foreground text-sm">
                  {tMedia("no_folders_available")}
                </p>
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button
              onClick={() => {
                setSearchQuery("");
                setSelectedDestination("");
              }}
              variant="outline"
              ref={dialogCloseButton}
            >
              {tCommon("actions.cancel")}
            </Button>
          </DialogClose>
          <Button
            onClick={handleMoveItem}
            isLoading={isLoading}
            disabled={!selectedDestination}
          >
            {tMedia("move_folder")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
