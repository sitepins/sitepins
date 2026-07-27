export function parseJsxString(jsxString: string): {
  name: string;
  attributes: Record<string, any>;
} {
  const result = { name: "", attributes: {} as Record<string, any> };

  // Strip invisible characters and trim before parsing
  const cleanJsxString = jsxString
    .replace(/[\u200B\u200C\u200D\uFEFF]/g, "")
    .trim();

  // Extract tag name
  const nameMatch = cleanJsxString.match(/^<([A-Z][a-zA-Z0-9]*)/);
  if (!nameMatch) return result;

  result.name = nameMatch[1];

  // Extract attributes string (everything after name but before > or />)
  // We need a smart approach because attribute values might contain >
  let attrString = "";
  let i = nameMatch[0].length;
  let inQuotes = false;
  let quoteChar = "";
  let inBraces = 0;

  while (i < cleanJsxString.length) {
    const char = cleanJsxString[i];

    if (!inQuotes && inBraces === 0) {
      if (char === ">" || (char === "/" && cleanJsxString[i + 1] === ">")) {
        break; // Reached end of opening tag
      }
      if (char === "'" || char === '"') {
        inQuotes = true;
        quoteChar = char;
      } else if (char === "{") {
        inBraces++;
      }
    } else if (inQuotes) {
      if (char === quoteChar && cleanJsxString[i - 1] !== "\\") {
        inQuotes = false;
        quoteChar = "";
      }
    } else if (inBraces > 0) {
      if (char === "{") inBraces++;
      else if (char === "}") inBraces--;
    }

    attrString += char;
    i++;
  }

  attrString = attrString.trim();
  if (!attrString) return result;

  // Parse attributes from attrString
  const attrRegex =
    /([\w:-]+)(?:\s*=\s*(?:(?:"([^"]*)")|(?:'([^']*)')|(?:\{([^}]*)\})))?/g;
  let match;

  while ((match = attrRegex.exec(attrString)) !== null) {
    const key = match[1];

    if (match[2] !== undefined) {
      // Double quoted
      result.attributes[key] = match[2];
    } else if (match[3] !== undefined) {
      // Single quoted
      result.attributes[key] = match[3];
    } else if (match[4] !== undefined) {
      // JS expression braces
      result.attributes[key] = match[4];
    } else {
      // Boolean attribute without a value
      result.attributes[key] = true;
    }
  }

  return result;
}
