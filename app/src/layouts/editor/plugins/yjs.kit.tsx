import { YjsPlugin } from "@platejs/yjs/react";
import { RemoteCursorOverlay } from "../plate-ui/remote-cursor-overlay";

export const YjsKit = (
  data: {
    name: string;
    color: string;
    document_id: string;
  },
  options: {
    onSyncChange?: (props: { isSynced: boolean }) => void;
  } = {},
) => [
  YjsPlugin.configure({
    render: {
      afterEditable: RemoteCursorOverlay,
    },
    options: {
      cursors: { data: { name: data.name, color: data.color } },
      onSyncChange: options.onSyncChange,
      providers: [
        {
          type: "hocuspocus",
          options: {
            name: data.document_id,
            url: process.env.NEXT_PUBLIC_HP_WS_URL!,
          },
          wsOptions: {
            url: process.env.NEXT_PUBLIC_HP_WS_URL!,
            maxAttempts: 5,
          },
        },
      ],
    },
  }),
];
