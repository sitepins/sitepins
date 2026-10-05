import { CollabBase, createCollabBase } from "@/contexts/collab-base-context";
import { UNKNOWN_BASE_SHA } from "@/lib/utils/collab-room-base";
import { registerProviderType } from "@platejs/yjs";
import { YjsPlugin } from "@platejs/yjs/react";
import { createRequire } from "node:module";
import path from "node:path";
import { Value } from "platejs";
import { createPlateEditor, PlateEditor } from "platejs/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { joinCollabRoom } from "./join-collab-room";

// yjs is only a transitive dependency; load the exact build Plate uses so the
// docs below and Plate's own Y.Doc share one module instance.
const require = createRequire(import.meta.url);
const yjsDir = path.dirname(
  require.resolve("yjs/package.json", {
    paths: [path.dirname(require.resolve("@platejs/yjs/package.json"))],
  }),
);

type YUpdateHandler = (update: Uint8Array, origin: unknown) => void;
type YDoc = {
  on(event: "update", handler: YUpdateHandler): void;
  off(event: "update", handler: YUpdateHandler): void;
  getMap(name: string): { get(key: string): unknown };
  get(
    name: string,
    type: unknown,
  ): { insert(index: number, text: string): void };
};
type YModule = {
  Doc: new () => YDoc;
  XmlText: unknown;
  applyUpdate(doc: YDoc, update: Uint8Array, origin?: unknown): void;
  encodeStateAsUpdate(doc: YDoc): Uint8Array;
};
let Y: YModule;

beforeAll(async () => {
  Y = await import(/* @vite-ignore */ path.join(yjsDir, "dist/yjs.mjs"));
});

type Room = { doc: YDoc; clients: number };
const rooms = new Map<string, Room>();

/** Hocuspocus stand-in: syncs on connect, relays updates, unloads empty rooms. */
class MemoryProvider {
  type = "memory";
  isConnected = false;
  isSynced = false;
  awareness: unknown;
  document: YDoc;
  private props: {
    doc: YDoc;
    awareness: unknown;
    options: { name: string };
    onConnect?: () => void;
    onDisconnect?: () => void;
    onSyncChange?: (isSynced: boolean) => void;
  };
  private detach?: () => void;

  constructor(props: MemoryProvider["props"]) {
    this.props = props;
    this.document = props.doc;
    this.awareness = props.awareness;
  }

  connect() {
    const { name } = this.props.options;
    const room = rooms.get(name) ?? { doc: new Y.Doc(), clients: 0 };
    rooms.set(name, room);
    room.clients++;
    setTimeout(() => {
      const doc = this.document;
      Y.applyUpdate(doc, Y.encodeStateAsUpdate(room.doc), this);
      const toServer = (update: Uint8Array, origin: unknown) => {
        if (origin !== this) Y.applyUpdate(room.doc, update, this);
      };
      const toClient = (update: Uint8Array, origin: unknown) => {
        if (origin !== this) Y.applyUpdate(doc, update, this);
      };
      doc.on("update", toServer);
      room.doc.on("update", toClient);
      this.detach = () => {
        doc.off("update", toServer);
        room.doc.off("update", toClient);
        if (--room.clients === 0) rooms.delete(name);
      };
      this.isConnected = true;
      this.props.onConnect?.();
      this.isSynced = true;
      this.props.onSyncChange?.(true);
    }, 5);
  }

  disconnect() {
    this.detach?.();
    this.detach = undefined;
    this.isConnected = false;
    this.isSynced = false;
    this.props.onDisconnect?.();
  }

  destroy() {
    this.disconnect();
  }
}

registerProviderType("memory", MemoryProvider as never);

const ROOM = "/org-1/proj-1/content/post.md";
// Plate types only its built-in provider names.
const memoryProvider = { type: "memory", options: { name: ROOM } } as never;
const S1 = "1".repeat(40);
const S2 = "2".repeat(40);
const S3 = "3".repeat(40);

const paragraphs = (...lines: string[]): Value =>
  lines.map((text) => ({ type: "p", children: [{ text }] }));

const bodyOf = (editor: PlateEditor) =>
  editor.children.map((node) => editor.api.string(node as never)).join("\n");

const tick = () => new Promise((resolve) => setTimeout(resolve, 20));

type Frontmatter = Record<string, unknown>;

type Tab = {
  editor: PlateEditor;
  collab: CollabBase;
  onOutdated: ReturnType<typeof vi.fn>;
  leave: () => void;
  rawMode: boolean;
  /** Mirrors EditorWrapper's frontmatter `state.data` and `baseline.data`. */
  frontmatter: { data: Frontmatter; baseline: Frontmatter };
  /** A local frontmatter edit, as FrontmatterRenderer + useFrontmatterSync do. */
  edit: (data: Frontmatter) => void;
};
const openTabs: Tab[] = [];

