import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  discoverFromHtmlString,
  findDirectoryLinksOnPage,
  findEmbeddedFeedUrls,
  looksLikePodcastFeedUrl,
  resolveFromHtmlBody,
  scoreDirectoryCandidate,
} from "./generic-page";
import { setDnsLookupForTests } from "./url-guard";
import * as cheerio from "cheerio";

const linkPage = readFileSync(
  path.join(__dirname, "__fixtures__", "sample-page-with-link.html"),
  "utf-8"
);
const jsonLdPage = readFileSync(
  path.join(__dirname, "__fixtures__", "sample-page-jsonld.html"),
  "utf-8"
);

const feedXml = readFileSync(
  path.join(__dirname, "__fixtures__", "sample-feed.xml"),
  "utf-8"
);
const episodeCardsPage = readFileSync(
  path.join(__dirname, "__fixtures__", "sample-page-episode-cards.html"),
  "utf-8"
);
const directoryLinksPage = readFileSync(
  path.join(__dirname, "__fixtures__", "sample-page-directory-links.html"),
  "utf-8"
);
const embeddedFeedPage = readFileSync(
  path.join(__dirname, "__fixtures__", "sample-page-embedded-feed.html"),
  "utf-8"
);

afterEach(() => {
  setDnsLookupForTests(null);
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("discoverFromHtmlString", () => {
  it("trouve le lien RSS alternate", () => {
    const result = discoverFromHtmlString(
      linkPage,
      "https://example.com/show"
    );
    expect(result.rssHref).toBe("https://example.com/feed.xml");
  });

  it("construit un épisode depuis JSON-LD sans RSS", () => {
    const result = discoverFromHtmlString(
      jsonLdPage,
      "https://example.com/episode"
    );
    expect(result.episodeFallback).toBeDefined();
    expect(result.episodeFallback?.kind).toBe("episode");
    expect(result.episodeFallback?.episodes[0]?.title).toBe(
      "L'anémone de mer"
    );
    expect(result.episodeFallback?.episodes[0]?.audioUrl).toBe(
      "https://example.com/audio.mp3"
    );
  });

  it("détecte les liens d'annuaire et préfère le show correspondant au slug", () => {
    const result = discoverFromHtmlString(
      directoryLinksPage,
      "https://editeur.example/podcasts/la-grande-histoire-de-pomme-d-api/"
    );
    expect(result.rssHref).toBeUndefined();
    expect(result.directoryCandidates?.length).toBeGreaterThanOrEqual(2);
    const top = result.directoryCandidates?.[0];
    expect(top?.url).toContain("podcasts.apple.com");
    expect(top?.url).toContain("la-grande-histoire-de-pomme-dapi");
    expect(top?.url).not.toContain("ariol");
  });

  it("détecte un flux Ausha embarqué", () => {
    const result = discoverFromHtmlString(
      embeddedFeedPage,
      "https://example.com/show"
    );
    expect(result.embeddedFeedUrls).toContain(
      "https://feed.ausha.co/B6r8OclKP6gn"
    );
    expect(result.embeddedFeedUrls).not.toContain(
      "https://image.ausha.co/cover.jpeg"
    );
  });
});

describe("looksLikePodcastFeedUrl", () => {
  it("accepte les hébergeurs connus et refuse les images", () => {
    expect(looksLikePodcastFeedUrl("https://feed.ausha.co/B6r8OclKP6gn")).toBe(
      true
    );
    expect(looksLikePodcastFeedUrl("https://image.ausha.co/cover.jpeg")).toBe(
      false
    );
    expect(
      looksLikePodcastFeedUrl("https://www.spreaker.com/show/1/episodes/feed")
    ).toBe(true);
  });
});

describe("scoreDirectoryCandidate", () => {
  it("favorise Apple + slug proche du path de la page", () => {
    const page =
      "https://editeur.example/podcasts/la-grande-histoire-de-pomme-d-api/";
    const title = "La grande histoire de Pomme d'Api";
    const appleMain = scoreDirectoryCandidate(
      "https://podcasts.apple.com/fr/podcast/la-grande-histoire-de-pomme-dapi/id1457819198",
      page,
      title,
      2
    );
    const appleOther = scoreDirectoryCandidate(
      "https://podcasts.apple.com/fr/podcast/ariol/id1842294842",
      page,
      title,
      20
    );
    expect(appleMain).toBeGreaterThan(appleOther);
  });
});

describe("findDirectoryLinksOnPage / findEmbeddedFeedUrls", () => {
  it("trie les candidats par score décroissant", () => {
    const $ = cheerio.load(directoryLinksPage);
    const ranked = findDirectoryLinksOnPage(
      $,
      "https://editeur.example/podcasts/la-grande-histoire-de-pomme-d-api/"
    );
    expect(ranked[0]?.url).toContain("la-grande-histoire-de-pomme-dapi");
  });

  it("ignore image.ausha.co", () => {
    const $ = cheerio.load(embeddedFeedPage);
    const feeds = findEmbeddedFeedUrls($, "https://example.com/show");
    expect(feeds).toEqual(["https://feed.ausha.co/B6r8OclKP6gn"]);
  });
});

describe("resolveFromHtmlBody", () => {
  it("fetch le flux RSS découvert (fetch mocké)", async () => {
    setDnsLookupForTests(
      (async () => [{ address: "93.184.216.34", family: 4 }]) as never
    );

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        return new Response(feedXml, {
          status: 200,
          headers: { "content-type": "application/rss+xml" },
        });
      })
    );

    const result = await resolveFromHtmlBody(
      linkPage,
      "https://example.com/show"
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.resolvedFrom).toBe("page-discovery");
    expect(result.data.episodes.length).toBeGreaterThan(0);
  });

  it("associe une image par épisode trouvée sur la page quand le flux RSS n'a qu'une image générique", async () => {
    setDnsLookupForTests(
      (async () => [{ address: "93.184.216.34", family: 4 }]) as never
    );

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        return new Response(feedXml, {
          status: 200,
          headers: { "content-type": "application/rss+xml" },
        });
      })
    );

    const result = await resolveFromHtmlBody(
      episodeCardsPage,
      "https://example.com/show"
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const recent = result.data.episodes.find(
      (e) => e.title === "Épisode récent"
    );
    const moyen = result.data.episodes.find(
      (e) => e.title === "Épisode moyen"
    );
    const court = result.data.episodes.find(
      (e) => e.title === "Épisode court"
    );

    expect(recent?.imageUrl).toBe(
      "https://example.com/images/episode-recent.jpg"
    );
    expect(moyen?.imageUrl).toBe(
      "https://example.com/images/episode-moyen.jpg"
    );
    expect(court?.imageUrl).toBe("https://example.com/show.jpg");
  });

  it("résout via flux Ausha embarqué (page-discovery)", async () => {
    setDnsLookupForTests(
      (async () => [{ address: "93.184.216.34", family: 4 }]) as never
    );

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("feed.ausha.co")) {
          return new Response(feedXml, {
            status: 200,
            headers: { "content-type": "application/rss+xml" },
          });
        }
        return new Response("not found", { status: 404 });
      })
    );

    const result = await resolveFromHtmlBody(
      embeddedFeedPage,
      "https://example.com/show"
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.resolvedFrom).toBe("page-discovery");
    expect(result.data.feedUrl).toBe("https://feed.ausha.co/B6r8OclKP6gn");
  });

  it("résout via lien Apple scoré (directory-search + lookup id)", async () => {
    setDnsLookupForTests(
      (async () => [{ address: "93.184.216.34", family: 4 }]) as never
    );

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("itunes.apple.com/lookup")) {
          return new Response(
            JSON.stringify({
              results: [
                {
                  collectionName: "La grande histoire de Pomme d'Api",
                  feedUrl: "https://feed.ausha.co/B6r8OclKP6gn",
                },
              ],
            }),
            {
              status: 200,
              headers: { "content-type": "application/json" },
            }
          );
        }
        if (url.includes("feed.ausha.co")) {
          return new Response(feedXml, {
            status: 200,
            headers: { "content-type": "application/rss+xml" },
          });
        }
        return new Response("not found", { status: 404 });
      })
    );

    const result = await resolveFromHtmlBody(
      directoryLinksPage,
      "https://editeur.example/podcasts/la-grande-histoire-de-pomme-d-api/"
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.resolvedFrom).toBe("directory-search");
    expect(result.data.feedUrl).toBe("https://feed.ausha.co/B6r8OclKP6gn");
  });
});
