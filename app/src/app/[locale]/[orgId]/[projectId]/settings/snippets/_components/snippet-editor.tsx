import { configureMonacoLoader } from "@/lib/utils/monaco";
import { initializeShiki } from "@/lib/utils/shiki";
import type { OnChange } from "@monaco-editor/react";
import { useTheme } from "next-themes";
import dynamic from "next/dynamic";
import { EditorSkeleton } from "./editor-skeleton";

// Configure Monaco AMD loader to a compatible CDN version
configureMonacoLoader();

// Dynamically import Monaco Editor to avoid SSR issues and improve performance
const Editor = dynamic(() => import("@monaco-editor/react"), {
  ssr: false,
  loading: () => <EditorSkeleton />,
});

interface CodeEditorProps {
  value: string;
  onChange: (value: string) => void;
}

export function SnippetEditor({ value, onChange }: CodeEditorProps) {
  const { resolvedTheme } = useTheme();

  const handleChange: OnChange = (value) => {
    onChange(value || "");
  };

  return (
    <div className="border-border relative overflow-hidden rounded border shadow-lg">
      <Editor
        height={"200px"}
        language={"html"}
        value={value}
        onChange={handleChange}
        theme={resolvedTheme === "light" ? "light-plus" : "dark-plus"}
        beforeMount={(monaco) =>
          initializeShiki(
            monaco,
            resolvedTheme === "light" ? "light-plus" : "dark-plus",
          )
        }
        options={{
          minimap: { enabled: false },
          fontSize: 13,
          lineHeight: 1.6,
          scrollBeyondLastLine: false,
          automaticLayout: true,
          tabSize: 2,
          wordWrap: "on",
          lineNumbers: "off",
          folding: true,
          bracketPairColorization: {
            enabled: true,
            independentColorPoolPerBracketType: true,
          },
        }}
      />
    </div>
  );
}