/** One browser tab opening the file: Git gave it `sha` and `lines`. */
const openTab = async (
  sha: string | undefined,
  lines: string[],
  frontmatter: Frontmatter = { title: "Hello" },
) => {
  const editor = createPlateEditor({
    plugins: [
      YjsPlugin.configure({
        options: { providers: [memoryProvider] },
      }),
    ],
  });
  const onOutdated = vi.fn();
  const collab = createCollabBase(sha, onOutdated);
  const tab: Tab = {
    editor,
    collab,
    onOutdated,
    leave: () => {},
    rawMode: false,
    frontmatter: { data: frontmatter, baseline: frontmatter },
    edit: (data) => {
      tab.frontmatter.data = data;
      collab.pushFrontmatter(data);
    },
  };
  collab.setFrontmatterBridge({
    read: () => tab.frontmatter.data,
    apply: (data, asBaseline) => {
      tab.frontmatter.data = data;
      if (asBaseline) tab.frontmatter.baseline = structuredClone(data);
    },
  });
  const { ready, leave } = joinCollabRoom(editor, {
    id: ROOM,
    value: paragraphs(...lines),
    collab,
    isRawMode: () => tab.rawMode,
  });
  tab.leave = leave;
  openTabs.push(tab);
  await ready;
  return tab;
};

const closeTab = (tab: Tab) => {
  tab.leave();
  openTabs.splice(openTabs.indexOf(tab), 1);
};

afterEach(() => {
  [...openTabs].forEach(closeTab);
  rooms.clear();
});

describe("joinCollabRoom", () => {
  it("seeds an empty room from Git and records that version", async () => {
    const a = await openTab(S1, ["Body"]);

    expect(bodyOf(a.editor)).toBe("Body");
    expect(a.collab.getBaseSha()).toBe(S1);
    expect(a.onOutdated).not.toHaveBeenCalled();
    expect(rooms.get(ROOM)!.doc.getMap("sitepins").get("baseSha")).toBe(S1);
  });

  it("joins a room on the same version and keeps its base", async () => {
    const a = await openTab(S1, ["Body"]);
    a.editor.tf.insertText(" edited", { at: { path: [0, 0], offset: 4 } });
    await tick();

    const b = await openTab(S1, ["Body"]);

    expect(bodyOf(b.editor)).toBe("Body edited");
    expect(b.collab.getBaseSha()).toBe(S1);
    expect(b.onOutdated).not.toHaveBeenCalled();
  });

  it("adopts the room's older version when Git moved on outside Sitepins", async () => {
    await openTab(S1, ["Body"]);

    // Someone pushed S2 to Git; this tab loaded it, but the room is still on S1.
    const b = await openTab(S2, ["Body", "Appended in GitHub"]);

    expect(bodyOf(b.editor)).toBe("Body");
    expect(b.collab.getBaseSha()).toBe(S1);
    expect(b.onOutdated).toHaveBeenCalledTimes(1);
  });

  it("lets later joiners match after a publish from the room", async () => {
    const a = await openTab(S1, ["Body"]);
    a.editor.tf.insertText(" edited", { at: { path: [0, 0], offset: 4 } });
    await tick();

    a.collab.recordPublished(S3);
    await tick();
    const c = await openTab(S3, ["Body edited"]);

    expect(a.collab.getBaseSha()).toBe(S3);
    expect(c.collab.getBaseSha()).toBe(S3);
    expect(c.onOutdated).not.toHaveBeenCalled();
  });

  it("does not vouch for the room after a raw-mode publish", async () => {
    const a = await openTab(S1, ["Body"]);
    a.rawMode = true;

    a.collab.recordPublished(S3);
    await tick();
    const c = await openTab(S3, ["Body edited in raw mode"]);

    expect(c.collab.getBaseSha()).toBe(S1);
    expect(c.onOutdated).toHaveBeenCalledTimes(1);
  });

  it("follows a collaborator's publish, since the content is shared", async () => {
    const a = await openTab(S1, ["Body"]);
    const b = await openTab(S1, ["Body"]);

    a.collab.recordPublished(S3);
    await tick();

    expect(b.collab.getBaseSha()).toBe(S3);
  });

  it("does not follow a publish while in raw mode", async () => {
    const a = await openTab(S1, ["Body"]);
    const b = await openTab(S1, ["Body"]);
    b.rawMode = true;

    a.collab.recordPublished(S3);
    await tick();

    expect(b.collab.getBaseSha()).toBe(S1);
  });

  it("treats a room with no recorded version as unknown", async () => {
    const legacy = new Y.Doc();
    legacy.get("content", Y.XmlText).insert(0, "old body");
    rooms.set(ROOM, { doc: legacy, clients: 1 });

    const b = await openTab(S2, ["Body"]);

    expect(b.collab.getBaseSha()).toBe(UNKNOWN_BASE_SHA);
    expect(b.onOutdated).toHaveBeenCalledTimes(1);
  });

  it("starts fresh from Git once everyone has left the room", async () => {
    const a = await openTab(S1, ["Body"]);
    closeTab(a);

    const b = await openTab(S2, ["Body", "Appended in GitHub"]);

    expect(bodyOf(b.editor)).toBe("Body\nAppended in GitHub");
    expect(b.collab.getBaseSha()).toBe(S2);
    expect(b.onOutdated).not.toHaveBeenCalled();
  });

  it("survives StrictMode's mount, unmount, remount without a second init", async () => {
    await openTab(S1, ["Body"]);
    const editor = createPlateEditor({
      plugins: [
        YjsPlugin.configure({
          options: { providers: [memoryProvider] },
        }),
      ],
    });
    const onOutdated = vi.fn();
    const collab = createCollabBase(S1, onOutdated);
    const join = () =>
      joinCollabRoom(editor, {
        id: ROOM,
        value: paragraphs("Body"),
        collab,
        isRawMode: () => false,
      });

    join().leave();
    const second = join();
    await second.ready;

    expect(bodyOf(editor)).toBe("Body");
    expect(rooms.get(ROOM)!.clients).toBe(2);
    expect(collab.getBaseSha()).toBe(S1);
    expect(onOutdated).not.toHaveBeenCalled();
    second.leave();
  });

  it("only lets the first join change the base", async () => {
    const collab = createCollabBase(S1, vi.fn());
    collab.onRoomJoined({ baseSha: S1, frontmatter: null });
    collab.recordPublished(S3);
    collab.onRoomJoined({ baseSha: S1, frontmatter: null });

    expect(collab.getBaseSha()).toBe(S3);
  });
});

