import { Badge } from "@/components/ui/badge";
import { useTranslations } from "next-intl";

export default function FileStatus({ draft }: { draft?: boolean }) {
  const tEditorFileStatus = useTranslations("editor.file_status");
  return draft ? (
    <Badge variant={"destructive"} size={"lg"}>
      {tEditorFileStatus("draft")}
    </Badge>
  ) : (
    <Badge variant={"success"} size={"lg"}>
      {tEditorFileStatus("published")}
    </Badge>
  );
}
