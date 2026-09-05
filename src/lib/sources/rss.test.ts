import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildEpisodesFromFeed, parseDurationToSeconds, parseRssFromXml } from "./rss";
import Parser from "rss-parser";

const fixture = readFileSync(
  path.join(__dirname, "__fixtures__", "sample-feed.xml"),
  "utf-8"
);

describe("parseDurationToSeconds", () => {
  it("parse HH:MM:SS", () => {
    expect(parseDurationToSeconds("01:02:03")).toBe(3723);
  });
  it("parse MM:SS", () => {
    expect(parseDurationToSeconds("12:30")).toBe(750);
  });
  it("parse secondes brutes", () => {
    expect(parseDurationToSeconds("90")).toBe(90);
    expect(parseDurationToSeconds(90)).toBe(90);
  });
});

describe("buildEpisodesFromFeed", () => {
  it("filtre les items sans enclosure audio, trie par date, parse les durées", async () => {
    const parser = new Parser();
    const feed = await parser.parseString(fixture);
    const result = buildEpisodesFromFeed(feed, "https://example.com/feed.xml");
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.episodes).toHaveLength(3);
    expect(result.data.episodes.map((e) => e.id)).toEqual([
      "ep-3",
      "ep-2",
      "ep-1",
    ]);
    expect(result.data.episodes[0]?.durationSeconds).toBe(3723);
    expect(result.data.episodes[1]?.durationSeconds).toBe(750);
    expect(result.data.episodes[2]?.durationSeconds).toBe(90);
    expect(result.data.kind).toBe("show");
    expect(result.data.showTitle).toBe("Podcast de test");
  });
});

describe("parseRssFromXml", () => {
  it("retourne une SourceResolution depuis le XML", async () => {
    const result = await parseRssFromXml(
      fixture,
      "https://example.com/feed.xml",
      "direct"
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.resolvedFrom).toBe("direct");
    expect(result.data.kind).toBe("show");
    expect(result.data.episodes.length).toBe(3);
  });
});
