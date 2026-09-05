import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  discoverFromHtmlString,
  resolveFromHtmlBody,
} from "./generic-page";
import { setDnsLookupForTests } from "./url-guard";

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
});
