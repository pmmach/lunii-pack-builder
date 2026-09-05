import { lookup as defaultLookup } from "node:dns/promises";
import { isIP } from "node:net";
import { err, ok, type Result } from "@/lib/shared/result";

type LookupFn = typeof defaultLookup;

/** Injectable pour les tests (Vitest ne peut pas spy les exports ESM natifs). */
let dnsLookup: LookupFn = defaultLookup;

export function setDnsLookupForTests(fn: LookupFn | null): void {
  dnsLookup = fn ?? defaultLookup;
}

const PRIVATE_V4_RANGES: Array<{ base: number; mask: number }> = [
  { base: ipToInt("10.0.0.0"), mask: 8 },
  { base: ipToInt("172.16.0.0"), mask: 12 },
  { base: ipToInt("192.168.0.0"), mask: 16 },
  { base: ipToInt("127.0.0.0"), mask: 8 },
  { base: ipToInt("169.254.0.0"), mask: 16 },
  { base: ipToInt("0.0.0.0"), mask: 8 },
];

function ipToInt(ip: string): number {
  const parts = ip.split(".").map((p) => Number(p));
  return (
    ((parts[0] ?? 0) << 24) +
    ((parts[1] ?? 0) << 16) +
    ((parts[2] ?? 0) << 8) +
    (parts[3] ?? 0)
  ) >>> 0;
}

function isPrivateIpv4(ip: string): boolean {
  const value = ipToInt(ip);
  return PRIVATE_V4_RANGES.some(({ base, mask }) => {
    const shift = 32 - mask;
    return value >>> shift === base >>> shift;
  });
}

function isPrivateIpv6(ip: string): boolean {
  const normalized = ip.toLowerCase();
  if (normalized === "::1" || normalized === "::") return true;
  if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true;
  if (normalized.startsWith("fe80")) return true;
  // IPv4-mapped IPv6 (::ffff:x.x.x.x)
  const mapped = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped?.[1]) return isPrivateIpv4(mapped[1]);
  return false;
}

export function isBlockedIp(ip: string): boolean {
  const version = isIP(ip);
  if (version === 4) return isPrivateIpv4(ip);
  if (version === 6) return isPrivateIpv6(ip);
  return true;
}

export async function assertSafeUrl(rawUrl: string): Promise<Result<URL>> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return err("URL invalide", "INVALID_URL");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return err("Seuls les schémas http et https sont autorisés", "INVALID_URL");
  }

  const hostname = url.hostname;
  if (!hostname) {
    return err("URL invalide", "INVALID_URL");
  }

  // Hostname littéral IP
  if (isIP(hostname)) {
    if (isBlockedIp(hostname)) {
      return err("URL non autorisée", "SSRF_BLOCKED");
    }
    return ok(url);
  }

  // Hostnames locaux courants
  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal")
  ) {
    return err("URL non autorisée", "SSRF_BLOCKED");
  }

  try {
    const records = await dnsLookup(hostname, { all: true, verbatim: true });
    if (records.length === 0) {
      return err("Impossible de résoudre l'hôte", "DNS_FAILED");
    }
    for (const record of records) {
      if (isBlockedIp(record.address)) {
        return err("URL non autorisée", "SSRF_BLOCKED");
      }
    }
  } catch {
    return err("Impossible de résoudre l'hôte", "DNS_FAILED");
  }

  return ok(url);
}

export const FETCH_TIMEOUT_MS = 10_000;
export const MAX_RESPONSE_BYTES = 5 * 1024 * 1024; // 5 Mo

/**
 * Fetch sécurisé : anti-SSRF, timeout, limite de taille, max 5 redirections.
 */
export async function safeFetch(
  rawUrl: string,
  init?: RequestInit
): Promise<Result<Response>> {
  const safe = await assertSafeUrl(rawUrl);
  if (!safe.ok) return safe;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    let currentUrl = safe.data.toString();
    let response: Response | undefined;
    const maxRedirects = 5;

    for (let hop = 0; hop <= maxRedirects; hop++) {
      const hopSafe = await assertSafeUrl(currentUrl);
      if (!hopSafe.ok) return hopSafe;

      response = await fetch(currentUrl, {
        ...init,
        redirect: "manual",
        signal: controller.signal,
        headers: {
          "User-Agent": "LuniiPackBuilder/0.1 (+https://github.com/pmmach/lunii-pack-builder)",
          Accept: "*/*",
          ...(init?.headers ?? {}),
        },
      });

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        if (!location) {
          return err("Redirection HTTP invalide", "REDIRECT_ERROR");
        }
        if (hop === maxRedirects) {
          return err("Trop de redirections HTTP", "TOO_MANY_REDIRECTS");
        }
        currentUrl = new URL(location, currentUrl).toString();
        continue;
      }

      break;
    }

    if (!response) {
      return err("Échec de la requête réseau", "FETCH_FAILED");
    }

    if (!response.ok) {
      return err(
        `Le serveur distant a répondu ${response.status}`,
        "HTTP_ERROR"
      );
    }

    // Wrap body to enforce size limit when consumed
    const contentLength = response.headers.get("content-length");
    if (contentLength && Number(contentLength) > MAX_RESPONSE_BYTES) {
      return err("Réponse trop volumineuse", "RESPONSE_TOO_LARGE");
    }

    return ok(response);
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") {
      return err("Délai dépassé lors de la requête", "TIMEOUT");
    }
    return err("Impossible de joindre l'URL", "FETCH_FAILED");
  } finally {
    clearTimeout(timeout);
  }
}

export async function readResponseText(
  response: Response,
  maxBytes = MAX_RESPONSE_BYTES
): Promise<Result<string>> {
  if (!response.body) {
    return err("Réponse vide", "EMPTY_RESPONSE");
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        return err("Réponse trop volumineuse", "RESPONSE_TOO_LARGE");
      }
      chunks.push(value);
    }
  } catch {
    return err("Erreur de lecture de la réponse", "READ_ERROR");
  }

  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return ok(new TextDecoder("utf-8").decode(merged));
}
