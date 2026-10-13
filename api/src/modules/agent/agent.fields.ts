import ApiError from "@/errors/ApiError";
import toml from "@ltd/j-toml";
import YAML from "yaml";

export type TDocFormat = "yaml" | "toml" | "json";

type TFieldKey = string | number;

type TSplitDocument = {
  format: TDocFormat;
  /** Opening fence, or "" for a whole-file data file. */
  before: string;
  data: string;
  /** Closing fence and body, kept byte for byte. */
  after: string;
};

export type TFieldChanges = {
  set?: Record<string, unknown>;
  unset?: string[];
};

export type TTemplateField = {
  name: string;
  type?: string;
  isRequired?: boolean;
  defaultValue?: unknown;
  alwaysUseCurrentDate?: boolean;
  options?: unknown[];
  fields?: TTemplateField[];
};

const YAML_OPTIONS = { lineWidth: 0 } as const;

const fail = (message: string, code = "unsupported") =>
  Object.assign(new ApiError(message, 400, ""), { code });

export const parseFieldPath = (key: string): TFieldKey[] => {
  const segments = key.split(".").filter(Boolean);
  if (!segments.length) throw fail(`Invalid field name "${key}"`, "invalid");
  return segments.map((s) => (/^\d+$/.test(s) ? Number(s) : s));
};

const FENCED = {
  yaml: /^(---[ \t]*\r?\n)([\s\S]*?)(^---[ \t]*(?:\r?\n|$)[\s\S]*)$/m,
  toml: /^(\+\+\+[ \t]*\r?\n)([\s\S]*?)(^\+\+\+[ \t]*(?:\r?\n|$)[\s\S]*)$/m,
};

/** Data files are edited whole; content files only between their frontmatter fences. */
export const splitDocument = (path: string, text: string): TSplitDocument => {
  const ext = path.slice(path.lastIndexOf(".") + 1).toLowerCase();
  if (ext === "json")
    return { format: "json", before: "", data: text, after: "" };
  if (ext === "yaml" || ext === "yml") {
    return { format: "yaml", before: "", data: text, after: "" };
  }
  if (ext === "toml")
    return { format: "toml", before: "", data: text, after: "" };
  for (const format of ["yaml", "toml"] as const) {
    const match = text.match(FENCED[format]);
    if (match && match.index === 0) {
      return { format, before: match[1], data: match[2], after: match[3] };
    }
  }
  throw fail(
    `${path} has no frontmatter to update. Use edit_file to change its text.`,
  );
};

const setIn = (target: unknown, path: TFieldKey[], value: unknown) => {
  let node = target as Record<TFieldKey, unknown>;
  for (const [i, key] of path.slice(0, -1).entries()) {
    if (node[key] === null || typeof node[key] !== "object") {
      node[key] = typeof path[i + 1] === "number" ? [] : {};
    }
    node = node[key] as Record<TFieldKey, unknown>;
  }
  node[path[path.length - 1]] = value;
};

const deleteIn = (target: unknown, path: TFieldKey[]) => {
  let node = target as Record<TFieldKey, unknown> | undefined;
  for (const key of path.slice(0, -1)) {
    node = node?.[key] as Record<TFieldKey, unknown> | undefined;
  }
  if (!node || typeof node !== "object") return;
  const last = path[path.length - 1];
  if (Array.isArray(node) && typeof last === "number") node.splice(last, 1);
  else delete node[last];
};

const updateYaml = (data: string, changes: TFieldChanges) => {
  const doc = YAML.parseDocument(data);
  if (doc.errors.length) {
    throw fail(`The YAML can't be parsed: ${doc.errors[0].message}`);
  }
  if (!doc.contents)
    doc.contents = doc.createNode({}) as unknown as typeof doc.contents;
  for (const [key, value] of Object.entries(changes.set ?? {})) {
    doc.setIn(parseFieldPath(key), value);
  }
  for (const key of changes.unset ?? []) doc.deleteIn(parseFieldPath(key));
  return doc.toString(YAML_OPTIONS);
};

const updateJson = (data: string, changes: TFieldChanges) => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(data);
  } catch {
    throw fail("The JSON can't be parsed; use edit_file instead");
  }
  for (const [key, value] of Object.entries(changes.set ?? {})) {
    setIn(parsed, parseFieldPath(key), value);
  }
  for (const key of changes.unset ?? []) deleteIn(parsed, parseFieldPath(key));
  const indent = data.match(/^([ \t]+)"/m)?.[1] ?? 2;
  return `${JSON.stringify(parsed, null, indent)}${data.endsWith("\n") ? "\n" : ""}`;
};

