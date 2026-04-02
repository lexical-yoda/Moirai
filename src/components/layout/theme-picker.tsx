"use client";

import { useState, useEffect } from "react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { Palette, Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";

const PALETTES = [
  { id: "github", label: "GitHub", color: "#58a6ff" },
  { id: "indigo", label: "Indigo", color: "#818cf8" },
  { id: "nord", label: "Nord", color: "#88c0d0" },
  { id: "emerald", label: "Emerald", color: "#34d399" },
  { id: "rose", label: "Rose", color: "#f472b6" },
  { id: "amber", label: "Amber", color: "#f59e0b" },
  { id: "ocean", label: "Ocean", color: "#38bdf8" },
];

export function ThemePicker() {
  const { theme, setTheme } = useTheme();
  const [palette, setPalette] = useState("github");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("moirai-palette") || "github";
    const valid = PALETTES.some((p) => p.id === saved) ? saved : "github";
    setPalette(valid);
    document.documentElement.setAttribute("data-palette", valid);
  }, []);

  function handlePalette(id: string) {
    setPalette(id);
    localStorage.setItem("moirai-palette", id);
    document.documentElement.setAttribute("data-palette", id);
  }

  return (
    <div className="relative">
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8"
        onClick={() => setOpen(!open)}
      >
        <Palette className="h-4 w-4" />
      </Button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full z-50 mt-2 w-48 rounded-lg border bg-popover p-2 shadow-lg">
            <p className="px-2 py-1 text-[10px] uppercase tracking-wider text-muted-foreground">Palette</p>
            {PALETTES.map((p) => (
              <button
                key={p.id}
                onClick={() => handlePalette(p.id)}
                className={cn(
                  "flex w-full items-center gap-2 rounded px-2 py-1.5 text-xs transition-colors hover:bg-accent",
                  palette === p.id && "text-primary"
                )}
              >
                <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: p.color }} />
                {p.label}
              </button>
            ))}

            <div className="my-1.5 h-px bg-border" />
            <p className="px-2 py-1 text-[10px] uppercase tracking-wider text-muted-foreground">Mode</p>
            <div className="grid grid-cols-2 gap-1">
              <button
                onClick={() => setTheme("light")}
                className={cn(
                  "flex items-center justify-center gap-1 rounded border px-2 py-1 text-xs transition-colors",
                  theme === "light" ? "border-primary text-primary bg-accent" : "border-border text-muted-foreground hover:border-primary"
                )}
              >
                <Sun className="h-3 w-3" /> Light
              </button>
              <button
                onClick={() => setTheme("dark")}
                className={cn(
                  "flex items-center justify-center gap-1 rounded border px-2 py-1 text-xs transition-colors",
                  theme === "dark" ? "border-primary text-primary bg-accent" : "border-border text-muted-foreground hover:border-primary"
                )}
              >
                <Moon className="h-3 w-3" /> Dark
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
