"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MoodChart } from "@/components/dashboard/mood-chart";
import { TopicCloud } from "@/components/dashboard/topic-cloud";
import { RecentEntries } from "@/components/dashboard/recent-entries";
import { PenLine, Calendar, TrendingUp, Flame, FileText, Loader2 } from "lucide-react";

interface DashboardData {
  totalEntries: number;
  monthEntries: number;
  avgMood: number | null;
  streak: number;
  totalWords: number;
  moodTrend: { date: string; moodScore: number | null }[];
  topThemes: { name: string; count: number }[];
  recentEntries: { id: string; date: string; title: string; wordCount: number | null }[];
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
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/insights");
        if (res.ok) setData(await res.json());
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const d = data || {
    totalEntries: 0, monthEntries: 0, avgMood: null, streak: 0,
    totalWords: 0, moodTrend: [], topThemes: [], recentEntries: [],
  };

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Dashboard</h1>

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
            <CardTitle className="text-sm font-medium">This Month</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{d.monthEntries}</div>
            <p className="text-xs text-muted-foreground">entries this month</p>
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

      {/* Charts and lists */}
      <div className="grid gap-6 lg:grid-cols-2">
        <MoodChart data={d.moodTrend} />
        <TopicCloud themes={d.topThemes} />
      </div>

      <RecentEntries entries={d.recentEntries} />
    </div>
  );
}
