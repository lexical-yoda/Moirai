"use client";

import { useState } from "react";
import { useVoiceRecorder } from "@/hooks/use-voice-recorder";
import { Button } from "@/components/ui/button";
import { Mic, Square, Loader2, Trash2, Send } from "lucide-react";
import { cn } from "@/lib/utils";

interface VoiceRecorderProps {
  onTranscription: (text: string) => void;
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function VoiceRecorder({ onTranscription }: VoiceRecorderProps) {
  const { isRecording, duration, audioBlob, audioUrl, startRecording, stopRecording, clearRecording } =
    useVoiceRecorder();
  const [transcribing, setTranscribing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleTranscribe() {
    if (!audioBlob) return;

    setTranscribing(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("file", audioBlob, "recording.webm");

      const res = await fetch("/api/voice/transcribe", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Transcription failed");
      }

      const data = await res.json();
      onTranscription(data.text);
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
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5"
          onClick={startRecording}
          title="Record voice note"
        >
          <Mic className="h-4 w-4" />
          Record
        </Button>
      )}

      {isRecording && (
        <>
          <div className="flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-500" />
            </span>
            <span className="text-sm font-mono text-muted-foreground">
              {formatDuration(duration)}
            </span>
          </div>
          <Button variant="destructive" size="sm" className="gap-1.5" onClick={stopRecording}>
            <Square className="h-3 w-3" />
            Stop
          </Button>
        </>
      )}

      {audioBlob && !isRecording && (
        <>
          {audioUrl && (
            <audio src={audioUrl} controls className="h-8 w-40" />
          )}
          <Button
            variant="default"
            size="sm"
            className="gap-1.5"
            onClick={handleTranscribe}
            disabled={transcribing}
          >
            {transcribing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            {transcribing ? "Transcribing..." : "Transcribe"}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={clearRecording}
            disabled={transcribing}
            title="Discard recording"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </>
      )}

      {error && <span className="text-xs text-destructive">{error}</span>}
    </div>
  );
}
