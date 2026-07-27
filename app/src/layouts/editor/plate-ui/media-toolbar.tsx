"use client";

import MediaPopupList from "@/components/media-popup-list";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { generatePath } from "@/lib/utils/common";
import { store } from "@/redux/store";
import {
  FloatingMedia as FloatingMediaPrimitive,
  FloatingMediaStore,
  useFloatingMediaValue,
  useImagePreviewValue,
} from "@platejs/media/react";
import { cva } from "class-variance-authority";
import { Link, Trash2Icon } from "lucide-react";
import { useTranslations } from "next-intl";
import { isUrl, type TImageElement, type WithRequiredKey } from "platejs";
import {
  useEditorRef,
  useEditorSelector,
  useElement,
  useFocusedLast,
  useReadOnly,
  useRemoveNodeButton,
  useSelected,
} from "platejs/react";
import { useEffect } from "react";
import { toast } from "sonner";
import { CaptionButton } from "./caption";

const inputVariants = cva(
  "flex h-[28px] w-full rounded-md border-none bg-transparent px-1.5 py-1 text-base placeholder:text-muted-foreground focus-visible:ring-transparent focus-visible:outline-none md:text-sm",
);

export function MediaToolbar({
  children,
  plugin,
}: {
  children: React.ReactNode;
  plugin: WithRequiredKey;
}) {
  const tEditorToolbar = useTranslations("editor.toolbar");
  const editor = useEditorRef();
  const readOnly = useReadOnly();
  const selected = useSelected();
  const isFocusedLast = useFocusedLast();
  const selectionCollapsed = useEditorSelector(
    (editor) => !editor.api.isExpanded(),
    [],
  );
  const isImagePreviewOpen = useImagePreviewValue("isOpen", editor.id);
  const open =
    isFocusedLast &&
    !readOnly &&
    selected &&
    selectionCollapsed &&
    !isImagePreviewOpen;
  const isEditing = useFloatingMediaValue("isEditing");

  useEffect(() => {
    if (!open && isEditing) {
      FloatingMediaStore.set("isEditing", false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  const config = store.getState().config;
  const element = useElement<TImageElement>();
  const { props: buttonProps } = useRemoveNodeButton({ element });

  const handleReplaceImage = (e: any) => {
    const src = typeof e === "string" ? e : e.target.value;
    const path = editor.api.findPath(element);
    if (!path) return toast.error(tEditorToolbar("reset_image_error"));
    editor.tf.setNodes(
      {
        url: src,
        isUpload: false,
        // isPasted: false,
      },
      { at: path },
    );
  };

  return (
    <Popover open={open} modal={false}>
      <PopoverAnchor>{children}</PopoverAnchor>

      <PopoverContent
        align="start"
        className="w-auto p-1"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        {isEditing ? (
          <div className="flex w-82.5 flex-col">
            <div className="flex items-center">
              <div className="text-muted-foreground flex items-center pr-1 pl-2">
                <Link className="size-4" />
              </div>

              <FloatingMediaPrimitive.UrlInput
                className={inputVariants()}
                placeholder={tEditorToolbar("paste_embed_link")}
                options={{ plugin }}
              />
            </div>
          </div>
        ) : (
          <div className="box-content flex items-center">
            {/* <ImageToolbarButton /> */}
            <MediaPopupList
              isReplace
              absolutePath={isUrl(element.url) ? element.url : undefined}
              className="cursor-pointer"
              onChangeHandler={handleReplaceImage}
              name={""}
              path={
                "/" +
                generatePath(
                  config.media,
                  (element as TImageElement).url,
                  config.public,
                )
              }
              triggerButton={
                <Button
                  size="sm"
                  variant="ghost"
                  className="hover:bg-background"
                >
                  {tEditorToolbar("replace")}
                </Button>
              }
            />
            <CaptionButton
              className="hover:bg-background"
              size="sm"
              variant="ghost"
            >
              {tEditorToolbar("alt_text")}
            </CaptionButton>

            <Separator orientation="vertical" className="mx-1 h-6" />

            <Button
              className="hover:bg-background"
              size="sm"
              variant="ghost"
              {...buttonProps}
            >
              <Trash2Icon className="w-4" />
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
