#!/usr/bin/env node

/**
 * Version synchronization script for Sitepins.
 *
 * Usage:
 *   node scripts/sync-version.mjs             # Syncs all packages & manifest to root package.json version
 *   node scripts/sync-version.mjs <version>   # Sets root package.json and syncs all packages & manifest
 *   node scripts/sync-version.mjs --check     # Verifies all packages & manifest match root package.json
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");

const ROOT_PKG_PATH = path.join(ROOT_DIR, "package.json");
const APP_PKG_PATH = path.join(ROOT_DIR, "app", "package.json");
const API_PKG_PATH = path.join(ROOT_DIR, "api", "package.json");
const MANIFEST_PATH = path.join(
  ROOT_DIR,
  "app",
  "src",
  "config",
  "manifest.json",
);

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n", "utf8");
}

const args = process.argv.slice(2);
const isCheckMode = args.includes("--check");
const newVersionArg = args.find((arg) => !arg.startsWith("--"));

const rootPkg = readJson(ROOT_PKG_PATH);

if (!rootPkg.version && !newVersionArg) {
  console.error("Error: root package.json has no 'version' specified.");
  process.exit(1);
}

const targetVersion = newVersionArg || rootPkg.version;

// Validate semver-like format (e.g. 1.0.0, 1.0.0-beta.1)
if (!/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(targetVersion)) {
  console.error(`Error: Invalid version format '${targetVersion}'.`);
  process.exit(1);
}

const targets = [
  { name: "root package.json", path: ROOT_PKG_PATH, type: "pkg" },
  { name: "app package.json", path: APP_PKG_PATH, type: "pkg" },
  { name: "api package.json", path: API_PKG_PATH, type: "pkg" },
  { name: "app manifest.json", path: MANIFEST_PATH, type: "manifest" },
];

if (isCheckMode) {
  let hasMismatch = false;
  console.log(`Checking version consistency against root version (${targetVersion})...`);

  for (const target of targets) {
    if (!fs.existsSync(target.path)) {
      console.warn(`⚠️  Missing file: ${target.name} (${target.path})`);
      continue;
    }
    const data = readJson(target.path);
    const currentVersion = data.version;

    if (currentVersion !== targetVersion) {
      console.error(
        `❌ Version mismatch in ${target.name}: found '${currentVersion}', expected '${targetVersion}'`,
      );
      hasMismatch = true;
    } else {
      console.log(`✅ ${target.name}: ${currentVersion}`);
    }
  }

  if (hasMismatch) {
    console.error("\nRun 'pnpm version:sync' or 'pnpm version:set <version>' to fix mismatches.");
    process.exit(1);
  } else {
    console.log("\n✨ All versions are in sync!");
    process.exit(0);
  }
}

console.log(`Synchronizing version to ${targetVersion}...`);

for (const target of targets) {
  if (!fs.existsSync(target.path)) {
    console.warn(`⚠️  Skipping missing file: ${target.name}`);
    continue;
  }
  const data = readJson(target.path);
  data.version = targetVersion;
  writeJson(target.path, data);
  console.log(` Updated ${target.name} -> ${targetVersion}`);
}

console.log("\n✨ Successfully synced version across all files!");
