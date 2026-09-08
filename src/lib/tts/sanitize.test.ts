import { describe, expect, it } from "vitest";
import { sanitizeTitleForTts } from "./sanitize";

describe("sanitizeTitleForTts", () => {
  it("trim et collapse les espaces", () => {
    expect(sanitizeTitleForTts("  Bonjour   monde  ")).toBe("Bonjour monde");
  });

  it("retire les balises HTML", () => {
    expect(sanitizeTitleForTts("<b>Titre</b> &amp; suite")).toBe(
      "Titre & suite"
    );
  });

  it("tronque à maxChars sur une frontière de mot", () => {
    const long =
      "L'anémone de mer bouche à tout faire épisode numéro un avec un titre très long pour le test";
    const out = sanitizeTitleForTts(long, 40);
    expect(out.length).toBeLessThanOrEqual(40);
    expect(out).not.toMatch(/\s$/);
    expect(out.startsWith("L'anémone")).toBe(true);
  });

  it("retourne une chaîne vide si seulement des balises", () => {
    expect(sanitizeTitleForTts("<p></p>")).toBe("");
  });
});
