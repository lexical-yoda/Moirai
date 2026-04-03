"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  SmilePlus,
  Lightbulb,
  Users,
  ListChecks,
  Tag,
  Calendar,
  MapPin,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Insight {
  mood: string;
  moodScore: number;
  summary: string;
  actionItems: string[];
  keyPeople: string[];
  themes: string[];
  events?: string[];
  places?: string[];
}

interface InsightsPanelProps {
  insight: Insight | null;
  loading: boolean;
  onPersonEdit?: (oldName: string, newName: string) => void;
  onPersonRemove?: (name: string) => void;
  onPlaceEdit?: (oldName: string, newName: string) => void;
  onPlaceRemove?: (name: string) => void;
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

export function InsightsPanel({ insight, loading, onPersonEdit, onPersonRemove, onPlaceEdit, onPlaceRemove }: InsightsPanelProps) {
  const [editingItem, setEditingItem] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
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
                <Users className="h-3 w-3" /> People
              </p>
              <div className="flex flex-wrap gap-1">
                {insight.keyPeople.map((person) => (
                  editingItem === person ? (
                    <form key={person} className="flex gap-1" onSubmit={(e) => {
                      e.preventDefault();
                      if (editValue.trim() && editValue.trim() !== person) {
                        onPersonEdit?.(person, editValue.trim());
                      }
                      setEditingItem(null);
                    }}>
                      <Input
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        className="h-6 w-20 sm:w-28 text-xs px-1.5"
                        autoFocus
                        onBlur={() => setEditingItem(null)}
                        onKeyDown={(e) => e.key === "Escape" && setEditingItem(null)}
                      />
                    </form>
                  ) : (
                    <Badge
                      key={person}
                      variant="outline"
                      className="text-xs text-blue-700 dark:text-blue-400 border-blue-400 dark:border-blue-600 bg-blue-500/10 gap-1 group cursor-pointer max-w-full"
                      onClick={() => { setEditingItem(person); setEditValue(person); }}
                    >
                      <span className="truncate">{person}</span>
                      <button
                        className="opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={(e) => { e.stopPropagation(); onPersonRemove?.(person); }}
                        title="Remove"
                      >
                        <X className="h-2.5 w-2.5" />
                      </button>
                    </Badge>
                  )
                ))}
              </div>
            </div>
          </>
        )}

        {/* Events */}
        {insight.events && insight.events.length > 0 && (
          <>
            <Separator />
            <div>
              <p className="mb-1.5 text-xs font-medium flex items-center gap-1">
                <Calendar className="h-3 w-3" /> Events
              </p>
              <div className="flex flex-wrap gap-1">
                {insight.events.map((event) => (
                  <Badge key={event} variant="outline" className="text-xs text-amber-700 dark:text-amber-400 border-amber-400 dark:border-amber-600 bg-amber-500/10 max-w-full">
                    <span className="truncate">{event}</span>
                  </Badge>
                ))}
              </div>
            </div>
          </>
        )}

        {/* Places */}
        {insight.places && insight.places.length > 0 && (
          <>
            <Separator />
            <div>
              <p className="mb-1.5 text-xs font-medium flex items-center gap-1">
                <MapPin className="h-3 w-3" /> Places
              </p>
              <div className="flex flex-wrap gap-1">
                {insight.places.map((place) => (
                  editingItem === `place:${place}` ? (
                    <form key={place} className="flex gap-1" onSubmit={(e) => {
                      e.preventDefault();
                      if (editValue.trim() && editValue.trim() !== place) {
                        onPlaceEdit?.(place, editValue.trim());
                      }
                      setEditingItem(null);
                    }}>
                      <Input
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        className="h-6 w-20 sm:w-28 text-xs px-1.5"
                        autoFocus
                        onBlur={() => setEditingItem(null)}
                        onKeyDown={(e) => e.key === "Escape" && setEditingItem(null)}
                      />
                    </form>
                  ) : (
                    <Badge
                      key={place}
                      variant="outline"
                      className="text-xs text-green-700 dark:text-green-400 border-green-400 dark:border-green-600 bg-green-500/10 max-w-full gap-1 group cursor-pointer"
                      onClick={() => { setEditingItem(`place:${place}`); setEditValue(place); }}
                    >
                      <span className="truncate">{place}</span>
                      <button
                        className="opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={(e) => { e.stopPropagation(); onPlaceRemove?.(place); }}
                        title="Remove"
                      >
                        <X className="h-2.5 w-2.5" />
                      </button>
                    </Badge>
                  )
                ))}
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
