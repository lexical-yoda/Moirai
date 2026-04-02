"use client";

import { useState, useRef } from "react";
import { useVoiceRecorder } from "@/hooks/use-voice-recorder";
import { Button } from "@/components/ui/button";
import { Mic, Square, Loader2, Trash2, Send, Save, Upload, Pause, Play } from "lucide-react";
import { toast } from "sonner";

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
  const { isRecording, isPaused, duration, audioBlob, audioUrl, startRecording, pauseRecording, resumeRecording, stopRecording, clearRecording } =
    useVoiceRecorder();
  const [saving, setSaving] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const busy = saving || transcribing;

  // Ensure entry exists, return entryId
  async function ensureEntry(): Promise<string | null> {
    if (entryId) return entryId;
    const res = await fetch("/api/entries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date, title: "", content: "" }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.id;
  }

  // Save recording to server (without transcription)
  async function saveRecording(blob: Blob, transcription?: string) {
    setSaving(true);
    setError(null);
    try {
      const resolvedId = await ensureEntry();
      if (!resolvedId) throw new Error("Failed to create entry");

      const form = new FormData();
      form.append("file", blob, "recording.webm");
      form.append("entryId", resolvedId);
      form.append("duration", String(duration));
      if (transcription) form.append("transcription", transcription);

      const res = await fetch("/api/voice/recordings", { method: "POST", body: form });
      if (!res.ok) throw new Error("Failed to save recording");

      onRecordingSaved?.();
      toast.success("Recording saved");
      return resolvedId;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
      return null;
    } finally {
      setSaving(false);
    }
  }

  // Save first, then transcribe
  async function handleSaveAndTranscribe() {
    if (!audioBlob) return;

    setTranscribing(true);
    setError(null);

    try {
      // Save recording first so it's never lost
      const resolvedId = await saveRecording(audioBlob);
      if (!resolvedId) {
        setTranscribing(false);
        return;
      }

      // Now transcribe
      const transcribeForm = new FormData();
      transcribeForm.append("file", audioBlob, "recording.webm");

      const res = await fetch("/api/voice/transcribe", {
        method: "POST",
        body: transcribeForm,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || "Transcription failed — recording was saved");
        clearRecording();
        setTranscribing(false);
        return;
      }

      const data = await res.json();
      onTranscription(data.text, resolvedId);
      clearRecording();
    } catch (err) {
      toast.error("Transcription failed — recording was saved");
    }
    setTranscribing(false);
  }

  // Save only (no transcription)
  async function handleSaveOnly() {
    if (!audioBlob) return;
    await saveRecording(audioBlob);
    clearRecording();
  }

  // Upload recording from file
  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type — accept audio files and webm/ogg containers
    const validTypes = ["audio/", "video/webm", "video/ogg"];
    if (!validTypes.some((t) => file.type.startsWith(t)) && !file.name.match(/\.(webm|ogg|mp3|wav|m4a|flac|opus|wma|aac)$/i)) {
      setError("Unsupported format. Use webm, mp3, wav, m4a, ogg, or flac.");
      return;
    }

    if (file.size > 50 * 1024 * 1024) {
      setError("File too large. Maximum 50MB.");
      return;
    }

    await saveRecording(file);
    // Reset input
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {!isRecording && !audioBlob && (
        <>
          <Button variant="ghost" size="sm" className="gap-1.5" onClick={startRecording} title="Record voice note">
            <Mic className="h-4 w-4" />
            <span className="hidden sm:inline">Record</span>
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept="audio/*,.webm,.ogg"
            className="hidden"
            onChange={handleUpload}
          />
          <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => fileInputRef.current?.click()} title="Upload audio file">
            <Upload className="h-4 w-4" />
            <span className="hidden sm:inline">Upload</span>
          </Button>
        </>
      )}

      {isRecording && (
        <>
          <div className="flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5">
              {!isPaused && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />}
              <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${isPaused ? "bg-yellow-500" : "bg-red-500"}`} />
            </span>
            <span className="text-sm font-mono text-muted-foreground">{formatDuration(duration)}</span>
          </div>
          <Button variant="ghost" size="sm" className="gap-1.5" onClick={isPaused ? resumeRecording : pauseRecording} title={isPaused ? "Resume" : "Pause"}>
            {isPaused ? <Play className="h-3 w-3" /> : <Pause className="h-3 w-3" />}
          </Button>
          <Button variant="destructive" size="sm" className="gap-1.5" onClick={stopRecording}>
            <Square className="h-3 w-3" /> Stop
          </Button>
        </>
      )}

      {audioBlob && !isRecording && (
        <>
          {audioUrl && <audio src={audioUrl} controls className="h-8 w-32 sm:w-40" />}
          <Button variant="default" size="sm" className="gap-1.5" onClick={handleSaveAndTranscribe} disabled={busy} title="Save recording and transcribe">
            {transcribing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            <span className="hidden sm:inline">{transcribing ? "Transcribing..." : "Transcribe"}</span>
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={handleSaveOnly} disabled={busy} title="Save recording without transcribing">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            <span className="hidden sm:inline">Save</span>
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={clearRecording} disabled={busy} title="Discard recording">
            <Trash2 className="h-4 w-4" />
          </Button>
        </>
      )}

      {error && <span className="text-xs text-destructive max-w-48 truncate">{error}</span>}
    </div>
  );
}
