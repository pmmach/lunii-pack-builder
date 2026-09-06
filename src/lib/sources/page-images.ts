import type { CheerioAPI } from "cheerio";
import type { Element } from "domhandler";
import type { EpisodeMeta } from "./types";

const TITLE_CANDIDATE_SELECTOR = "a,h1,h2,h3,h4,h5,h6,p,span,div,li";
const MEDIA_SELECTOR = "img[src], img[srcset], source[srcset]";
const MAX_ANCESTOR_DEPTH = 8;
const MIN_TITLE_LENGTH = 4;

function absoluteUrl(href: string, base: string): string {
  try {
    return new URL(href, base).toString();
  } catch {
    return href;
  }
}

function normalizeTitle(text: string): string {
  return text.normalize("NFC").replace(/\s+/g, " ").trim().toLowerCase();
}

function looksLikeIcon(url: string): boolean {
  const lower = url.toLowerCase();
  return (
    lower.endsWith(".svg") ||
    lower.includes("logo") ||
    lower.includes("icon") ||
    lower.includes("favicon") ||
    lower.includes("sprite")
  );
}

function bestMediaUrl(
  $: CheerioAPI,
  el: Element,
  pageUrl: string
): string | undefined {
  const node = $(el);
  if (node.is("img")) {
    const src = node.attr("src");
    if (src && !src.startsWith("data:")) return absoluteUrl(src, pageUrl);
    const srcset = node.attr("srcset");
    if (srcset) {
      const first = srcset.split(",")[0]?.trim().split(/\s+/)[0];
      if (first) return absoluteUrl(first, pageUrl);
    }
    return undefined;
  }
  if (node.is("source")) {
    const srcset = node.attr("srcset");
    if (!srcset) return undefined;
    const candidates = srcset
      .split(",")
      .map((c) => c.trim().split(/\s+/)[0])
      .filter((c): c is string => Boolean(c));
    const last = candidates[candidates.length - 1];
    return last ? absoluteUrl(last, pageUrl) : undefined;
  }
  return undefined;
}

/**
 * Indexe les éléments du DOM par texte normalisé, en ne conservant que
 * l'élément le plus spécifique (le moins d'enfants) pour chaque texte — en
 * général le lien/titre exact d'une carte d'épisode plutôt qu'un conteneur
 * englobant plus large partageant le même texte.
 */
function buildTitleIndex($: CheerioAPI): Map<string, Element> {
  const childCounts = new Map<string, number>();
  const index = new Map<string, Element>();
  $(TITLE_CANDIDATE_SELECTOR).each((_, el) => {
    const node = $(el);
    const normalized = normalizeTitle(node.text());
    if (normalized.length < MIN_TITLE_LENGTH) return;
    const childCount = node.children().length;
    const previous = childCounts.get(normalized);
    if (previous === undefined || childCount < previous) {
      childCounts.set(normalized, childCount);
      index.set(normalized, el);
    }
  });
  return index;
}

function findImageNearElement(
  $: CheerioAPI,
  el: Element,
  pageUrl: string
): string | undefined {
  let container = $(el);
  for (let depth = 0; depth <= MAX_ANCESTOR_DEPTH; depth++) {
    const mediaEl = container.find(MEDIA_SELECTOR).first().get(0);
    if (mediaEl) {
      const url = bestMediaUrl($, mediaEl, pageUrl);
      if (url && !looksLikeIcon(url)) return url;
    }
    container = container.parent();
    if (container.length === 0) break;
  }
  return undefined;
}

/**
 * Tente d'associer à chaque épisode une image spécifique trouvée sur la page
 * HTML d'origine, par correspondance exacte de titre. Utile pour les pages
 * qui listent plusieurs épisodes avec une vignette propre à chacun (ex :
 * pages podcasts Radio France) alors que le flux RSS associé ne fournit
 * souvent qu'une image générique identique pour tous les items.
 *
 * N'écrase l'image d'un épisode que si une correspondance de titre exacte et
 * une image exploitable ont été trouvées ; sinon l'épisode est renvoyé tel
 * quel (l'image issue du flux RSS reste le fallback).
 */
export function enrichEpisodeImagesFromPage(
  $: CheerioAPI,
  pageUrl: string,
  episodes: EpisodeMeta[]
): EpisodeMeta[] {
  if (episodes.length === 0) return episodes;
  const titleIndex = buildTitleIndex($);
  if (titleIndex.size === 0) return episodes;

  return episodes.map((episode) => {
    const el = titleIndex.get(normalizeTitle(episode.title));
    if (!el) return episode;
    const imageUrl = findImageNearElement($, el, pageUrl);
    if (!imageUrl) return episode;
    return { ...episode, imageUrl };
  });
}
