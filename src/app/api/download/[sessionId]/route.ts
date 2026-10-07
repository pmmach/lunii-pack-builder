import { createReadStream } from "node:fs";
import { access, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { recordUsage } from "@/lib/stats/usage";
import { getClientIp } from "@/lib/shared/client-ip";
import { env } from "@/lib/shared/env";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ sessionId: string }> }
): Promise<Response> {
  const { sessionId } = await params;

  // Empêcher path traversal
  if (
    !sessionId ||
    sessionId.includes("..") ||
    sessionId.includes("/") ||
    sessionId.includes("\\")
  ) {
    return new Response("Not found", { status: 404 });
  }

  const workspaceDir = path.join(process.cwd(), "workspace", sessionId);
  const zipPath = path.join(workspaceDir, "export.zip");
  const metaPath = path.join(workspaceDir, "export-meta.json");

  try {
    await access(zipPath);
  } catch {
    return new Response("Pack introuvable", { status: 404 });
  }

  let packSlug = "pack";
  try {
    const meta = JSON.parse(await readFile(metaPath, "utf-8")) as {
      packSlug?: string;
      stories?: number;
      downloadCounted?: boolean;
    };
    if (meta.packSlug) packSlug = meta.packSlug;
    if (!meta.downloadCounted) {
      const ip = await getClientIp();
      await writeFile(
        metaPath,
        JSON.stringify({ ...meta, downloadCounted: true }),
        "utf-8"
      );
      recordUsage({
        type: "download",
        visitorIp: ip,
        ok: true,
        stories: typeof meta.stories === "number" ? meta.stories : undefined,
      });
    }
  } catch {
    // le téléchargement reste prioritaire
  }

  const stream = createReadStream(zipPath);
  const webStream = ReadableToWeb(stream);

  // Planifier le nettoyage après TTL (pas immédiatement)
  const ttlMs = env.WORKSPACE_TTL_MINUTES * 60 * 1000;
  setTimeout(() => {
    void rm(workspaceDir, { recursive: true, force: true }).catch(() => undefined);
  }, ttlMs);

  return new Response(webStream, {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${packSlug}.zip"`,
    },
  });
}

function ReadableToWeb(
  nodeStream: NodeJS.ReadableStream
): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      nodeStream.on("data", (chunk: Buffer) => {
        controller.enqueue(new Uint8Array(chunk));
      });
      nodeStream.on("end", () => controller.close());
      nodeStream.on("error", (err) => controller.error(err));
    },
    cancel() {
      if ("destroy" in nodeStream && typeof nodeStream.destroy === "function") {
        nodeStream.destroy();
      }
    },
  });
}
