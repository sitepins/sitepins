import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import { getAICredential } from "@/editor/plugins/copilot-kit";
import { useAiAccess } from "@/hooks/use-ai-access";
import { Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";

type CommitDetails = {
  message: string;
  description: string;
  createPullRequest: boolean;
};

type CommitModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onCommit: (details: CommitDetails) => void;
  isLoading: boolean;
  filePath?: string;
  getUncommittedContent?: () => { path: string; content: string } | undefined;
  getBaselineContent?: () => { path: string; content: string } | undefined;
  autoGenerateAi?: boolean;
};

const CommitModal: React.FC<CommitModalProps> = ({
  isOpen,
  onClose,
  onCommit,
  isLoading,
  filePath,
  getUncommittedContent,
  getBaselineContent,
  autoGenerateAi,
}) => {
  const tEditorCommit = useTranslations("editor.commit");
  const tCommon = useTranslations("common");
  const [message, setMessage] = useState("");
  const [description, setDescription] = useState("");
  const [commitType] = useState<"main" | "pr">("main");
  const [isAiGenerating, setIsAiGenerating] = useState(false);
  const previousLoadingRef = useRef(false);
  const { checkAiAccess, isAiCommitEnabled } = useAiAccess();

  const handleCommit = () => {
    onCommit({
      message,
      description,
      createPullRequest: commitType === "pr",
    });
  };

  const handleGenerateAiCommit = useCallback(async () => {
    if (!isAiCommitEnabled || !checkAiAccess()) {
      return;
    }

    setIsAiGenerating(true);
    try {
      const cred = getAICredential();
      const uncommitted = getUncommittedContent?.();
      const baseline = getBaselineContent?.();
      const res = await fetch("/api/ai/commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiKey: cred?.apiKey,
          provider: cred?.provider,
          model: cred?.model,
          filePath: filePath || uncommitted?.path,
          originalContent: baseline?.content,
          content: uncommitted?.content,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || tEditorCommit("ai.error"));
      }

      const data = await res.json();
      if (data.message) {
        setMessage(data.message);
      }
      if (data.description) {
        setDescription(data.description);
      }
      toast.success(tEditorCommit("ai.success"));
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : tEditorCommit("ai.error");
      toast.error(msg);
    } finally {
      setIsAiGenerating(false);
    }
  }, [
    checkAiAccess,
    filePath,
    getBaselineContent,
    getUncommittedContent,
    isAiCommitEnabled,
    tEditorCommit,
  ]);

  useEffect(() => {
    if (isOpen && autoGenerateAi && isAiCommitEnabled) {
      const timer = setTimeout(() => {
        handleGenerateAiCommit();
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [isOpen, autoGenerateAi, isAiCommitEnabled, handleGenerateAiCommit]);

  useEffect(() => {
    // Only close and reset when loading transitions from true to false (commit completed)
    if (previousLoadingRef.current && !isLoading) {
      onClose();
      setMessage("");
      setDescription("");
    }
    previousLoadingRef.current = isLoading;
  }, [isLoading, isOpen, onClose]);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="gap-5 lg:max-w-131.25">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold">
            {tEditorCommit("title")}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="commit-message">{tEditorCommit("message")}</Label>
              {isAiCommitEnabled && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-primary hover:text-primary/90 -my-1 h-7 gap-1.5 px-2 text-xs font-normal"
                  onClick={handleGenerateAiCommit}
                  disabled={isAiGenerating || isLoading}
                  isLoading={isAiGenerating}
                >
                  {!isAiGenerating && <Sparkles className="size-3.5" />}
                  <span>
                    {isAiGenerating
                      ? tEditorCommit("ai.generating")
                      : tEditorCommit("ai.generate")}
                  </span>
                </Button>
              )}
            </div>
            <Input
              id="commit-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={tEditorCommit("message_placeholder")}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="extended-description">
              {tEditorCommit("description")}
            </Label>
            <Textarea
              id="extended-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={tEditorCommit("description_placeholder")}
            />
          </div>
        </div>
        <DialogFooter className="sm:justify-end">
          <Button size="lg" type="button" variant="outline" onClick={onClose}>
            {tCommon("actions.cancel")}
          </Button>
          <Button
            onClick={handleCommit}
            type="button"
            size="lg"
            isLoading={isLoading}
            disabled={!message.trim()}
          >
            {tEditorCommit("submit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default CommitModal;
