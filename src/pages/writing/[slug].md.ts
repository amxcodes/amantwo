import type { APIRoute } from "astro";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../convex/_generated/api";
import type { PublicArticle } from "../../components/ArticleRenderer";
import { markdownHeaders, notFoundMarkdown } from "../../lib/agent-resources";
import { articleToMarkdown } from "../../lib/article-markdown";
import { publicConvexUrl } from "../../lib/publicConfig";

export const prerender = false;

export const GET: APIRoute = async ({ params }) => {
  const slug = params.slug?.trim() ?? "";
  if (!slug || !publicConvexUrl) {
    return new Response(notFoundMarkdown, {
      status: 404,
      headers: markdownHeaders,
    });
  }

  try {
    const client = new ConvexHttpClient(publicConvexUrl);
    const article = (await client.query(api.articles.publicBySlug, {
      slug,
    })) as unknown as PublicArticle | null;
    if (!article)
      return new Response(notFoundMarkdown, {
        status: 404,
        headers: markdownHeaders,
      });
    return new Response(articleToMarkdown(article), {
      headers: {
        ...markdownHeaders,
        Link: `</writing/${article.slug}>; rel="alternate"; type="text/html"`,
      },
    });
  } catch {
    return new Response(
      "# Writing is temporarily unavailable\n\nPlease return to the [portfolio homepage](/).\n",
      {
        status: 503,
        headers: markdownHeaders,
      },
    );
  }
};
