import Link from "next/link";
import { ThemeToggle } from "@/components/theme-toggle";
import { GUIDE_PAGES } from "@/lib/seo/site";

export function SiteShell({
  children,
  currentPath,
}: {
  children: React.ReactNode;
  currentPath?: string;
}) {
  const guideLinks = GUIDE_PAGES.filter((page) => page.path !== currentPath);

  return (
    <div className="relative min-h-screen overflow-hidden bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-teal-100 via-background to-background dark:from-teal-950/40">
      <header className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4">
        <Link
          href="/"
          className="text-lg font-semibold tracking-tight text-primary"
        >
          Lunii Pack Builder
        </Link>
        <ThemeToggle />
      </header>

      <main className="mx-auto flex max-w-3xl flex-col gap-10 px-4 pb-16 pt-6">
        {children}
        <footer className="text-muted-foreground space-y-4 text-center text-xs">
          <nav
            aria-label="Guides"
            className="flex flex-wrap justify-center gap-2"
          >
            {currentPath ? (
              <Link
                href="/#analyser"
                className="border-primary/25 bg-primary/5 text-primary hover:border-primary/40 hover:bg-primary/10 inline-flex min-h-9 items-center rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors"
              >
                Créer un pack
              </Link>
            ) : null}
            {guideLinks.map((page) => (
              <Link
                key={page.path}
                href={page.path}
                className="border-border/80 bg-background/70 text-primary hover:border-primary/30 hover:bg-primary/5 inline-flex min-h-9 items-center rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors"
              >
                {page.title}
              </Link>
            ))}
          </nav>
          <p>
            Usage personnel, indépendant de Lunii — l&apos;audio reste aux
            ayants droit.
          </p>
          <p>
            Ensuite :{" "}
            <a
              href="https://lunii-admin-web.pages.dev/"
              className="text-primary underline-offset-2 hover:underline"
              target="_blank"
              rel="noreferrer"
            >
              Lunii Admin Web
            </a>
          </p>
        </footer>
      </main>
    </div>
  );
}
