import { ArrowRight, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { SiteShell } from "@/components/site-shell";

function CreatePackCta({ compact = false }: { compact?: boolean }) {
  return (
    <div
      className={
        compact
          ? "pt-1"
          : "rounded-2xl border border-primary/20 bg-primary/5 px-4 py-5 sm:px-5"
      }
    >
      {!compact ? (
        <p className="text-foreground mb-3 text-sm font-medium sm:text-base">
          Prêt à transformer un podcast en pack Lunii&nbsp;?
        </p>
      ) : null}
      <Link
        href="/#analyser"
        className="bg-accent text-accent-foreground hover:bg-accent/90 inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold"
      >
        Créer un pack
        <ArrowRight className="size-4" aria-hidden />
      </Link>
    </div>
  );
}

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
        <header className="space-y-4">
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
            {title}
          </h1>
          <p className="text-muted-foreground max-w-xl text-balance">{lede}</p>
          <CreatePackCta compact />
        </header>
        <div className="space-y-6">{children}</div>
        <CreatePackCta />
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
