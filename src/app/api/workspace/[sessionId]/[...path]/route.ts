import { createReadStream } from "node:fs";
import { access, stat } from "node:fs/promises";
import path from "node:path";

export async function GET(
  _req: Request,
  {
    params,
  }: { params: Promise<{ sessionId: string; path: string[] }> }
): Promise<Response> {
  const { sessionId, path: parts } = await params;
  if (
    !sessionId ||
    sessionId.includes("..") ||
    parts.some((p) => p.includes(".."))
  ) {
    return new Response("Not found", { status: 404 });
  }

  const filePath = path.join(process.cwd(), "workspace", sessionId, ...parts);
  const root = path.join(process.cwd(), "workspace", sessionId);
  if (!filePath.startsWith(root)) {
    return new Response("Not found", { status: 404 });
  }

  try {
    await access(filePath);
    const info = await stat(filePath);
    if (!info.isFile()) return new Response("Not found", { status: 404 });
  } catch {
    return new Response("Not found", { status: 404 });
  }

  const ext = path.extname(filePath).toLowerCase();
  const type =
    ext === ".mp3"
      ? "audio/mpeg"
      : ext === ".jpg" || ext === ".jpeg"
        ? "image/jpeg"
        : ext === ".png"
          ? "image/png"
          : "application/octet-stream";

  const stream = createReadStream(filePath);
  return new Response(
    new ReadableStream({
      start(controller) {
        stream.on("data", (chunk: string | Buffer) => {
          const buf = typeof chunk === "string" ? Buffer.from(chunk) : chunk;
          controller.enqueue(new Uint8Array(buf));
        });
        stream.on("end", () => controller.close());
        stream.on("error", (e) => controller.error(e));
      },
      cancel() {
        stream.destroy();
      },
    }),
    { headers: { "Content-Type": type } }
  );
}
