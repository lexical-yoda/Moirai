"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Target } from "lucide-react";
import { cn } from "@/lib/utils";

interface Activity {
  id: string;
  name: string;
  emoji: string;
  type: string;
  active: boolean;
}

interface ActivityLog {
  id: string;
  activityId: string;
  completed: boolean;
  source: string;
}

interface ActivityChecklistProps {
  date: string;
  entryId: string | null;
}

export function ActivityChecklist({ date, entryId }: ActivityChecklistProps) {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [logs, setLogs] = useState<Map<string, ActivityLog>>(new Map());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [activitiesRes, logsRes] = await Promise.all([
          fetch("/api/activities"),
          fetch(`/api/activities/logs?date=${date}`),
        ]);
        if (activitiesRes.ok) {
          const data = await activitiesRes.json();
          setActivities(data.filter((a: Activity) => a.active));
        }
        if (logsRes.ok) {
          const data: ActivityLog[] = await logsRes.json();
          setLogs(new Map(data.map((l) => [l.activityId, l])));
        }
      } finally { setLoading(false); }
    }
    load();
  }, [date]);

  async function toggle(activityId: string) {
    const current = logs.get(activityId);
    const newCompleted = !current?.completed;

    // Optimistic update
    setLogs((prev) => {
      const next = new Map(prev);
      if (current) {
        next.set(activityId, { ...current, completed: newCompleted });
      } else {
        next.set(activityId, { id: "", activityId, completed: true, source: "manual" });
      }
      return next;
    });

    const res = await fetch("/api/activities/logs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        activityId,
        date,
        completed: newCompleted,
        source: "manual",
        entryId,
      }),
    });

    if (res.ok) {
      const log = await res.json();
      setLogs((prev) => new Map(prev).set(activityId, log));
    }
  }

  if (loading || activities.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Target className="h-4 w-4" /> Activities
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
          {activities.map((activity) => {
            const log = logs.get(activity.id);
            const checked = log?.completed ?? false;
            const isAi = log?.source === "ai";

            return (
              <button
                key={activity.id}
                onClick={() => toggle(activity.id)}
                className={cn(
                  "flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs transition-all text-left",
                  checked
                    ? activity.type === "good"
                      ? "border-green-500/50 bg-green-500/10 text-green-700 dark:text-green-400"
                      : "border-red-500/50 bg-red-500/10 text-red-700 dark:text-red-400"
                    : "border-border hover:bg-accent text-muted-foreground"
                )}
              >
                <span className="text-sm">{activity.emoji || (checked ? "✓" : "○")}</span>
                <span className="truncate">{activity.name}</span>
                {isAi && <span className="ml-auto text-[9px] opacity-50">AI</span>}
              </button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
