import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { useRaisedShadow } from "@/hooks/use-rise-drag";
import { TArrangement } from "@/types";
import {
  File,
  Folder,
  GripVertical,
  Heading,
  Settings,
  Trash2,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { Reorder, useDragControls, useMotionValue } from "motion/react";

const icons = {
  file: File,
  folder: Folder,
  heading: Heading,
} as const;

function DeleteArrangement({
  handleDelete,
  id,
}: {
  handleDelete: (id: string) => void;
  id: string;
}) {
  const tCommon = useTranslations("common");
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button type="button" variant="link">
          <Trash2 />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {tCommon("confirm.absolutely_sure")}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {tCommon("confirm.delete_description")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{tCommon("actions.cancel")}</AlertDialogCancel>
          <Button onClick={() => handleDelete(id)}>
            {tCommon("actions.continue")}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export default function ArrangementItem({
  arrangement,
  handleDelete,
  onEdit,
}: {
  arrangement: TArrangement;
  handleDelete: (id: string) => void;
  onEdit?: () => void;
}) {
  const y = useMotionValue(0);
  const boxShadow = useRaisedShadow(y);
  const dragControls = useDragControls();
  const Icon = icons[arrangement.type];

  return (
    <Reorder.Item
      className="border-b-border! bg-background flex cursor-grab items-center border-b px-2 py-2 pl-2 last:border-b-0"
      value={arrangement}
      id={arrangement.id}
      style={{ y, boxShadow }}
      dragListener={false}
      dragControls={dragControls}
    >
      <span
        className="touch-none"
        onPointerDown={(event) => dragControls.start(event)}
      >
        <GripVertical />
      </span>
      <div className="flex min-w-0 flex-1 items-center justify-between select-none">
        <div className="mr-2 flex min-w-0 items-center">
          <Icon className="mr-2 size-6 shrink-0" />
          <span className="truncate">{arrangement.groupName}</span>
        </div>
        <div className="flex items-center">
          <Button size={"icon"} variant={"ghost"} onClick={onEdit}>
            <Settings />
          </Button>
          <DeleteArrangement handleDelete={handleDelete} id={arrangement.id} />
        </div>
      </div>
    </Reorder.Item>
  );
}
