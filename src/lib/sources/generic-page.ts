import * as cheerio from "cheerio";
import { createHash } from "node:crypto";
import { err, ok, type Result } from "@/lib/shared/result";
import {
  cleanShowTitle,
  isDirectoryUrl,
  namesMatch,
  resolveFromDirectory,
  searchItunesFeed,
} from "./directory-resolver";
import { enrichEpisodeImagesFromPage } from "./page-images";
import { parseRssFromXml } from "./rss";
import type { SourceResolution } from "./types";
import { readResponseText, safeFetch } from "./url-guard";

function absoluteUrl(href: string, base: string): string {
  try {
    return new URL(href, base).toString();
  } catch {
    return href;
  }
}

function findRssLink($: cheerio.CheerioAPI, pageUrl: string): string | undefined {
  const candidates = [
    'link[rel="alternate"][type="application/rss+xml"]',
    'link[rel="alternate"][type="application/atom+xml"]',
    'link[type="application/rss+xml"]',
  ];
  for (const sel of candidates) {
    const href = $(sel).first().attr("href");
    if (href) return absoluteUrl(href, pageUrl);
  }
  return undefined;
}

/** Hébergeurs de flux podcast publics courants (hostname exact). */
const KNOWN_FEED_HOSTS = new Set([
  "feed.ausha.co",
  "feeds.acast.com",
  "rss.buzzsprout.com",
  "feeds.megaphone.fm",
  "feeds.transistor.fm",
  "feeds.captivate.fm",
  "feeds.podcastics.com",
  "feeds.audiomeans.fr",
  "feeds.feedburner.com",
  "feed.podbean.com",
  "feeds.simplecast.com",
]);

const EMBEDDED_FEED_PATH_RE = /\/(feed|rss|podcast)(\.xml)?\/?$/i;

