#!/usr/bin/env node
// White-label guard: fails when app or API source hard-codes the upstream
// Sitepins identity instead of reading it from the brand modules
// (app/src/lib/brand.ts, api/src/config/brand.ts).
//
// Skipped: tests, comments, the brand modules themselves, and internal identifiers users never see and repos never get
// (listed in ALLOWED below). Locale files are covered by i18n.test.ts.
//
// Usage: node scripts/check-brand.mjs

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE_DIRS = ["app/src", "api/src"];

// Files that define the brand modules.
const ALLOWED_FILES = new Set([
  "app/src/lib/brand.ts",
  "api/src/config/brand.ts",
]);

// Internal identifiers: never rendered, emitted to users, or committed.
const ALLOWED = [
  // window events between editor components
  /["'`]sitepins:[a-z-]+["'`]/,
  // Monaco editor action ids
  /["'`]sitepins-ai-(copilot|explain|fix-bugs|refactor|comments)["'`]/,
  // Yjs collaboration internals and markdown serializer node type
  /META_MAP = "sitepins"/,
  /Symbol\("sitepins-room"\)/,
  /"sitepinsInlineHtml"/,
  // live-preview bridge, injected only into the ephemeral preview sandbox
  /SitepinsBridge|SITEPINS_BASE_URL/,
  // outbound User-Agent strings
  /User-Agent["']?\s*[:,]\s*["'`]sitepins/i,
  /'User-Agent':'sitepins-sandbox'/,
  // code identifiers (not output)
  /\b(getSitepinsManifest|sitepinsManifest|SITEPINS_GENERATOR)\b/,
  // HMAC domain separator for signed values
  /`sitepins-\$\{purpose\}:/,
  // hosted demo cookie domain, overridable with DEMO_COOKIE_DOMAIN
  /DEMO_COOKIE_DOMAIN \|\| "\.sitepins\.com"/,
];

const BRAND = /sitepins/i;

const isTest = (file) =>
  /\.test\.tsx?$/.test(file) ||
  file.includes(`${path.sep}test${path.sep}`) ||
  file.endsWith(".fixture.ts");

function* walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules") continue;
      yield* walk(full);
    } else if (/\.(ts|tsx|mjs|js)$/.test(entry.name)) {
      yield full;
    }
  }
}

// Strips // and /* */ comments well enough for a line-based scan; strings
// containing "//" (URLs) are kept by only stripping "//" after whitespace or
// at line start.
const stripComments = (source) =>
  source
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/(^|\s)\/\/.*$/gm, "$1");

const violations = [];
for (const dir of SOURCE_DIRS) {
  for (const file of walk(path.join(ROOT, dir))) {
    const rel = path.relative(ROOT, file).split(path.sep).join("/");
    if (ALLOWED_FILES.has(rel) || isTest(file)) continue;
    const lines = stripComments(fs.readFileSync(file, "utf8")).split("\n");
    lines.forEach((line, i) => {
      if (!BRAND.test(line)) return;
      if (ALLOWED.some((re) => re.test(line))) return;
      violations.push(`${rel}:${i + 1}: ${line.trim()}`);
    });
  }
}

if (violations.length) {
  console.error(
    "Hard-coded Sitepins identity found. Read it from the brand module instead\n" +
      "(app: @/lib/brand, api: @/config/brand), or add the identifier to\n" +
      "ALLOWED in scripts/check-brand.mjs if users never see it:\n",
  );
  for (const v of violations) console.error(`  ${v}`);
  process.exit(1);
}

console.log("✅  no hard-coded Sitepins identity");
