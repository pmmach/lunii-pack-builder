import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createAzureTtsProvider } from "./azure";

let tmpDir: string;

afterEach(async () => {
  if (tmpDir) await rm(tmpDir, { recursive: true, force: true });
});

describe("createAzureTtsProvider", () => {
  it("envoie du SSML et écrit un MP3", async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), "lunii-azure-"));
    const out = path.join(tmpDir, "out.mp3");
    const fetchFn = vi.fn(async (_url: string, init?: RequestInit) => {
      expect(init?.method).toBe("POST");
      const headers = init?.headers as Record<string, string>;
      expect(headers["Ocp-Apim-Subscription-Key"]).toBe("test-key");
      expect(headers["Content-Type"]).toBe("application/ssml+xml");
      expect(headers["X-Microsoft-OutputFormat"]).toBe(
        "audio-16khz-128kbitrate-mono-mp3"
      );
      expect(String(init?.body)).toContain("<voice name=\"fr-FR-EloiseNeural\">");
      expect(String(init?.body)).toContain("Bonjour");
      return new Response(new Uint8Array([1, 2, 3, 4]), { status: 200 });
    });

    const provider = createAzureTtsProvider({
      fetchFn: fetchFn as unknown as typeof fetch,
      key: "test-key",
      region: "westeurope",
      voice: "fr-FR-EloiseNeural",
      language: "fr-FR",
    });

    const result = await provider.synthesize("Bonjour", out);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(await readFile(out)).toEqual(Buffer.from([1, 2, 3, 4]));
  });

  it("mappe 429 vers un message FR", async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), "lunii-azure-"));
    const out = path.join(tmpDir, "out.mp3");
    const fetchFn = vi.fn(
      async () => new Response("throttled", { status: 429 })
    );
    const provider = createAzureTtsProvider({
      fetchFn: fetchFn as unknown as typeof fetch,
      key: "k",
      region: "westeurope",
    });
    const result = await provider.synthesize("Hi", out);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("TTS_QUOTA");
    expect(result.error).toMatch(/Quota/);
  });

  it("signale TTS_NOT_CONFIGURED sans clé", async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), "lunii-azure-"));
    const provider = createAzureTtsProvider({
      key: "",
      region: "",
    });
    const result = await provider.synthesize("Hi", path.join(tmpDir, "x.mp3"));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("TTS_NOT_CONFIGURED");
  });
});
