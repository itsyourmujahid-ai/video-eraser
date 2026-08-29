import type { MetadataRoute } from "next";

export const dynamic = "force-static";

const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://itsyourmujahid-ai.github.io/video-eraser";

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();

  return [
    {
      url: siteUrl,
      changeFrequency: "monthly",
      priority: 1,
      lastModified,
    },
    {
      url: `${siteUrl}/video-lab`,
      changeFrequency: "monthly",
      priority: 1,
      lastModified,
    },
  ];
}