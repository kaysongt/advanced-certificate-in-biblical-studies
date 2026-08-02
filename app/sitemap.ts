import type { MetadataRoute } from "next";

import { getCurriculum } from "@/lib/curriculum";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.thekti.org";

export default function sitemap(): MetadataRoute.Sitemap {
  const { modules } = getCurriculum();
  const publicPaths = ["", "/curriculum", "/pricing", "/community", "/glossary", "/privacy"];

  return [
    ...publicPaths.map((path, index) => ({
      url: `${SITE_URL}${path}`,
      changeFrequency: index === 0 ? ("weekly" as const) : ("monthly" as const),
      priority: index === 0 ? 1 : 0.7,
    })),
    ...modules.map((module) => ({
      url: `${SITE_URL}/curriculum/${module.slug}`,
      changeFrequency: "monthly" as const,
      priority: 0.6,
    })),
  ];
}
