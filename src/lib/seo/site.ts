export const SITE_NAME = "Lunii Pack Builder";

export const HOME_TITLE = "Transformer un podcast en pack Lunii";

export const HOME_DESCRIPTION =
  "Colle l'URL d'un podcast et télécharge un pack .zip pour la Fabrique à histoires, à importer dans Lunii Admin Web. Usage personnel, flux publics.";

export type PublicPage = {
  path: string;
  title: string;
  description: string;
  priority: number;
};

export const GUIDE_PAGES: readonly PublicPage[] = [
  {
    path: "/guides/importer",
    title: "Importer le pack sur la Lunii",
    description:
      "Après le téléchargement du .zip : l'importer dans Lunii Admin Web ou Lunii Admin Builder, puis l'installer sur la Fabrique à histoires.",
    priority: 0.8,
  },
  {
    path: "/guides/un-ou-plusieurs-episodes",
    title: "Un épisode ou plusieurs dans le même pack",
    description:
      "Crée un pack avec une histoire, ou une sélection d'épisodes : images, navigation, titres audio TTS et zip prêt pour Lunii Admin Web.",
    priority: 0.7,
  },
  {
    path: "/guides/sources",
    title: "Quelles adresses de podcast fonctionnent",
    description:
      "Flux RSS public, page du podcast, ou lien Apple Podcasts, Spotify et Deezer pour retrouver le flux équivalent. Pas d'extraction audio.",
    priority: 0.7,
  },
];

export function guidePage(path: string): PublicPage {
  const page = GUIDE_PAGES.find((item) => item.path === path);
  if (!page) throw new Error(`Guide inconnu: ${path}`);
  return page;
}

export const PUBLIC_PAGES: readonly PublicPage[] = [
  {
    path: "/",
    title: HOME_TITLE,
    description: HOME_DESCRIPTION,
    priority: 1,
  },
  ...GUIDE_PAGES,
];

export function isSafeHost(host: string): boolean {
  return /^[a-z0-9.-]+(?::\d{1,5})?$/i.test(host);
}

export function parseHttpOrigin(raw: string | undefined): URL | null {
  if (!raw?.trim()) return null;
  try {
    const url = new URL(raw.trim());
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return new URL(url.origin);
  } catch {
    return null;
  }
}

export function siteUrlFromParts(
  configured: string | undefined,
  host: string | null,
  proto: string | null,
): URL {
  const fromEnv = parseHttpOrigin(configured);
  if (fromEnv) return fromEnv;

  const firstHost = host?.split(",")[0]?.trim() ?? "";
  if (isSafeHost(firstHost)) {
    const firstProto = proto?.split(",")[0]?.trim();
    const protocol =
      firstProto === "http" || firstProto === "https"
        ? firstProto
        : firstHost.startsWith("localhost") || firstHost.startsWith("127.0.0.1")
          ? "http"
          : "https";
    return new URL(`${protocol}://${firstHost}`);
  }

  return new URL("http://localhost:3000");
}
