"use client";

import { format, isToday, isSameMonth } from "date-fns";
import { cn } from "@/lib/utils";

interface EntryInfo {
  id: string;
  title: string;
  wordCount: number;
  moodScore?: number | null;
}

interface CalendarDayProps {
  date: Date;
  currentMonth: Date;
  entry?: EntryInfo;
  onClick: (date: string) => void;
}

function moodColor(score: number | null | undefined): string {
  if (score == null) return "";
  if (score >= 0.5) return "bg-green-500/20 border-green-500/40";
  if (score >= 0.1) return "bg-emerald-500/15 border-emerald-500/30";
  if (score >= -0.1) return "bg-yellow-500/15 border-yellow-500/30";
  if (score >= -0.5) return "bg-orange-500/15 border-orange-500/30";
  return "bg-red-500/15 border-red-500/30";
}

export function CalendarDay({ date, currentMonth, entry, onClick }: CalendarDayProps) {
  const dateStr = format(date, "yyyy-MM-dd");
  const inMonth = isSameMonth(date, currentMonth);
  const today = isToday(date);

  return (
    <button
      onClick={() => onClick(dateStr)}
      className={cn(
        "flex h-24 flex-col rounded-md border p-1.5 text-left transition-colors hover:bg-accent/50",
        !inMonth && "opacity-30",
        today && "ring-2 ring-primary",
        entry && moodColor(entry.moodScore)
      )}
    >
      <span
        className={cn(
          "text-xs font-medium",
          today && "text-primary font-bold"
        )}
      >
        {format(date, "d")}
      </span>
      {entry && (
        <div className="mt-0.5 flex-1 overflow-hidden">
          <p className="truncate text-xs font-medium">{entry.title || "Untitled"}</p>
          <p className="text-[10px] text-muted-foreground">{entry.wordCount} words</p>
        </div>
      )}
    </button>
  );
}
