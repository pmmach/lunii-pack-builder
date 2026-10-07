import { afterEach, describe, expect, it } from "vitest";
import {
  _resetStatsAccessForTests,
  allowStatsAttempt,
  passwordMatches,
  readStatsToken,
  setStatsAccessNowForTests,
  statsCookieMatches,
  statsCookieValue,
} from "./access";

afterEach(() => {
  _resetStatsAccessForTests();
});

describe("accès statistiques", () => {
  it("compare le mot de passe sans exiger la même longueur", () => {
    expect(passwordMatches("secret", "secret")).toBe(true);
    expect(passwordMatches("nope", "secret")).toBe(false);
    expect(passwordMatches("", "secret")).toBe(false);
  });

  it("ignore les espaces autour du token", () => {
    expect(readStatsToken("  secret  ")).toBe("secret");
    expect(readStatsToken("   ")).toBeUndefined();
    expect(readStatsToken(undefined)).toBeUndefined();
  });

  it("reconnaît le cookie dérivé du token", () => {
    const token = "secret";
    expect(statsCookieMatches(statsCookieValue(token), token)).toBe(true);
    expect(statsCookieMatches("autre", token)).toBe(false);
    expect(statsCookieMatches(undefined, token)).toBe(false);
  });

  it("bloque après 8 tentatives et se réouvre ensuite", () => {
    let now = 1_000_000;
    setStatsAccessNowForTests(() => now);
    for (let i = 0; i < 8; i++) {
      expect(allowStatsAttempt("1.2.3.4")).toBe(true);
    }
    expect(allowStatsAttempt("1.2.3.4")).toBe(false);
    expect(allowStatsAttempt("5.6.7.8")).toBe(true);
    now += 5 * 60 * 1000 + 1;
    expect(allowStatsAttempt("1.2.3.4")).toBe(true);
  });
});
