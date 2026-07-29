import { describe, expect, it } from "vitest";
import { siteData, siteSchema } from "../src/content/site";

describe("site content", () => {
  it("matches the public content contract", () => {
    expect(siteSchema.safeParse(siteData).success).toBe(true);
  });

  it("keeps project slugs unique for future CMS records", () => {
    const slugs = siteData.projects.map((project) => project.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });
});
