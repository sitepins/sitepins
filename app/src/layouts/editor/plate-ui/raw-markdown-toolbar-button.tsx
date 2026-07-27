import { setRawMode } from "@/redux/features/config/slice";
import { useAppDispatch } from "@/redux/store";
import { Icons } from "./icons";
import { ToolbarButton } from "./toolbar";

const useRawMarkdownToolbarButton = () => {
  const dispatch = useAppDispatch();
  const onMouseDown = (e: React.MouseEvent) => {
    dispatch(setRawMode(true));
  };

  return {
    props: {
      onMouseDown,
      pressed: false,
    },
  };
};

export const RawMarkdownToolbarButton = (
  props: React.ComponentProps<typeof ToolbarButton> & { iconOnly?: boolean },
) => {
  const { iconOnly, ...rest } = props;
  const { props: buttonProps } = useRawMarkdownToolbarButton();
  return (
    <ToolbarButton
      tooltip="Raw Markdown"
      {...rest}
      {...buttonProps}
      data-testid="markdown-button"
    >
      {iconOnly ? (
        <Icons.raw />
      ) : (
        <span className="hidden @md/toolbar:inline">Raw Markdown</span>
      )}
    </ToolbarButton>
  );
};
