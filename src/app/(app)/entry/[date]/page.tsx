"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { format, parseISO } from "date-fns";
import { MarkdownEditor } from "@/components/editor/markdown-editor";
import { TagInput } from "@/components/editor/tag-input";
import { VersionHistory } from "@/components/editor/version-history";
import { TemplateSelector } from "@/components/editor/template-selector";
import { VoiceRecorder } from "@/components/editor/voice-recorder";
import { InsightsPanel } from "@/components/entry/insights-panel";
import { SimilarEntries } from "@/components/entry/similar-entries";
import { RecordingsList } from "@/components/entry/recordings-list";
import { EntryLinks } from "@/components/entry/entry-links";
import { ActivityChecklist } from "@/components/entry/activity-checklist";
import { TherapyItemsInline } from "@/components/entry/therapy-items";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Check, Loader2, Trash2, RefreshCw, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { useTherapyEnabled } from "@/hooks/use-therapy-enabled";

interface Entry {
  id: string;
  date: string;
  title: string;
  generatedTitle: string | null;
  content: string;
  formattedContent: string | null;
  wordCount: number;
  templateUsed: string | null;
  isSessionDay: boolean;
}

interface Tag {
  id: string;
  name: string;
  color: string | null;
}

interface Version {
  id: string;
  versionNumber: number;
  title: string;
  wordCount: number | null;
  createdAt: string;
}

interface Insight {
  mood: string;
  moodScore: number;
  summary: string;
  actionItems: string[];
  keyPeople: string[];
  themes: string[];
  events?: string[];
  places?: string[];
}

interface SimilarEntry {
  id: string;
  date: string;
  title: string;
  wordCount: number;
  distance: number;
}

