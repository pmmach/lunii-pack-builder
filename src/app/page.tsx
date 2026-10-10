import { Download, Link2, Scissors } from "lucide-react";
import { AnalyzeForm } from "@/components/analyze-form";
import {
  ExternalGuideLink,
  LUNII_ADMIN_WEB_URL,
} from "@/components/guide-article";
import { SiteShell } from "@/components/site-shell";
import { buildPageMetadata } from "@/lib/seo/metadata";
import { getSiteUrl } from "@/lib/seo/request";
import { HOME_DESCRIPTION, HOME_TITLE, SITE_NAME } from "@/lib/seo/site";

const STEPS = [
  {
    icon: Link2,
    title: "Lien",
    text: <>Colle l&apos;URL d&apos;un épisode ou d&apos;un podcast.</>,
  },
  {
    icon: Scissors,
    title: "Découpe",
    text: <>Ajuste le début/fin et la vignette.</>,
  },
  {
    icon: Download,
    title: "Export",
    text: (
      <>
        Télécharge un .zip prêt pour{" "}
        <ExternalGuideLink href={LUNII_ADMIN_WEB_URL}>
          Lunii Admin Web
        </ExternalGuideLink>
        .
      </>
    ),
  },
] as const;

export async function generateMetadata() {
  return buildPageMetadata({
    path: "/",
    title: HOME_TITLE,
    description: HOME_DESCRIPTION,
  });
}

export default async function HomePage() {
  const origin = await getSiteUrl();
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: SITE_NAME,
    applicationCategory: "MultimediaApplication",
    operatingSystem: "Web",
    inLanguage: "fr",
    description: HOME_DESCRIPTION,
    url: origin.href,
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "EUR",
    },
  };

  return (
    <SiteShell>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c"),
        }}
      />
      <section className="space-y-3 text-center">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
          {HOME_TITLE}
        </h1>
        <p className="text-muted-foreground mx-auto max-w-xl text-balance">
          Colle l&apos;URL d&apos;un podcast, on en fait un pack pour la
          Fabrique à histoires.
        </p>
        <p className="text-muted-foreground mx-auto max-w-xl text-sm text-balance">
          Usage personnel : un épisode ou une sélection d&apos;épisodes, une
          découpe, puis un fichier .zip à importer dans{" "}
          <ExternalGuideLink href={LUNII_ADMIN_WEB_URL}>
            Lunii Admin Web
          </ExternalGuideLink>
          . Indépendant de Lunii.
        </p>
      </section>

      <AnalyzeForm />

      <section className="grid gap-4 sm:grid-cols-3">
        {STEPS.map((item) => (
          <div
            key={item.title}
            className="flex flex-col items-start gap-2 rounded-lg border border-transparent p-3 motion-safe:transition-colors hover:border-border"
          >
            <item.icon className="text-primary size-5" aria-hidden />
            <h2 className="font-semibold">{item.title}</h2>
            <p className="text-muted-foreground text-sm">{item.text}</p>
          </div>
        ))}
      </section>
    </SiteShell>
  );
}
