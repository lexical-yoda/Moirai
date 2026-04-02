"use client";

import { useMemo } from "react";
import { format, subDays, startOfWeek, eachDayOfInterval, getDay } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Flame } from "lucide-react";
import { cn } from "@/lib/utils";

interface HeatmapDataPoint {
  date: string;
  moodScore: number | null;
}

interface MoodHeatmapProps {
  data: HeatmapDataPoint[];
}

function moodColor(score: number | null, hasEntry: boolean): string {
  if (!hasEntry) return "bg-muted/40";
  if (score == null) return "bg-muted";
  if (score >= 0.5) return "bg-green-500";
  if (score >= 0.2) return "bg-green-400";
  if (score >= 0) return "bg-emerald-300";
  if (score >= -0.3) return "bg-yellow-400";
  if (score >= -0.6) return "bg-orange-400";
  return "bg-red-400";
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAYS = ["", "Mon", "", "Wed", "", "Fri", ""];

export function MoodHeatmap({ data }: MoodHeatmapProps) {
  const { grid, monthLabels } = useMemo(() => {
    const now = new Date();
    const start = startOfWeek(subDays(now, 364));
    const days = eachDayOfInterval({ start, end: now });

    const dataMap = new Map(data.map((d) => [d.date, d]));

    // Build weeks grid (7 rows x ~52 cols)
    const weeks: { date: string; score: number | null; hasEntry: boolean }[][] = [];
    let currentWeek: typeof weeks[0] = [];

    // Pad first week
    const startDay = getDay(start);
    for (let i = 0; i < startDay; i++) {
      currentWeek.push({ date: "", score: null, hasEntry: false });
    }

    for (const day of days) {
      const dateStr = format(day, "yyyy-MM-dd");
      const point = dataMap.get(dateStr);
      currentWeek.push({
        date: dateStr,
        score: point?.moodScore ?? null,
        hasEntry: !!point,
      });
      if (currentWeek.length === 7) {
        weeks.push(currentWeek);
        currentWeek = [];
      }
    }
    if (currentWeek.length > 0) {
      while (currentWeek.length < 7) currentWeek.push({ date: "", score: null, hasEntry: false });
      weeks.push(currentWeek);
    }

    // Month labels
    const labels: { label: string; col: number }[] = [];
    let lastMonth = -1;
    weeks.forEach((week, i) => {
      const firstDay = week.find((d) => d.date);
      if (firstDay?.date) {
        const month = parseInt(firstDay.date.split("-")[1]) - 1;
        if (month !== lastMonth) {
          labels.push({ label: MONTHS[month], col: i });
          lastMonth = month;
        }
      }
    });

    return { grid: weeks, monthLabels: labels };
  }, [data]);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Flame className="h-4 w-4" /> Mood Heatmap
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          {/* Month labels */}
          <div className="flex ml-8 mb-1">
            {monthLabels.map((m, i) => (
              <div
                key={i}
                className="text-[10px] text-muted-foreground"
                style={{ position: "relative", left: `${m.col * 13}px` }}
              >
                {m.label}
              </div>
            ))}
          </div>

          <div className="flex gap-0">
            {/* Day labels */}
            <div className="flex flex-col gap-[2px] mr-1 pt-0">
              {DAYS.map((d, i) => (
                <div key={i} className="h-[11px] text-[9px] text-muted-foreground leading-[11px] w-6 text-right pr-1">
                  {d}
                </div>
              ))}
            </div>

            {/* Grid */}
            <div className="flex gap-[2px]">
              {grid.map((week, wi) => (
                <div key={wi} className="flex flex-col gap-[2px]">
                  {week.map((day, di) => (
                    <div
                      key={`${wi}-${di}`}
                      className={cn(
                        "h-[11px] w-[11px] rounded-sm",
                        day.date ? moodColor(day.score, day.hasEntry) : "bg-transparent"
                      )}
                      title={day.date ? `${day.date}${day.hasEntry ? ` (mood: ${day.score?.toFixed(1) ?? "no data"})` : " (no entry)"}` : ""}
                    />
                  ))}
                </div>
              ))}
            </div>
          </div>

          {/* Legend */}
          <div className="flex items-center gap-1 mt-2 ml-8">
            <span className="text-[9px] text-muted-foreground">Negative</span>
            <div className="h-[9px] w-[9px] rounded-sm bg-red-400" />
            <div className="h-[9px] w-[9px] rounded-sm bg-orange-400" />
            <div className="h-[9px] w-[9px] rounded-sm bg-yellow-400" />
            <div className="h-[9px] w-[9px] rounded-sm bg-emerald-300" />
            <div className="h-[9px] w-[9px] rounded-sm bg-green-400" />
            <div className="h-[9px] w-[9px] rounded-sm bg-green-500" />
            <span className="text-[9px] text-muted-foreground">Positive</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
