"use client";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { useSnippets } from "@/hooks/use-snippets";
import type { PlateEditor } from "platejs/react";
import { useEditorRef } from "platejs/react";
import type { ChangeEvent } from "react";
import { useState } from "react";
import { insertSnippet } from "../snippets/common/snippet-embed";
import { MdxSnippet } from "../utils/plate-types";
import { Icons } from "./icons";
import { ToolbarButton } from "./toolbar";

export default function SnippetsToolbarButton() {
  const { snippets } = useSnippets();
  const editor = useEditorRef();
  if (!snippets.length) return null;

  return <EmbedButton snippets={snippets} editor={editor} />;
}

interface EmbedButtonProps {
  editor: PlateEditor;
  snippets: MdxSnippet[];
}

const EmbedButton = ({ editor, snippets }: EmbedButtonProps) => {
  const [open, setOpen] = useState(false);
  const [filteredSnippets, setFilteredSnippets] = useState(snippets);

  const filterChange = (e: ChangeEvent<HTMLInputElement>) => {
    const filterText = e.target.value.toLowerCase();
    setFilteredSnippets(
      snippets.filter((snippet) =>
        snippet.label.toLowerCase().includes(filterText),
      ),
    );
  };

  const handleSnippetClick = (snippet: MdxSnippet) => {
    setOpen(false);
    insertSnippet(editor, snippet);
    // Focus the editor after insertion
    if (!editor.api.isFocused()) {
      editor.tf.focus();
    }
  };

  return (
    <DropdownMenu modal={false} open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <ToolbarButton isDropdown pressed={open} tooltip="Snippets">
          <Icons.add className="size-5" />
          <span className="hidden @md/toolbar:inline">Snippets</span>
        </ToolbarButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="max-h-48 overflow-y-auto">
        {snippets.length > 5 && (
          <>
            <Input
              type="text"
              autoFocus
              placeholder="Search"
              onKeyDown={(e) => e.stopPropagation()}
              onChange={filterChange}
              onClick={(e) => e.stopPropagation()}
              onFocus={(e) => e.stopPropagation()}
            />
            <DropdownMenuSeparator />
          </>
        )}
        {filteredSnippets.map((snippet) => (
          <DropdownMenuItem
            key={snippet.label}
            onMouseDown={(e) => {
              e.preventDefault();
              handleSnippetClick(snippet);
            }}
            className={"cursor-pointer"}
          >
            {snippet.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
