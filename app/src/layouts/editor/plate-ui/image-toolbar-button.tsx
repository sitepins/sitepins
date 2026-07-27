import MediaPopupList from "@/components/media-popup-list";
import { KEYS } from "platejs";
import { useEditorRef } from "platejs/react";
import { useCallback } from "react";
import { Icons } from "./icons";
import { ToolbarButton } from "./toolbar";

export const ImageToolbarButton = (
  props: React.ComponentProps<typeof ToolbarButton>,
) => {
  const editor = useEditorRef();

  const embedImage = useCallback(
    (url: string) => {
      editor.tf.insertNodes({
        children: [{ text: "" }],
        name: undefined,
        type: KEYS.img,
        url,
      });
    },
    [editor],
  );

  return (
    <MediaPopupList
      addExternalImage={(url) => {
        embedImage(url);
      }}
      className="invisible absolute top-1/2 left-1/2 z-30 -translate-x-1/2 -translate-y-1/2 cursor-pointer opacity-0 transition-opacity duration-300 group-hover:visible group-hover:opacity-100"
      onChangeHandler={(e: any) => {
        const src = e.target.value;
        embedImage(src);
      }}
      name={""}
      path={""}
      triggerButton={
        <ToolbarButton tooltip="Image" {...props}>
          <Icons.image />
        </ToolbarButton>
      }
    />
  );
};
