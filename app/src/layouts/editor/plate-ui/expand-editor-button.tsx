import { selectConfig, updateConfig } from "@/redux/features/config/slice";
import { useAppDispatch } from "@/redux/store";
import { Expand, Maximize } from "lucide-react";
import { withRef } from "platejs/react";
import { useSelector } from "react-redux";
import { ToolbarButton } from "./toolbar";

export const ExpandToolbarButton = withRef<
  typeof ToolbarButton,
  {
    clear?: string | string[];
  }
>(({ clear, ...rest }, ref) => {
  const dispatch = useAppDispatch();
  const { fullscreen } = useSelector(selectConfig);

  return (
    <ToolbarButton
      tooltip={fullscreen ? "Exit Fullscreen" : "Fullscreen"}
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
