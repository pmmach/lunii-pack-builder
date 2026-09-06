import { createHash } from "node:crypto";
import Parser from "rss-parser";
import { err, ok, type Result } from "@/lib/shared/result";
import type { EpisodeMeta, SourceResolution } from "./types";

const parser = new Parser({
  timeout: 10_000,
  customFields: {
    item: [
      ["itunes:duration", "itunesDuration"],
      ["itunes:image", "itunesImage", { keepArray: false }],
    ],
  },
});

const MAX_EPISODES = 100;
const MAX_DESCRIPTION = 500;

export function parseDurationToSeconds(
  raw: string | number | undefined
): number | undefined {
  if (raw === undefined || raw === null || raw === "") return undefined;
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return Math.max(0, Math.round(raw));
  }
  const str = String(raw).trim();
  if (/^\d+(\.\d+)?$/.test(str)) {
    return Math.max(0, Math.round(Number(str)));
  }
  const parts = str.split(":").map((p) => Number(p));
  if (parts.some((p) => Number.isNaN(p))) return undefined;
  if (parts.length === 3) {
    const [h = 0, m = 0, s = 0] = parts;
    return Math.round(h * 3600 + m * 60 + s);
  }
  if (parts.length === 2) {
    const [m = 0, s = 0] = parts;
    return Math.round(m * 60 + s);
  }
  return undefined;
}

function truncate(text: string | undefined, max: number): string | undefined {
  if (!text) return undefined;
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (!cleaned) return undefined;
  return cleaned.length > max ? `${cleaned.slice(0, max - 1)}…` : cleaned;
}

function episodeId(guid: string | undefined, audioUrl: string): string {
  if (guid && guid.trim()) return guid.trim();
  return createHash("sha1").update(audioUrl).digest("hex");
}

function isAudioEnclosure(url: string, type?: string): boolean {
  if (type && type.toLowerCase().startsWith("audio/")) return true;
  const lower = url.toLowerCase();
  return (
    lower.includes(".mp3") ||
    lower.includes(".m4a") ||
    lower.includes(".aac") ||
    lower.includes(".ogg") ||
    lower.includes(".wav") ||
    lower.includes("audio")
  );
}

type FeedItem = {
  title?: string;
  contentSnippet?: string;
  content?: string;
  guid?: string;
  link?: string;
  isoDate?: string;
  pubDate?: string;
  enclosure?: { url?: string; type?: string };
  itunesDuration?: string;
  itunesImage?: string | { href?: string };
  itunes?: { duration?: string; image?: string };
};

function extractImage(
  item: FeedItem,
  feedImage?: string
): string | undefined {
  if (typeof item.itunesImage === "string") return item.itunesImage;
  if (item.itunesImage && typeof item.itunesImage === "object" && item.itunesImage.href) {
    return item.itunesImage.href;
  }
  if (item.itunes?.image) return item.itunes.image;
  return feedImage;
}

type ParsedFeed = {
  title?: string;
  image?: { url?: string };
  itunes?: { image?: string; author?: string };
  managingEditor?: string;
  creator?: string;
  items?: FeedItem[];
};

export function buildEpisodesFromFeed(
  feed: ParsedFeed,
  feedUrl: string
): Result<SourceResolution> {
  const feedImage =
    feed.image?.url ||
    (feed as { itunes?: { image?: string } }).itunes?.image ||
    undefined;

  const feedAuthor = truncate(
    feed.itunes?.author || feed.managingEditor || feed.creator,
    200
  );

  const episodes: EpisodeMeta[] = [];

  for (const raw of feed.items ?? []) {
    const item = raw as FeedItem;
    const audioUrl = item.enclosure?.url;
    if (!audioUrl || !isAudioEnclosure(audioUrl, item.enclosure?.type)) {
      continue;
    }

    const durationRaw =
      item.itunesDuration ?? item.itunes?.duration ?? undefined;

    episodes.push({
      id: episodeId(item.guid, audioUrl),
      title: item.title?.trim() || "Épisode sans titre",
      description: truncate(
        item.contentSnippet || item.content,
        MAX_DESCRIPTION
      ),
      audioUrl,
      imageUrl: extractImage(item, feedImage),
      durationSeconds: parseDurationToSeconds(durationRaw),
      publishedAt: item.isoDate || (item.pubDate ? new Date(item.pubDate).toISOString() : undefined),
    });
  }

  if (episodes.length === 0) {
    return err(
      "Aucun épisode audio exploitable trouvé dans ce flux.",
      "NO_EPISODES"
    );
  }

  episodes.sort((a, b) => {
    const da = a.publishedAt ? Date.parse(a.publishedAt) : 0;
    const db = b.publishedAt ? Date.parse(b.publishedAt) : 0;
    return db - da;
  });

  const limited = episodes.slice(0, MAX_EPISODES);

  return ok({
    kind: "show",
    showTitle: feed.title?.trim() || "Podcast",
    showAuthor: feedAuthor,
    showImageUrl: feedImage,
    feedUrl,
    episodes: limited,
  });
}

export async function parseRssFeed(
  xmlOrUrl: string,
  feedUrl: string,
  resolvedFrom: SourceResolution["resolvedFrom"]
): Promise<Result<SourceResolution>> {
  try {
    const feed = xmlOrUrl.trim().startsWith("<")
      ? await parser.parseString(xmlOrUrl)
      : await parser.parseURL(xmlOrUrl);
    const built = buildEpisodesFromFeed(feed, feedUrl);
    if (!built.ok) return built;
    return ok({ ...built.data, resolvedFrom });
  } catch {
    return err(
      "Impossible de lire ce flux RSS (XML invalide ou inaccessible).",
      "INVALID_FEED"
    );
  }
}

export async function parseRssFromXml(
  xml: string,
  feedUrl: string,
  resolvedFrom: SourceResolution["resolvedFrom"]
): Promise<Result<SourceResolution>> {
  return parseRssFeed(xml, feedUrl, resolvedFrom);
}
