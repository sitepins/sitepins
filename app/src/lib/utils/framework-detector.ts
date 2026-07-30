import config from "@/lib/config";
import { TTree } from "@/types";

export type Framework =
  "nextjs" | "astro" | "hugo" | "hugo_examplesite" | "tanstack" | null;

const FRAMEWORKS: readonly NonNullable<Framework>[] = [
  "nextjs",
  "astro",
  "hugo",
  "hugo_examplesite",
  "tanstack",
];

/** Legacy spellings stored on existing projects. */
const FRAMEWORK_ALIASES: Record<string, NonNullable<Framework>> = {
  next: "nextjs",
};

/**
 * Narrows a `generator` string coming off the API or a stored config to the
 * frameworks the editor knows, so callers stop casting.
 */
export const asFramework = (value: unknown): Framework => {
  if (typeof value !== "string") return null;
  const key = value.toLowerCase().replace(/[^a-z_]/g, "");
  const aliased = FRAMEWORK_ALIASES[key] ?? key;
  return FRAMEWORKS.includes(aliased as NonNullable<Framework>)
    ? (aliased as NonNullable<Framework>)
    : null;
};

// Detection rule per framework, declared in `config/global.json`. `requireAll`
// carries the extra evidence needed when `configFiles` isn't exclusive —
// TanStack Start shares `vite.config.ts` with every other Vite app.
type FrameworkRule = {
  configFiles: string[];
  requireAll?: string[][];
  packageDependencies?: string[];
  matchNested?: boolean;
  variant?: { name: string; whenPathStartsWith: string[] };
};

const frameworks = config.frameworks as unknown as Record<
  string,
  FrameworkRule
>;

type TreePaths = (string | undefined)[];

const hasPath = (treeFiles: TreePaths, candidate: string, nested?: boolean) => {
  const bare = candidate.replace(/^\.\//, "");
  if (treeFiles.includes(candidate) || treeFiles.includes(bare)) return true;
  return nested
    ? treeFiles.some((filePath) => filePath?.endsWith(`/${bare}`))
    : false;
};

const hasVariantPath = (treeFiles: TreePaths, prefix: string) => {
  const dir = prefix.replace(/\/$/, "");
  return treeFiles.some(
    (filePath) => filePath === dir || filePath?.startsWith(prefix),
  );
};

// Framework detection helper function
const detectFramework = (trees: TTree[]): Framework => {
  const treeFiles = trees.map((tree) => tree.path).filter(Boolean);

  for (const [frameworkName, rule] of Object.entries(frameworks)) {
    const hasConfigFile = rule.configFiles.some((configFile) =>
      hasPath(treeFiles, configFile, rule.matchNested),
    );
    if (!hasConfigFile) continue;

    const hasRequiredEvidence = (rule.requireAll ?? []).every((group) =>
      group.some((candidate) =>
        hasPath(treeFiles, candidate, rule.matchNested),
      ),
    );
    if (!hasRequiredEvidence) continue;

    if (
      rule.variant &&
      rule.variant.whenPathStartsWith.some((prefix) =>
        hasVariantPath(treeFiles, prefix),
      )
    ) {
      return rule.variant.name as Framework;
    }

    return frameworkName as Framework;
  }

  return null;
};

// Dependencies are authoritative, but only consulted when the path pass found
// nothing or matched on a shared config file — a confident match stands.
export const refineFrameworkFromPackageJson = (
  framework: Framework,
  packageJsonRaw?: string | null,
): Framework => {
  if (!packageJsonRaw) return framework;

  const ambiguous =
    framework === null || Boolean(frameworks[framework]?.requireAll);
  if (!ambiguous) return framework;

  let pkg: Record<string, any>;
  try {
    pkg = JSON.parse(packageJsonRaw);
  } catch {
    return framework;
  }

  const deps = {
    ...(pkg.dependencies ?? {}),
    ...(pkg.devDependencies ?? {}),
  } as Record<string, string>;

  for (const [frameworkName, rule] of Object.entries(frameworks)) {
    if (rule.packageDependencies?.some((dep) => dep in deps)) {
      return frameworkName as Framework;
    }
  }

  return framework;
};

export default detectFramework;
