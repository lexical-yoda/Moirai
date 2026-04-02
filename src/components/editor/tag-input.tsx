"use client";

import { useState, useRef, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface Tag {
  id: string;
  name: string;
  color: string | null;
}

interface TagInputProps {
  tags: Tag[];
  allTags: Tag[];
  onAddTag: (name: string) => void;
  onRemoveTag: (tagId: string) => void;
}

export function TagInput({ tags, allTags, onAddTag, onRemoveTag }: TagInputProps) {
  const [input, setInput] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const suggestions = allTags
    .filter((t) => t.name.toLowerCase().includes(input.toLowerCase()))
    .filter((t) => !tags.some((et) => et.id === t.id))
    .slice(0, 5);

  function selectSuggestion(name: string) {
    onAddTag(name);
    setInput("");
    setShowSuggestions(false);
    setActiveIndex(-1);
    inputRef.current?.focus();
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (showSuggestions && suggestions.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((i) => (i + 1) % suggestions.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((i) => (i <= 0 ? suggestions.length - 1 : i - 1));
        return;
      }
      if (e.key === "Enter" && activeIndex >= 0) {
        e.preventDefault();
        selectSuggestion(suggestions[activeIndex].name);
        return;
      }
      if (e.key === "Escape") {
        setShowSuggestions(false);
        setActiveIndex(-1);
        return;
      }
    }

    if (e.key === "Enter" && input.trim()) {
      e.preventDefault();
      onAddTag(input.trim());
      setInput("");
      setShowSuggestions(false);
      setActiveIndex(-1);
    }
  }

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
        setActiveIndex(-1);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Reset active index when suggestions change
  useEffect(() => { setActiveIndex(-1); }, [input]);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5" role="list" aria-label="Applied tags">
        {tags.map((tag) => (
          <Badge key={tag.id} variant="secondary" className="gap-1" role="listitem">
            {tag.name}
            <button
              onClick={() => onRemoveTag(tag.id)}
              className="ml-0.5 hover:text-destructive"
              aria-label={`Remove tag ${tag.name}`}
            >
              <X className="h-3 w-3" />
            </button>
          </Badge>
        ))}
      </div>
      <div className="relative" ref={containerRef}>
        <Input
          ref={inputRef}
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            setShowSuggestions(true);
          }}
          onFocus={() => setShowSuggestions(true)}
          onKeyDown={handleKeyDown}
          placeholder="Add a tag..."
          className="h-8 text-sm"
          aria-label="Add a tag"
          role="combobox"
          aria-expanded={showSuggestions && suggestions.length > 0}
          aria-activedescendant={activeIndex >= 0 ? `tag-suggestion-${activeIndex}` : undefined}
        />
        {showSuggestions && input && suggestions.length > 0 && (
          <div className="absolute z-10 mt-1 w-full rounded-md border bg-popover p-1 shadow-md" role="listbox">
            {suggestions.map((tag, i) => (
              <button
                key={tag.id}
                id={`tag-suggestion-${i}`}
                role="option"
                aria-selected={i === activeIndex}
                className={cn(
                  "w-full rounded px-2 py-1 text-left text-sm hover:bg-accent",
                  i === activeIndex && "bg-accent"
                )}
                onClick={() => selectSuggestion(tag.name)}
              >
                {tag.name}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
