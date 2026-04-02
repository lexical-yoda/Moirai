"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { format, parseISO } from "date-fns";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Search, Loader2, Download, Sparkles, Type } from "lucide-react";
import { sanitizeHtml } from "@/lib/sanitize";
import { toast } from "sonner";

type SearchMode = "keyword" | "semantic";

interface SearchResult {
  id: string;
  date: string;
  title: string;
  wordCount: number;
  snippet?: string;
  distance?: number;
}

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<SearchMode>("keyword");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [exporting, setExporting] = useState(false);

  const handleSearch = useCallback(async () => {
    if (!query.trim()) return;
    setSearching(true);
    setSearched(true);

    try {
      const url = mode === "keyword"
        ? `/api/search?q=${encodeURIComponent(query)}`
        : `/api/search/semantic?q=${encodeURIComponent(query)}`;

      const res = await fetch(url);
      if (res.ok) {
        setResults(await res.json());
      } else {
        setResults([]);
      }
    } finally {
      setSearching(false);
    }
  }, [query, mode]);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") handleSearch();
  }

  async function handleExport() {
    setExporting(true);
    try {
      const res = await fetch("/api/export");
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || "Export failed");
        return;
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `moirai-journal-export-${new Date().toISOString().split("T")[0]}.md`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Journal exported successfully");
    } catch {
      toast.error("Export failed");
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Search</h1>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5"
          onClick={handleExport}
          disabled={exporting}
        >
          {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          Export Journal
        </Button>
      </div>

      {/* Search bar */}
      <div className="space-y-3">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Search your journal entries..."
              className="pl-9"
            />
          </div>
          <Button onClick={handleSearch} disabled={searching || !query.trim()}>
            {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : "Search"}
          </Button>
        </div>

        {/* Mode toggle */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Mode:</span>
          <Button
            variant={mode === "keyword" ? "default" : "outline"}
            size="sm"
            className="gap-1.5 h-7 text-xs"
            onClick={() => setMode("keyword")}
          >
            <Type className="h-3 w-3" /> Keyword
          </Button>
          <Button
            variant={mode === "semantic" ? "default" : "outline"}
            size="sm"
            className="gap-1.5 h-7 text-xs"
            onClick={() => setMode("semantic")}
          >
            <Sparkles className="h-3 w-3" /> Semantic
          </Button>
        </div>
      </div>

      {/* Results */}
      {searching && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {!searching && searched && results.length === 0 && (
        <div className="text-center py-12">
          <p className="text-muted-foreground">No results found for &ldquo;{query}&rdquo;</p>
          {mode === "semantic" && (
            <p className="text-xs text-muted-foreground mt-1">
              Semantic search requires embeddings to be configured and entries to be embedded.
            </p>
          )}
        </div>
      )}

      {!searching && results.length > 0 && (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {results.length} result{results.length !== 1 && "s"}
          </p>
          {results.map((result) => (
            <Link key={result.id} href={`/entry/${result.date}`}>
              <Card className="transition-colors hover:bg-accent/50">
                <CardContent className="py-3">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium truncate">
                        {result.title || "Untitled"}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {(() => { try { return format(parseISO(result.date), "EEEE, MMMM d, yyyy"); } catch { return result.date; } })()}
                        {" · "}{result.wordCount} words
                      </p>
                      {result.snippet && (
                        <p
                          className="mt-1.5 text-sm text-muted-foreground line-clamp-2 [&_mark]:bg-yellow-200 [&_mark]:text-foreground dark:[&_mark]:bg-yellow-900"
                          dangerouslySetInnerHTML={{ __html: sanitizeHtml(result.snippet) }}
                        />
                      )}
                    </div>
                    {result.distance != null && (
                      <Badge variant="outline" className="shrink-0 text-xs">
                        {(1 - result.distance).toFixed(0)}% match
                      </Badge>
                    )}
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
