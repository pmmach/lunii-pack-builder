import { afterEach, describe, expect, it, vi } from "vitest";
import {
  assertSafeUrl,
  isBlockedIp,
  setDnsLookupForTests,
} from "./url-guard";

afterEach(() => {
  setDnsLookupForTests(null);
  vi.restoreAllMocks();
});

describe("isBlockedIp", () => {
  it("bloque les IP privées / loopback / lien-local", () => {
    expect(isBlockedIp("127.0.0.1")).toBe(true);
    expect(isBlockedIp("10.0.0.1")).toBe(true);
    expect(isBlockedIp("192.168.1.1")).toBe(true);
    expect(isBlockedIp("172.16.5.5")).toBe(true);
    expect(isBlockedIp("169.254.169.254")).toBe(true);
    expect(isBlockedIp("::1")).toBe(true);
  });

  it("accepte une IP publique", () => {
    expect(isBlockedIp("93.184.216.34")).toBe(false);
    expect(isBlockedIp("8.8.8.8")).toBe(false);
  });
});

describe("assertSafeUrl", () => {
  it("rejette ftp://", async () => {
    const result = await assertSafeUrl("ftp://example.com/file");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("INVALID_URL");
  });

  it("rejette localhost", async () => {
    const result = await assertSafeUrl("http://localhost/secret");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("SSRF_BLOCKED");
  });

  it("rejette 127.0.0.1", async () => {
    const result = await assertSafeUrl("http://127.0.0.1/");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("SSRF_BLOCKED");
  });

  it("rejette 169.254.169.254 (metadata cloud)", async () => {
    const result = await assertSafeUrl("http://169.254.169.254/latest");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("SSRF_BLOCKED");
  });

  it("accepte une URL publique (DNS mocké)", async () => {
    setDnsLookupForTests(
      (async () => [{ address: "93.184.216.34", family: 4 }]) as never
    );

    const result = await assertSafeUrl("https://example.com/podcast");
    expect(result.ok).toBe(true);
  });

  it("rejette un hostname résolvant vers une IP privée", async () => {
    setDnsLookupForTests(
      (async () => [{ address: "10.0.0.5", family: 4 }]) as never
    );

    const result = await assertSafeUrl("https://evil.example/internal");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("SSRF_BLOCKED");
  });
});
