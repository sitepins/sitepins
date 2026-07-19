"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Code2, Eye, FileText } from "lucide-react";
import Link from "next/link";
import path from "path";

interface FilePreviewProps {
  filePath: string;
  content: string;
  orgId: string;
  projectId: string;
}

const getLanguageFromExtension = (filePath: string): string => {
  const ext = path.extname(filePath).toLowerCase();
  const languageMap: Record<string, string> = {
    ".js": "JavaScript",
    ".jsx": "JSX",
    ".ts": "TypeScript",
    ".tsx": "TSX",
    ".json": "JSON",
    ".html": "HTML",
    ".css": "CSS",
    ".scss": "SCSS",
    ".md": "Markdown",
    ".py": "Python",
    ".java": "Java",
    ".go": "Go",
    ".rs": "Rust",
    ".php": "PHP",
    ".rb": "Ruby",
  };

  return languageMap[ext] || "Text";
};

export default function FilePreview({
  filePath,
  content,
  orgId,
  projectId,
}: FilePreviewProps) {
  const fileName = path.basename(filePath);
  const language = getLanguageFromExtension(filePath);
  const lines = content.split("\n").length;
  const chars = content.length;

  return (
    <div className="p-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <FileText className="text-muted-foreground size-6" />
              <div>
                <CardTitle className="text-lg">{fileName}</CardTitle>
                <p className="text-muted-foreground text-sm">{filePath}</p>
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <Badge variant="muted">{language}</Badge>
              <Link href={`/org-${orgId}/${projectId}/code/${filePath}`}>
                <Button className="gap-2">
                  <Code2 className="size-4" />
                  Edit Code
                </Button>
              </Link>
            </div>
          </div>
        </CardHeader>

        <CardContent>
          <div className="space-y-4">
            <div className="text-muted-foreground flex items-center space-x-6 text-sm">
              <span>Lines: {lines}</span>
              <span>Characters: {chars}</span>
              <span>Language: {language}</span>
            </div>

            <div className="bg-muted/30 rounded-lg border p-4">
              <div className="mb-3 flex items-center space-x-2">
                <Eye className="size-4" />
                <span className="text-sm font-medium">Preview</span>
              </div>
              <pre className="max-h-96 overflow-x-auto text-sm whitespace-pre-wrap">
                {content.substring(0, 1000)}
                {content.length > 1000 && "..."}
              </pre>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
