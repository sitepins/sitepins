import { authClient } from "@/lib/auth/auth-client";
import { useUpsertProjectContentMutation } from "@/redux/features/project-content/project-content-api";
import { useTranslations } from "next-intl";
import { useCallback } from "react";
import { toast } from "sonner";

interface UseSaveAsDraftOptions {
  projectId: string;
  orgId: string;
  filePath: string;
  /** Returns the fully-formatted file content string ready to persist. */
  getFormattedContent: () => string;
  /**
   * Returns the current Git file SHA (GitHub `sha` / GitLab `blob_id`).
   * Stored alongside the draft so we can detect if Git was updated while the draft sat in the DB.
   */
  getGitSha: () => string | null | undefined;
  /** Called after the upsert succeeds so the caller can sync its baseline. */
  onSuccess?: () => void;
}

/**
 * Saves the current editor content to the database (project-content module)
 * without pushing anything to Git.
 *
 * Also stores the Git SHA at the time of save so that, on next load,
 * we can detect a conflict if someone else pushed to Git in the meantime.
 */
export function useSaveAsDraft({
  projectId,
  orgId,
  filePath,
  getFormattedContent,
  getGitSha,
  onSuccess,
}: UseSaveAsDraftOptions) {
  const [upsert, { isLoading: isSavingDraft }] =
    useUpsertProjectContentMutation();
  const { data: auth } = authClient.useSession();

  const tFeedback = useTranslations("common.feedback");

  const saveAsDraft = useCallback(async () => {
    const content = getFormattedContent();
    const git_sha = getGitSha() ?? undefined;
    const user_id = auth?.user?.user_id ?? auth?.user?.id ?? undefined;

    try {
      await upsert({
        projectId,
        orgId,
        file: filePath,
        content,
        user_id,
        git_sha,
      }).unwrap();
      toast.success(tFeedback("draft_saved"));
      onSuccess?.();
    } catch {
      toast.error(tFeedback("draft_saved_error"));
    }
  }, [
    getFormattedContent,
    getGitSha,
    auth?.user?.user_id,
    auth?.user?.id,
    upsert,
    projectId,
    orgId,
    filePath,
    tFeedback,
    onSuccess,
  ]);

  return { saveAsDraft, isSavingDraft };
}
