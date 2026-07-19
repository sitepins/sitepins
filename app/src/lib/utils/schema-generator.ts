import matter from "gray-matter";
import { checkMedia } from "./check-media-file";
import { verifyColor } from "./common";

type Type =
  | "media"
  | "object"
  | "list"
  | "string"
  | "number"
  | "boolean"
  | "textarea"
  | "bigint"
  | any;

interface Frontmatter {
  [key: string]: any;
}

export interface FieldSchema {
  type: Type;
  name: string;
  label: string;
  description?: string;
  fields?: FieldSchema[];
  value?: any;
  defaultValue?: any;
}

export type IJsonSchema =
  | {
      path: string;
      frontmatter: FieldSchema[];
      content: FieldSchema;
    }
  | undefined;

const convertToCamelCase = (input: string = ""): string => {
  if (typeof input !== "string") {
    // @ts-ignore
    input = input.toString();
  }
  const fileName = input?.replace(/\.[^/.]+$/, ""); // Remove file extension
  const words = fileName.split(/[-_]/).filter((word) => word !== ""); // Split by hyphen and underscore, then filter out empty strings
  const capitalizedWords = words.map((word, index) => {
    if (index === 0) {
      if (/^\d/.test(word)) {
        return word.charAt(0).toUpperCase() + word.slice(1);
      }
      return word.charAt(0).toUpperCase() + word.slice(1);
    }
    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
  });
  return capitalizedWords.join(" ");
};

const reShapeJsonToFieldSchema = (data: {
  name?: string;
  content: string;
}): IJsonSchema => {
  if (!data?.name) return undefined;

  const filePath = data.name;
  const repoFileContent = decodeBase64(data.content);
  const ext = filePath.substring(filePath.lastIndexOf("."));

  // convert data to json
  const jsonData =
    ext === ".json"
      ? { data: JSON.parse(repoFileContent), content: null }
      : [".md", ".mdx"].includes(ext)
        ? matter(repoFileContent)
        : {};
  const schema = generateSchema(jsonData.data || {});
  const content: FieldSchema = {
    type: "textarea",
    name: "content",
    label: "Content",
    value: "",
    defaultValue: "",
  };

  return {
    path: filePath,
    frontmatter: schema,
    content: content,
  };
};

export default reShapeJsonToFieldSchema;

// compare with schema
export function generateSchema(
  jsonData: Frontmatter,
  parentPath = "",
  comments?: Record<string, string>,
): FieldSchema[] {
  return Object.entries(jsonData).map(([key, value]) => {
    const path = parentPath ? `${parentPath}.${key}` : key;
    const description = comments?.[path];

    if (typeof value === "object" && value !== null) {
      return {
        type: Array.isArray(value) ? "list" : "object",
        name: path,
        label: convertToCamelCase(
          value?.title || value?.name || value?.label || key,
        ),
        description,
        defaultValue: "",
        fields: generateSchema(value, path, comments),
      };
    } else if (typeof value === "string") {
      return {
        type: 'media',
        name: path,
        label: convertToCamelCase(key),
        description,
        value: "",
        defaultValue: "",
      };
    } else {
      const name = (path: string): string => {
        const name = path.split(".");
        return name[name.length - 1];
      };

      return {
        type:
          name(path) !== "content" && name(path) !== "description"
            ? !value
              ? "string"
              : typeof value
            : "textarea",
        name: path,
        label: convertToCamelCase(key),
        description,
        value:
          typeof value === "number"
            ? 0
            : typeof value === "boolean"
              ? false
              : "",
        defaultValue:
          typeof value === "number"
            ? 0
            : typeof value === "boolean"
              ? false
              : "",
      };
    }
  });
}

export function decodeBase64(data: string): string {
  if (!data) return "";
  return Buffer.from(data, "base64").toString("utf-8");
}

export function extractFolderName(path: string): string {
  const parts = path.split("/");
  const lastPart = parts[parts.length - 1];
  return lastPart.includes(".") ? parts[parts.length - 2] : lastPart;
}

export function generateSchemaName(
  path: string,
  root: string = "src/content",
): string {
  // Remove leading/trailing slashes
  let cleanPath = path.replace(/^\/+|\/+$/g, "");
  const cleanRoot = root.replace(/^\/+|\/+$/g, "");

  if (cleanPath.startsWith(cleanRoot)) {
    cleanPath = cleanPath.substring(cleanRoot.length);
  }

  // Remove leading/trailing slashes again after stripping root
  return cleanPath.replace(/^\/+|\/+$/g, "");
}

function typeofValue(value: any) {
  return typeof value === "object"
    ? Array.isArray(value)
      ? "Array"
      : value instanceof Date
        ? "Date"
        : "object"
    : typeof value;
}

export function convertSchema(
  docs: Record<string, any>,
  comments?: Record<string, string>,
  parentPath: string = "",
): FieldSchema[] {
  if (!docs) return [];

  return Object?.entries(docs).map(([key, value]) => {
    const path = parentPath ? `${parentPath}.${key}` : key;
    return generateFieldSchema({ label: key, value, comments, path, docs });
  });
}

function generateFieldSchema({
  label,
  value,
  comments,
  path = "",
  docs,
}: {
  label: string;
  value: any;
  comments?: Record<string, string>;
  path?: string;
  docs?: Record<string, any>;
}): FieldSchema {
  const type = typeofValue(value);
  const description = comments?.[path];
  const isoFormat = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/;
  if (type === "Array" && value) {
    const val = value[0];
    const next = typeof val === "object";
    const isMediaList = checkMedia(val);
    if (isMediaList) {
      return {
        label: convertToCamelCase(label),
        name: label,
        type: isMediaList ? "gallery" : type,
        description,
        defaultValue: "",
        ...(next && { fields: convertSchema(val, comments, path) }),
      };
    } else {
      // @ts-ignore
      const combinedObject = value?.reduce((acc, item) => {
        const filteredItem = Object.fromEntries(
          Object.entries(item).filter(
            ([_key, val]) => val !== null && val !== undefined,
          ),
        );
        return { ...acc, ...filteredItem };
      }, {});
      return {
        label: convertToCamelCase(label),
        name: label,
        type: type,
        description,
        defaultValue: "",
        ...(next && { fields: convertSchema(combinedObject, comments, path) }),
      };
    }
  } else if (type === "object" && value !== null && value !== undefined) {
    const hasNext = Object.keys(value).length > 0;

    return {
      label: convertToCamelCase(label),
      name: label,
      type: !value ? "string" : type,
      description,
      defaultValue: "",
      ...(hasNext && { fields: convertSchema(value, comments, path) }),
    };
  } else if (verifyColor(value) && isNaN(value)) {
    return {
      label: convertToCamelCase(label),
      name: label,
      type: "color",
      description,
      value: "",
      defaultValue: "",
    };
  } else if (isoFormat.test(value)) {
    return {
      label: convertToCamelCase(label),
      name: label,
      type: "Date",
      description,
      value: "",
      defaultValue: "",
    };
  } else {
    return {
      label: convertToCamelCase(label),
      name: label,
      type: checkMedia(value) ? "media" : type === "object" ? "string" : type,
      description,
      value: type === "number" ? 0 : type === "boolean" ? false : "",
      defaultValue: type === "number" ? 0 : type === "boolean" ? false : "",
    };
  }
}
