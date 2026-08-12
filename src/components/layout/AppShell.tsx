import type { ReactNode } from "react";
import { Sidebar } from "./Sidebar";
import { MobileNav } from "./MobileNav";

interface AppShellProps {
  children: ReactNode;
  person?: { name: string; isManager: boolean };
}

export function AppShell({ children, person }: AppShellProps) {
  return (
    <div className="flex h-full min-h-screen bg-background text-foreground">
      <Sidebar person={person} />
      <div className="flex min-h-screen flex-1 flex-col">
        <MobileNav person={person} />
        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-10 lg:py-10">{children}</main>
      </div>
    </div>
  );
}
