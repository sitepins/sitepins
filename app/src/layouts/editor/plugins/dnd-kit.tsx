"use client";

import { DndPlugin } from "@platejs/dnd";
import { PlaceholderPlugin } from "@platejs/media/react";
import { DndProvider } from "react-dnd";
import { TouchBackend } from "react-dnd-touch-backend";
import {
  BlockDraggable,
  CustomDragLayer,
  DragHandleProvider,
} from "../plate-ui/block-draggable";

export const DndKit = [
  DndPlugin.configure({
    options: {
      enableScroller: true,
      onDropFiles: ({ dragItem, editor, target }) => {
        editor
          .getTransforms(PlaceholderPlugin)
          .insert.media(dragItem.files, { at: target, nextBlock: false });
      },
    },
    render: {
      aboveNodes: BlockDraggable,
      aboveSlate: ({ children }) => (
        <DndProvider
          backend={TouchBackend}
          options={{
            enableMouseEvents: true,
            enableTouchEvents: true,
            delayTouchStart: 0,
            ignoreContextMenu: true,
          }}
        >
          <DragHandleProvider>
            {children}
            <CustomDragLayer />
          </DragHandleProvider>
        </DndProvider>
      ),
    },
  }),
];
