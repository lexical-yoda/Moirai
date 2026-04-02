"use client";

import { useState } from "react";
import Link from "next/link";
import { format, parseISO } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Link2, Plus, X, Loader2 } from "lucide-react";

interface LinkedEntry {
  id: string;
  date: string;
  title: string;
  wordCount: number | null;
  linkId: string;
}

interface EntryLinksProps {
  entryId: string;
  links: LinkedEntry[];
  onLink: (date: string) => Promise<void>;
  onUnlink: (linkId: string) => void;
}

export function EntryLinks({ entryId, links, onLink, onUnlink }: EntryLinksProps) {
  const [showInput, setShowInput] = useState(false);
  const [dateInput, setDateInput] = useState("");
  const [linking, setLinking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleLink() {
    if (!dateInput) return;
    setLinking(true);
    setError(null);
    try {
      await onLink(dateInput);
      setDateInput("");
      setShowInput(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to link");
    } finally {
      setLinking(false);
    }
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <Link2 className="h-4 w-4" /> Linked Entries ({links.length})
          </CardTitle>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => { setShowInput(!showInput); setError(null); }}
          >
            <Plus className="h-3 w-3" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {showInput && (
          <div className="space-y-1.5">
            <div className="flex gap-1.5">
              <Input
                type="date"
                value={dateInput}
                onChange={(e) => setDateInput(e.target.value)}
                className="h-7 text-xs"
              />
              <Button size="sm" className="h-7 text-xs px-2" onClick={handleLink} disabled={linking || !dateInput}>
                {linking ? <Loader2 className="h-3 w-3 animate-spin" /> : "Link"}
              </Button>
            </div>
            {error && <p className="text-xs text-destructive">{error}</p>}
          </div>
        )}

        {links.length === 0 && !showInput && (
          <p className="text-xs text-muted-foreground">No linked entries</p>
        )}

        {links.map((entry) => (
          <div key={entry.linkId} className="flex items-center justify-between rounded-md p-1.5 text-sm hover:bg-accent group">
            <Link href={`/entry/${entry.date}`} className="flex-1 min-w-0">
              <p className="truncate text-xs font-medium">{entry.title || "Untitled"}</p>
              <p className="text-[10px] text-muted-foreground">
                {(() => { try { return format(parseISO(entry.date), "MMM d, yyyy"); } catch { return entry.date; } })()}
              </p>
            </Link>
            <Button
              variant="ghost"
              size="icon"
              className="h-5 w-5 opacity-0 group-hover:opacity-100"
              onClick={() => onUnlink(entry.linkId)}
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
