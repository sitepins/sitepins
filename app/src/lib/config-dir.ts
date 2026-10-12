import { CONFIG_DIR } from "@/lib/brand";

// The repo folder (`.<slug>`) that holds config.json, schema/ and snippet/.

export const siteConfigPath = () => `${CONFIG_DIR}/config.json`;
export const schemaFolder = () => `${CONFIG_DIR}/schema`;
export const snippetFolder = () => `${CONFIG_DIR}/snippet`;

const strip = (p: string) => p.replace(/^\.?\/+/, "");

export const isConfigDirPath = (p: string) => {
  const path = strip(p);
  return path === CONFIG_DIR || path.startsWith(`${CONFIG_DIR}/`);
};

export const isSiteConfigPath = (p: string) => strip(p) === siteConfigPath();

export const isSchemaPath = (p: string) =>
  strip(p).startsWith(`${schemaFolder()}`);

export const isSnippetPath = (p: string) =>
  strip(p).startsWith(`${snippetFolder()}`);
