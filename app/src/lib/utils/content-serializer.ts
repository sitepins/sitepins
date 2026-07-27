import toml from "@ltd/j-toml";
import matter from "gray-matter";
import YAML from "yaml";

export type format = "json" | "toml" | "yaml";

function deepSyncYaml(node: any, data: any) {
  if (!node || data === undefined) {
    return;
  }

  // Handle Sequences (Arrays)
  if (
    node.type === "SEQ" ||
    (node.items && Array.isArray(node.items) && !node.items[0]?.key)
  ) {
    if (!Array.isArray(data)) return;

    // Remove extra items
    while (node.items.length > data.length) {
      node.items.pop();
    }

    // Update/Add items
    for (let i = 0; i < data.length; i++) {
      const val = data[i];
      const existingItem = node.items[i];

      if (existingItem) {
        const isExistingMap =
          existingItem.type === "MAP" || existingItem.type === "FLOW_MAP";
        const isNewMap =
          typeof val === "object" && val !== null && !Array.isArray(val);

        if (isExistingMap && isNewMap) {
          deepSyncYaml(existingItem, val);
        } else {
          node.set(i, val);
        }
      } else {
        node.add(val);
      }
    }
    return;
  }

  // Handle Maps (Objects)
  let existingKeys: string[] = [];
  if (node.items) {
    existingKeys = node.items
      .map((i: any) => i.key && (i.key.value || i.key))
      .filter(Boolean);
  }

  const newKeys =
    typeof data === "object" && data !== null ? Object.keys(data) : [];

  // Remove keys not in data
  for (const key of existingKeys) {
    if (!newKeys.includes(key as string)) {
      node.delete(key);
    }
  }

  // Add/Update keys
  for (const key of newKeys) {
    const val = data[key];
    const existingNode = node.get(key, true);

    const isExistingMap =
      existingNode &&
      (existingNode.type === "MAP" ||
        existingNode.type === "FLOW_MAP" ||
        (existingNode.items && !Array.isArray(existingNode.items)));

    const isNewMap =
      typeof val === "object" && val !== null && !Array.isArray(val);

    if (isExistingMap && isNewMap) {
      deepSyncYaml(existingNode, val);
    } else {
      // Check if we can update existing scalar to preserve comments
      if (
        existingNode &&
        !isNewMap &&
        !Array.isArray(val) &&
        existingNode.type !== "MAP" &&
        existingNode.type !== "SEQ"
      ) {
        existingNode.value = val;
      } else {
        node.set(key, val);
      }
    }
  }
}

function syncYaml(doc: any, data: any) {
  if (!doc.contents) {
    doc.contents = data;
    return;
  }
  if (doc.contents === null && data) {
    doc.contents = data;
    return;
  }
  deepSyncYaml(doc.contents, data);
}

function flatten(obj: any, prefix: string[] = []): Record<string, any> {
  let result: Record<string, any> = {};
  if (obj === null || obj === undefined) return result;

  if (Array.isArray(obj)) {
    obj.forEach((v, i) => {
      Object.assign(result, flatten(v, [...prefix, i.toString()]));
    });
  } else if (typeof obj === "object") {
    for (const [k, v] of Object.entries(obj)) {
      Object.assign(result, flatten(v, [...prefix, k]));
    }
  } else {
    result[prefix.join(".")] = obj;
  }
  return result;
}