const parseToml = (data: string) => {
  try {
    return toml.parse(data, 1.0, "\n", false) as Record<string, unknown>;
  } catch (error) {
    throw fail(
      `The TOML can't be parsed: ${error instanceof Error ? error.message : "invalid"}`,
    );
  }
};

const tomlValue = (value: unknown): string => {
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value) && value.every((v) => typeof v !== "object")) {
    return `[${value.map(tomlValue).join(", ")}]`;
  }
  throw fail(
    "TOML fields can only be set to text, numbers, true/false or simple lists here; use edit_file for anything else",
  );
};

/** Line index of each `key = value` by its dotted path ([table] headers included). */
const tomlKeyLines = (lines: string[]) => {
  const map = new Map<string, number>();
  let table: string[] = [];
  const counts = new Map<string, number>();
  for (const [i, raw] of lines.entries()) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const header = line.match(/^(\[\[?)\s*([^\]]+?)\s*\]\]?/);
    if (header) {
      const name = header[2];
      if (header[1] === "[[") {
        const n = counts.get(name) ?? 0;
        counts.set(name, n + 1);
        table = [...name.split("."), String(n)];
      } else {
        table = name.split(".");
      }
      continue;
    }
    const key = line.match(/^("[^"]+"|[A-Za-z0-9_-]+)\s*=/)?.[1];
    if (key) map.set([...table, key.replace(/^"|"$/g, "")].join("."), i);
  }
  return map;
};

