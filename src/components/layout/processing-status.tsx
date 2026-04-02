"use client";

import { useState, useEffect, useCallback, useRef } from "react";

interface ProcessingTask {
  id: string;
  type: string;
  status: string;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

interface ProcessingData {
  tasks: ProcessingTask[];
  activeCount: number;
  failedCount: number;
}

const TYPE_LABELS: Record<string, string> = {
  transcription: "Transcription",
  formatting: "Formatting",
  insights: "AI Insights",
  activities: "Activities",
  therapy: "Therapy",
  embedding: "Embedding",
};

const STATUS_ICONS: Record<string, string> = {
  pending: "○",
  running: "◎",
  completed: "✓",
  failed: "✕",
};

export function ProcessingStatus() {
  const [data, setData] = useState<ProcessingData | null>(null);
  const [open, setOpen] = useState(false);
  const [retrying, setRetrying] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/processing");
      if (res.ok) setData(await res.json());
    } catch (err) {
      console.error("[ProcessingStatus] Failed to fetch:", err);
    }
  }, []);

  // Poll every 30s when closed, every 5s when open
  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, open ? 5_000 : 30_000);
    return () => clearInterval(interval);
  }, [fetchStatus, open]);

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  async function handleRetry(taskId: string) {
    setRetrying(taskId);
    try {
      await fetch(`/api/processing/retry/${taskId}`, { method: "POST" });
      await fetchStatus();
    } catch (err) {
      console.error("[ProcessingStatus] Retry failed:", err);
    }
    setRetrying(null);
  }

  const badgeCount = (data?.activeCount || 0) + (data?.failedCount || 0);

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setOpen(!open)}
        className="relative flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
        title="Processing status"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
        {badgeCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-medium text-primary-foreground">
            {badgeCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-10 z-50 w-80 rounded-lg border bg-popover shadow-lg">
          <div className="border-b px-3 py-2">
            <span className="text-sm font-medium">Processing</span>
          </div>

          <div className="max-h-72 overflow-y-auto">
            {!data?.tasks?.length ? (
              <div className="px-3 py-4 text-center text-sm text-muted-foreground">
                No recent tasks
              </div>
            ) : (
              data.tasks.map((task) => (
                <div key={task.id} className="flex items-center gap-2 border-b px-3 py-2 last:border-0">
                  <span className={`text-sm font-mono ${
                    task.status === "completed" ? "text-green-500" :
                    task.status === "failed" ? "text-red-500" :
                    task.status === "running" ? "text-blue-500 animate-pulse" :
                    "text-muted-foreground"
                  }`}>
                    {STATUS_ICONS[task.status] || "?"}
                  </span>

                  <div className="flex-1 min-w-0">
                    <div className="text-sm truncate">
                      {TYPE_LABELS[task.type] || task.type}
                    </div>
                    {task.errorMessage && (
                      <div className="text-xs text-red-500 truncate" title={task.errorMessage}>
                        {task.errorMessage}
                      </div>
                    )}
                  </div>

                  {task.status === "failed" && (
                    <button
                      onClick={() => handleRetry(task.id)}
                      disabled={retrying === task.id}
                      className="text-xs px-2 py-0.5 rounded border hover:bg-accent transition-colors disabled:opacity-50"
                    >
                      {retrying === task.id ? "..." : "Retry"}
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
