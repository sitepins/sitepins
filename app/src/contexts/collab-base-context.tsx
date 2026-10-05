import type { RoomFrontmatter } from "@/lib/utils/collab-room-base";
import { createContext, useContext } from "react";

export type RoomWriters = {
  base: (sha: string) => void;
  frontmatter: (data: RoomFrontmatter) => void;
};

/** Links the rich editor's collaborative room to the editor state. */
export type TCollabBaseContext = {
  getBaseSha: () => string | undefined;
  /** The editor now mirrors a room based on `baseSha`; `frontmatter` is null when the room has none yet. */
  onRoomJoined: (room: {
    baseSha: string | undefined;
    frontmatter: RoomFrontmatter | null;
  }) => void;
  /** Another client edited the frontmatter. */
  onRoomFrontmatter: (data: RoomFrontmatter) => void;
  /** Another client published the room's content as `sha`. */
  onRoomBase: (sha: string) => void;
  /** Null while not joined. */
  setRoomWriters: (writers: RoomWriters | null) => void;
};

export type FrontmatterBridge = {
  read: () => RoomFrontmatter | undefined;
  /** `asBaseline`: the room's copy is where this tab starts, not an edit. */
  apply: (data: RoomFrontmatter, asBaseline: boolean) => void;
};

export type CollabBase = TCollabBaseContext & {
  /** A publish succeeded with this blob sha. */
  recordPublished: (sha: string) => void;
  setFrontmatterBridge: (bridge: FrontmatterBridge | null) => void;
  /** Local frontmatter changed. */
  pushFrontmatter: (data: RoomFrontmatter) => void;
};

/**
 * Owns the blob sha the editor's content is based on and relays frontmatter
 * between the editor state and the room. Only the first join adopts the
 * room's copy; a rejoin pushes this tab's frontmatter, which it kept editing.
 */
export const createCollabBase = (
  initialSha: string | undefined,
  onOutdated: () => void,
): CollabBase => {
  let baseSha = initialSha;
  let joined = false;
  let writers: RoomWriters | null = null;
  let bridge: FrontmatterBridge | null = null;

  return {
    getBaseSha: () => baseSha,
    onRoomJoined: (room) => {
      const first = !joined;
      joined = true;
      if (first && room.frontmatter) {
        bridge?.apply(room.frontmatter, true);
      } else {
        const local = bridge?.read();
        if (local) writers?.frontmatter(local);
      }
      if (first && room.baseSha !== baseSha) {
        baseSha = room.baseSha;
        onOutdated();
      }
    },
    onRoomFrontmatter: (data) => bridge?.apply(data, false),
    onRoomBase: (sha) => {
      // Body and frontmatter are both shared, so the publisher's version is ours.
      if (joined) baseSha = sha;
    },
    setRoomWriters: (next) => {
      writers = next;
    },
    recordPublished: (sha) => {
      baseSha = sha;
      writers?.base(sha);
    },
    setFrontmatterBridge: (next) => {
      bridge = next;
    },
    pushFrontmatter: (data) => writers?.frontmatter(data),
  };
};

export const CollabBaseContext = createContext<TCollabBaseContext | null>(null);

export const useCollabBase = () => useContext(CollabBaseContext);
