"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { format, parseISO } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { ArrowLeft, Loader2, Trash2, Lightbulb, Tag } from "lucide-react";
import { sanitizeHtml } from "@/lib/sanitize";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

interface Reflection {
  id: string;
  type: string;
  periodStart: string;
  periodEnd: string;
  title: string | null;
  content: string | null;
  moodSummary: string | null;
  themes: string[];
  keyInsights: string[];
  entryIds: string[];
  generatedAt: string;
}

export default function ReflectionDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [reflection, setReflection] = useState<Reflection | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/reflections/${params.id}`);
        if (res.ok) setReflection(await res.json());
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [params.id]);

  async function handleDelete() {
    setDeleting(true);
    await fetch(`/api/reflections/${params.id}`, { method: "DELETE" });
    router.push("/reflections");
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!reflection) {
    return (
      <div className="text-center py-20">
        <p className="text-muted-foreground">Reflection not found.</p>
      </div>
    );
  }

  const periodLabel = (() => {
    try {
      const start = format(parseISO(reflection.periodStart), "MMM d");
      const end = format(parseISO(reflection.periodEnd), "MMM d, yyyy");
      return `${start} - ${end}`;
    } catch {
      return `${reflection.periodStart} - ${reflection.periodEnd}`;
    }
  })();

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => router.push("/reflections")}>
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>
        <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <DialogTrigger render={<Button variant="ghost" size="sm" className="gap-1.5 text-destructive hover:text-destructive" />}>
            <Trash2 className="h-4 w-4" /> Delete
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete Reflection</DialogTitle>
              <DialogDescription>
                Are you sure you want to delete this reflection? This action cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <div className="flex justify-end gap-2 pt-4">
              <Button variant="outline" size="sm" onClick={() => setDeleteDialogOpen(false)}>
                Cancel
              </Button>
              <Button variant="destructive" size="sm" onClick={handleDelete} disabled={deleting}>
                {deleting ? "Deleting..." : "Delete"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div>
        <div className="flex items-center gap-2 mb-2">
          <Badge variant="outline" className="capitalize">{reflection.type}</Badge>
          <span className="text-sm text-muted-foreground">{periodLabel}</span>
        </div>
        <h1 className="text-2xl font-bold">{reflection.title || "Untitled Reflection"}</h1>
        {reflection.moodSummary && (
          <p className="mt-2 text-muted-foreground">{reflection.moodSummary}</p>
        )}
      </div>

      {/* Content */}
      {reflection.content && (
        <div
          className="prose prose-sm dark:prose-invert max-w-none"
          dangerouslySetInnerHTML={{
            __html: sanitizeHtml(reflection.content.replace(/\n/g, "<br/>")),
          }}
        />
      )}

      {/* Key Insights */}
      {reflection.keyInsights.length > 0 && (
        <>
          <Separator />
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Lightbulb className="h-4 w-4" /> Key Insights
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {reflection.keyInsights.map((insight, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                    {insight}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </>
      )}

      {/* Themes */}
      {reflection.themes.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Tag className="h-4 w-4" /> Themes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-1.5">
              {reflection.themes.map((theme) => (
                <Badge key={theme} variant="secondary">{theme}</Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <p className="text-xs text-muted-foreground">
        Based on {reflection.entryIds.length} entries · Generated{" "}
        {(() => {
          try { return format(new Date(reflection.generatedAt), "MMM d, yyyy 'at' h:mm a"); }
          catch { return "unknown"; }
        })()}
      </p>
    </div>
  );
}
