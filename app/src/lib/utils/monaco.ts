import useMounted from "@/hooks/use-mounted";
import { loader } from "@monaco-editor/react";
import { useTheme } from "next-themes";
import { useEffect } from "react";

// Configure Monaco AMD loader to a compatible CDN version
export const configureMonacoLoader = () => {
  loader.config({
    paths: { vs: "https://cdn.jsdelivr.net/npm/monaco-editor@0.54.0/min/vs" },
  });
};

export const useMonacoTheme = (monaco: any) => {
  const { resolvedTheme } = useTheme();
  const mounted = useMounted();

  useEffect(() => {
    if (!monaco || !mounted) return;

    const applyTheme = (theme: string | undefined) => {
      const themeName = theme === "dark" ? "vs-dark" : "vs";
      try {
        monaco.editor.setTheme(themeName);
      } catch (e) {
        console.warn("Failed to set theme:", e);
      }
    };

    // Apply theme based on resolvedTheme
    applyTheme(resolvedTheme);

    // Listen for custom theme event
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as string;
      applyTheme(detail);
    };

    if (typeof window !== "undefined") {
      window.addEventListener("sitepins:theme", handler);
    }

    return () => {
      if (typeof window !== "undefined") {
        window.removeEventListener("sitepins:theme", handler);
      }
    };
  }, [monaco, resolvedTheme, mounted]);

  return resolvedTheme === "dark" ? "vs-dark" : "vs";
};