function patchToml(originalContent: string, data: any): string {
  let lines = originalContent.split("\n");
  let currentPath: string[] = [];
  const pathMap = new Map<string, number>(); // path string -> line index
  const arrayCounts = new Map<string, number>(); // path -> occurrences

  // 1. Build a map of where keys are located
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith("#") || line === "") continue;

    const tableMatch = line.match(/^\[+([^\]]+)\]+/);
    if (tableMatch) {
      const tableName = tableMatch[1];
      const isArrayOfTables = line.startsWith("[[");

      if (isArrayOfTables) {
        const count = arrayCounts.get(tableName) || 0;
        currentPath = [tableName, count.toString()];
        arrayCounts.set(tableName, count + 1);
      } else {
        currentPath = tableName.split(".");
      }
      continue;
    }

    if (line.includes("=")) {
      const keyPart = line.split("=")[0].trim();
      const key = keyPart.replace(/^"|"$/g, "");
      const fullPath = [...currentPath, key].join(".");
      pathMap.set(fullPath, i);
    }
  }

  const flatData = flatten(data);
  let updatedLines = [...lines];

  // Update existing
  for (const [path, value] of Object.entries(flatData)) {
    if (pathMap.has(path)) {
      const index = pathMap.get(path)!;
      const line = updatedLines[index];
      const segments = path.split(".");
      const key = segments[segments.length - 1];

      // Serialize value
      let valStr;
      if (value instanceof Date) {
        valStr = value.toISOString();
      } else {
        valStr = JSON.stringify(value);
      }

      const escapedKey = key!.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const regex = new RegExp(
        `^(\\s*${escapedKey}\\s*=\\s*)([^#]+?)((\\s*#.*)?)$`,
      );

      if (regex.test(line)) {
        updatedLines[index] = line.replace(regex, `$1${valStr}$3`);
      } else {
        const commentIndex = line.indexOf("#");
        if (commentIndex !== -1) {
          const comment = line.substring(commentIndex);
          updatedLines[index] = `${key} = ${valStr} ${comment}`;
        } else {
          updatedLines[index] = `${key} = ${valStr}`;
        }
      }
    }
  }

  return updatedLines.join("\n");
}

export function contentFormatter({
  data,
  page_content,
  format,
  startWith,
  originalContent,
}: {
  data: { [key: string]: any };
  page_content: string;
  format: format;
  startWith?: string;
  originalContent?: string;
}) {
  if (format === "json") {
    const jsonContent = `${JSON.stringify(data, null, 2)}\n${page_content ?? ""}`;
    return jsonContent;
  } else if (format === "toml") {
    if (originalContent) {
      try {
        // Try patching first
        let frontmatter = originalContent;
        let body = "";
        let hasFence = false;

        const trimmed = originalContent.trimStart();
        if (trimmed.startsWith("+++")) {
          const parts = originalContent.split("+++");
          if (parts.length >= 3) {
            frontmatter = parts[1];
            body = parts.slice(2).join("+++");
            hasFence = true;
          }
        } else if (trimmed.startsWith("---toml")) {
          const parts = originalContent.split(/---toml|---/);
          if (parts.length >= 2) {
            frontmatter = parts[1];
            body = parts.slice(2).join("---");
            hasFence = true;
          }
        }

        const patched = patchToml(frontmatter, data);
        const tomlString = patched.trim();

        if (hasFence) {
          return `+++\n${tomlString}\n+++\n${page_content ?? body}`;
        } else if (startWith === "+++") {
          return `+++\n${tomlString}\n+++\n${page_content ?? body}`;
        }
        return `${tomlString}\n${page_content ?? ""}`;
      } catch (e) {
        // fall through
      }
    }

    // Fallback
    // @ts-ignore
    const newToml = toml.stringify(data, { newline: "\n", indent: 2 });
    if (startWith === "---toml") {
      return `---toml\n${newToml}---\n${page_content}`;
    } else if (startWith === "+++") {
      return `+++\n${newToml}+++\n${page_content}`;
    }
    return `${newToml}\n${page_content}`;
  } else {
    // YAML
    let yamlString = "";
    if (originalContent) {
      const trimmed = originalContent.trimStart();
      let frontmatter = "";
      let hasFence = false;

      if (trimmed.startsWith("---")) {
        const parts = originalContent.split("---");
        if (parts.length >= 3) {
          frontmatter = parts[1];
          hasFence = true;
        }
      } else {
        frontmatter = originalContent;
      }

      try {
        const doc = YAML.parseDocument(frontmatter);
        if (doc.contents || doc.errors.length === 0) {
          syncYaml(doc, data);
          yamlString = doc.toString();

          if (hasFence) {
            return `---\n${yamlString}---\n${page_content}`;
          } else if (startWith === "---") {
            return `---\n${yamlString}---\n${page_content}`;
          }
          return `${yamlString}\n${page_content ?? ""}`;
        }
      } catch (e) {
        // fallback
      }
    }

    const doc = new YAML.Document(data);
    const newYaml = doc.toString();
    if (startWith === "---") {
      return `---\n${newYaml}---\n${page_content || ""}`;
    }
    return `${newYaml}\n${page_content || ""}`;
  }
}

// RESTORED EXTRACTION FUNCTIONS

