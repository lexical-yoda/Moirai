"use client";

import { useState, useEffect } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Highlight from "@tiptap/extension-highlight";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import { Toolbar } from "./toolbar";
import { SearchReplace } from "./search-replace";

interface MarkdownEditorProps {
  content: string;
  onChange: (content: string) => void;
  placeholder?: string;
}

export function MarkdownEditor({ content, onChange, placeholder = "Start writing..." }: MarkdownEditorProps) {
  const [searchOpen, setSearchOpen] = useState(false);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder }),
      Highlight,
      TaskList,
      TaskItem.configure({ nested: true }),
    ],
    content,
    editorProps: {
      attributes: {
        class: "prose prose-sm dark:prose-invert max-w-none min-h-[300px] p-4 focus:outline-none",
      },
      handleKeyDown: (_view, event) => {
        // Ctrl/Cmd + H → search & replace
        if ((event.ctrlKey || event.metaKey) && event.key === "h") {
          event.preventDefault();
          setSearchOpen(true);
          return true;
        }
        // Ctrl/Cmd + F → search
        if ((event.ctrlKey || event.metaKey) && event.key === "f") {
          event.preventDefault();
          setSearchOpen(true);
          return true;
        }
        return false;
      },
    },
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
  });

  return (
    <div className="rounded-md border bg-background">
      <Toolbar editor={editor} onSearchToggle={() => setSearchOpen(!searchOpen)} />
      <SearchReplace editor={editor} open={searchOpen} onClose={() => setSearchOpen(false)} />
      <EditorContent editor={editor} />
    </div>
  );
}
