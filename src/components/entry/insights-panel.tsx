"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  SmilePlus,
  Lightbulb,
  Users,
  ListChecks,
  Tag,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Insight {
  mood: string;
  moodScore: number;
  summary: string;
  actionItems: string[];
  keyPeople: string[];
  themes: string[];
}

interface InsightsPanelProps {
  insight: Insight | null;
  loading: boolean;
}

function moodEmoji(score: number): string {
  if (score >= 0.5) return "😊";
  if (score >= 0.1) return "🙂";
  if (score >= -0.1) return "😐";
  if (score >= -0.5) return "😕";
  return "😞";
}

function moodColor(score: number): string {
  if (score >= 0.5) return "text-green-600 bg-green-500/10";
  if (score >= 0.1) return "text-emerald-600 bg-emerald-500/10";
  if (score >= -0.1) return "text-yellow-600 bg-yellow-500/10";
  if (score >= -0.5) return "text-orange-600 bg-orange-500/10";
  return "text-red-600 bg-red-500/10";
}

export function InsightsPanel({ insight, loading }: InsightsPanelProps) {
  if (loading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Lightbulb className="h-4 w-4" /> AI Insights
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground animate-pulse">Analyzing entry...</p>
        </CardContent>
      </Card>
    );
  }

  if (!insight) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Lightbulb className="h-4 w-4" /> AI Insights
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Mood */}
        <div className="flex items-center gap-2">
          <SmilePlus className="h-4 w-4 text-muted-foreground" />
          <Badge className={cn("gap-1", moodColor(insight.moodScore))}>
            {moodEmoji(insight.moodScore)} {insight.mood}
          </Badge>
        </div>

        {/* Summary */}
        {insight.summary && (
          <p className="text-sm text-muted-foreground">{insight.summary}</p>
        )}

        {/* Themes */}
        {insight.themes.length > 0 && (
          <>
            <Separator />
            <div>
              <p className="mb-1.5 text-xs font-medium flex items-center gap-1">
                <Tag className="h-3 w-3" /> Themes
              </p>
              <div className="flex flex-wrap gap-1">
                {insight.themes.map((theme) => (
                  <Badge key={theme} variant="secondary" className="text-xs">
                    {theme}
                  </Badge>
                ))}
              </div>
            </div>
          </>
        )}

        {/* Action Items */}
        {insight.actionItems.length > 0 && (
          <>
            <Separator />
            <div>
              <p className="mb-1.5 text-xs font-medium flex items-center gap-1">
                <ListChecks className="h-3 w-3" /> Action Items
              </p>
              <ul className="space-y-1">
                {insight.actionItems.map((item, i) => (
                  <li key={i} className="text-xs text-muted-foreground flex items-start gap-1.5">
                    <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </>
        )}

        {/* Key People */}
        {insight.keyPeople.length > 0 && (
          <>
            <Separator />
            <div>
              <p className="mb-1.5 text-xs font-medium flex items-center gap-1">
                <Users className="h-3 w-3" /> People Mentioned
              </p>
              <div className="flex flex-wrap gap-1">
                {insight.keyPeople.map((person) => (
                  <Badge key={person} variant="outline" className="text-xs">
                    {person}
                  </Badge>
                ))}
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
