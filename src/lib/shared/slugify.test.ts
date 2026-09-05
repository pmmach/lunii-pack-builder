import { describe, expect, it } from "vitest";
import { slugify } from "./slugify";

describe("slugify", () => {
  it("translittère les accents", () => {
    expect(slugify("Émission")).toBe("emission");
    expect(slugify("Àéîôù")).toBe("aeiou");
  });

  it("remplace les espaces multiples par un seul tiret", () => {
    expect(slugify("une   histoire  et oli")).toBe("une-histoire-et-oli");
  });

  it("retire les caractères spéciaux", () => {
    expect(slugify("Hello, World! (2024)")).toBe("hello-world-2024");
    expect(slugify("a/b\\c..d")).toBe("a-b-c-d");
  });

  it("retourne 'histoire' pour une chaîne vide ou non alphanumérique", () => {
    expect(slugify("")).toBe("histoire");
    expect(slugify("   ")).toBe("histoire");
    expect(slugify("!!!")).toBe("histoire");
  });
});
