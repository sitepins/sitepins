"use client";

import { useAddLog } from "@/hooks/use-add-log";
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
import { Button, ButtonProps } from "@/components/ui/button";
import { useDialog } from "@/hooks/use-dialog";
import { isGitLabProvider } from "@/lib/utils/provider-checker";
import { selectConfig } from "@/redux/features/config/slice";
import { useUpdateGitHubFilesMutation } from "@/redux/features/github";
import { useUpdateGitLabFilesMutation } from "@/redux/features/gitlab";
import { excludeMedia } from "@/redux/features/media/slice";
import { EAction, EProjectLogType } from "@/redux/features/project-log/type";
import { getGitProviderAdapter } from "@/redux/features/git/provider-adapter";
import { store, useAppDispatch } from "@/redux/store";
import { useTranslations } from "next-intl";
import { useParams } from "next/navigation";
import { useSelector } from "react-redux";
import { toast } from "sonner";

export default function MediaDelete({
  dir,
  open: controlledOpen,
  onOpenChange: setControlledOpen,
}: ButtonProps & {
  dir: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const { isOpen: internalOpen, onOpenChange: setInternalOpen } = useDialog();
  const isOpen = controlledOpen !== undefined ? controlledOpen : internalOpen;
  const onOpenChange = setControlledOpen || setInternalOpen;
  const tCommon = useTranslations("common");
  const params = useParams();
  const config = useSelector(selectConfig);
  const dispatch = useAppDispatch();

  const [addLog] = useAddLog();
  const [deleteGhFiles, { isLoading: isGhLoading }] =
    useUpdateGitHubFilesMutation();
  const [deleteGlFiles, { isLoading: isGlLoading }] =
    useUpdateGitLabFilesMutation();

  const isPending = isGitLabProvider(config.provider)
    ? isGlLoading
    : isGhLoading;

  return (
    <AlertDialog open={isOpen} onOpenChange={onOpenChange}>
      <AlertDialogContent className="**:aria-[aria-label='close']:hidden">
        <AlertDialogHeader>
          <AlertDialogTitle>{tCommon("confirm.delete_media")}</AlertDialogTitle>
          <AlertDialogDescription className="text-sm">
            {tCommon("confirm.delete_media_description")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel asChild>
            <Button className="border-border border" variant={"basic"}>
              {tCommon("actions.cancel")}
            </Button>
          </AlertDialogCancel>
          <AlertDialogAction asChild>
            <Button
              variant="destructive"
              isLoading={isPending}
              onClick={async (e) => {
                e.preventDefault();
                const deletePromise = isGitLabProvider(config.provider)
                  ? deleteGlFiles({
                      id: config.repoName
                        ? `${config.owner}/${config.repoName}`
                        : config.owner,
                      branch: config.branch,
                      files: [{ path: dir, delete: true }],
                      message: `: ${dir}`,
                    })
                  : deleteGhFiles({
                      files: [{ path: dir, delete: true }],
                      message: `: ${dir}`,
                      owner: config.owner,
                      repo: config.repoName,
                      tree: config.branch,
                    });

                deletePromise.then((res) => {
                  if (!res.error?.message) {
                    addLog({
                      project_id: params.projectId as string,
                      action: EAction.DELETE,
                      file: `media/${dir}`,
                      file_type: EProjectLogType.MEDIA,
                    });
                    toast.success(tCommon("feedback.image_deleted"));
                    onOpenChange(false);
                    dispatch(excludeMedia(`media/${dir}`));

                    const filepath = `media/${dir}`;

                    getGitProviderAdapter(config.provider).updateAllTreeCaches(
                      dispatch,
                      store.getState(),
                      (draft) => {
                        draft.trees = draft.trees.filter(
                          (file) => file.path !== filepath,
                        );
                        draft.files = draft.files.filter(
                          (file) => file.path !== filepath,
                        );
                      },
                    );
                  }
                });
              }}
            >
              {tCommon("actions.delete")}
            </Button>
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