const roomFrontmatter = () => {
  const map = rooms.get(ROOM)!.doc.getMap("frontmatter");
  const order = JSON.parse(map.get("\u0000order") as string) as string[];
  return Object.fromEntries(
    order.map((key) => [key, JSON.parse(map.get(key) as string)]),
  );
};

describe("frontmatter in the collaborative room", () => {
  it("seeds the room with the first tab's frontmatter", async () => {
    await openTab(S1, ["Body"], { title: "Hello", draft: false });

    expect(roomFrontmatter()).toEqual({ title: "Hello", draft: false });
  });

  it("gives a joiner the room's frontmatter as its clean starting point", async () => {
    const a = await openTab(S1, ["Body"], { title: "Hello" });
    a.edit({ title: "Unpublished title" });
    await tick();

    const b = await openTab(S1, ["Body"], { title: "Hello" });

    expect(b.frontmatter.data).toEqual({ title: "Unpublished title" });
    expect(b.frontmatter.baseline).toEqual({ title: "Unpublished title" });
  });

  it("syncs live edits both ways without touching the baseline", async () => {
    const a = await openTab(S1, ["Body"], { title: "Hello", tags: ["a"] });
    const b = await openTab(S1, ["Body"], { title: "Hello", tags: ["a"] });

    a.edit({ ...a.frontmatter.data, title: "From A" });
    await tick();
    b.edit({ ...b.frontmatter.data, tags: ["a", "b"] });
    await tick();

    expect(a.frontmatter.data).toEqual({ title: "From A", tags: ["a", "b"] });
    expect(b.frontmatter.data).toEqual({ title: "From A", tags: ["a", "b"] });
    expect(b.frontmatter.baseline).toEqual({ title: "Hello", tags: ["a"] });
  });

  it("merges concurrent edits to different fields", async () => {
    const a = await openTab(S1, ["Body"], { title: "Hello", draft: true });
    const b = await openTab(S1, ["Body"], { title: "Hello", draft: true });

    a.edit({ title: "From A", draft: true });
    b.edit({ title: "Hello", draft: false });
    await tick();

    expect(a.frontmatter.data).toEqual(b.frontmatter.data);
  });

  it("keeps the field order and propagates a removed field", async () => {
    const a = await openTab(S1, ["Body"], {
      title: "Hello",
      date: "2026",
      draft: true,
    });
    const b = await openTab(S1, ["Body"], {
      title: "Hello",
      date: "2026",
      draft: true,
    });

    a.edit({ title: "Hello", draft: true });
    await tick();

    expect(Object.keys(b.frontmatter.data)).toEqual(["title", "draft"]);
    expect(roomFrontmatter()).toEqual({ title: "Hello", draft: true });
  });

  it("does not echo a remote edit back into the room", async () => {
    const a = await openTab(S1, ["Body"], { title: "Hello" });
    const b = await openTab(S1, ["Body"], { title: "Hello" });
    const updates = vi.fn();
    rooms.get(ROOM)!.doc.on("update", updates);

    a.edit({ title: "From A" });
    await tick();
    // useFrontmatterSync pushes every state change, including applied ones.
    b.collab.pushFrontmatter(b.frontmatter.data);
    await tick();

    expect(updates).toHaveBeenCalledTimes(1);
  });

  it("pushes edits made while disconnected when the editor rejoins", async () => {
    const a = await openTab(S1, ["Body"], { title: "Hello" });
    const b = await openTab(S1, ["Body"], { title: "Hello" });
    b.leave();
    b.frontmatter.data = { title: "Edited offline" };

    const editor = createPlateEditor({
      plugins: [
        YjsPlugin.configure({ options: { providers: [memoryProvider] } }),
      ],
    });
    const rejoin = joinCollabRoom(editor, {
      id: ROOM,
      value: paragraphs("Body"),
      collab: b.collab,
      isRawMode: () => false,
    });
    await rejoin.ready;
    await tick();

    expect(a.frontmatter.data).toEqual({ title: "Edited offline" });
    rejoin.leave();
  });
});