export const extractTomlComments = (
  content: string,
): Record<string, string> => {
  const comments: Record<string, string> = {};
  let currentComment: string[] = [];
  let currentPath: string[] = [];

  const lines = content.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    if (line === "") {
      continue;
    }

    // Handle Tables [table] or [[array_of_tables]]
    const tableMatch = line.match(/^\[+([^\]]+)\]+/);
    if (tableMatch) {
      currentPath = tableMatch[1].split(".");
      currentComment = [];
      continue;
    }

    if (line.startsWith("#")) {
      currentComment.push(line.replace(/^#\s*/, ""));
    } else if (line.includes("=")) {
      const key = line.split("=")[0].trim();
      const fullKey = [...currentPath, key].join(".");

      // 1. Preceding comments
      if (currentComment.length > 0) {
        comments[fullKey] = currentComment.join("\n");
        currentComment = [];
      }

      // 2. Trailing comments
      const commentMatch = line.match(/#[ \t]*(.*)$/);
      if (commentMatch) {
        // Ensure # is not inside a string
        const beforeComment = line.split("#")[0];
        const quoteCount = (beforeComment.match(/"/g) || []).length;
        if (quoteCount % 2 === 0) {
          const trailing = commentMatch[1].trim();
          if (trailing) {
            comments[fullKey] = comments[fullKey]
              ? `${comments[fullKey]}\n${trailing}`
              : trailing;
          }
        }
      }
    } else {
      currentComment = [];
    }
  }
  return comments;
};

export const extractYamlComments = (
  content: string,
): Record<string, string> => {
  const comments: Record<string, string> = {};
  let currentComment: string[] = [];
  const stack: { indent: number; key: string }[] = [];

  const lines = content.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmedLine = line.trim();

    if (trimmedLine === "" || trimmedLine === "---" || trimmedLine === "...") {
      continue;
    }

    if (trimmedLine.startsWith("#")) {
      currentComment.push(trimmedLine.replace(/^#\s*/, ""));
      continue;
    }

    const match = line.match(/^(\s*)([^#:]+):/);
    if (match) {
      const indent = match[1].length;
      const key = match[2].trim().replace(/^['"]|['"]$/g, "");

      while (stack.length > 0 && stack[stack.length - 1].indent >= indent) {
        stack.pop();
      }

      const currentPath = [...stack.map((s) => s.key), key].join(".");

      if (currentComment.length > 0) {
        comments[currentPath] = currentComment.join("\n");
        currentComment = [];
      }

      // Handle Trailing Comments
      const commentMatch = line.match(/#[ \t]*(.*)$/);
      if (commentMatch) {
        // Ensure # is not inside a string
        const beforeComment = line.split("#")[0];
        const quoteCount = (beforeComment.match(/"/g) || []).length;
        if (quoteCount % 2 === 0) {
          const trailing = commentMatch[1].trim();
          if (trailing) {
            comments[currentPath] = comments[currentPath]
              ? `${comments[currentPath]}\n${trailing}`
              : trailing;
          }
        }
      }

      stack.push({ indent, key });
    } else {
      if (!trimmedLine.startsWith("-")) {
        currentComment = [];
      }
    }
  }
  return comments;
};

export const extractJsonComments = (
  content: string,
): Record<string, string> => {
  const comments: Record<string, string> = {};
  let currentPrecedingComment: string[] = [];
  const stack: string[] = [];

  const lines = content.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmedLine = line.trim();

    if (!trimmedLine) continue;

    // Handle Comment-only lines
    if (
      trimmedLine.startsWith("//") ||
      trimmedLine.startsWith("#") ||
      trimmedLine.startsWith("/*")
    ) {
      currentPrecedingComment.push(
        trimmedLine.replace(/^(\/\/|#|\/\*+)\s*/, "").replace(/\*+\/$/, ""),
      );
      continue;
    }

    // Detect Key and Path
    const keyMatch = line.match(/"([^"]+)"\s*:/);
    if (keyMatch) {
      const key = keyMatch[1];
      const fullPath = [...stack, key].join(".");

      // 1. Handle Preceding Comments
      if (currentPrecedingComment.length > 0) {
        comments[fullPath] = currentPrecedingComment.join("\n");
        currentPrecedingComment = [];
      }

      // 2. Handle Trailing Comments
      const commentIndex =
        line.indexOf("//") !== -1
          ? line.indexOf("//")
          : line.indexOf("#") !== -1
            ? line.indexOf("#")
            : line.indexOf("/*") !== -1
              ? line.indexOf("/*")
              : -1;

      const beforeComment = line.substring(0, commentIndex);
      const quoteCount = (beforeComment.match(/"/g) || []).length;
      if (commentIndex !== -1 && quoteCount % 2 === 0) {
        const trailing = line
          .substring(commentIndex)
          .replace(/^(\/\/|#|\/\*+)\s*/, "")
          .replace(/\*+\/$/, "")
          .trim();
        if (trailing) {
          comments[fullPath] = comments[fullPath]
            ? `${comments[fullPath]}\n${trailing}`
            : trailing;
        }
      }

      if (line.includes("{")) {
        stack.push(key);
      }
    }

    // Path management: Pop stack on closing braces
    const openBraces = (line.match(/\{/g) || []).length;
    const closeBraces = (line.match(/\}/g) || []).length;
    let diff = closeBraces - openBraces;
    while (diff > 0 && stack.length > 0) {
      stack.pop();
      diff--;
    }
  }
  return comments;
};

function stripJsonComments(json: string): string {
  let isInsideString = false;
  let isInsideSingleLineComment = false;
  let isInsideMultiLineComment = false;
  let result = "";

  for (let i = 0; i < json.length; i++) {
    const char = json[i];
    const nextChar = json[i + 1];

    if (
      !isInsideString &&
      !isInsideSingleLineComment &&
      !isInsideMultiLineComment
    ) {
      if (char === '"' && (i === 0 || json[i - 1] !== "\\")) {
        isInsideString = true;
        result += char;
      } else if (char === "/" && nextChar === "/") {
        isInsideSingleLineComment = true;
        i++;
      } else if (char === "/" && nextChar === "*") {
        isInsideMultiLineComment = true;
        i++;
      } else if (char === "#") {
        isInsideSingleLineComment = true;
      } else {
        result += char;
      }
    } else if (isInsideString) {
      if (char === '"' && json[i - 1] !== "\\") {
        isInsideString = false;
      }
      result += char;
    } else if (isInsideSingleLineComment) {
      if (char === "\n") {
        isInsideSingleLineComment = false;
        result += char;
      }
    } else if (isInsideMultiLineComment) {
      if (char === "*" && nextChar === "/") {
        isInsideMultiLineComment = false;
        i++;
      }
    }
  }

  return result.replace(/,(\s*[\]}])/g, "$1");
}

export const parseContentJson = (content: string, format: format) => {
  if (format === "json") {
    const comments = extractJsonComments(content);
    // Remove comments before parsing if any exist to avoid JSON.parse error
    const cleanContent = stripJsonComments(content);
    try {
      return { data: JSON.parse(cleanContent), content: null, comments };
    } catch (e) {
      return { data: JSON.parse(content), content: null, comments };
    }
  } else if (format === "toml") {
    const comments = extractTomlComments(content);
    if (content.startsWith("+++")) {
      const result = matter(content, {
        engines: {
          // @ts-ignore
          toml: (data) => toml.parse(data, 1.0, "\n", false),
        },
        language: "toml",
        delimiters: "+++",
      });
      return { ...result, comments };
    } else if (content.startsWith("---")) {
      const result = matter(content, {
        engines: {
          // @ts-ignore
          toml: (data) => toml.parse(data, 1.0, "\n", false),
        },
      });
      return { ...result, comments };
    }

    // @ts-ignore
    return {
      data: toml.parse(content, 1.0, "\n", false),
      content: null,
      comments,
    };
  } else {
    const comments = extractYamlComments(content);
    // YAML
    const trimmed = content.trimStart();
    const hasYamlFences =
      trimmed.startsWith("---") || trimmed.startsWith("...");

    if (!hasYamlFences && /^\s*[^#\n\r][^:\n]+:\s+/m.test(content)) {
      try {
        const data = YAML.parse(content) as any;
        return { data: data || {}, content: null, comments };
      } catch (err) {
        const { data, content: page_content } = matter(content);
        return { data, content: page_content, comments };
      }
    }

    const { data, content: page_content } = matter(content);
    return { data, content: page_content, comments };
  }
};
