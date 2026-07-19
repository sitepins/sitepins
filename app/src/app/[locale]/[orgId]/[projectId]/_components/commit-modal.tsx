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
import { useEffect, useRef, useState } from "react";

interface CommitDetails {
  message: string;
  description: string;
  createPullRequest: boolean;
}

interface CommitModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCommit: (details: CommitDetails) => void;
  isLoading: boolean;
}

import { useTranslations } from "next-intl";

const CommitModal: React.FC<CommitModalProps> = ({
  isOpen,
  onClose,
  onCommit,
  isLoading,
}) => {
  const tEditorCommit = useTranslations("editor.commit");
  const tCommon = useTranslations("common");
  const [message, setMessage] = useState("");
  const [description, setDescription] = useState("");
  const [commitType] = useState<"main" | "pr">("main");
  const previousLoadingRef = useRef(false);

  const handleCommit = () => {
    onCommit({
      message,
      description,
      createPullRequest: commitType === "pr",
    });
  };

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
            <Label htmlFor="commit-message">{tEditorCommit("message")}</Label>
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
