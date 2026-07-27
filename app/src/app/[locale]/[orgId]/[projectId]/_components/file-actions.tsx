import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useOwnerPlan } from "@/hooks/use-owner-plan";
import { cn } from "@/lib/utils/cn";
import { selectConfig } from "@/redux/features/config/slice";
import { TFiles } from "@/types";
import {
  Code2,
  CopyIcon,
  Edit2Icon,
  EllipsisVertical,
  Trash2,
} from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { useSelector } from "react-redux";
import { FileOperation } from "./file-operation";

export default function FileAction({
  file,
  className,
}: {
  file: TFiles;
  className?: string;
}) {
  const tDirectoryViewActions = useTranslations("directory-view.actions");
  const tCommon = useTranslations("common");
  const params = useParams() as { orgId: string; projectId: string };
  const { canAccessProFeatures } = useOwnerPlan();
  const filePath = file.path.replace("content/", "");

  const config = useSelector(selectConfig);

  const normalize = (p = "") => p.replace(/^\/+|\/+$/g, "");
  const normalizedContentRoot = normalize(config?.content || "src/content");
  const filePathNormalized = normalize(file.path.replace(/^content\//, ""));
  const contentBase = normalizedContentRoot.split("/").pop() || "";

  const isContentPath =
    normalizedContentRoot &&
    (filePathNormalized === normalizedContentRoot ||
      filePathNormalized.startsWith(normalizedContentRoot + "/"));

  const looksLikeContent =
    contentBase &&
    (filePathNormalized === contentBase ||
      filePathNormalized.startsWith(contentBase + "/") ||
      filePathNormalized.includes("/" + contentBase + "/"));
  const showEditInCms = !!(isContentPath || looksLikeContent);

  const [isOpen, setIsOpen] = useState(false);
  const [isRenameOpen, setIsRenameOpen] = useState(false);
  const [isDuplicateOpen, setIsDuplicateOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);

  return (
    <>
      <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
        <DropdownMenuTrigger asChild>
          <Button
            className={cn("text-muted-foreground", className)}
            variant={"ghost"}
            size={"icon"}
          >
            <EllipsisVertical className="text-secondary-foreground mx-auto" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent collisionPadding={8} align="end">
          {showEditInCms && (
            <DropdownMenuItem asChild onClick={() => setIsOpen(false)}>
              <Link
                href={`/${params.orgId}/${params.projectId}/content/${filePath}`}
                className="flex w-full items-center"
              >
                <Edit2Icon className="mr-2 size-4" />
                <span className="font-medium">
                  {tDirectoryViewActions("edit_in_cms")}
                </span>
              </Link>
            </DropdownMenuItem>
          )}
          {canAccessProFeatures && (
            <DropdownMenuItem asChild onClick={() => setIsOpen(false)}>
              <Link
                href={`/${params.orgId}/${params.projectId}/code/${filePath}`}
                className="flex w-full items-center"
              >
                <Code2 className="mr-2 size-4" />
                <span className="font-medium">
                  {tCommon("actions.edit_as_code")}
                </span>
              </Link>
            </DropdownMenuItem>
          )}
          <DropdownMenuItem
            className="cursor-pointer"
            onClick={() => {
              setIsOpen(false);
              setIsDuplicateOpen(true);
            }}
          >
            <CopyIcon className="mr-2 size-4" />
            <span>{tCommon("actions.duplicate")}</span>
          </DropdownMenuItem>
          <DropdownMenuItem
            className="cursor-pointer"
            onClick={() => {
              setIsOpen(false);
              setIsRenameOpen(true);
            }}
          >
            <Edit2Icon className="mr-2 size-4" />
            <span>{tCommon("actions.rename")}</span>
          </DropdownMenuItem>
          <DropdownMenuItem
            variant="destructive"
            className="cursor-pointer"
            onClick={() => {
              setIsOpen(false);
              setIsDeleteOpen(true);
            }}
          >
            <Trash2 className="mr-2 size-4" />
            <span>{tCommon("actions.delete")}</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <FileOperation
        operation="duplicate"
        title={tDirectoryViewActions("duplicate_confirm", { name: file.name })}
        path={filePath}
        open={isDuplicateOpen}
        onOpenChange={setIsDuplicateOpen}
      />

      <FileOperation
        operation="rename"
        title={tDirectoryViewActions("rename_confirm", { name: file.name })}
        path={filePath}
        open={isRenameOpen}
        onOpenChange={setIsRenameOpen}
      />

      <FileOperation
        operation="delete"
        title={tDirectoryViewActions("delete_confirm", { name: file.name })}
        path={filePath}
        open={isDeleteOpen}
        onOpenChange={setIsDeleteOpen}
      />
    </>
  );
}
