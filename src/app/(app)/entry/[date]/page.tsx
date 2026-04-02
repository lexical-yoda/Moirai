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
import { Check, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";

interface Entry {
  id: string;
  date: string;
  title: string;
  content: string;
  wordCount: number;
  templateUsed: string | null;
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
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initialLoadRef = useRef(true);

  // Cleanup save timer on unmount
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  async function loadRecordings(entryId: string) {
    try {
      const res = await fetch(`/api/voice/recordings?entryId=${entryId}`);
      if (res.ok) setRecordings(await res.json());
    } catch {}
  }

  async function loadLinks(entryId: string) {
    try {
      const res = await fetch(`/api/entries/${entryId}/links`);
      if (res.ok) setLinkedEntries(await res.json());
    } catch {}
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
          setTitle(entryData.title || "");
          setContent(entryData.content || "");
          setEditorKey((k) => k + 1);

          const versionsRes = await fetch(`/api/entries/${entryData.id}/versions`);
          setVersions(await versionsRes.json());

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
  const save = useCallback(async (titleToSave: string, contentToSave: string) => {
    setSaving(true);
    setSaved(false);
    try {
      const res = await fetch("/api/entries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, title: titleToSave, content: contentToSave }),
      });
      const data = await res.json();
      setEntry(data);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);

      if (data.id) {
        const versionsRes = await fetch(`/api/entries/${data.id}/versions`);
        setVersions(await versionsRes.json());

        // Refresh insights after save (AI extraction runs async on server)
        setTimeout(() => loadSidebarData(data.id), 5000);
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
      setEntry({ id: newEntryId, date, title: "", content: `<p>${text}</p>`, wordCount: 0, templateUsed: null });
      setContent(`<p>${text}</p>`);
      setEditorKey((k) => k + 1);
      loadSidebarData(newEntryId);
      return;
    }

    // Escape HTML entities to prevent injection from transcription
    const escaped = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
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
        <Input
          value={title}
          onChange={(e) => handleTitleChange(e.target.value)}
          placeholder="Entry title (optional)"
          className="border-none text-2xl font-bold shadow-none focus-visible:ring-0 px-0"
        />

        {/* Editor */}
        <MarkdownEditor
          key={editorKey}
          content={content}
          onChange={handleContentChange}
          placeholder="Start writing your thoughts..."
        />

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
