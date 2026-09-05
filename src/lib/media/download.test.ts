import { access, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { downloadToWorkspace } from "./download";
import { setDnsLookupForTests } from "@/lib/sources/url-guard";

let tmpDir: string;

beforeEach(() => {
  setDnsLookupForTests(
    (async () => [{ address: "93.184.216.34", family: 4 }]) as never
  );
});

afterEach(async () => {
  setDnsLookupForTests(null);
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  if (tmpDir) await rm(tmpDir, { recursive: true, force: true });
});

describe("downloadToWorkspace", () => {
  it("rejette un Content-Type invalide", async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), "lunii-dl-"));
    const dest = path.join(tmpDir, "file.bin");

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        return new Response("not audio", {
          status: 200,
          headers: { "content-type": "text/plain" },
        });
      })
    );

    const result = await downloadToWorkspace(
      "https://example.com/x.mp3",
      dest,
      "audio"
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("INVALID_CONTENT_TYPE");
  });

  it("rejette un fichier trop volumineux et n'laisse pas de partiel", async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), "lunii-dl-"));
    const dest = path.join(tmpDir, "big.mp3");

    // Forcer une limite basse via mock de content-length + stream
    const big = Buffer.alloc(2 * 1024 * 1024); // 2 Mo
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        return new Response(big, {
          status: 200,
          headers: {
            "content-type": "audio/mpeg",
            "content-length": String(big.length),
          },
        });
      })
    );

    // MAX_DOWNLOAD_MB est 100 par défaut — simuler via content-length trop grand
    // en mentant content-length > limite
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        return new Response(big, {
          status: 200,
          headers: {
            "content-type": "audio/mpeg",
            "content-length": String(200 * 1024 * 1024),
          },
        });
      })
    );

    const result = await downloadToWorkspace(
      "https://example.com/huge.mp3",
      dest,
      "audio"
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("FILE_TOO_LARGE");

    await expect(access(dest)).rejects.toThrow();
  });
});
