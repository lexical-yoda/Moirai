"use client";

import { useState } from "react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Mic, Trash2, Download, ChevronDown, ChevronUp } from "lucide-react";

interface Recording {
  id: string;
  transcription: string | null;
  duration: number | null;
  createdAt: string;
}

interface RecordingsListProps {
  recordings: Recording[];
  onDelete: (id: string) => void;
}

function formatDuration(seconds: number | null): string {
  if (!seconds) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

async function downloadRecording(id: string, date: string) {
  const res = await fetch(`/api/voice/file/${id}`);
  if (!res.ok) return;
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `moirai-recording-${date}-${id.slice(0, 6)}.webm`;
  a.click();
  URL.revokeObjectURL(url);
}

export function RecordingsList({ recordings, onDelete }: RecordingsListProps) {
  const [expanded, setExpanded] = useState(false);

  if (recordings.length === 0) return null;

  const visible = expanded ? recordings : recordings.slice(0, 2);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Mic className="h-4 w-4" /> Voice Recordings ({recordings.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {visible.map((rec) => (
          <div key={rec.id} className="rounded-md border p-2.5 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>{formatDuration(rec.duration)}</span>
                <span>
                  {(() => { try { return format(new Date(rec.createdAt), "MMM d, h:mm a"); } catch { return ""; } })()}
                </span>
              </div>
              <div className="flex items-center gap-0.5">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => downloadRecording(rec.id, rec.createdAt.split("T")[0] || "unknown")}
                  title="Download recording"
                >
                  <Download className="h-3 w-3" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 text-destructive hover:text-destructive"
                  onClick={() => onDelete(rec.id)}
                  title="Delete recording"
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </div>
            <audio src={`/api/voice/file/${rec.id}`} controls className="w-full h-8" preload="none" />
            {rec.transcription && (
              <p className="text-xs text-muted-foreground line-clamp-2">{rec.transcription}</p>
            )}
          </div>
        ))}
        {recordings.length > 2 && (
          <Button variant="ghost" size="sm" className="w-full gap-1 text-xs" onClick={() => setExpanded(!expanded)}>
            {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            {expanded ? "Show less" : `Show ${recordings.length - 2} more`}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
