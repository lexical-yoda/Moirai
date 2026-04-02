"use client";

import { useState } from "react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { History, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { sanitizeHtml } from "@/lib/sanitize";

interface Version {
  id: string;
  versionNumber: number;
  title: string;
  wordCount: number | null;
  createdAt: string;
}

interface VersionHistoryProps {
  entryId: string;
  versions: Version[];
  onRevert: (versionId: string) => void;
  onClearHistory?: () => void;
}

export function VersionHistory({ entryId, versions, onRevert, onClearHistory }: VersionHistoryProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  async function loadVersion(versionId: string) {
    setSelectedId(versionId);
    setLoading(true);
    try {
      const res = await fetch(`/api/entries/${entryId}/versions/${versionId}`);
      const data = await res.json();
      setPreview(data.content);
    } finally {
      setLoading(false);
    }
  }

  async function handleRevert() {
    if (!selectedId) return;
    onRevert(selectedId);
    setOpen(false);
    setSelectedId(null);
    setPreview(null);
  }

  if (versions.length === 0) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="ghost" size="sm" className="gap-1.5" />}>
        <History className="h-4 w-4" />
        {versions.length} version{versions.length !== 1 && "s"}
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle>Version History</DialogTitle>
          <DialogDescription>View and restore previous versions of this entry</DialogDescription>
        </DialogHeader>
        <div className="flex gap-4 h-[60vh]">
          <div className="w-56 shrink-0 space-y-1 overflow-y-auto border-r pr-4">
            {versions.map((v) => (
              <button
                key={v.id}
                onClick={() => loadVersion(v.id)}
                className={cn(
                  "w-full rounded px-3 py-2 text-left text-sm transition-colors",
                  selectedId === v.id ? "bg-accent" : "hover:bg-accent/50"
                )}
              >
                <div className="font-medium">v{v.versionNumber}</div>
                <div className="text-xs text-muted-foreground">
                  {format(new Date(v.createdAt), "MMM d, h:mm a")}
                </div>
                <div className="text-xs text-muted-foreground">
                  {v.wordCount ?? 0} words
                </div>
              </button>
            ))}
          </div>
          <div className="flex-1 flex flex-col overflow-hidden">
            {loading && <div className="flex-1 flex items-center justify-center text-muted-foreground">Loading...</div>}
            {!loading && !preview && (
              <div className="flex-1 flex items-center justify-center text-muted-foreground">
                Select a version to preview
              </div>
            )}
            {!loading && preview && (
              <>
                <div
                  className="flex-1 overflow-y-auto prose prose-sm dark:prose-invert max-w-none p-4 rounded-md border bg-muted/30"
                  dangerouslySetInnerHTML={{ __html: sanitizeHtml(preview) }}
                />
                <div className="pt-3 flex justify-end">
                  <Button onClick={handleRevert} variant="outline" className="gap-1.5">
                    <RotateCcw className="h-4 w-4" />
                    Revert to this version
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
        {onClearHistory && (
          <div className="flex justify-between items-center border-t pt-3">
            <p className="text-xs text-muted-foreground">{versions.length} version{versions.length !== 1 && "s"} saved</p>
            <Button
              variant="ghost"
              size="sm"
              className="text-xs text-destructive hover:text-destructive"
              onClick={() => {
                onClearHistory();
                setOpen(false);
                setSelectedId(null);
                setPreview(null);
              }}
            >
              Clear all history
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
