"use client";

import { useMemo } from "react";
import { format, subDays, startOfWeek, eachDayOfInterval } from "date-fns";
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
  if (!hasEntry) return "bg-muted/30";
  if (score == null) return "bg-muted";
  if (score >= 0.5) return "bg-green-500";
  if (score >= 0.2) return "bg-green-400";
  if (score >= 0) return "bg-emerald-300";
  if (score >= -0.3) return "bg-yellow-400";
  if (score >= -0.6) return "bg-orange-400";
  return "bg-red-400";
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const CELL = 11;
const GAP = 2;
const STEP = CELL + GAP;

export function MoodHeatmap({ data }: MoodHeatmapProps) {
  const { cells, weeks, monthLabels } = useMemo(() => {
    const now = new Date();
    const start = startOfWeek(subDays(now, 364));
    const days = eachDayOfInterval({ start, end: now });
    const dataMap = new Map(data.map((d) => [d.date, d]));

    const cells: { date: string; score: number | null; hasEntry: boolean; col: number; row: number }[] = [];
    let col = 0;
    let prevWeek = -1;

    for (const day of days) {
      const dayOfWeek = day.getDay(); // 0=Sun
      const weekNum = Math.floor((day.getTime() - start.getTime()) / (7 * 24 * 60 * 60 * 1000));

      if (weekNum !== prevWeek) {
        col = weekNum;
        prevWeek = weekNum;
      }

      const dateStr = format(day, "yyyy-MM-dd");
      const point = dataMap.get(dateStr);
      cells.push({
        date: dateStr,
        score: point?.moodScore ?? null,
        hasEntry: !!point,
        col: weekNum,
        row: dayOfWeek,
      });
    }

    const totalWeeks = cells.length > 0 ? cells[cells.length - 1].col + 1 : 0;

    // Month labels positioned at the week where a new month starts
    const labels: { label: string; col: number }[] = [];
    let lastMonth = -1;
    for (const cell of cells) {
      if (cell.row === 0) { // Only check Sundays (start of week)
        const month = parseInt(cell.date.split("-")[1]) - 1;
        if (month !== lastMonth) {
          labels.push({ label: MONTHS[month], col: cell.col });
          lastMonth = month;
        }
      }
    }

    return { cells, weeks: totalWeeks, monthLabels: labels };
  }, [data]);

  const gridWidth = weeks * STEP;
  const labelWidth = 28;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Flame className="h-4 w-4" /> Mood Heatmap
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <svg
            width={labelWidth + gridWidth + 4}
            height={STEP * 7 + 20 + 24}
            className="block"
          >
            {/* Month labels */}
            {monthLabels.map((m, i) => (
              <text
                key={i}
                x={labelWidth + m.col * STEP}
                y={10}
                className="fill-muted-foreground"
                fontSize={10}
              >
                {m.label}
              </text>
            ))}

            {/* Day labels */}
            {[1, 3, 5].map((row) => (
              <text
                key={row}
                x={0}
                y={18 + row * STEP + CELL - 2}
                className="fill-muted-foreground"
                fontSize={9}
              >
                {DAY_LABELS[row]}
              </text>
            ))}

            {/* Grid cells */}
            {cells.map((cell, i) => (
              <rect
                key={i}
                x={labelWidth + cell.col * STEP}
                y={18 + cell.row * STEP}
                width={CELL}
                height={CELL}
                rx={2}
                className={cn(
                  moodColor(cell.score, cell.hasEntry),
                  "transition-colors"
                )}
              >
                <title>
                  {cell.date}{cell.hasEntry ? ` (mood: ${cell.score?.toFixed(1) ?? "no AI data"})` : " (no entry)"}
                </title>
              </rect>
            ))}

            {/* Legend */}
            {(() => {
              const ly = 18 + 7 * STEP + 10;
              const colors = ["bg-red-400", "bg-orange-400", "bg-yellow-400", "bg-emerald-300", "bg-green-400", "bg-green-500"];
              return (
                <>
                  <text x={labelWidth} y={ly + 8} className="fill-muted-foreground" fontSize={9}>Negative</text>
                  {colors.map((c, i) => (
                    <rect key={i} x={labelWidth + 48 + i * 14} y={ly} width={10} height={10} rx={2} className={c} />
                  ))}
                  <text x={labelWidth + 48 + colors.length * 14 + 4} y={ly + 8} className="fill-muted-foreground" fontSize={9}>Positive</text>
                </>
              );
            })()}
          </svg>
        </div>
      </CardContent>
    </Card>
  );
}
