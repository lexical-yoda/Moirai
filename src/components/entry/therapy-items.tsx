"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Heart, Plus, Trash2, Check, Loader2, Lightbulb } from "lucide-react";
import { toast } from "sonner";

interface TherapyItem {
  id: string;
  description: string;
  type: string;
  priority: string;
  status: string;
  sessionEntryId: string | null;
}

interface TherapyItemsProps {
  entryId: string;
  isSessionDay: boolean;
  onSessionDayChange: (value: boolean) => void;
}

const PRIORITY_COLORS: Record<string, string> = {
  high: "text-red-600 border-red-300 bg-red-500/10",
  medium: "text-yellow-600 border-yellow-300 bg-yellow-500/10",
  low: "text-muted-foreground border-border bg-muted",
};

export function TherapyItemsInline({ entryId, isSessionDay, onSessionDayChange }: TherapyItemsProps) {
  const [entryItems, setEntryItems] = useState<TherapyItem[]>([]);
  const [pendingItems, setPendingItems] = useState<TherapyItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [newItem, setNewItem] = useState("");
  const [adding, setAdding] = useState(false);

  async function loadTherapyItems() {
    try {
      const [entryRes, pendingRes] = await Promise.all([
        fetch(`/api/therapy?entryId=${entryId}`),
        isSessionDay ? fetch("/api/therapy?status=pending") : Promise.resolve(null),
      ]);
      if (entryRes.ok) setEntryItems(await entryRes.json());
      if (pendingRes?.ok) setPendingItems(await pendingRes.json());
    } catch (err) {
      console.error("[TherapyItems] Failed to load:", err);
    } finally {
      setLoading(false);
    }
  }

  // Load on mount + poll every 10s to catch background-generated items
  useEffect(() => {
    loadTherapyItems();
    const interval = setInterval(loadTherapyItems, 10_000);
    return () => clearInterval(interval);
  }, [entryId, isSessionDay]);

  async function handleAdd() {
    if (!newItem.trim()) return;
    setAdding(true);
    try {
      const res = await fetch("/api/therapy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entryId,
          description: newItem.trim(),
          type: isSessionDay ? "takeaway" : "topic",
          priority: "medium",
        }),
      });
      if (res.ok) {
        const created = await res.json();
        setEntryItems((prev) => [...prev, created]);
        setNewItem("");
        toast.success(isSessionDay ? "Takeaway added" : "Topic added");
      } else {
        toast.error("Failed to add item");
      }
    } finally {
      setAdding(false);
    }
  }

  async function handleStatusChange(id: string, status: string) {
    const res = await fetch(`/api/therapy/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (res.ok) {
      const updated = await res.json();
      setEntryItems((prev) => prev.map((i) => i.id === id ? updated : i));
      setPendingItems((prev) => prev.map((i) => i.id === id ? updated : i));
    }
  }

  async function handleDelete(id: string) {
    const res = await fetch(`/api/therapy/${id}`, { method: "DELETE" });
    if (res.ok) {
      setEntryItems((prev) => prev.filter((i) => i.id !== id));
      setPendingItems((prev) => prev.filter((i) => i.id !== id));
    }
  }

  const topics = entryItems.filter((i) => i.type === "topic");
  const takeaways = entryItems.filter((i) => i.type === "takeaway");

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <Heart className="h-4 w-4" /> Therapy
          </CardTitle>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={isSessionDay}
              onChange={(e) => onSessionDayChange(e.target.checked)}
              className="rounded border-input"
            />
            <span className="text-xs text-muted-foreground">Session Day</span>
          </label>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? (
          <div className="flex justify-center py-2"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
        ) : (
          <>
            {/* Session day: show pending items to address */}
            {isSessionDay && pendingItems.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1.5">Agenda (pending topics)</p>
                <div className="space-y-1">
                  {pendingItems.map((item) => (
                    <div key={item.id} className="flex items-center gap-2 text-sm rounded border px-2 py-1.5">
                      <button
                        onClick={() => handleStatusChange(item.id, "discussed")}
                        className="shrink-0 h-4 w-4 rounded border border-input hover:border-primary flex items-center justify-center"
                        title="Mark discussed"
                      >
                        {item.status === "discussed" && <Check className="h-3 w-3 text-green-600" />}
                      </button>
                      <span className={`flex-1 min-w-0 truncate ${item.status === "discussed" ? "line-through text-muted-foreground" : ""}`}>
                        {item.description}
                      </span>
                      <Badge variant="outline" className={`shrink-0 text-[10px] ${PRIORITY_COLORS[item.priority]}`}>
                        {item.priority}
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Topics extracted from this entry */}
            {topics.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1.5">Topics from this entry</p>
                <div className="space-y-1">
                  {topics.map((item) => (
                    <div key={item.id} className="flex items-center gap-2 text-sm rounded border px-2 py-1.5 group">
                      <span className="flex-1 min-w-0 truncate">{item.description}</span>
                      <Badge variant="outline" className={`shrink-0 text-[10px] ${PRIORITY_COLORS[item.priority]}`}>
                        {item.priority}
                      </Badge>
                      <Button
                        variant="ghost" size="icon" className="h-5 w-5 opacity-0 group-hover:opacity-100 text-destructive hover:text-destructive"
                        onClick={() => handleDelete(item.id)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Takeaways (session day) */}
            {takeaways.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1.5 flex items-center gap-1">
                  <Lightbulb className="h-3 w-3" /> Session Takeaways
                </p>
                <div className="space-y-1">
                  {takeaways.map((item) => (
                    <div key={item.id} className="flex items-center gap-2 text-sm rounded border border-green-300 dark:border-green-800 bg-green-500/10 px-2 py-1.5 group">
                      <span className="flex-1 min-w-0 truncate">{item.description}</span>
                      <Button
                        variant="ghost" size="icon" className="h-5 w-5 opacity-0 group-hover:opacity-100 text-destructive hover:text-destructive"
                        onClick={() => handleDelete(item.id)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Add item input */}
            <div className="flex gap-1.5">
              <Input
                value={newItem}
                onChange={(e) => setNewItem(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAdd()}
                placeholder={isSessionDay ? "Add a takeaway..." : "Add a topic..."}
                className="h-7 text-sm"
              />
              <Button size="sm" className="h-7 gap-1 shrink-0" onClick={handleAdd} disabled={adding || !newItem.trim()}>
                <Plus className="h-3 w-3" /> Add
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
