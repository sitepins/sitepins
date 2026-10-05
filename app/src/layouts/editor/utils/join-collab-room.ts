import { TCollabBaseContext } from "@/contexts/collab-base-context";
import {
  observeRoomBase,
  observeRoomFrontmatter,
  readRoomFrontmatter,
  readRoomSnapshot,
  resolveRoomBase,
  RoomDoc,
  RoomSnapshot,
  writeRoomBase,
  writeRoomFrontmatter,
} from "@/lib/utils/collab-room-base";
import { YjsPlugin } from "@platejs/yjs/react";
import { Value } from "platejs";
import { PlateEditor } from "platejs/react";

type JoinOptions = {
  id: string;
  /** Seeds the room only when the server has no state for it. */
  value: Value;
  collab: TCollabBaseContext | null;
  isRawMode: () => boolean;
};

export function joinCollabRoom(
  editor: PlateEditor,
  { id, value, collab, isRawMode }: JoinOptions,
): { ready: Promise<void>; leave: () => void } {
  const roomDoc = editor.getOptions(YjsPlugin).ydoc as unknown as RoomDoc;
  let room: RoomSnapshot | null = null;
  let active = true;
  let started = false;
  let stopObserving: () => void = () => {};
  let settle: () => void = () => {};
  let fail: (error: unknown) => void = () => {};
  const ready = new Promise<void>((resolve, reject) => {
    settle = resolve;
    fail = reject;
  });

  const onReady = () => {
    if (!active || !collab) return;
    const { baseSha, record } = resolveRoomBase(room, collab.getBaseSha());
    if (record && baseSha) writeRoomBase(roomDoc, baseSha);

    // Raw-mode edits never reach the room body, so a raw-mode tab can neither
    // vouch for the room's content nor take a publish of it as its own.
    collab.setRoomWriters({
      base: (sha) => {
        if (!isRawMode()) writeRoomBase(roomDoc, sha);
      },
      frontmatter: (data) => writeRoomFrontmatter(roomDoc, data),
    });
    collab.onRoomJoined({ baseSha, frontmatter: readRoomFrontmatter(roomDoc) });

    const stopFrontmatter = observeRoomFrontmatter(
      roomDoc,
      collab.onRoomFrontmatter,
    );
    const stopBase = observeRoomBase(roomDoc, (sha) => {
      if (!isRawMode()) collab.onRoomBase(sha);
    });
    stopObserving = () => {
      stopFrontmatter();
      stopBase();
    };
  };

  // StrictMode mounts, unmounts and remounts in one go. An abandoned init
  // still connects the editor and makes the surviving one throw "already
  // connected", so only start once this mount has outlived that cycle.
  const timer = setTimeout(() => {
    started = true;
    // Plate reports the first sync before it seeds an empty room, so this
    // captures the server's state.
    editor.setOption(YjsPlugin, "onSyncChange", ({ isSynced }) => {
      if (isSynced && !room) room = readRoomSnapshot(roomDoc);
    });
    editor
      .getApi(YjsPlugin)
      .yjs.init({ id, value, onReady })
      .then(settle, fail);
  }, 0);

  return {
    ready,
    leave: () => {
      active = false;
      clearTimeout(timer);
      stopObserving();
      collab?.setRoomWriters(null);
      if (started) editor.getApi(YjsPlugin).yjs.destroy();
      else settle();
    },
  };
}
