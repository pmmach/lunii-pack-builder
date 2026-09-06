import * as cheerio from "cheerio";
import { createHash } from "node:crypto";
import { err, ok, type Result } from "@/lib/shared/result";
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
  const m = raw.match(/P(?:(\d+)Y)?(?:(\d+)M)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?/i);
  if (!m) return undefined;
  const hours = Number(m[4] ?? 0);
  const minutes = Number(m[5] ?? 0);
  const seconds = Number(m[6] ?? 0);
  const total = hours * 3600 + minutes * 60 + seconds;
  return Number.isFinite(total) ? Math.round(total) : undefined;
}

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
    // Le flux RSS ne fournit souvent qu'une image générique par item (celle
    // du podcast) : on tente de retrouver une vignette propre à chaque
    // épisode directement sur la page HTML d'origine (ex : Radio France).
    const episodes = enrichEpisodeImagesFromPage(
      $,
      pageUrl,
      parsed.data.episodes
    );
    return ok({ ...parsed.data, episodes });
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
  episodeFallback?: SourceResolution;
} {
  const $ = cheerio.load(html);
  const rssHref = findRssLink($, pageUrl);
  if (rssHref) return { rssHref };

  const jsonLd = extractAudioFromJsonLd(collectJsonLd($));
  const ogTitle = $('meta[property="og:title"]').attr("content");
  const ogImage = $('meta[property="og:image"]').attr("content");
  const ogAudio = $('meta[property="og:audio"]').attr("content");
  const pageTitle = $("title").first().text().trim();
  const title = jsonLd.title || ogTitle || pageTitle;
  const audioUrl = jsonLd.audioUrl || ogAudio;
  const imageUrl = jsonLd.imageUrl || ogImage;

  if (title && audioUrl) {
    return {
      episodeFallback: {
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
      },
    };
  }
  return {};
}
