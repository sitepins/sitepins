/**
 * A collaborative room outlives any one tab, so it can be older than the Git
 * version a newcomer just loaded. Besides the rich-text body, the room holds
 * the frontmatter and the blob sha its content is based on.
 */

const META_MAP = "sitepins";
const BASE_KEY = "baseSha";
const FRONTMATTER_MAP = "frontmatter";
// Cannot collide with a YAML/TOML/JSON key.
const ORDER_KEY = "\u0000order";

/** Base for a room of unknown origin; never matches, so publishing always asks. */
export const UNKNOWN_BASE_SHA = "unknown";

/** Origin of this module's own writes, so observers can skip their echo. */
const LOCAL_ORIGIN = Symbol("sitepins-room");

type SharedRoot = { length?: number; _start?: unknown };

type RoomMapEvent = { transaction: { origin: unknown } };

type RoomMap = {
  get(key: string): unknown;
  set(key: string, value: string): unknown;
  delete(key: string): void;
  forEach(fn: (value: unknown, key: string) => void): void;
  observe(fn: (event: RoomMapEvent) => void): void;
  unobserve(fn: (event: RoomMapEvent) => void): void;
};

/** The slice of `Y.Doc` this module touches. */
export type RoomDoc = {
  share: Map<string, unknown>;
  getMap(name: string): RoomMap;
  transact(fn: () => void, origin?: unknown): void;
};

export type RoomFrontmatter = Record<string, unknown>;

export type RoomSnapshot = {
  /** Mirrors Plate's check for whether it will seed the room. */
  wasEmpty: boolean;
  baseSha?: string;
};

const readBase = (doc: RoomDoc) => {
  const baseSha = doc.getMap(META_MAP).get(BASE_KEY);
  return typeof baseSha === "string" ? baseSha : undefined;
};

export const readRoomSnapshot = (doc: RoomDoc): RoomSnapshot => {
  const root = doc.share.get("content") as SharedRoot | undefined;
  return {
    wasEmpty: !root || (!(root.length ?? 0) && root._start == null),
    baseSha: readBase(doc),
  };
};

export const writeRoomBase = (doc: RoomDoc, sha: string): void => {
  doc.transact(() => doc.getMap(META_MAP).set(BASE_KEY, sha), LOCAL_ORIGIN);
};

/** Null until a client has written frontmatter to the room. */
export const readRoomFrontmatter = (doc: RoomDoc): RoomFrontmatter | null => {
  const map = doc.getMap(FRONTMATTER_MAP);
  const order = map.get(ORDER_KEY);
  if (typeof order !== "string") return null;

  const keys: string[] = JSON.parse(order);
  // Keys added concurrently can be missing from the last-written order.
  const extra: string[] = [];
  map.forEach((_, key) => {
    if (key !== ORDER_KEY && !keys.includes(key)) extra.push(key);
  });

  const data: RoomFrontmatter = {};
  for (const key of [...keys, ...extra.sort()]) {
    const json = map.get(key);
    if (typeof json === "string") data[key] = JSON.parse(json);
  }
  return data;
};

export const writeRoomFrontmatter = (
  doc: RoomDoc,
  data: RoomFrontmatter,
): void => {
  const map = doc.getMap(FRONTMATTER_MAP);
  const keys = Object.keys(data).filter((key) => data[key] !== undefined);
  doc.transact(() => {
    for (const key of keys) {
      const json = JSON.stringify(data[key]);
      if (map.get(key) !== json) map.set(key, json);
    }
    const stale: string[] = [];
    map.forEach((_, key) => {
      if (key !== ORDER_KEY && !keys.includes(key)) stale.push(key);
    });
    stale.forEach((key) => map.delete(key));
    const order = JSON.stringify(keys);
    if (map.get(ORDER_KEY) !== order) map.set(ORDER_KEY, order);
  }, LOCAL_ORIGIN);
};

/** Calls back on frontmatter changes made by other clients. */
export const observeRoomFrontmatter = (
  doc: RoomDoc,
  onChange: (data: RoomFrontmatter) => void,
): (() => void) => {
  const map = doc.getMap(FRONTMATTER_MAP);
  const handler = (event: RoomMapEvent) => {
    if (event.transaction.origin === LOCAL_ORIGIN) return;
    const data = readRoomFrontmatter(doc);
    if (data) onChange(data);
  };
  map.observe(handler);
  return () => map.unobserve(handler);
};

/** Calls back when another client records a new base sha. */
export const observeRoomBase = (
  doc: RoomDoc,
  onChange: (sha: string) => void,
): (() => void) => {
  const map = doc.getMap(META_MAP);
  const handler = (event: RoomMapEvent) => {
    if (event.transaction.origin === LOCAL_ORIGIN) return;
    const sha = readBase(doc);
    if (sha) onChange(sha);
  };
  map.observe(handler);
  return () => map.unobserve(handler);
};

/**
 * `room` is the state seen at first sync, before Plate seeds it; null when the
 * sync timed out and the editor seeded from its own content.
 */
export const resolveRoomBase = (
  room: RoomSnapshot | null,
  ownBaseSha: string | undefined,
): { baseSha: string | undefined; record: boolean } => {
  if (!room) return { baseSha: ownBaseSha, record: false };
  if (room.wasEmpty) return { baseSha: ownBaseSha, record: !!ownBaseSha };
  return { baseSha: room.baseSha ?? UNKNOWN_BASE_SHA, record: false };
};
