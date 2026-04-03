"use client";

import { useState, useEffect, useCallback } from "react";
import { Editor } from "@tiptap/react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Replace, X, ChevronUp, ChevronDown } from "lucide-react";

interface SearchReplaceProps {
  editor: Editor | null;
  open: boolean;
  onClose: () => void;
}

function findMatches(editor: Editor, searchTerm: string): { from: number; to: number }[] {
  if (!searchTerm) return [];
  const doc = editor.state.doc;
  const results: { from: number; to: number }[] = [];
  const term = searchTerm.toLowerCase();

  doc.descendants((node, pos) => {
    if (!node.isText || !node.text) return;
    const text = node.text.toLowerCase();
    let index = text.indexOf(term);
    while (index !== -1) {
      results.push({ from: pos + index, to: pos + index + searchTerm.length });
      index = text.indexOf(term, index + 1);
    }
  });

  return results;
}

export function SearchReplace({ editor, open, onClose }: SearchReplaceProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [replaceTerm, setReplaceTerm] = useState("");
  const [currentIndex, setCurrentIndex] = useState(0);
  const [matches, setMatches] = useState<{ from: number; to: number }[]>([]);
  const [showReplace, setShowReplace] = useState(false);

  // Update matches when search term changes
  useEffect(() => {
    if (!editor || !searchTerm) {
      setMatches([]);
      setCurrentIndex(0);
      return;
    }
    const found = findMatches(editor, searchTerm);
    setMatches(found);
    setCurrentIndex(found.length > 0 ? 0 : -1);
  }, [editor, searchTerm]);

  // Highlight current match
  useEffect(() => {
    if (!editor || matches.length === 0 || currentIndex < 0) return;
    const match = matches[currentIndex];
    if (!match) return;

    editor.chain().focus().setTextSelection({ from: match.from, to: match.to }).run();

    // Scroll into view
    const domAtPos = editor.view.domAtPos(match.from);
    if (domAtPos?.node) {
      const el = domAtPos.node instanceof HTMLElement ? domAtPos.node : domAtPos.node.parentElement;
      el?.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  }, [editor, matches, currentIndex]);

  // Clear highlights on close
  useEffect(() => {
    if (!open) {
      setSearchTerm("");
      setReplaceTerm("");
      setMatches([]);
      setCurrentIndex(0);
    }
  }, [open]);

  const goNext = useCallback(() => {
    if (matches.length === 0) return;
    setCurrentIndex((i) => (i + 1) % matches.length);
  }, [matches]);

  const goPrev = useCallback(() => {
    if (matches.length === 0) return;
    setCurrentIndex((i) => (i - 1 + matches.length) % matches.length);
  }, [matches]);

  const replaceOne = useCallback(() => {
    if (!editor || matches.length === 0 || currentIndex < 0) return;
    const match = matches[currentIndex];
    if (!match) return;

    editor.chain().focus()
      .setTextSelection({ from: match.from, to: match.to })
      .insertContent(replaceTerm)
      .run();

    // Refresh matches
    const found = findMatches(editor, searchTerm);
    setMatches(found);
    setCurrentIndex(found.length > 0 ? Math.min(currentIndex, found.length - 1) : -1);
  }, [editor, matches, currentIndex, replaceTerm, searchTerm]);

  const replaceAll = useCallback(() => {
    if (!editor || matches.length === 0) return;

    // Replace from end to start to preserve positions
    const sorted = [...matches].sort((a, b) => b.from - a.from);
    let chain = editor.chain();
    for (const match of sorted) {
      chain = chain.setTextSelection({ from: match.from, to: match.to }).insertContent(replaceTerm);
    }
    chain.run();

    setMatches([]);
    setCurrentIndex(-1);
  }, [editor, matches, replaceTerm]);

  // Keyboard shortcuts
  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") { onClose(); return; }
      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); goNext(); }
      if (e.key === "Enter" && e.shiftKey) { e.preventDefault(); goPrev(); }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose, goNext, goPrev]);

  if (!open || !editor) return null;

  return (
    <div className="flex flex-col gap-2 border-b bg-background px-3 py-2">
      <div className="flex items-center gap-2">
        <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <Input
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Search..."
          className="h-7 text-sm"
          autoFocus
        />
        <span className="shrink-0 text-xs text-muted-foreground min-w-12 text-center">
          {matches.length > 0 ? `${currentIndex + 1}/${matches.length}` : "0/0"}
        </span>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={goPrev} disabled={matches.length === 0} title="Previous (Shift+Enter)">
          <ChevronUp className="h-3 w-3" />
        </Button>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={goNext} disabled={matches.length === 0} title="Next (Enter)">
          <ChevronDown className="h-3 w-3" />
        </Button>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setShowReplace(!showReplace)} title="Toggle replace">
          <Replace className="h-3 w-3" />
        </Button>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onClose} title="Close (Esc)">
          <X className="h-3 w-3" />
        </Button>
      </div>

      {showReplace && (
        <div className="flex items-center gap-2 pl-5">
          <Replace className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <Input
            value={replaceTerm}
            onChange={(e) => setReplaceTerm(e.target.value)}
            placeholder="Replace..."
            className="h-7 text-sm"
          />
          <Button variant="outline" size="sm" className="h-6 text-xs shrink-0" onClick={replaceOne} disabled={matches.length === 0}>
            Replace
          </Button>
          <Button variant="outline" size="sm" className="h-6 text-xs shrink-0" onClick={replaceAll} disabled={matches.length === 0}>
            All
          </Button>
        </div>
      )}
    </div>
  );
}