export default function EntryPage() {
  const params = useParams<{ date: string }>();
  const router = useRouter();
  const date = params.date;

  const [entry, setEntry] = useState<Entry | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [entryTags, setEntryTags] = useState<Tag[]>([]);
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [versions, setVersions] = useState<Version[]>([]);
  const [insight, setInsight] = useState<Insight | null>(null);
  const [insightLoading, setInsightLoading] = useState(false);
  const [similarEntries, setSimilarEntries] = useState<SimilarEntry[]>([]);
  const [similarLoading, setSimilarLoading] = useState(false);
  const [recordings, setRecordings] = useState<{ id: string; transcription: string | null; duration: number | null; createdAt: string }[]>([]);
  const [linkedEntries, setLinkedEntries] = useState<{ id: string; date: string; title: string; wordCount: number | null; linkId: string }[]>([]);
  const [editorKey, setEditorKey] = useState(0);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [contentView, setContentView] = useState<"raw" | "formatted">("raw");
  const [formattedContent, setFormattedContent] = useState("");
  const [formattedEditorKey, setFormattedEditorKey] = useState(100);
  const [reformatting, setReformatting] = useState(false);
  const therapyEnabled = useTherapyEnabled();
  const [isSessionDay, setIsSessionDay] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initialLoadRef = useRef(true);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastContentRef = useRef<string>("");
  const lastRecordingCountRef = useRef<number>(0);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  // Poll for background processing changes (transcription, formatting, insights)
  useEffect(() => {
    if (!entry?.id) {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
      return;
    }

    const entryId = entry.id;
    lastContentRef.current = content;
    lastRecordingCountRef.current = recordings.length;

    async function pollForChanges() {
      try {
        // Check if there are active tasks for this entry
        const procRes = await fetch("/api/processing");
        if (!procRes.ok) return;
        const procData = await procRes.json();
        const activeTasks = procData.tasks?.filter(
          (t: { entryId: string; status: string }) =>
            t.entryId === entryId && (t.status === "pending" || t.status === "running")
        );

        // If no active tasks AND we had some before, do a final refresh
        // Also refresh if we detect any completed tasks recently
        const recentCompleted = procData.tasks?.filter(
          (t: { entryId: string; status: string; updatedAt: string }) =>
            t.entryId === entryId && t.status === "completed" &&
            new Date(t.updatedAt).getTime() > Date.now() - 10_000
        );

        if (recentCompleted?.length > 0 || activeTasks?.length === 0) {
          // Reload entry data to pick up transcription appends, formatted content, generated title
          const entryRes = await fetch(`/api/entries?date=${date}`);
          if (entryRes.ok) {
            const fresh = await entryRes.json();
            if (fresh) {
              // Update content if it changed on the server (e.g., transcription appended)
              if (fresh.content && fresh.content !== lastContentRef.current) {
                setContent(fresh.content);
                setEditorKey((k) => k + 1);
                lastContentRef.current = fresh.content;
              }
              if (fresh.formattedContent && fresh.formattedContent !== formattedContent) {
                setFormattedContent(fresh.formattedContent);
                setFormattedEditorKey((k) => k + 1);
              }
              if (fresh.generatedTitle && !title) {
                setTitle(fresh.generatedTitle);
                setEntry((prev) => prev ? { ...prev, generatedTitle: fresh.generatedTitle } : prev);
              }
            }
          }

          // Reload recordings (transcription text may have been added)
          const recRes = await fetch(`/api/voice/recordings?entryId=${entryId}`);
          if (recRes.ok) {
            const recs = await recRes.json();
            setRecordings(recs);
          }

          // Reload insights
          loadSidebarData(entryId);
        }

        // Stop polling when no active tasks remain
        if (!activeTasks?.length && pollRef.current) {
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
      } catch (err) {
        console.error("[Entry] Poll error:", err);
      }
    }

    // Start polling every 5 seconds
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(pollForChanges, 5_000);

    return () => {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    };
  }, [entry?.id, date]);

  async function loadRecordings(entryId: string) {
    try {
      const res = await fetch(`/api/voice/recordings?entryId=${entryId}`);
      if (res.ok) setRecordings(await res.json());
    } catch (err) {
      console.error("[Entry] Failed to load recordings:", err);
    }
  }

  async function loadLinks(entryId: string) {
    try {
      const res = await fetch(`/api/entries/${entryId}/links`);
      if (res.ok) setLinkedEntries(await res.json());
    } catch (err) {
      console.error("[Entry] Failed to load links:", err);
    }
  }

  // Load insights, similar entries, and recordings for an entry
  async function loadSidebarData(entryId: string) {
    setInsightLoading(true);
    setSimilarLoading(true);

    const [insightRes, similarRes] = await Promise.all([
      fetch(`/api/entries/${entryId}/insights`).catch(() => null),
      fetch(`/api/entries/${entryId}/similar`).catch(() => null),
    ]);

    loadRecordings(entryId);
    loadLinks(entryId);

    if (insightRes?.ok) {
      const data = await insightRes.json();
      setInsight(data);
    }
    setInsightLoading(false);

    if (similarRes?.ok) {
      const data = await similarRes.json();
      setSimilarEntries(data);
    }
    setSimilarLoading(false);
  }

  // Load entry for this date
  useEffect(() => {
    async function load() {
      setLoading(true);
      initialLoadRef.current = true;
      setInsight(null);
      setSimilarEntries([]);

      try {
        const [entryRes, tagsRes] = await Promise.all([
          fetch(`/api/entries?date=${date}`),
          fetch("/api/tags"),
        ]);
        const entryData = await entryRes.json();
        const tagsData = await tagsRes.json();

        setAllTags(tagsData);

        if (entryData) {
          setEntry(entryData);
          setTitle(entryData.title || entryData.generatedTitle || "");
          setContent(entryData.content || "");
          setFormattedContent(entryData.formattedContent || "");
          setFormattedEditorKey((k) => k + 1);
          setEditorKey((k) => k + 1);
          setIsSessionDay(entryData.isSessionDay || false);

          const [versionsRes, entryTagsRes] = await Promise.all([
            fetch(`/api/entries/${entryData.id}/versions`),
            fetch(`/api/tags?entryId=${entryData.id}`),
          ]);
          setVersions(await versionsRes.json());
          if (entryTagsRes.ok) setEntryTags(await entryTagsRes.json());

          loadSidebarData(entryData.id);
        } else {
          setEntry(null);
          setTitle("");
          setContent("");
          setEditorKey((k) => k + 1);
          setVersions([]);
        }
      } finally {
        setLoading(false);
        setTimeout(() => { initialLoadRef.current = false; }, 500);
      }
    }
    load();
  }, [date]);

  // Autosave with 2s debounce
  const save = useCallback(async (titleToSave: string, contentToSave: string, extraFields?: Record<string, unknown>) => {
    setSaving(true);
    setSaved(false);
    try {
      const res = await fetch("/api/entries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, title: titleToSave, content: contentToSave, ...extraFields }),
      });
      const data = await res.json();
      setEntry(data);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);

      if (data.id) {
        const versionsRes = await fetch(`/api/entries/${data.id}/versions`);
        setVersions(await versionsRes.json());

        // Restart polling to pick up newly queued processing tasks
        if (!pollRef.current) {
          pollRef.current = setInterval(() => {}, 5_000); // Will be replaced by the effect
        }
      }
    } finally {
      setSaving(false);
    }
  }, [date]);

  function handleChange(newTitle: string, newContent: string) {
    if (initialLoadRef.current) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => save(newTitle, newContent), 2000);
  }

  function handleTitleChange(newTitle: string) {
    setTitle(newTitle);
    handleChange(newTitle, content);
  }

  function handleContentChange(newContent: string) {
    setContent(newContent);
    handleChange(title, newContent);
  }

  function handleTemplateSelect(_templateId: string, templateContent: string) {
    setContent(templateContent);
    setEditorKey((k) => k + 1);
    handleChange(title, templateContent);
  }

  function handleTranscription(text: string, newEntryId?: string) {
    // If entry was just created by the voice recorder, update state
    if (newEntryId && !entry) {
      setEntry({ id: newEntryId, date, title: "", generatedTitle: null, content: `<p>${text}</p>`, formattedContent: null, wordCount: 0, templateUsed: null, isSessionDay: false });
      setContent(`<p>${text}</p>`);
      setEditorKey((k) => k + 1);
      loadSidebarData(newEntryId);
      return;
    }

    // Escape HTML entities to prevent injection from transcription
    const escaped = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

    // Skip if this text is already in the content (prevents duplicate appends)
    if (content && content.includes(escaped)) return;

    const newContent = content
      ? `${content}<p>${escaped}</p>`
      : `<p>${escaped}</p>`;
    setContent(newContent);
    setEditorKey((k) => k + 1);
    handleChange(title, newContent);
  }

  async function handleAddTag(name: string) {
    const res = await fetch("/api/tags", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, entryId: entry?.id }),
    });
    if (!res.ok) {
      console.error("[Entry] Failed to add tag:", res.status);
      return;
    }
    const tag = await res.json();
    setEntryTags((prev) => [...prev, tag]);
    setAllTags((prev) => prev.some((t) => t.id === tag.id) ? prev : [...prev, tag]);
  }

  function handleRemoveTag(tagId: string) {
    setEntryTags((prev) => prev.filter((t) => t.id !== tagId));
  }

  async function handleRevert(versionId: string) {
    if (!entry) return;
    const res = await fetch(`/api/entries/${entry.id}/versions/${versionId}/revert`, {
      method: "POST",
    });
    const data = await res.json();
    setEntry(data);
    setTitle(data.title || "");
    setContent(data.content || "");
    setEditorKey((k) => k + 1);

    const versionsRes = await fetch(`/api/entries/${entry.id}/versions`);
    setVersions(await versionsRes.json());
  }

  function handleSessionDayToggle(enabled: boolean) {
    setIsSessionDay(enabled);
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => save(title, content, { isSessionDay: enabled }), 1000);
  }

  async function handleReformat() {
    if (!entry) return;
    setReformatting(true);
    try {
      await fetch(`/api/entries/${entry.id}/reformat`, { method: "POST" });
      toast.success("Reformatting queued");

      // Poll with exponential backoff: 5s, 10s, 20s
      const delays = [5000, 10000, 20000];
      const entryId = entry.id;
      for (const delay of delays) {
        await new Promise((r) => setTimeout(r, delay));
        try {
          const res = await fetch(`/api/entries/${entryId}`);
          if (res.ok) {
            const data = await res.json();
            if (data.formattedContent && data.formattedContent !== formattedContent) {
              setFormattedContent(data.formattedContent);
              setFormattedEditorKey((k) => k + 1);
              if (data.generatedTitle && !title) {
                setTitle(data.generatedTitle);
                setEntry((prev) => prev ? { ...prev, generatedTitle: data.generatedTitle } : prev);
              }
              break;
            }
          }
        } catch (err) {
          console.error("[Entry] Reformat poll error:", err);
        }
      }
    } catch {
      toast.error("Failed to queue reformatting");
    } finally {
      setReformatting(false);
    }
  }

  function handleFormattedContentChange(newContent: string) {
    setFormattedContent(newContent);
    if (entry) {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(async () => {
        await fetch(`/api/entries/${entry.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title, content, formattedContent: newContent }),
        });
      }, 2000);
    }
  }



  async function handleDelete() {
    if (!entry) return;
    const res = await fetch(`/api/entries/${entry.id}`, { method: "DELETE" });
    if (res.ok) {
      toast.success("Entry deleted");
      router.push("/");
    } else {
      toast.error("Failed to delete entry");
    }
  }

  const wordCount = content.replace(/<[^>]*>/g, " ").trim().split(/\s+/).filter(Boolean).length;
  const dateFormatted = (() => {
    try { return format(parseISO(date), "EEEE, MMMM d, yyyy"); }
    catch { return date; }
  })();

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex gap-6">
      {/* Main editor column */}
      <div className="flex-1 min-w-0 space-y-4">
        {/* Header */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">{dateFormatted}</p>
            <div className="flex items-center gap-1">
              {saving && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
              {saved && <Check className="h-3 w-3 text-green-600" />}
              <Badge variant="outline" className="text-xs">{wordCount}w</Badge>
            </div>
          </div>
          <div className="flex items-center gap-1 overflow-x-auto">
            <VoiceRecorder
              entryId={entry?.id || null}
              date={date}
              onTranscription={handleTranscription}
              onRecordingSaved={() => {
                const eid = entry?.id;
                if (eid) loadRecordings(eid);
              }}
            />
            <TemplateSelector onSelect={handleTemplateSelect} />
            <VersionHistory
              entryId={entry?.id || ""}
              versions={versions}
              onRevert={handleRevert}
              onClearHistory={async () => {
                if (!entry) return;
                await fetch(`/api/entries/${entry.id}/versions`, { method: "DELETE" });
                setVersions([]);
                toast.success("Version history cleared");
              }}
            />
            {entry && (
              <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
                <DialogTrigger render={<Button variant="ghost" size="sm" className="gap-1.5 text-destructive hover:text-destructive" title="Delete entry" />}>
                  <Trash2 className="h-4 w-4" />
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Delete Entry</DialogTitle>
                    <DialogDescription>
                      This will permanently delete this entry and all its recordings, versions, and insights.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="flex justify-end gap-2 pt-4">
                    <Button variant="outline" size="sm" onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
                    <Button variant="destructive" size="sm" onClick={handleDelete}>Delete</Button>
                  </div>
                </DialogContent>
              </Dialog>
            )}
          </div>
        </div>

        {/* Title */}
        <div className="flex items-center gap-2">
          <Input
            value={title}
            onChange={(e) => handleTitleChange(e.target.value)}
            placeholder="Entry title (optional)"
            className="border-none text-2xl font-bold shadow-none focus-visible:ring-0 px-0"
          />
          {!entry?.title && entry?.generatedTitle && (
            <span title="AI-generated title" className="shrink-0">
              <Sparkles className="h-3.5 w-3.5 text-muted-foreground" />
            </span>
          )}
        </div>

        {/* Raw / Formatted tabs */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => setContentView("raw")}
            className={`px-3 py-1 text-sm rounded-md transition-colors ${contentView === "raw" ? "bg-accent font-medium" : "text-muted-foreground hover:text-foreground"}`}
          >
            Raw
          </button>
          <button
            onClick={() => setContentView("formatted")}
            className={`px-3 py-1 text-sm rounded-md transition-colors ${contentView === "formatted" ? "bg-accent font-medium" : "text-muted-foreground hover:text-foreground"}`}
          >
            Formatted
          </button>
          {contentView === "formatted" && entry && (
            <button
              onClick={handleReformat}
              disabled={reformatting}
              className="ml-auto flex items-center gap-1 px-2 py-1 text-xs rounded border hover:bg-accent transition-colors disabled:opacity-50"
              title="Regenerate formatted version"
            >
              <RefreshCw className={`h-3 w-3 ${reformatting ? "animate-spin" : ""}`} />
              {reformatting ? "Formatting..." : "Regenerate"}
            </button>
          )}
        </div>

        {/* Editor */}
        {contentView === "raw" ? (
          <MarkdownEditor
            key={editorKey}
            content={content}
            onChange={handleContentChange}
            placeholder="Start writing your thoughts..."
          />
        ) : (
          <MarkdownEditor
            key={formattedEditorKey}
            content={formattedContent || "<p><em>No formatted version yet. Save your entry and it will be auto-formatted.</em></p>"}
            onChange={handleFormattedContentChange}
            placeholder="Formatted content will appear here..."
          />
        )}

        {/* Tags */}
        <Separator />
        <div>
          <p className="mb-2 text-sm font-medium text-muted-foreground">Tags</p>
          <TagInput
            tags={entryTags}
            allTags={allTags}
            onAddTag={handleAddTag}
            onRemoveTag={handleRemoveTag}
          />
        </div>

        {/* Activities */}
        <ActivityChecklist date={date} entryId={entry?.id || null} />

        {/* Therapy Items */}
        {therapyEnabled && entry && (
          <TherapyItemsInline
            entryId={entry.id}
            isSessionDay={isSessionDay}
            onSessionDayChange={handleSessionDayToggle}
          />
        )}

        {/* Recordings — visible on all screen sizes */}
        {entry && recordings.length > 0 && (
          <RecordingsList
            recordings={recordings}
            onDelete={async (id) => {
              await fetch(`/api/voice/recordings/${id}`, { method: "DELETE" });
              setRecordings((prev) => prev.filter((r) => r.id !== id));
            }}
            onTranscribed={(_id, text) => {
              handleTranscription(text);
              if (entry?.id) loadRecordings(entry.id);
            }}
          />
        )}

        {/* Mobile: show insights, links, similar entries inline (hidden on desktop where sidebar shows them) */}
        {entry && (
          <div className="space-y-4 lg:hidden">
            <InsightsPanel insight={insight} loading={insightLoading} />
            <EntryLinks
              entryId={entry.id}
              links={linkedEntries}
              onLink={async (targetDate) => {
                const res = await fetch(`/api/entries/${entry.id}/links`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ targetDate }),
                });
                if (!res.ok) {
                  const data = await res.json();
                  throw new Error(data.error || "Failed to link");
                }
                loadLinks(entry.id);
              }}
              onUnlink={async (linkId) => {
                await fetch(`/api/entries/${entry.id}/links`, {
                  method: "DELETE",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ linkId }),
                });
                setLinkedEntries((prev) => prev.filter((l) => l.linkId !== linkId));
              }}
            />
            <SimilarEntries entries={similarEntries} loading={similarLoading} />
          </div>
        )}
      </div>

      {/* Sidebar — insights, recordings, similar entries */}
      {entry && (
        <aside className="hidden w-72 shrink-0 space-y-4 lg:block">
          <InsightsPanel insight={insight} loading={insightLoading} />
          <EntryLinks
            entryId={entry.id}
            links={linkedEntries}
            onLink={async (targetDate) => {
              const res = await fetch(`/api/entries/${entry.id}/links`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ targetDate }),
              });
              if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || "Failed to link");
              }
              loadLinks(entry.id);
            }}
            onUnlink={async (linkId) => {
              await fetch(`/api/entries/${entry.id}/links`, {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ linkId }),
              });
              setLinkedEntries((prev) => prev.filter((l) => l.linkId !== linkId));
            }}
          />
          <RecordingsList
            recordings={recordings}
            onDelete={async (id) => {
              await fetch(`/api/voice/recordings/${id}`, { method: "DELETE" });
              setRecordings((prev) => prev.filter((r) => r.id !== id));
            }}
            onTranscribed={(_id, text) => {
              handleTranscription(text);
              if (entry?.id) loadRecordings(entry.id);
            }}
          />
          <SimilarEntries entries={similarEntries} loading={similarLoading} />
        </aside>
      )}
    </div>
  );
}
