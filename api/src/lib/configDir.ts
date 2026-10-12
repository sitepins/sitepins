import brand from "@/config/brand";

// The repo folder (`.<slug>`) that holds config.json, schema/ and snippet/.
export const CONFIG_DIR = brand.config_dir;

export const configPaths = () => ({
  dir: CONFIG_DIR,
  config: `${CONFIG_DIR}/config.json`,
  schema: `${CONFIG_DIR}/schema`,
  snippet: `${CONFIG_DIR}/snippet`,
});

const under = (path: string, root: string) =>
  path === root || path.startsWith(`${root}/`);

export const isConfigDirPath = (path: string) => under(path, CONFIG_DIR);

export const isSchemaDirPath = (path: string) =>
  under(path, configPaths().schema);

export const isSnippetDirPath = (path: string) =>
  under(path, configPaths().snippet);
