import type { MetadataRoute } from "next";

const siteUrl = "https://www.rackandframe.app";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: `${siteUrl}/`,
      lastModified: new Date("2026-11-20"),
      changeFrequency: "weekly",
      priority: 1,
    },
  ];
}
