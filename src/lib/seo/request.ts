import { headers } from "next/headers";
import { env } from "@/lib/shared/env";
import { siteUrlFromParts } from "./site";

export async function getSiteUrl(): Promise<URL> {
  const h = await headers();
  return siteUrlFromParts(
    env.SITE_URL,
    h.get("x-forwarded-host") ?? h.get("host"),
    h.get("x-forwarded-proto"),
  );
}
