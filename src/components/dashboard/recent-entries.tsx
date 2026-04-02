"use client";

import Link from "next/link";
import { format, parseISO } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PenLine } from "lucide-react";

interface EntryItem {
  id: string;
  date: string;
  title: string;
  wordCount: number | null;
}

interface RecentEntriesProps {
  entries: EntryItem[];
}

export function RecentEntries({ entries }: RecentEntriesProps) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <PenLine className="h-4 w-4" /> Recent Entries
        </CardTitle>
      </CardHeader>
      <CardContent>
        {entries.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            No entries yet. Start writing today!
          </p>
        ) : (
          <div className="space-y-2">
            {entries.map((entry) => (
              <Link
                key={entry.id}
                href={`/entry/${entry.date}`}
                className="flex items-center justify-between rounded-md p-2 text-sm transition-colors hover:bg-accent"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">{entry.title || "Untitled"}</p>
                  <p className="text-xs text-muted-foreground">
                    {(() => { try { return format(parseISO(entry.date), "MMM d, yyyy"); } catch { return entry.date; } })()}
                  </p>
                </div>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {entry.wordCount ?? 0}w
                </span>
              </Link>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
