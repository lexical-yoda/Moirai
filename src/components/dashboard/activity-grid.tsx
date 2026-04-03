"use client";

import { useMemo } from "react";
import { eachDayOfInterval, format, parseISO, getDate } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Target } from "lucide-react";
import { cn } from "@/lib/utils";

interface Activity {
  id: string;
  name: string;
  emoji: string;
  type: string;
}

interface ActivityLog {
  activityId: string;
  date: string;
  completed: boolean;
  source: string;
}

interface ActivityGridProps {
  activities: Activity[];
  logs: ActivityLog[];
  from: string;
  to: string;
}

export function ActivityGrid({ activities, logs, from, to }: ActivityGridProps) {
  const { days, logMap, stats } = useMemo(() => {
    const days = eachDayOfInterval({
      start: parseISO(from),
      end: parseISO(to),
    });

    // Map: activityId -> date -> log
    const logMap = new Map<string, Map<string, ActivityLog>>();
    for (const log of logs) {
      if (!logMap.has(log.activityId)) logMap.set(log.activityId, new Map());
      logMap.get(log.activityId)!.set(log.date, log);
    }

    // Stats per activity
    const stats = new Map<string, { completed: number; total: number; streak: number }>();
    for (const activity of activities) {
      const activityLogs = logMap.get(activity.id);
      let completed = 0;
      let currentStreak = 0;
      let maxStreak = 0;

      for (let i = days.length - 1; i >= 0; i--) {
        const dateStr = format(days[i], "yyyy-MM-dd");
        const log = activityLogs?.get(dateStr);
        if (log?.completed) {
          completed++;
          currentStreak++;
          maxStreak = Math.max(maxStreak, currentStreak);
        } else {
          if (i < days.length - 1) currentStreak = 0; // Don't break streak for today
        }
      }

      stats.set(activity.id, { completed, total: days.length, streak: currentStreak });
    }

    return { days, logMap, stats };
  }, [activities, logs, from, to]);

  if (activities.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Target className="h-4 w-4" /> Activity Tracker
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr>
                <th className="text-left py-1 pr-2 sm:pr-3 font-medium text-muted-foreground sticky left-0 bg-card min-w-20 sm:min-w-28 whitespace-nowrap">Activity</th>
                {days.map((day) => (
                  <th key={format(day, "yyyy-MM-dd")} className="text-center font-normal text-muted-foreground px-0.5 min-w-5">
                    {getDate(day)}
                  </th>
                ))}
                <th className="text-center pl-2 font-medium text-muted-foreground min-w-10 sm:min-w-12 whitespace-nowrap">Rate</th>
                <th className="text-center pl-1 font-medium text-muted-foreground min-w-8 sm:min-w-10 whitespace-nowrap">Streak</th>
              </tr>
            </thead>
            <tbody>
              {activities.map((activity) => {
                const activityLogs = logMap.get(activity.id);
                const stat = stats.get(activity.id);
                const rate = stat ? Math.round((stat.completed / stat.total) * 100) : 0;

                return (
                  <tr key={activity.id}>
                    <td className="py-1 pr-2 sm:pr-3 sticky left-0 bg-card max-w-20 sm:max-w-28 truncate">
                      <span className="flex items-center gap-1">
                        <span>{activity.emoji || (activity.type === "good" ? "✅" : "❌")}</span>
                        <span className="truncate">{activity.name}</span>
                      </span>
                    </td>
                    {days.map((day) => {
                      const dateStr = format(day, "yyyy-MM-dd");
                      const log = activityLogs?.get(dateStr);
                      const done = log?.completed ?? false;

                      return (
                        <td key={dateStr} className="text-center px-0.5">
                          <div
                            className={cn(
                              "w-4 h-4 rounded-sm mx-auto",
                              done
                                ? activity.type === "good"
                                  ? "bg-green-500"
                                  : "bg-red-500"
                                : "bg-muted/40"
                            )}
                            title={`${activity.name}: ${done ? "Done" : "Not done"} (${dateStr})`}
                          />
                        </td>
                      );
                    })}
                    <td className="text-center pl-2 font-mono">
                      <span className={cn(
                        "text-[10px] font-medium",
                        rate >= 70 ? "text-green-600" : rate >= 40 ? "text-yellow-600" : "text-muted-foreground"
                      )}>
                        {rate}%
                      </span>
                    </td>
                    <td className="text-center pl-1 font-mono text-[10px]">
                      {stat?.streak || 0}d
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