export function looksLikePodcastFeedUrl(rawUrl: string): boolean {
  try {
    const u = new URL(rawUrl);
    if (u.protocol !== "http:" && u.protocol !== "https:") return false;
    const host = u.hostname.toLowerCase();
    if (KNOWN_FEED_HOSTS.has(host)) return true;
    if (host.endsWith(".megaphone.fm") && host.startsWith("feeds.")) return true;
    if (host.includes("anchor.fm") && /\/(rss|podcast\/rss)\/?$/i.test(u.pathname)) {
      return true;
    }
    if (host.includes("spreaker.com") && /\/feed\/?$/i.test(u.pathname)) {
      return true;
    }
    if (EMBEDDED_FEED_PATH_RE.test(u.pathname)) return true;
    if (/\.(rss|xml)$/i.test(u.pathname) && /feed|rss|podcast/i.test(u.href)) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

/** Collecte des URLs de flux RSS potentiellement embarquées dans la page. */
export function findEmbeddedFeedUrls(
  $: cheerio.CheerioAPI,
  pageUrl: string
): string[] {
  const found: string[] = [];
  const seen = new Set<string>();

  const consider = (raw: string | undefined) => {
    if (!raw) return;
    const abs = absoluteUrl(raw.trim(), pageUrl);
    if (seen.has(abs)) return;
    if (!looksLikePodcastFeedUrl(abs)) return;
    seen.add(abs);
    found.push(abs);
  };

  $("a[href], link[href], iframe[src]").each((_, el) => {
    const attribs = (el as { attribs?: Record<string, string> }).attribs;
    consider(attribs?.href ?? attribs?.src);
  });

  // Quelques CMS injectent l'URL du flux dans des data-attributes
  $("[data-feed], [data-rss], [data-feed-url]").each((_, el) => {
    const attribs = (el as { attribs?: Record<string, string> }).attribs;
    if (!attribs) return;
    consider(attribs["data-feed"]);
    consider(attribs["data-rss"]);
    consider(attribs["data-feed-url"]);
  });

  return found;
}

function slugTokens(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function pathSlug(rawUrl: string): string {
  try {
    const parts = new URL(rawUrl).pathname.split("/").filter(Boolean);
    // Dernier segment non numérique / non "id…"
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i] ?? "";
      if (/^id\d+$/i.test(p)) continue;
      if (/^\d+$/.test(p)) continue;
      return slugTokens(decodeURIComponent(p));
    }
    return "";
  } catch {
    return "";
  }
}

export type DirectoryCandidate = {
  url: string;
  score: number;
  index: number;
};

/**
 * Score un lien d'annuaire trouvé sur une page éditeur
 * (similarité slug/titre + préférence Apple + position).
 */
export function scoreDirectoryCandidate(
  href: string,
  pageUrl: string,
  pageTitle: string,
  documentIndex: number
): number {
  let score = 0;
  try {
    const host = new URL(href).hostname.toLowerCase();
    if (host.includes("podcasts.apple.com")) score += 30;
    else if (host.includes("spotify.com")) score += 20;
    else if (host.includes("deezer.com")) score += 10;
  } catch {
    return -Infinity;
  }

  const linkSlug = pathSlug(href);
  const pagePathSlug = pathSlug(pageUrl);
  const titleTokens = slugTokens(cleanShowTitle(pageTitle));

  if (linkSlug && pagePathSlug && namesMatch(linkSlug, pagePathSlug)) {
    score += 50;
  }
  if (linkSlug && titleTokens && namesMatch(linkSlug, titleTokens)) {
    score += 40;
  }

  // Pénalité douce pour les liens plus bas dans la page (shows connexes)
  score -= Math.min(documentIndex, 40);

  return score;
}

export function findDirectoryLinksOnPage(
  $: cheerio.CheerioAPI,
  pageUrl: string
): DirectoryCandidate[] {
  const pageTitle =
    $('meta[property="og:title"]').attr("content")?.trim() ||
    $("h1").first().text().trim() ||
    $("title").first().text().trim() ||
    "";

  const candidates: DirectoryCandidate[] = [];
  const seen = new Set<string>();
  let index = 0;

  $("a[href], iframe[src]").each((_, el) => {
    const attribs = (el as { attribs?: Record<string, string> }).attribs;
    const raw = attribs?.href ?? attribs?.src;
    if (!raw) return;
    const abs = absoluteUrl(raw, pageUrl);
    index += 1;
    if (!isDirectoryUrl(abs)) return;
    // Uniquement des pages show / podcast (pas des épisodes isolés si possible)
    try {
      const u = new URL(abs);
      const path = u.pathname.toLowerCase();
      if (path.includes("/episode/") || path.includes("/episodes/")) return;
    } catch {
      return;
    }
    const canonical = abs.split("?")[0] ?? abs;
    if (seen.has(canonical)) return;
    seen.add(canonical);
    candidates.push({
      url: abs,
      score: scoreDirectoryCandidate(abs, pageUrl, pageTitle, index),
      index,
    });
  });

  return candidates.sort((a, b) => b.score - a.score || a.index - b.index);
}

export function guessShowNameFromPage($: cheerio.CheerioAPI): string | undefined {
  const og = $('meta[property="og:title"]').attr("content")?.trim();
  const h1 = $("h1").first().text().trim();
  const title = $("title").first().text().trim();
  const raw = og || h1 || title;
  if (!raw) return undefined;
  const cleaned = cleanShowTitle(raw);
  return cleaned.length >= 3 ? cleaned : undefined;
}

type JsonLdNode = Record<string, unknown>;

function asArray<T>(value: T | T[] | undefined): T[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function collectJsonLd($: cheerio.CheerioAPI): JsonLdNode[] {
  const nodes: JsonLdNode[] = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    const text = $(el).html();
    if (!text) return;
    try {
      const parsed: unknown = JSON.parse(text);
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          if (item && typeof item === "object") nodes.push(item as JsonLdNode);
        }
      } else if (parsed && typeof parsed === "object") {
        const obj = parsed as JsonLdNode;
        if (Array.isArray(obj["@graph"])) {
          for (const item of obj["@graph"]) {
            if (item && typeof item === "object") nodes.push(item as JsonLdNode);
          }
        } else {
          nodes.push(obj);
        }
      }
    } catch {
      // ignore malformed JSON-LD
    }
  });
  return nodes;
}

function typeMatches(node: JsonLdNode, types: string[]): boolean {
  const t = node["@type"];
  const list = asArray(t).map(String);
  return list.some((x) => types.some((wanted) => x.includes(wanted)));
}

