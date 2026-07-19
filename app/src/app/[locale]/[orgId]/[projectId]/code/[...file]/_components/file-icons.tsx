import {
  Code2,
  File,
  FileCode2,
  FileImage,
  FileJson,
  FileText,
  Hash,
} from "lucide-react";
import path from "path";
import React from "react";

export const getFileIcon = (filePath: string): React.ReactNode => {
  const ext = path.extname(filePath).toLowerCase();
  const iconMap: Record<string, React.ReactNode> = {
    ".js": <FileCode2 className="size-4 text-yellow-500" />,
    ".jsx": <FileCode2 className="size-4 text-blue-500" />,
    ".ts": <FileCode2 className="size-4 text-blue-600" />,
    ".tsx": <FileCode2 className="size-4 text-blue-600" />,
    ".json": <FileJson className="size-4 text-yellow-600" />,
    ".html": <Code2 className="size-4 text-orange-500" />,
    ".css": <Hash className="size-4 text-blue-500" />,
    ".scss": <Hash className="size-4 text-pink-500" />,
    ".sass": <Hash className="size-4 text-pink-500" />,
    ".py": <FileCode2 className="size-4 text-blue-500" />,
    ".java": <FileCode2 className="size-4 text-red-600" />,
    ".cpp": <FileCode2 className="size-4 text-blue-600" />,
    ".c": <FileCode2 className="size-4 text-blue-600" />,
    ".cs": <FileCode2 className="size-4 text-purple-600" />,
    ".php": <FileCode2 className="size-4 text-purple-500" />,
    ".rb": <FileCode2 className="size-4 text-red-500" />,
    ".go": <FileCode2 className="size-4 text-cyan-500" />,
    ".rs": <FileCode2 className="size-4 text-orange-600" />,
    ".swift": <FileCode2 className="size-4 text-orange-500" />,
    ".kt": <FileCode2 className="size-4 text-purple-500" />,
    ".md": <FileText className="size-4 text-blue-600" />,
    ".yaml": <FileText className="size-4 text-red-500" />,
    ".yml": <FileText className="size-4 text-red-500" />,
    ".xml": <FileText className="size-4 text-orange-500" />,
    ".sql": <FileCode2 className="size-4 text-blue-500" />,
    ".sh": <FileCode2 className="size-4 text-green-600" />,
    ".bat": <FileCode2 className="size-4 text-green-600" />,
    ".ps1": <FileCode2 className="size-4 text-blue-600" />,
    ".dockerfile": <FileCode2 className="size-4 text-blue-500" />,
    ".vue": <FileCode2 className="size-4 text-green-500" />,
    ".svelte": <FileCode2 className="size-4 text-orange-500" />,
    ".toml": <FileText className="size-4 text-gray-600" />,
    ".ini": <FileText className="size-4 text-gray-600" />,
    ".env": <FileText className="size-4 text-yellow-600" />,
    ".gitignore": <FileText className="size-4 text-gray-500" />,
    ".png": <FileImage className="size-4 text-purple-500" />,
    ".jpg": <FileImage className="size-4 text-purple-500" />,
    ".jpeg": <FileImage className="size-4 text-purple-500" />,
    ".gif": <FileImage className="size-4 text-purple-500" />,
    ".svg": <FileImage className="size-4 text-purple-500" />,
    ".webp": <FileImage className="size-4 text-purple-500" />,
  };

  return iconMap[ext] || <File className="size-4 text-gray-500" />;
};

export const languageMap: Record<string, string> = {
  ".js": "javascript",
  ".mjs": "javascript",
  ".cjs": "javascript",
  ".jsx": "javascript",
  ".ts": "typescript",
  ".mts": "typescript",
  ".cts": "typescript",
  ".tsx": "typescript",
  ".json": "json",
  ".html": "html",
  ".css": "css",
  ".scss": "scss",
  ".sass": "sass",
  ".py": "python",
  ".java": "java",
  ".cpp": "cpp",
  ".c": "c",
  ".cs": "csharp",
  ".php": "php",
  ".rb": "ruby",
  ".go": "go",
  ".rs": "rust",
  ".swift": "swift",
  ".kt": "kotlin",
  ".md": "markdown",
  ".mdx": "markdown",
  ".yaml": "yaml",
  ".yml": "yaml",
  ".xml": "xml",
  ".sql": "sql",
  ".sh": "shell",
  ".bat": "bat",
  ".ps1": "powershell",
  ".dockerfile": "dockerfile",
  ".vue": "vue",
  ".svelte": "svelte",
  ".toml": "toml",
  ".ini": "ini",
  ".env": "plaintext",
  ".gitignore": "plaintext",
  ".astro": "astro",
};

export const getLanguageFromExtension = (filePath: string): string => {
  const ext = path.extname(filePath).toLowerCase();
  return languageMap[ext] || "plaintext";
};

export default {};
