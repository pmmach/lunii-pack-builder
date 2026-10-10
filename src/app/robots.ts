import type { MetadataRoute } from "next";
import { getSiteUrl } from "@/lib/seo/request";

export default async function robots(): Promise<MetadataRoute.Robots> {
  const origin = await getSiteUrl();
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/pack/", "/stats", "/api/"],
    },
    sitemap: new URL("/sitemap.xml", origin).href,
  };
}
