import { BaseTableKit } from "../plate-ui/table-base-kit";
import { BaseAlignKit } from "./align-base-kit";
import { BaseBasicBlocksKit } from "./basic-blocks-base-kit";
import { BaseBasicMarksKit } from "./basic-marks-base-kit";
import { BaseCodeBlockKit } from "./code-block-base-kit";
import { BaseLineHeightKit } from "./line-height-base-kit";
import { BaseLinkKit } from "./link-base-kit";
import { BaseListKit } from "./list-base-kit";
import { MarkdownKit } from "./markdown-kit";
import { BaseMathKit } from "./math-base-kit";
import { BaseMediaKit } from "./media-base-kit";

export const BaseEditorKit = [
  ...BaseBasicBlocksKit,
  ...BaseCodeBlockKit,
  ...BaseTableKit,
  ...BaseMediaKit,
  ...BaseMathKit,
  ...BaseLinkKit,
  ...BaseBasicMarksKit,
  ...BaseListKit,
  ...BaseAlignKit,
  ...BaseLineHeightKit,
  ...MarkdownKit,
];
