import type { APIRoute } from "astro";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../convex/_generated/api";
import { publicConvexUrl } from "../lib/publicConfig";

export const prerender = false;

const siteOrigin = new URL(import.meta.env.SITE ?? "https://amananu.me");
const staticPaths = ["/", "/about", "/contact", "/privacy", "/developers"];

const escapeXml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");

export const GET: APIRoute = async () => {
  const urls = new Set(
    staticPaths.map((path) => new URL(path, siteOrigin).href),
  );

  if (publicConvexUrl) {
    try {
      const client = new ConvexHttpClient(publicConvexUrl);
      let cursor: string | null = null;

      // Each query returns only published article cards, never draft records
      // or article bodies. Keep paging so older published writing is indexed.
      for (let pageNumber = 0; pageNumber < 500; pageNumber += 1) {
        const articlePage: {
          page: Array<{ slug: string }>;
          continueCursor: string | null;
          isDone: boolean;
        } = await client.query(api.articles.publicCards, {
          paginationOpts: { numItems: 100, cursor },
        });

        for (const article of articlePage.page) {
          const slug = article.slug.trim();
          if (slug) {
            urls.add(
              new URL(`/writing/${encodeURIComponent(slug)}`, siteOrigin).href,
            );
          }
        }

        if (
          articlePage.isDone ||
          typeof articlePage.continueCursor !== "string"
        )
          break;
        cursor = articlePage.continueCursor;
      }
    } catch (error) {
      // Keep the static pages discoverable during a temporary Convex outage.
      console.error(
        "Unable to load published article URLs for sitemap.",
        error,
      );
    }
  }

  const entries = Array.from(
    urls,
    (url) => `<url><loc>${escapeXml(url)}</loc></url>`,
  ).join("");
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${entries}</urlset>`;

  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control":
        "public, max-age=0, s-maxage=300, stale-while-revalidate=900",
    },
  });
};
