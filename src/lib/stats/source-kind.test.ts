import { describe, expect, it } from "vitest";
import { classifySourceKind } from "./source-kind";

describe("classifySourceKind", () => {
  it("reconnaît les hôtes connus sans garder l'URL", () => {
    expect(classifySourceKind("https://open.spotify.com/show/abc")).toBe(
      "spotify"
    );
    expect(
      classifySourceKind("https://podcasts.apple.com/fr/podcast/id1")
    ).toBe("apple");
    expect(classifySourceKind("https://www.deezer.com/fr/show/1")).toBe(
      "deezer"
    );
    expect(
      classifySourceKind("https://www.radiofrance.fr/franceinter/podcasts/x")
    ).toBe("radiofrance");
  });

  it("utilise le mode de résolution pour le reste", () => {
    expect(
      classifySourceKind("https://example.com/feed.xml", "direct")
    ).toBe("rss");
    expect(
      classifySourceKind("https://example.com/emission", "page-discovery")
    ).toBe("page");
    expect(classifySourceKind("https://example.com/rss")).toBe("rss");
    expect(classifySourceKind("https://example.com/emission")).toBe("autre");
    expect(classifySourceKind("pas une url")).toBe("autre");
  });
});
