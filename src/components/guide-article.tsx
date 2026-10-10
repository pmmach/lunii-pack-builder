import type { LucideIcon } from "lucide-react";
import { SiteShell } from "@/components/site-shell";

export function GuideArticle({
  path,
  title,
  lede,
  children,
}: {
  path: string;
  title: string;
  lede: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <SiteShell currentPath={path}>
      <article className="space-y-8">
        <header className="space-y-3">
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
            {title}
          </h1>
          <p className="text-muted-foreground max-w-xl text-balance">{lede}</p>
        </header>
        <div className="space-y-6">{children}</div>
      </article>
    </SiteShell>
  );
}

export function GuideSection({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: LucideIcon;
  children: React.ReactNode;
}) {
  return (
    <section className="flex gap-4 rounded-2xl border border-border/60 bg-background/60 p-4 sm:p-5">
      <div
        className="bg-primary/10 text-primary flex size-11 shrink-0 items-center justify-center rounded-xl"
        aria-hidden
      >
        <Icon className="size-5" strokeWidth={1.75} />
      </div>
      <div className="min-w-0 space-y-2">
        <h2 className="text-lg font-semibold leading-snug">{title}</h2>
        <div className="text-muted-foreground space-y-3 text-sm leading-6">
          {children}
        </div>
      </div>
    </section>
  );
}

export function ExternalGuideLink({
  href,
  children,
  prominent = false,
}: {
  href: string;
  children: React.ReactNode;
  /** Style plus marqué (page d'import, etc.). */
  prominent?: boolean;
}) {
  return (
    <a
      href={href}
      className={
        prominent
          ? "text-primary font-semibold underline decoration-primary/50 underline-offset-4 hover:decoration-primary"
          : "text-primary font-medium underline underline-offset-2 hover:decoration-primary"
      }
      target="_blank"
      rel="noreferrer"
    >
      {children}
    </a>
  );
}

export const LUNII_ADMIN_WEB_URL = "https://lunii-admin-web.pages.dev/";
export const LUNII_ADMIN_BUILDER_URL = "https://lunii-admin-builder.pages.dev/";
