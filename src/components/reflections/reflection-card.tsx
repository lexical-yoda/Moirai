"use client";

import Link from "next/link";
import { format, parseISO } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface ReflectionCardProps {
  reflection: {
    id: string;
    type: string;
    periodStart: string;
    periodEnd: string;
    title: string | null;
    moodSummary: string | null;
    themes: string[];
    generatedAt: string;
  };
}

export function ReflectionCard({ reflection }: ReflectionCardProps) {
  const periodLabel = (() => {
    try {
      const start = format(parseISO(reflection.periodStart), "MMM d");
      const end = format(parseISO(reflection.periodEnd), "MMM d, yyyy");
      return `${start} - ${end}`;
    } catch {
      return `${reflection.periodStart} - ${reflection.periodEnd}`;
    }
  })();

  return (
    <Link href={`/reflections/${reflection.id}`}>
      <Card className="transition-colors hover:bg-accent/50">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <Badge variant="outline" className="text-xs capitalize">
              {reflection.type}
            </Badge>
            <span className="text-xs text-muted-foreground">{periodLabel}</span>
          </div>
          <CardTitle className="text-base">
            {reflection.title || "Untitled Reflection"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {reflection.moodSummary && (
            <p className="text-sm text-muted-foreground mb-2">{reflection.moodSummary}</p>
          )}
          {reflection.themes.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {reflection.themes.slice(0, 4).map((theme) => (
                <Badge key={theme} variant="secondary" className="text-xs">
                  {theme}
                </Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}
