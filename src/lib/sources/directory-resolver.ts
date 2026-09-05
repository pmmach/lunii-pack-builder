import * as cheerio from "cheerio";
import { err, ok, type Result } from "@/lib/shared/result";
import { parseRssFromXml } from "./rss";
import type { SourceResolution } from "./types";
import { readResponseText, safeFetch } from "./url-guard";

const DIRECTORY_HOSTS = [
  "open.spotify.com",
  "podcasts.apple.com",
  "www.deezer.com",
  "deezer.com",
];

export function isDirectoryUrl(rawUrl: string): boolean {
  try {
    const host = new URL(rawUrl).hostname.toLowerCase();
    return DIRECTORY_HOSTS.some(
      (h) => host === h || host.endsWith(`.${h}`)
    );
  } catch {
    return false;
  }
}

function normalizeForCompare(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Distance de Levenshtein simple. */
export function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    Array.from({ length: n + 1 }, () => 0)
  );
  for (let i = 0; i <= m; i++) {
    const row = dp[i];
    if (row) row[0] = i;
  }
  for (let j = 0; j <= n; j++) {
    const row0 = dp[0];
    if (row0) row0[j] = j;
  }
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const row = dp[i];
      const prev = dp[i - 1];
      if (!row || !prev) continue;
      row[j] = Math.min(
        (prev[j] ?? 0) + 1,
        (row[j - 1] ?? 0) + 1,
        (prev[j - 1] ?? 0) + cost
      );
    }
  }
  return dp[m]?.[n] ?? 0;
}

export function namesMatch(query: string, candidate: string): boolean {
  const q = normalizeForCompare(query);
  const c = normalizeForCompare(candidate);
  if (!q || !c) return false;
  if (q === c) return true;
  if (c.includes(q) || q.includes(c)) return true;
  const maxLen = Math.max(q.length, c.length);
  if (maxLen === 0) return false;
  const distance = levenshtein(q, c);
  return distance / maxLen <= 0.25;
}

async function fetchShowName(rawUrl: string): Promise<Result<string>> {
  const host = new URL(rawUrl).hostname.toLowerCase();

  if (host.includes("spotify.com")) {
    const oembedUrl = `https://open.spotify.com/oembed?url=${encodeURIComponent(rawUrl)}`;
    const fetched = await safeFetch(oembedUrl);
    if (!fetched.ok) return fetched;
    const text = await readResponseText(fetched.data);
    if (!text.ok) return text;
    try {
      const json = JSON.parse(text.data) as { title?: string };
      if (json.title?.trim()) return ok(json.title.trim());
    } catch {
      return err("Impossible de lire le titre Spotify", "OEMBED_FAILED");
    }
  }

  // Apple / Deezer / fallback : og:title ou <title>
  const page = await safeFetch(rawUrl);
  if (!page.ok) return page;
  const html = await readResponseText(page.data);
  if (!html.ok) return html;
  const $ = cheerio.load(html.data);
  const og = $('meta[property="og:title"]').attr("content")?.trim();
  const title = og || $("title").first().text().trim();
  if (!title) {
    return err("Impossible d'obtenir le nom de l'émission", "NO_SHOW_NAME");
  }
  return ok(title);
}

type ItunesResult = {
  collectionName?: string;
  feedUrl?: string;
};

export async function searchItunesFeed(
  showName: string
): Promise<Result<{ feedUrl: string; collectionName: string }>> {
  const searchUrl = `https://itunes.apple.com/search?term=${encodeURIComponent(showName)}&entity=podcast&limit=5`;
  const fetched = await safeFetch(searchUrl);
  if (!fetched.ok) return fetched;
  const text = await readResponseText(fetched.data);
  if (!text.ok) return text;

  let results: ItunesResult[] = [];
  try {
    const json = JSON.parse(text.data) as { results?: ItunesResult[] };
    results = json.results ?? [];
  } catch {
    return err("Réponse iTunes invalide", "ITUNES_ERROR");
  }

  for (const item of results) {
    if (
      item.feedUrl &&
      item.collectionName &&
      namesMatch(showName, item.collectionName)
    ) {
      return ok({
        feedUrl: item.feedUrl,
        collectionName: item.collectionName,
      });
    }
  }

  return err(
    "Impossible de trouver un flux RSS public pour cette émission. Les plateformes comme Spotify ne permettent pas le téléchargement direct de l'audio.",
    "NO_PUBLIC_FEED"
  );
}

export async function resolveFromDirectory(
  rawUrl: string
): Promise<Result<SourceResolution>> {
  if (!isDirectoryUrl(rawUrl)) {
    return err(
      "Cette page n'est pas reconnue comme un podcast (aucun flux RSS trouvé).",
      "UNSUPPORTED_SOURCE"
    );
  }

  const nameResult = await fetchShowName(rawUrl);
  if (!nameResult.ok) return nameResult;

  const feedResult = await searchItunesFeed(nameResult.data);
  if (!feedResult.ok) return feedResult;

  const feedFetched = await safeFetch(feedResult.data.feedUrl);
  if (!feedFetched.ok) return feedFetched;
  const xml = await readResponseText(feedFetched.data);
  if (!xml.ok) return xml;

  return parseRssFromXml(xml.data, feedResult.data.feedUrl, "directory-search");
}

/** Helpers testables sans réseau. */
export function pickItunesMatch(
  showName: string,
  results: ItunesResult[]
): { feedUrl: string; collectionName: string } | null {
  for (const item of results) {
    if (
      item.feedUrl &&
      item.collectionName &&
      namesMatch(showName, item.collectionName)
    ) {
      return { feedUrl: item.feedUrl, collectionName: item.collectionName };
    }
  }
  return null;
}
