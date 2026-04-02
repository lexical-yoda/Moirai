"use client";

import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  format,
} from "date-fns";
import { CalendarDay } from "./calendar-day";

interface EntryInfo {
  id: string;
  date: string;
  title: string;
  wordCount: number;
  moodScore?: number | null;
}

interface CalendarGridProps {
  currentMonth: Date;
  entries: EntryInfo[];
  onDayClick: (date: string) => void;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function CalendarGrid({ currentMonth, entries, onDayClick }: CalendarGridProps) {
  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const calendarStart = startOfWeek(monthStart);
  const calendarEnd = endOfWeek(monthEnd);

  const days = eachDayOfInterval({ start: calendarStart, end: calendarEnd });

  const entryMap = new Map(entries.map((e) => [e.date, e]));

  return (
    <div>
      <div className="mb-1 grid grid-cols-7 gap-1">
        {WEEKDAYS.map((day) => (
          <div key={day} className="py-1 text-center text-xs font-medium text-muted-foreground">
            {day}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {days.map((day) => {
          const dateStr = format(day, "yyyy-MM-dd");
          return (
            <CalendarDay
              key={dateStr}
              date={day}
              currentMonth={currentMonth}
              entry={entryMap.get(dateStr)}
              onClick={onDayClick}
            />
          );
        })}
      </div>
    </div>
  );
}
