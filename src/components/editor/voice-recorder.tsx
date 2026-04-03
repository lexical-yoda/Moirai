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

  // Get duration from an audio blob
  function getAudioDuration(blob: Blob): Promise<number> {
    return new Promise((resolve) => {
      const audio = new Audio();
      const url = URL.createObjectURL(blob);
      let resolved = false;

      function done(dur: number) {
        if (resolved) return;
        resolved = true;
        URL.revokeObjectURL(url);
        resolve(dur);
      }

      audio.addEventListener("loadedmetadata", () => {
        if (isFinite(audio.duration) && audio.duration > 0) {
          done(Math.round(audio.duration));
        }
        // Some formats report duration only after durationchange
      });
      audio.addEventListener("durationchange", () => {
        if (isFinite(audio.duration) && audio.duration > 0) {
          done(Math.round(audio.duration));
        }
      });
      audio.addEventListener("error", () => done(0));

      // Fallback timeout — some formats never report duration in the browser
      setTimeout(() => done(0), 3000);

      audio.preload = "metadata";
      audio.src = url;
    });
  }

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
  async function saveRecording(blob: Blob, opts?: { transcription?: string; skipAutoTranscribe?: boolean; durationOverride?: number }) {
    setSaving(true);
    setError(null);
    try {
      const resolvedId = await ensureEntry();
      if (!resolvedId) throw new Error("Failed to create entry");

      const form = new FormData();
      form.append("file", blob, "recording.webm");
      form.append("entryId", resolvedId);
      form.append("duration", String(opts?.durationOverride ?? duration));
      if (opts?.transcription) form.append("transcription", opts.transcription);
      if (opts?.skipAutoTranscribe) form.append("skipAutoTranscribe", "true");

      const res = await fetch("/api/voice/recordings", { method: "POST", body: form });
      if (!res.ok) throw new Error("Failed to save recording");

      const result = await res.json();
      onRecordingSaved?.();
      toast.success("Recording saved");
      return { entryId: resolvedId, recordingId: result.id as string };
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
      return null;
    } finally {
      setSaving(false);
    }
  }


  // Save and queue background transcription (with LLM cleanup + recording markers)
  async function handleSaveAndTranscribe() {
    if (!audioBlob) return;
    setTranscribing(true);
    setError(null);
    try {
      // Save recording — server auto-queues transcription with LLM cleanup
      const saveResult = await saveRecording(audioBlob);
      if (!saveResult) {
        setTranscribing(false);
        return;
      }
      toast.success("Recording saved — transcription queued");
      clearRecording();
    } catch (err) {
      toast.error("Failed to save recording");
      console.error("[Voice] Save and transcribe error:", err);
    }
    setTranscribing(false);
  }

  // Save only — background transcription will be queued automatically
  async function handleSaveOnly() {
    if (!audioBlob) return;
    await saveRecording(audioBlob); // Server auto-queues transcription
    clearRecording();
  }

  // Upload one or more recording files
  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;

    const validTypes = ["audio/", "video/webm", "video/ogg"];
    const validExtPattern = /\.(webm|ogg|mp3|wav|m4a|flac|opus|wma|aac)$/i;

    // Collect and validate files
    const files: File[] = [];
    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];
      if (!validTypes.some((t) => file.type.startsWith(t)) && !file.name.match(validExtPattern)) {
        setError(`Unsupported format: ${file.name}`);
        continue;
      }
      if (file.size > 50 * 1024 * 1024) {
        setError(`File too large: ${file.name} (max 50MB)`);
        continue;
      }
      files.push(file);
    }

    if (files.length === 0) return;

    // Sort by file's lastModified timestamp (chronological order)
    files.sort((a, b) => a.lastModified - b.lastModified);

    // Upload sequentially in order so transcriptions append chronologically
    setSaving(true);
    setError(null);
    let uploaded = 0;
    for (const file of files) {
      try {
        const fileDuration = await getAudioDuration(file);
        await saveRecording(file, { durationOverride: fileDuration });
        uploaded++;
      } catch (err) {
        console.error(`[Voice] Failed to upload ${file.name}:`, err);
      }
    }
    setSaving(false);
    if (uploaded > 1) toast.success(`${uploaded} recordings uploaded`);
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
            multiple
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
          <Button variant="default" size="sm" className="gap-1.5" onClick={handleSaveAndTranscribe} disabled={busy} title="Save and transcribe in background">
            {(saving || transcribing) ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            <span className="hidden sm:inline">{(saving || transcribing) ? "Saving..." : "Save & Transcribe"}</span>
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
