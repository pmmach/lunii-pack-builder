import { describe, expect, it } from "vitest";
import {
  namesMatch,
  pickItunesMatch,
  isDirectoryUrl,
  extractApplePodcastId,
  cleanShowTitle,
} from "./directory-resolver";

describe("isDirectoryUrl", () => {
  it("détecte Spotify / Apple / Deezer", () => {
    expect(
      isDirectoryUrl("https://open.spotify.com/show/2kRvsf2hPuQFVPax4jE4WT")
    ).toBe(true);
    expect(
      isDirectoryUrl("https://podcasts.apple.com/fr/podcast/foo/id123")
    ).toBe(true);
    expect(isDirectoryUrl("https://www.deezer.com/show/123")).toBe(true);
    expect(isDirectoryUrl("https://www.radiofrance.fr/podcasts/x")).toBe(
      false
    );
  });
});

describe("extractApplePodcastId", () => {
  it("extrait l'id depuis le path", () => {
    expect(
      extractApplePodcastId(
        "https://podcasts.apple.com/fr/podcast/la-grande-histoire-de-pomme-dapi/id1457819198?mt=2"
      )
    ).toBe("1457819198");
  });

  it("retourne undefined hors Apple", () => {
    expect(
      extractApplePodcastId("https://open.spotify.com/show/abc")
    ).toBeUndefined();
  });
});

describe("cleanShowTitle", () => {
  it("retire le suffixe de site", () => {
    expect(
      cleanShowTitle("La grande histoire de Pomme d'Api - Tout Bayard Jeunesse")
    ).toBe("La grande histoire de Pomme d'Api");
    expect(cleanShowTitle("Mon podcast | Site")).toBe("Mon podcast");
  });
});

describe("namesMatch", () => {
  it("accepte inclusion et accents", () => {
    expect(namesMatch("Une histoire et Oli", "Une histoire et... Oli")).toBe(
      true
    );
    expect(namesMatch("Émission Test", "Emission Test")).toBe(true);
  });
});

describe("pickItunesMatch", () => {
  it("happy path : retourne le feedUrl correspondant", () => {
    const match = pickItunesMatch("Une histoire et Oli", [
      {
        collectionName: "Autre podcast",
        feedUrl: "https://example.com/other.xml",
      },
      {
        collectionName: "Une histoire et... Oli",
        feedUrl: "https://example.com/oli.xml",
      },
    ]);
    expect(match?.feedUrl).toBe("https://example.com/oli.xml");
  });

  it("NO_PUBLIC_FEED équivalent : aucun match", () => {
    const match = pickItunesMatch("Émission Introuvable XYZ", [
      {
        collectionName: "Complètement Autre Chose",
        feedUrl: "https://example.com/x.xml",
      },
    ]);
    expect(match).toBeNull();
  });
});
