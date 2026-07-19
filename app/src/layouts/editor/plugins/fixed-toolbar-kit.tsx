"use client";

import { createPlatePlugin } from "platejs/react";
import { FixedToolbar } from "../plate-ui/fixed-toolbar";
import FixedToolbarButtons from "../plate-ui/fixed-toolbar-buttons";

export const FixedToolbarKit = [
  createPlatePlugin({
    key: "fixed-toolbar",
    render: {
      beforeEditable: () => (
        <FixedToolbar className="rounded-tl rounded-tr p-0">
          <FixedToolbarButtons />
        </FixedToolbar>
      ),
    },
  }),
];
