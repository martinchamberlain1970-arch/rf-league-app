import type { MetadataRoute } from "next";

const siteUrl = "https://www.rackandframe.app";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/api/",
        "/auth/",
        "/audit",
        "/backup",
        "/entry-pack/",
        "/league-entry",
        "/notifications",
        "/results",
        "/usage",
      ],
    },
    sitemap: `${siteUrl}/sitemap.xml`,
    host: siteUrl,
  };
}