const singleLine = (line: string) => {
  const value = line.slice(line.indexOf("=") + 1).trim();
  return (
    !value.startsWith('"""') &&
    !value.startsWith("'''") &&
    (!value.startsWith("[") || value.replace(/#.*$/, "").trim().endsWith("]"))
  );
};

const updateToml = (data: string, changes: TFieldChanges) => {
  parseToml(data);
  const lines = data.split("\n");
  const locate = () => tomlKeyLines(lines);
  for (const [key, value] of Object.entries(changes.set ?? {})) {
    const path = parseFieldPath(key).join(".");
    const at = locate().get(path);
    const rendered = tomlValue(value);
    if (at !== undefined) {
      if (!singleLine(lines[at])) {
        throw fail(`${key} spans several lines; use edit_file for it`);
      }
      lines[at] = lines[at].replace(
        /^(\s*[^=]+?=\s*)(.*?)(\s+#.*)?$/,
        (_m, head: string, _v: string, comment = "") =>
          `${head}${rendered}${comment}`,
      );
    } else if (!path.includes(".")) {
      const firstTable = lines.findIndex((l) => /^\s*\[/.test(l));
      const insertAt = firstTable === -1 ? lines.length : firstTable;
      const trailingBlank =
        insertAt === lines.length && lines[lines.length - 1] === "";
      lines.splice(
        trailingBlank ? insertAt - 1 : insertAt,
        0,
        `${path} = ${rendered}`,
      );
    } else {
      throw fail(`${key} doesn't exist yet; use edit_file to add nested TOML`);
    }
  }
  for (const key of changes.unset ?? []) {
    const at = locate().get(parseFieldPath(key).join("."));
    if (at === undefined) continue;
    if (!singleLine(lines[at])) {
      throw fail(`${key} spans several lines; use edit_file for it`);
    }
    lines.splice(at, 1);
  }
  const out = lines.join("\n");
  parseToml(out);
  return out;
};

/** The frontmatter (or data file) as an object; null when there is none or it doesn't parse. */
export const readFields = (
  path: string,
  text: string,
): Record<string, unknown> | null => {
  try {
    const doc = splitDocument(path, text);
    const parsed =
      doc.format === "yaml"
        ? YAML.parse(doc.data)
        : doc.format === "json"
          ? JSON.parse(doc.data)
          : parseToml(doc.data);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
};

/** Changes only the named fields; everything else in the file stays byte for byte. */
export const updateFields = (
  path: string,
  text: string,
  changes: TFieldChanges,
) => {
  if (!Object.keys(changes.set ?? {}).length && !changes.unset?.length) {
    throw fail("Nothing to change", "invalid");
  }
  const doc = splitDocument(path, text);
  const data =
    doc.format === "yaml"
      ? updateYaml(doc.data, changes)
      : doc.format === "json"
        ? updateJson(doc.data, changes)
        : updateToml(doc.data, changes);
  return { format: doc.format, text: `${doc.before}${data}${doc.after}`, data };
};

/** Mirrors the editor's new-file defaults (schema-form-converter.tsx). */
export const defaultsFromTemplate = (
  template: TTemplateField[],
  title?: string,
): Record<string, unknown> => {
  const out: Record<string, unknown> = {};
  for (const field of template) {
    const given =
      field.defaultValue !== undefined && field.defaultValue !== ""
        ? field.defaultValue
        : undefined;
    if (field.fields?.length) {
      const inner = defaultsFromTemplate(field.fields);
      out[field.name] = field.type === "object" ? inner : [inner];
      continue;
    }
    if (field.name === "title") {
      out.title = title ?? "";
      continue;
    }
    switch (field.type) {
      case "Date":
      case "date":
        out[field.name] = field.alwaysUseCurrentDate
          ? new Date().toISOString().split("T")[0]
          : (given ?? "");
        break;
      case "boolean":
        out[field.name] =
          given !== undefined ? String(given) === "true" : false;
        break;
      case "number":
        out[field.name] = given !== undefined ? Number(given) || 0 : 0;
        break;
      case "Array":
      case "gallery":
        out[field.name] = [];
        break;
      case "object":
        out[field.name] = {};
        break;
      default:
        out[field.name] = given ?? "";
    }
  }
  return out;
};

const TYPE_CHECKS: Record<string, (v: unknown) => boolean> = {
  string: (v) => typeof v === "string",
  media: (v) => typeof v === "string",
  date: (v) => typeof v === "string",
  Date: (v) => typeof v === "string",
  number: (v) => typeof v === "number",
  boolean: (v) => typeof v === "boolean",
  Array: Array.isArray,
  gallery: Array.isArray,
  object: (v) => typeof v === "object" && v !== null && !Array.isArray(v),
};

/** Problems with the agent's values against the schema, in words it can act on. */
export const checkEntryFields = (
  template: TTemplateField[],
  values: Record<string, unknown>,
) => {
  const problems: string[] = [];
  const known = new Map(template.map((f) => [f.name, f]));
  for (const [name, value] of Object.entries(values)) {
    const field = known.get(name);
    if (!field) {
      problems.push(
        `"${name}" isn't a field of this schema (fields: ${[...known.keys()].join(", ")})`,
      );
      continue;
    }
    const check = field.type ? TYPE_CHECKS[field.type] : undefined;
    if (check && !check(value)) {
      problems.push(`"${name}" must be ${field.type}`);
    }
    if (
      Array.isArray(field.options) &&
      field.options.length &&
      typeof value === "string" &&
      !field.options.map(String).includes(value)
    ) {
      problems.push(
        `"${name}" must be one of: ${field.options.map(String).join(", ")}`,
      );
    }
  }
  return problems;
};

export const missingRequired = (
  template: TTemplateField[],
  data: Record<string, unknown>,
) =>
  template
    .filter((f) => f.isRequired)
    .filter((f) => {
      const v = data[f.name];
      return (
        v === undefined ||
        v === null ||
        v === "" ||
        (Array.isArray(v) && v.length === 0)
      );
    })
    .map((f) => f.name);

// j-toml writes every JS number as a float (weight = 2.0) unless it's a BigInt.
const withTomlIntegers = (value: unknown): unknown => {
  if (typeof value === "number" && Number.isInteger(value))
    return BigInt(value);
  if (Array.isArray(value)) return value.map(withTomlIntegers);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, withTomlIntegers(v)]),
    );
  }
  return value;
};

/** Same layout the editor writes for a new file. */
export const serializeEntry = (
  format: TDocFormat,
  data: Record<string, unknown>,
  body: string,
) => {
  if (format === "json") return `${JSON.stringify(data, null, 2)}\n${body}`;
  if (format === "toml") {
    const rendered = toml.stringify(withTomlIntegers(data) as never, {
      newline: "\n",
      indent: 2,
    }) as unknown as string;
    return `+++\n${rendered.replace(/^\n+/, "")}+++\n${body}`;
  }
  return `---\n${new YAML.Document(data).toString(YAML_OPTIONS)}---\n${body}`;
};
