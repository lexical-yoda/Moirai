"use client";

import { useState } from "react";
import { format, subDays, startOfWeek, endOfWeek, startOfMonth, endOfMonth, subMonths } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Loader2, Sparkles } from "lucide-react";

interface GenerateReflectionProps {
  onGenerated: () => void;
}

export function GenerateReflection({ onGenerated }: GenerateReflectionProps) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<"weekly" | "monthly">("weekly");
  const [periodStart, setPeriodStart] = useState(() =>
    format(startOfWeek(subDays(new Date(), 7)), "yyyy-MM-dd")
  );
  const [periodEnd, setPeriodEnd] = useState(() =>
    format(endOfWeek(subDays(new Date(), 7)), "yyyy-MM-dd")
  );
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleTypeChange(newType: "weekly" | "monthly") {
    setType(newType);
    if (newType === "weekly") {
      const lastWeek = subDays(new Date(), 7);
      setPeriodStart(format(startOfWeek(lastWeek), "yyyy-MM-dd"));
      setPeriodEnd(format(endOfWeek(lastWeek), "yyyy-MM-dd"));
    } else {
      const lastMonth = subMonths(new Date(), 1);
      setPeriodStart(format(startOfMonth(lastMonth), "yyyy-MM-dd"));
      setPeriodEnd(format(endOfMonth(lastMonth), "yyyy-MM-dd"));
    }
  }

  async function handleGenerate() {
    setGenerating(true);
    setError(null);

    try {
      const res = await fetch("/api/reflections/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, periodStart, periodEnd }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Generation failed");
      }

      setOpen(false);
      onGenerated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generation failed");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button className="gap-1.5" />}>
        <Sparkles className="h-4 w-4" />
        Generate Reflection
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Generate Reflection</DialogTitle>
          <DialogDescription>
            Create an AI-generated summary of your journal entries for a time period
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Type</Label>
            <div className="flex gap-2">
              <Button
                variant={type === "weekly" ? "default" : "outline"}
                size="sm"
                onClick={() => handleTypeChange("weekly")}
              >
                Weekly
              </Button>
              <Button
                variant={type === "monthly" ? "default" : "outline"}
                size="sm"
                onClick={() => handleTypeChange("monthly")}
              >
                Monthly
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="start">Start Date</Label>
              <Input
                id="start"
                type="date"
                value={periodStart}
                onChange={(e) => setPeriodStart(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="end">End Date</Label>
              <Input
                id="end"
                type="date"
                value={periodEnd}
                onChange={(e) => setPeriodEnd(e.target.value)}
              />
            </div>
          </div>

          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}

          <Button
            onClick={handleGenerate}
            disabled={generating}
            className="w-full gap-1.5"
          >
            {generating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            {generating ? "Generating..." : "Generate"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
