"use client";

import { ThemeToggle } from "./theme-toggle";
import { UserMenu } from "./user-menu";
import { ServiceStatus } from "./service-status";

export function Header() {
  return (
    <header className="flex h-14 items-center justify-end gap-3 border-b px-4">
      <ServiceStatus />
      <ThemeToggle />
      <UserMenu />
    </header>
  );
}
