import type { MetadataRoute } from "next";
import { getSiteUrl } from "@/lib/seo/request";
import { PUBLIC_PAGES } from "@/lib/seo/site";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const origin = await getSiteUrl();
  return PUBLIC_PAGES.map((page) => ({
    url: new URL(page.path, origin).href,
    changeFrequency: "monthly",
    priority: page.priority,
  }));
}
