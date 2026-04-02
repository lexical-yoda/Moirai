"use client";

import { useState } from "react";
import { useVoiceRecorder } from "@/hooks/use-voice-recorder";
import { Button } from "@/components/ui/button";
import { Mic, Square, Loader2, Trash2, Send } from "lucide-react";

interface VoiceRecorderProps {
  entryId: string | null;
  date: string;
  onTranscription: (text: string, entryId: string) => void;
  onRecordingSaved?: () => void;
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function VoiceRecorder({ entryId, date, onTranscription, onRecordingSaved }: VoiceRecorderProps) {
  const { isRecording, duration, audioBlob, audioUrl, startRecording, stopRecording, clearRecording } =
    useVoiceRecorder();
  const [transcribing, setTranscribing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleTranscribe() {
    if (!audioBlob) return;

    setTranscribing(true);
    setError(null);

    try {
      // Transcribe
      const transcribeForm = new FormData();
      transcribeForm.append("file", audioBlob, "recording.webm");

      const res = await fetch("/api/voice/transcribe", {
        method: "POST",
        body: transcribeForm,
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Transcription failed");
      }

      const data = await res.json();

      // Ensure entry exists before saving recording
      let resolvedEntryId = entryId;
      if (!resolvedEntryId) {
        // Create entry with the transcribed text
        const entryRes = await fetch("/api/entries", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ date, title: "", content: `<p>${data.text}</p>` }),
        });
        if (entryRes.ok) {
          const entryData = await entryRes.json();
          resolvedEntryId = entryData.id;
        }
      }

      onTranscription(data.text, resolvedEntryId || "");

      // Save recording
      if (resolvedEntryId) {
        const saveForm = new FormData();
        saveForm.append("file", audioBlob, "recording.webm");
        saveForm.append("entryId", resolvedEntryId);
        saveForm.append("transcription", data.text);
        saveForm.append("duration", String(data.duration || duration));

        await fetch("/api/voice/recordings", { method: "POST", body: saveForm }).catch(() => {});
        onRecordingSaved?.();
      }

      clearRecording();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Transcription failed");
    } finally {
      setTranscribing(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      {!isRecording && !audioBlob && (
        <Button variant="ghost" size="sm" className="gap-1.5" onClick={startRecording} title="Record voice note">
          <Mic className="h-4 w-4" />
          <span className="hidden sm:inline">Record</span>
        </Button>
      )}

      {isRecording && (
        <>
          <div className="flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-500" />
            </span>
            <span className="text-sm font-mono text-muted-foreground">{formatDuration(duration)}</span>
          </div>
          <Button variant="destructive" size="sm" className="gap-1.5" onClick={stopRecording}>
            <Square className="h-3 w-3" /> Stop
          </Button>
        </>
      )}

      {audioBlob && !isRecording && (
        <>
          {audioUrl && <audio src={audioUrl} controls className="h-8 w-32 sm:w-40" />}
          <Button variant="default" size="sm" className="gap-1.5" onClick={handleTranscribe} disabled={transcribing}>
            {transcribing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            <span className="hidden sm:inline">{transcribing ? "Transcribing..." : "Transcribe"}</span>
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={clearRecording} disabled={transcribing} title="Discard recording">
            <Trash2 className="h-4 w-4" />
          </Button>
        </>
      )}

      {error && <span className="text-xs text-destructive max-w-32 truncate">{error}</span>}
    </div>
  );
}
