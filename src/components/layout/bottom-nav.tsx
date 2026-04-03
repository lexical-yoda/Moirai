"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Calendar, PenLine, Search, Heart } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTherapyEnabled } from "@/hooks/use-therapy-enabled";

const baseNavItems = [
  { href: "/", label: "Home", icon: LayoutDashboard },
  { href: "/entry", label: "Write", icon: PenLine },
  { href: "/calendar", label: "Calendar", icon: Calendar },
  { href: "/search", label: "Search", icon: Search },
];

function todayDate() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function BottomNav() {
  const pathname = usePathname();
  const therapyEnabled = useTherapyEnabled();

  const navItems = [
    ...baseNavItems,
    ...(therapyEnabled ? [{ href: "/therapy", label: "Therapy", icon: Heart }] : []),
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 md:hidden">
      <div className="flex items-center justify-around py-1.5 pb-[max(0.375rem,env(safe-area-inset-bottom))]">
        {navItems.map((item) => {
          const isActive = item.href === "/"
            ? pathname === "/"
            : pathname.startsWith(item.href);
          const href = item.href === "/entry" ? `/entry/${todayDate()}` : item.href;

          return (
            <Link
              key={item.href}
              href={href}
              className={cn(
                "flex flex-col items-center gap-0.5 px-1.5 sm:px-3 py-1.5 rounded-lg transition-colors min-w-0",
                isActive
                  ? "text-primary"
                  : "text-muted-foreground"
              )}
            >
              <item.icon className={cn("h-5 w-5", item.href === "/entry" && "h-6 w-6")} />
              <span className="text-[10px] font-medium">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
