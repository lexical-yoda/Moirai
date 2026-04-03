"use client";

import { ThemePicker } from "./theme-picker";
import { UserMenu } from "./user-menu";
import { ServiceStatus } from "./service-status";
import { ProcessingStatus } from "./processing-status";

export function Header() {
  return (
    <header className="flex h-14 items-center justify-end gap-1.5 sm:gap-3 border-b px-2 sm:px-4">
      <ServiceStatus />
      <ProcessingStatus />
      <ThemePicker />
      <UserMenu />
    </header>
  );
}
