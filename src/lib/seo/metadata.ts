import type { Metadata } from "next";
import { getSiteUrl } from "./request";

export async function buildPageMetadata(page: {
  path: string;
  title: string;
  description: string;
}): Promise<Metadata> {
  const origin = await getSiteUrl();
  const url = new URL(page.path, origin).href;
  return {
    title: page.path === "/" ? { absolute: page.title } : page.title,
    description: page.description,
    alternates: { canonical: url },
    openGraph: {
      title: page.title,
      description: page.description,
      url,
    },
    twitter: {
      title: page.title,
      description: page.description,
    },
  };
}
