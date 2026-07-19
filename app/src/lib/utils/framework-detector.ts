import config from "@/lib/config";
import { TTree } from "@/types";

export type Framework = "nextjs" | "astro" | "hugo" | "hugo_examplesite" | null;

const frameworks = config.frameworks;

// Framework detection helper function
const detectFramework = (trees: TTree[]): Framework => {
  const treeFiles = trees.map((tree) => tree.path).filter(Boolean);

  for (const [frameworkName, configFiles] of Object.entries(frameworks)) {
    const hasConfigFile = configFiles.some((configFile) => {
      if (frameworkName === "hugo") {
        return (
          treeFiles.includes(configFile) ||
          treeFiles.includes(configFile.replace(/^\.\//, "")) ||
          treeFiles.some((filePath) => filePath?.endsWith(`/${configFile}`))
        );
      }

      return (
        treeFiles.includes(configFile) ||
        treeFiles.includes(configFile.replace(/^\.\//, ""))
      );
    });

    if (hasConfigFile) {
      if (frameworkName === "hugo") {
        const hasExampleSite =
          treeFiles.includes("exampleSite") ||
          treeFiles.includes("./exampleSite") ||
          treeFiles.some(
            (filePath) =>
              filePath?.startsWith("exampleSite/") ||
              filePath?.startsWith("./exampleSite/"),
          );
        if (hasExampleSite) {
          return "hugo_examplesite";
        }
      }
      return frameworkName as Framework;
    }
  }

  return null;
};

export default detectFramework;
