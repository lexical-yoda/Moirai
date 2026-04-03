"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { format, addMonths, subMonths } from "date-fns";
import { CalendarGrid } from "@/components/calendar/calendar-grid";
import { CalendarNav } from "@/components/calendar/calendar-nav";
import { Loader2 } from "lucide-react";

interface EntryInfo {
  id: string;
  date: string;
  title: string;
  wordCount: number;
  moodScore?: number | null;
}

export default function CalendarPage() {
  const router = useRouter();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [entries, setEntries] = useState<EntryInfo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadEntries() {
      setLoading(true);
      try {
        const month = format(currentMonth, "yyyy-MM");
        const res = await fetch(`/api/entries?month=${month}`);
        const data = await res.json();
        setEntries(data);
      } finally {
        setLoading(false);
      }
    }
    loadEntries();
  }, [currentMonth]);

  // Refresh when tab regains focus (e.g., user edited entry and came back)
  useEffect(() => {
    function handleFocus() {
      const month = format(currentMonth, "yyyy-MM");
      fetch(`/api/entries?month=${month}`).then((r) => r.json()).then(setEntries).catch(() => {});
    }
    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, [currentMonth]);

  function handleDayClick(date: string) {
    router.push(`/entry/${date}`);
  }

  return (
    <div className="space-y-4">
      <CalendarNav
        currentMonth={currentMonth}
        onPrevMonth={() => setCurrentMonth((m) => subMonths(m, 1))}
        onNextMonth={() => setCurrentMonth((m) => addMonths(m, 1))}
        onToday={() => setCurrentMonth(new Date())}
      />
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <CalendarGrid
          currentMonth={currentMonth}
          entries={entries}
          onDayClick={handleDayClick}
        />
      )}
    </div>
  );
}
