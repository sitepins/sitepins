import { selectConfig, updateConfig } from "@/redux/features/config/slice";
import { useAppDispatch } from "@/redux/store";
import { Expand, Maximize } from "lucide-react";
import { useTranslations } from "next-intl";
import { withRef } from "platejs/react";
import { useSelector } from "react-redux";
import { ToolbarButton } from "./toolbar";

export const ExpandToolbarButton = withRef<
  typeof ToolbarButton,
  {
    clear?: string | string[];
  }
>(({ clear: _clear, tooltip, ...rest }, _ref) => {
  const tEditorRaw = useTranslations("editor.raw");
  const dispatch = useAppDispatch();
  const { fullscreen } = useSelector(selectConfig);

  return (
    <ToolbarButton
      tooltip={
        tooltip ??
        (fullscreen ? tEditorRaw("exit_fullscreen") : tEditorRaw("fullscreen"))
      }
      {...rest}
      data-testid="fullscreen-button"
      onClick={() => {
        dispatch(
          updateConfig({
            fullscreen: !fullscreen,
          }),
        );
      }}
    >
      {!fullscreen ? (
        <Expand className="size-4" />
      ) : (
        <Maximize className="size-4" />
      )}
    </ToolbarButton>
  );
});
