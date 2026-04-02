"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tag } from "lucide-react";
import { cn } from "@/lib/utils";

interface Theme {
  name: string;
  count: number;
}

interface TopicCloudProps {
  themes: Theme[];
}

export function TopicCloud({ themes }: TopicCloudProps) {
  if (themes.length === 0) return null;

  const maxCount = Math.max(...themes.map((t) => t.count));

  function sizeClass(count: number): string {
    const ratio = count / maxCount;
    if (ratio >= 0.8) return "text-sm font-semibold";
    if (ratio >= 0.5) return "text-sm";
    if (ratio >= 0.3) return "text-xs";
    return "text-xs opacity-75";
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Tag className="h-4 w-4" /> Top Themes
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-1.5">
          {themes.map((theme) => (
            <Badge
              key={theme.name}
              variant="secondary"
              className={cn("transition-all", sizeClass(theme.count))}
            >
              {theme.name}
              <span className="ml-1 opacity-50">{theme.count}</span>
            </Badge>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