function extractAudioFromJsonLd(nodes: JsonLdNode[]): {
  title?: string;
  audioUrl?: string;
  imageUrl?: string;
  description?: string;
  durationSeconds?: number;
} {
  const podcastTypes = [
    "PodcastEpisode",
    "RadioEpisode",
    "PodcastSeries",
    "RadioSeries",
  ];
  for (const node of nodes) {
    if (!typeMatches(node, podcastTypes)) continue;

    let audioUrl: string | undefined;
    const associated = node.associatedMedia;
    if (associated && typeof associated === "object") {
      const media = associated as JsonLdNode;
      if (typeof media.contentUrl === "string") audioUrl = media.contentUrl;
    }
    if (!audioUrl && typeof node.contentUrl === "string") {
      audioUrl = node.contentUrl;
    }
    // Radio France : RadioEpisode.mainEntity (AudioObject).contentUrl
    if (!audioUrl && node.mainEntity && typeof node.mainEntity === "object") {
      const main = node.mainEntity as JsonLdNode;
      if (typeof main.contentUrl === "string") audioUrl = main.contentUrl;
    }

    let imageUrl: string | undefined;
    if (typeof node.image === "string") imageUrl = node.image;
    else if (node.image && typeof node.image === "object") {
      const img = node.image as JsonLdNode;
      if (typeof img.url === "string") imageUrl = img.url;
    }

    let durationSeconds: number | undefined;
    if (node.mainEntity && typeof node.mainEntity === "object") {
      const main = node.mainEntity as JsonLdNode;
      if (typeof main.duration === "string") {
        durationSeconds = parseIso8601Duration(main.duration);
      }
    }

    return {
      title: typeof node.name === "string" ? node.name : undefined,
      audioUrl,
      imageUrl,
      description:
        typeof node.description === "string" ? node.description : undefined,
      durationSeconds,
    };
  }
  return {};
}

/** Parse ISO 8601 duration (ex: P0Y0M0DT0H10M25S) → secondes. */
function parseIso8601Duration(raw: string): number | undefined {
  const m = raw.match(
    /P(?:(\d+)Y)?(?:(\d+)M)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?/i
  );
  if (!m) return undefined;
  const hours = Number(m[4] ?? 0);
  const minutes = Number(m[5] ?? 0);
  const seconds = Number(m[6] ?? 0);
  const total = hours * 3600 + minutes * 60 + seconds;
  return Number.isFinite(total) ? Math.round(total) : undefined;
}

async function tryParseFeedUrl(
  feedUrl: string,
  resolvedFrom: SourceResolution["resolvedFrom"],
  $: cheerio.CheerioAPI,
  pageUrl: string,
  enrichImages: boolean
): Promise<Result<SourceResolution> | null> {
  const feedFetched = await safeFetch(feedUrl);
  if (!feedFetched.ok) return null;
  const xml = await readResponseText(feedFetched.data);
  if (!xml.ok) return null;
  const parsed = await parseRssFromXml(xml.data, feedUrl, resolvedFrom);
  if (!parsed.ok) return null;
  if (enrichImages) {
    const episodes = enrichEpisodeImagesFromPage(
      $,
      pageUrl,
      parsed.data.episodes
    );
    return ok({ ...parsed.data, episodes });
  }
  return parsed;
}

const MAX_DIRECTORY_CANDIDATES = 3;

export async function resolveFromHtmlBody(
  html: string,
  pageUrl: string
): Promise<Result<SourceResolution>> {
  const $ = cheerio.load(html);
  const rssHref = findRssLink($, pageUrl);

  if (rssHref) {
    const feedFetched = await safeFetch(rssHref);
    if (!feedFetched.ok) return feedFetched;
    const xml = await readResponseText(feedFetched.data);
    if (!xml.ok) return xml;
    const parsed = await parseRssFromXml(xml.data, rssHref, "page-discovery");
    if (!parsed.ok) return parsed;
    const episodes = enrichEpisodeImagesFromPage(
      $,
      pageUrl,
      parsed.data.episodes
    );
    return ok({ ...parsed.data, episodes });
  }

  // Flux embarqué (Ausha, Acast, etc.) sans balise <link rel="alternate">
  for (const feedUrl of findEmbeddedFeedUrls($, pageUrl)) {
    const resolved = await tryParseFeedUrl(
      feedUrl,
      "page-discovery",
      $,
      pageUrl,
      true
    );
    if (resolved?.ok) return resolved;
  }

  // Fallback JSON-LD / OG without RSS
  const jsonLd = extractAudioFromJsonLd(collectJsonLd($));
  const ogTitle = $('meta[property="og:title"]').attr("content");
  const ogImage = $('meta[property="og:image"]').attr("content");
  const ogAudio = $('meta[property="og:audio"]').attr("content");
  const pageTitle = $("title").first().text().trim();

  const title = jsonLd.title || ogTitle || pageTitle;
  const audioUrl = jsonLd.audioUrl || ogAudio;
  const imageUrl = jsonLd.imageUrl || ogImage;

  if (title && audioUrl) {
    return ok({
      kind: "episode",
      showTitle: title,
      showImageUrl: imageUrl,
      feedUrl: pageUrl,
      resolvedFrom: "page-discovery",
      episodes: [
        {
          id: createHash("sha1").update(audioUrl).digest("hex"),
          title,
          description: jsonLd.description,
          audioUrl: absoluteUrl(audioUrl, pageUrl),
          imageUrl: imageUrl ? absoluteUrl(imageUrl, pageUrl) : undefined,
          durationSeconds: jsonLd.durationSeconds,
        },
      ],
    });
  }

  // Liens Apple / Spotify / Deezer sur la page (ex. Bayard)
  const directoryLinks = findDirectoryLinksOnPage($, pageUrl).slice(
    0,
    MAX_DIRECTORY_CANDIDATES
  );
  for (const candidate of directoryLinks) {
    // Score minimal : un lien Apple/Spotify précoce sans match de slug
    // reste viable ; les shows connexes en bas de page sont pénalisés
    if (candidate.score < 10) continue;
    const resolved = await resolveFromDirectory(candidate.url);
    if (resolved.ok) {
      const episodes = enrichEpisodeImagesFromPage(
        $,
        pageUrl,
        resolved.data.episodes
      );
      return ok({ ...resolved.data, episodes });
    }
  }

  // Dernier recours : recherche iTunes sur le titre de la page
  const guessedName = guessShowNameFromPage($);
  if (guessedName) {
    const feedResult = await searchItunesFeed(guessedName);
    if (feedResult.ok) {
      const resolved = await tryParseFeedUrl(
        feedResult.data.feedUrl,
        "directory-search",
        $,
        pageUrl,
        true
      );
      if (resolved?.ok) return resolved;
    }
  }

  return err(
    "Cette page n'est pas reconnue comme un podcast (aucun flux RSS trouvé).",
    "UNSUPPORTED_SOURCE"
  );
}

