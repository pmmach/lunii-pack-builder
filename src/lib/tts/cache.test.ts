import { describe, expect, it } from "vitest";
import { ttsCacheKey, ttsCachePath } from "./cache";

describe("ttsCacheKey", () => {
  it("produit le même hash pour le même texte", () => {
    const a = ttsCacheKey({
      provider: "azure",
      voice: "fr-FR-EloiseNeural",
      language: "fr-FR",
      text: "Bonjour",
    });
    const b = ttsCacheKey({
      provider: "azure",
      voice: "fr-FR-EloiseNeural",
      language: "fr-FR",
      text: "Bonjour",
    });
    expect(a).toBe(b);
    expect(a).toHaveLength(64);
  });

  it("change si la voix change", () => {
    const a = ttsCacheKey({
      provider: "azure",
      voice: "fr-FR-EloiseNeural",
      language: "fr-FR",
      text: "Bonjour",
    });
    const b = ttsCacheKey({
      provider: "azure",
      voice: "fr-FR-DeniseNeural",
      language: "fr-FR",
      text: "Bonjour",
    });
    expect(a).not.toBe(b);
  });
});

describe("ttsCachePath", () => {
  it("pointe vers workspace/session/tts/hash.mp3", () => {
    const p = ttsCachePath("sess-1", "abc123");
    expect(p.replace(/\\/g, "/")).toMatch(
      /workspace\/sess-1\/tts\/abc123\.mp3$/
    );
  });
});
