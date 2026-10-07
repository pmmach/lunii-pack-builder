export const SOURCE_KINDS = [
  "rss",
  "page",
  "spotify",
  "apple",
  "deezer",
  "radiofrance",
  "annuaire",
  "autre",
] as const;

export type SourceKind = (typeof SOURCE_KINDS)[number];

export const SOURCE_KIND_LABELS: Record<SourceKind, string> = {
  rss: "Flux RSS",
  page: "Page web",
  spotify: "Spotify",
  apple: "Apple Podcasts",
  deezer: "Deezer",
  radiofrance: "Radio France",
  annuaire: "Annuaire",
  autre: "Autre",
};

const KIND_SET = new Set<string>(SOURCE_KINDS);

export function isSourceKind(value: string): value is SourceKind {
  return KIND_SET.has(value);
}

function hostKind(host: string): SourceKind | undefined {
  if (host === "spotify.com" || host.endsWith(".spotify.com")) return "spotify";
  if (host === "podcasts.apple.com" || host.endsWith(".podcasts.apple.com")) {
    return "apple";
  }
  if (host === "deezer.com" || host.endsWith(".deezer.com")) return "deezer";
  if (host === "radiofrance.fr" || host.endsWith(".radiofrance.fr")) {
    return "radiofrance";
  }
  return undefined;
}

function pathLooksLikeFeed(url: URL): boolean {
  const path = url.pathname.toLowerCase();
  return (
    /\/(feed|rss|podcast)(\.xml)?\/?$/i.test(path) ||
    (/\.(rss|xml)$/i.test(path) && /feed|rss|podcast/i.test(url.href))
  );
}

/**
 * Classe une source sans conserver l'URL : famille connue, ou le mode de résolution.
 */
export function classifySourceKind(
  rawUrl: string,
  resolvedFrom?: "direct" | "page-discovery" | "directory-search"
): SourceKind {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return "autre";
  }

  const fromHost = hostKind(url.hostname.toLowerCase());
  if (fromHost) return fromHost;
  if (resolvedFrom === "direct") return "rss";
  if (resolvedFrom === "page-discovery") return "page";
  if (resolvedFrom === "directory-search") return "annuaire";
  if (pathLooksLikeFeed(url)) return "rss";
  return "autre";
}
