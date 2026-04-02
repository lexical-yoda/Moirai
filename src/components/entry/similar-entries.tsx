"use client";

import Link from "next/link";
import { format, parseISO } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Sparkles } from "lucide-react";

interface SimilarEntry {
  id: string;
  date: string;
  title: string;
  wordCount: number;
  distance: number;
}

interface SimilarEntriesProps {
  entries: SimilarEntry[];
  loading: boolean;
}

export function SimilarEntries({ entries, loading }: SimilarEntriesProps) {
  if (loading) return null;
  if (entries.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Sparkles className="h-4 w-4" /> Similar Entries
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {entries.map((entry) => (
          <Link
            key={entry.id}
            href={`/entry/${entry.date}`}
            className="block rounded-md p-2 text-sm transition-colors hover:bg-accent"
          >
            <p className="font-medium truncate">{entry.title || "Untitled"}</p>
            <p className="text-xs text-muted-foreground">
              {(() => { try { return format(parseISO(entry.date), "MMM d, yyyy"); } catch { return entry.date; } })()}
              {" · "}
              {entry.wordCount} words
            </p>
          </Link>
        ))}
      </CardContent>
    </Card>
  );
}
