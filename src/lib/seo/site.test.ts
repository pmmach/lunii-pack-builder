import { describe, expect, it } from "vitest";
import { isSafeHost, siteUrlFromParts } from "./site";

describe("siteUrlFromParts", () => {
  it("prend l'origine de SITE_URL", () => {
    const url = siteUrlFromParts(
      "https://packs.example.com/ignored",
      "evil.test",
      "http",
    );
    expect(url.href).toBe("https://packs.example.com/");
  });

  it("retombe sur l'hôte de la requête", () => {
    const url = siteUrlFromParts(undefined, "packs.example.com", "https");
    expect(url.href).toBe("https://packs.example.com/");
  });

  it("ignore un hôte invalide", () => {
    expect(isSafeHost("packs.example.com")).toBe(true);
    expect(isSafeHost("evil.test/path")).toBe(false);
    expect(isSafeHost("localhost:3000")).toBe(true);
    const url = siteUrlFromParts(undefined, "evil.test/path", "https");
    expect(url.href).toBe("http://localhost:3000/");
  });

  it("utilise http pour localhost sans proto", () => {
    const url = siteUrlFromParts(undefined, "localhost:3000", null);
    expect(url.href).toBe("http://localhost:3000/");
  });
});
