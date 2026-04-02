"use client";

import { useState, useEffect } from "react";
import { GenerateReflection } from "@/components/reflections/generate-reflection";
import { ReflectionCard } from "@/components/reflections/reflection-card";
import { Loader2 } from "lucide-react";

interface Reflection {
  id: string;
  type: string;
  periodStart: string;
  periodEnd: string;
  title: string | null;
  moodSummary: string | null;
  themes: string[];
  generatedAt: string;
}

export default function ReflectionsPage() {
  const [reflections, setReflections] = useState<Reflection[]>([]);
  const [loading, setLoading] = useState(true);

  async function loadReflections() {
    try {
      const res = await fetch("/api/reflections");
      if (res.ok) setReflections(await res.json());
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadReflections(); }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Reflections</h1>
        <GenerateReflection onGenerated={loadReflections} />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : reflections.length === 0 ? (
        <div className="text-center py-20">
          <p className="text-muted-foreground">No reflections yet.</p>
          <p className="text-sm text-muted-foreground mt-1">
            Generate your first weekly or monthly reflection above.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {reflections.map((r) => (
            <ReflectionCard key={r.id} reflection={r} />
          ))}
        </div>
      )}
    </div>
  );
}
