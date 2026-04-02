"use client";

import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";

interface HealthResponse {
  status: string;
  services?: Record<string, { status: string }>;
}

export function ServiceStatus() {
  const [health, setHealth] = useState<HealthResponse | null>(null);

  useEffect(() => {
    async function check() {
      try {
        const res = await fetch("/api/health");
        if (res.ok) setHealth(await res.json());
      } catch {}
    }
    check();
    const interval = setInterval(check, 60_000);
    return () => clearInterval(interval);
  }, []);

  if (!health?.services || Object.keys(health.services).length === 0) return null;

  return (
    <div className="flex items-center gap-2">
      {Object.entries(health.services).map(([name, svc]) => (
        <div key={name} className="flex items-center gap-1" title={`${name}: ${svc.status}`}>
          <span className={cn("h-1.5 w-1.5 rounded-full", svc.status === "online" ? "bg-green-500" : "bg-red-500")} />
          <span className="text-[10px] text-muted-foreground capitalize">{name}</span>
        </div>
      ))}
    </div>
  );
}
