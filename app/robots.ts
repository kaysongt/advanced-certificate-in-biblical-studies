import type { MetadataRoute } from "next";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.thekti.org";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/admin", "/api/", "/courses/", "/dashboard", "/login", "/community/"],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
