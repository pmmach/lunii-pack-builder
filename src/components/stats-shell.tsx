import Link from "next/link";
import type { ReactNode } from "react";
import { ThemeToggle } from "@/components/theme-toggle";

export function StatsShell({
  children,
  toolbar,
}: {
  children: ReactNode;
  toolbar?: ReactNode;
}) {
  return (
    <div className="relative min-h-screen overflow-hidden bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-teal-100 via-background to-background dark:from-teal-950/40">
      <header className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-4">
        <Link
          href="/"
          className="text-lg font-semibold tracking-tight text-primary"
        >
          Lunii Pack Builder
        </Link>
        <div className="flex items-center gap-2">
          {toolbar}
          <ThemeToggle />
        </div>
      </header>
      <main className="mx-auto flex max-w-5xl flex-col gap-6 px-4 pb-16 pt-2">
        {children}
      </main>
    </div>
  );
}
