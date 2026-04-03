"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Loader2, Trash2, ChevronDown, ChevronUp } from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";

interface TherapyItem {
  id: string;
  entryId: string;
  description: string;
  type: string;
  priority: string;
  status: string;
  sessionEntryId: string | null;
  entryDate: string | null;
  sessionEntryDate: string | null;
  createdAt: string;
  updatedAt: string;
}

const PRIORITY_COLORS: Record<string, string> = {
  high: "text-red-600 border-red-300 bg-red-500/10",
  medium: "text-yellow-600 border-yellow-300 bg-yellow-500/10",
  low: "text-muted-foreground border-border bg-muted",
};

const STATUS_TABS = ["pending", "discussed", "resolved", "takeaways"] as const;

export default function TherapyPage() {
  const [items, setItems] = useState<TherapyItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<string>("pending");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  async function loadItems() {
    try {
      const res = await fetch("/api/therapy");
      if (res.ok) {
        setItems(await res.json());
      } else {
        console.error("[Therapy] Failed to load items:", res.status);
      }
    } catch (err) {
      console.error("[Therapy] Failed to load items:", err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadItems(); }, []);

  async function updateItem(id: string, updates: Record<string, string>) {
    try {
      const res = await fetch(`/api/therapy/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      if (res.ok) {
        const updated = await res.json();
        setItems((prev) => prev.map((i) => i.id === id ? updated : i));
        toast.success("Item updated");
      } else {
        toast.error("Failed to update");
        console.error("[Therapy] Update failed:", res.status);
      }
    } catch (err) {
      toast.error("Failed to update");
      console.error("[Therapy] Update error:", err);
    }
  }

  async function deleteItem(id: string) {
    const res = await fetch(`/api/therapy/${id}`, { method: "DELETE" });
    if (res.ok) {
      setItems((prev) => prev.filter((i) => i.id !== id));
      toast.success("Item deleted");
    } else {
      toast.error("Failed to delete");
    }
  }

  const topics = items.filter((i) => i.type === "topic");
  const takeaways = items.filter((i) => i.type === "takeaway");
  const filtered = activeTab === "takeaways"
    ? takeaways
    : topics.filter((i) => i.status === activeTab);
  const counts = {
    pending: topics.filter((i) => i.status === "pending").length,
    discussed: topics.filter((i) => i.status === "discussed").length,
    resolved: topics.filter((i) => i.status === "resolved").length,
    takeaways: takeaways.length,
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Therapy</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {counts.pending} pending &middot; {counts.discussed} discussed &middot; {counts.resolved} resolved
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-1.5 text-sm rounded-md capitalize transition-colors ${
              activeTab === tab ? "bg-accent font-medium" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab} ({counts[tab]})
          </button>
        ))}
      </div>

      {/* Items */}
      {filtered.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            No {activeTab} items
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((item) => (
            <Card key={item.id}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <button
                    onClick={() => setExpandedId(expandedId === item.id ? null : item.id)}
                    className="flex items-start gap-2 text-left flex-1 min-w-0"
                  >
                    {expandedId === item.id ? (
                      <ChevronUp className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
                    )}
                    <CardTitle className="text-sm font-normal leading-snug">
                      {item.description}
                    </CardTitle>
                  </button>
                  <Badge variant="outline" className={`shrink-0 text-xs ${PRIORITY_COLORS[item.priority]}`}>
                    {item.priority}
                  </Badge>
                </div>
              </CardHeader>

              {expandedId === item.id && (
                <CardContent className="pt-0 space-y-3">
                  <Separator />
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    {item.entryDate && (
                      <span>
                        Source:{" "}
                        <Link href={`/entry/${item.entryDate}`} className="underline hover:text-foreground">
                          {item.entryDate}
                        </Link>
                      </span>
                    )}
                    {item.sessionEntryDate && (
                      <span>
                        &middot; Session:{" "}
                        <Link href={`/entry/${item.sessionEntryDate}`} className="underline hover:text-foreground">
                          {item.sessionEntryDate}
                        </Link>
                      </span>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {/* Priority buttons */}
                    {(["high", "medium", "low"] as const).map((p) => (
                      <Button
                        key={p}
                        variant={item.priority === p ? "default" : "outline"}
                        size="sm"
                        className="text-xs capitalize"
                        onClick={() => updateItem(item.id, { priority: p })}
                      >
                        {p}
                      </Button>
                    ))}

                    <Separator orientation="vertical" className="h-6" />

                    {/* Status buttons */}
                    {STATUS_TABS.filter((s) => s !== item.status).map((s) => (
                      <Button
                        key={s}
                        variant="outline"
                        size="sm"
                        className="text-xs capitalize"
                        onClick={() => updateItem(item.id, { status: s })}
                      >
                        Mark {s}
                      </Button>
                    ))}

                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-xs text-destructive hover:text-destructive ml-auto"
                      onClick={() => deleteItem(item.id)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </CardContent>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
