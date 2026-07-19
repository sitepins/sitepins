import {
  useLinkToolbarButton,
  useLinkToolbarButtonState,
} from "@platejs/link/react";
import { Icons } from "./icons";
import { ToolbarButton } from "./toolbar";

export function LinkToolbarButton(
  props: React.ComponentProps<typeof ToolbarButton>,
) {
  const state = useLinkToolbarButtonState();
  const { props: buttonProps } = useLinkToolbarButton(state);

  return (
    <ToolbarButton {...props} {...buttonProps} data-plate-focus tooltip="Link">
      <Icons.link />
    </ToolbarButton>
  );
}
