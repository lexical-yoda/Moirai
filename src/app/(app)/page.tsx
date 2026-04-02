"use client";

import { useState, useEffect, useCallback } from "react";
import { format, startOfMonth, endOfMonth, subMonths, addMonths } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MoodChart } from "@/components/dashboard/mood-chart";
import { TopicCloud } from "@/components/dashboard/topic-cloud";
import { RecentEntries } from "@/components/dashboard/recent-entries";
import { MoodHeatmap } from "@/components/dashboard/mood-heatmap";
import { ActivityGrid } from "@/components/dashboard/activity-grid";
import { PenLine, Calendar, TrendingUp, Flame, Loader2, ChevronLeft, ChevronRight } from "lucide-react";

interface DashboardData {
  totalEntries: number;
  rangeEntries: number;
  avgMood: number | null;
  streak: number;
  totalWords: number;
  moodTrend: { date: string; moodScore: number | null }[];
  topThemes: { name: string; count: number }[];
  recentEntries: { id: string; date: string; title: string; wordCount: number | null }[];
  heatmapData: { date: string; moodScore: number | null }[];
  dateRange: { from: string; to: string };
}

interface Activity {
  id: string;
  name: string;
  emoji: string;
  type: string;
  active: boolean;
}

interface ActivityLog {
  activityId: string;
  date: string;
  completed: boolean;
  source: string;
}

function moodLabel(score: number | null): string {
  if (score == null) return "--";
  if (score >= 0.5) return "Great";
  if (score >= 0.1) return "Good";
  if (score >= -0.1) return "Neutral";
  if (score >= -0.5) return "Low";
  return "Rough";
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentMonth, setCurrentMonth] = useState(new Date());

  const from = format(startOfMonth(currentMonth), "yyyy-MM-dd");
  const to = format(endOfMonth(currentMonth), "yyyy-MM-dd");

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [insightsRes, activitiesRes, logsRes] = await Promise.all([
        fetch(`/api/insights?from=${from}&to=${to}`),
        fetch("/api/activities"),
        fetch(`/api/activities/logs?from=${from}&to=${to}`),
      ]);

      if (insightsRes.ok) setData(await insightsRes.json());
      if (activitiesRes.ok) {
        const acts = await activitiesRes.json();
        setActivities(acts.filter((a: Activity) => a.active !== false));
      }
      if (logsRes.ok) setActivityLogs(await logsRes.json());
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => { loadData(); }, [loadData]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const d = data || {
    totalEntries: 0, rangeEntries: 0, avgMood: null, streak: 0, heatmapData: [],
    totalWords: 0, moodTrend: [], topThemes: [], recentEntries: [],
    dateRange: { from, to },
  };

  return (
    <div className="space-y-6">
      {/* Header with month filter */}
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setCurrentMonth((m) => subMonths(m, 1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" className="min-w-32 text-sm font-medium" onClick={() => setCurrentMonth(new Date())}>
            {format(currentMonth, "MMMM yyyy")}
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setCurrentMonth((m) => addMonths(m, 1))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Entries</CardTitle>
            <PenLine className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{d.totalEntries}</div>
            <p className="text-xs text-muted-foreground">
              {d.totalWords.toLocaleString()} total words
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">This Period</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{d.rangeEntries}</div>
            <p className="text-xs text-muted-foreground">entries in {format(currentMonth, "MMM yyyy")}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg. Mood</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{moodLabel(d.avgMood)}</div>
            <p className="text-xs text-muted-foreground">
              {d.avgMood != null ? `Score: ${d.avgMood.toFixed(2)}` : "no data yet"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Streak</CardTitle>
            <Flame className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{d.streak}</div>
            <p className="text-xs text-muted-foreground">days in a row</p>
          </CardContent>
        </Card>
      </div>

      {/* Activity Grid */}
      {activities.length > 0 && (
        <ActivityGrid activities={activities} logs={activityLogs} from={from} to={to} />
      )}

      {/* Charts and lists */}
      <div className="grid gap-6 lg:grid-cols-2">
        <MoodChart data={d.moodTrend} />
        <TopicCloud themes={d.topThemes} />
      </div>

      <MoodHeatmap data={d.heatmapData} />

      <RecentEntries entries={d.recentEntries} />
    </div>
  );
}
