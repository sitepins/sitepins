import { useGitCacheUpdates } from "@/hooks/use-git-cache-updates";
import { decodeGitContent } from "@/lib/utils/git-content";
import { TConfig, TTree } from "@/types";
import { logger } from "@/lib/logger";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { useGitProvider } from "@/hooks/use-git-provider";
import { useOwnerPlan } from "@/hooks/use-owner-plan";
import { useAppDispatch } from "@/redux/store";
import { Code2, CopyPlus, Ellipsis } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import path from "path";
import { useState } from "react";
import { toast } from "sonner";

export default function ConfigActions({
  pathname,
  pending,
}: {
  pathname?: string | null;
  config: TConfig;
  pending: boolean;
}) {
  const router = useRouter();
  const params = useParams() as { orgId: string; projectId: string };
  const tCommon = useTranslations("common");
  const tGit = useTranslations("project.git");
  const dispatch = useAppDispatch();
  const { canAccessProFeatures } = useOwnerPlan();
  const [showDuplicateDialog, setShowDuplicateDialog] = useState(false);
  const [duplicateName, setDuplicateName] = useState("");
  const { updateFiles, useGitTrees, useGitContent, adapter, isPending } =
    useGitProvider();
  const { updateCacheOnDuplicate } = useGitCacheUpdates();

  // Support both `/content/` and `/configs/` routes by extracting the tail after either segment
  const pathMatch = pathname?.match(/\/(?:content|configs)\/(.+)$/);
  const currentFilepath = pathMatch
    ? decodeURIComponent(pathMatch[1])
    : undefined;
  const currentPrefix = pathMatch
    ? pathname!.match(/\/(content|configs)\//)![1]
    : undefined;

  const treesQuery = useGitTrees(
    currentFilepath ? path.dirname(currentFilepath) : "",
    { skip: !currentFilepath },
  );
  const contentQuery = useGitContent(currentFilepath || "", {
    skip: !currentFilepath,
  });

  const trees = treesQuery?.data;
  const content = contentQuery?.data;

  const handleConfirmDuplicate = async () => {
    if (!currentFilepath) {
      toast.error(tCommon("errors.unable_to_determine_path"));
      setShowDuplicateDialog(false);
      return;
    }

    try {
      const { dir, name, ext } = path.parse(currentFilepath);

      const treesToUse: TTree[] = trees?.files ?? [];

      const number: number = Math.max(
        ...(treesToUse.reduce(
          (acc: number[], curr) => {
            const regex = /_copy_(\d+)/;
            const fileName = path.parse(curr.path ?? "").name;
            const match = fileName.match(regex);
            if (match) {
              const [, number] = match;
              const extractedNumber = number ? parseInt(number, 10) : 0;
              return [...acc, extractedNumber];
            }
            return acc;
          },
          [0],
        ) || [0]),
      );

      let finalName = duplicateName?.trim();
      if (!finalName) {
        finalName = `${name.replace(/_copy_(\d+)/, "")}_copy_${number + 1}${ext}`;
      } else {
        if (!finalName.includes(".")) finalName = `${finalName}${ext}`;
      }

      const newPath = `${dir}/${finalName}`;

      const fileContent = decodeGitContent(content);

      const res = await updateFiles({
        files: [{ path: newPath, content: fileContent }],
        message: tGit("commit_messages.duplicate_file", { name: finalName }),
      });

      if (!res.error?.message) {
        toast.success(tCommon("feedback.duplicate_success"));

        updateCacheOnDuplicate({
          name: finalName,
          path: newPath,
          sha: null,
          isFile: true,
          commitDate: new Date().toISOString(),
        });
        adapter.invalidateCommit(dispatch, currentFilepath);

        if (currentPrefix) {
          const newUrl = pathname!.replace(
            /\/(?:content|configs)\/.+$/,
            `/${currentPrefix}/${encodeURIComponent(newPath)}`,
          );
          router.push(newUrl);
        } else {
          router.refresh();
        }
      } else {
        toast.error(res.error.message || tCommon("feedback.duplicate_failed"));
      }
    } catch (err) {
      logger.error("Failed to duplicate config", err);
      toast.error(tCommon("feedback.duplicate_failed"));
    }

    setShowDuplicateDialog(false);
    setDuplicateName("");
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" type="button" disabled={pending}>
            <Ellipsis className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-45">
          <DropdownMenuItem
            className="cursor-pointer"
            onClick={() => setShowDuplicateDialog(true)}
          >
            <CopyPlus className="mr-1 size-4" />
            <span>{tCommon("actions.duplicate")}</span>
          </DropdownMenuItem>
          {canAccessProFeatures && (
            <DropdownMenuItem asChild>
              <Link
                href={`/${params.orgId}/${params.projectId}/code/${currentFilepath}`}
                className="flex w-full items-center"
              >
                <Code2 className="mr-1 size-4" />
                <span>{tCommon("actions.edit_as_code")}</span>
              </Link>
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog
        open={showDuplicateDialog}
        onOpenChange={setShowDuplicateDialog}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {tCommon("confirm.duplicate_file")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {tCommon("confirm.duplicate_file_description")}
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="pt-2">
            <Input
              value={duplicateName}
              onChange={(e) => setDuplicateName(e.target.value)}
              placeholder="e.g. index.en.md"
            />
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel>{tCommon("actions.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDuplicate}
              disabled={isPending}
            >
              {tCommon("actions.duplicate")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