export async function discoverFromHtmlPage(
  pageUrl: string
): Promise<Result<SourceResolution>> {
  const fetched = await safeFetch(pageUrl);
  if (!fetched.ok) return fetched;

  const contentType = fetched.data.headers.get("content-type") ?? "";
  if (
    contentType.includes("xml") ||
    contentType.includes("rss") ||
    contentType.includes("atom")
  ) {
    const text = await readResponseText(fetched.data);
    if (!text.ok) return text;
    return parseRssFromXml(text.data, pageUrl, "direct");
  }

  const htmlResult = await readResponseText(fetched.data);
  if (!htmlResult.ok) return htmlResult;

  return resolveFromHtmlBody(htmlResult.data, pageUrl);
}

/** Exposé pour les tests unitaires (sans réseau). */
export function discoverFromHtmlString(
  html: string,
  pageUrl: string
): {
  rssHref?: string;
  embeddedFeedUrls?: string[];
  directoryCandidates?: DirectoryCandidate[];
  guessedShowName?: string;
  episodeFallback?: SourceResolution;
} {
  const $ = cheerio.load(html);
  const rssHref = findRssLink($, pageUrl);
  if (rssHref) return { rssHref };

  const embeddedFeedUrls = findEmbeddedFeedUrls($, pageUrl);
  const directoryCandidates = findDirectoryLinksOnPage($, pageUrl);
  const guessedShowName = guessShowNameFromPage($);

  const jsonLd = extractAudioFromJsonLd(collectJsonLd($));
  const ogTitle = $('meta[property="og:title"]').attr("content");
  const ogImage = $('meta[property="og:image"]').attr("content");
  const ogAudio = $('meta[property="og:audio"]').attr("content");
  const pageTitle = $("title").first().text().trim();
  const title = jsonLd.title || ogTitle || pageTitle;
  const audioUrl = jsonLd.audioUrl || ogAudio;
  const imageUrl = jsonLd.imageUrl || ogImage;

  const result: ReturnType<typeof discoverFromHtmlString> = {
    embeddedFeedUrls,
    directoryCandidates,
    guessedShowName,
  };

  if (title && audioUrl) {
    result.episodeFallback = {
      kind: "episode",
      showTitle: title,
      showImageUrl: imageUrl,
      feedUrl: pageUrl,
      resolvedFrom: "page-discovery",
      episodes: [
        {
          id: createHash("sha1").update(audioUrl).digest("hex"),
          title,
          description: jsonLd.description,
          audioUrl: absoluteUrl(audioUrl, pageUrl),
          imageUrl: imageUrl ? absoluteUrl(imageUrl, pageUrl) : undefined,
          durationSeconds: jsonLd.durationSeconds,
        },
      ],
    };
  }
  return result;
}
