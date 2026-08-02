import { ConvexProvider, ConvexReactClient, useQuery } from "convex/react";
import { useEffect, useMemo } from "react";
import { api } from "../../convex/_generated/api";
import ArticleRenderer, { type PublicArticle } from "./ArticleRenderer";

function ArticleByPath({ slug }: { slug: string }) {
  const exactArticle = useQuery(api.articles.publicBySlug, { slug });
  const publishedArticles = useQuery(api.articles.publicList, {});
  const normalizeSlug = (value: string) =>
    value
      .trim()
      .toLowerCase()
      .replace(/[’']/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  const article = useMemo(() => {
    if (exactArticle) return exactArticle;
    if (!Array.isArray(publishedArticles)) return undefined;
    const wanted = normalizeSlug(slug);
    return publishedArticles.find((candidate) => {
      const candidateSlug = normalizeSlug(candidate.slug);
      const titleSlug = normalizeSlug(candidate.title);
      return candidateSlug === wanted || titleSlug === wanted || candidateSlug.endsWith(`-${wanted}`);
    }) ?? null;
  }, [exactArticle, publishedArticles, slug]);
  useEffect(() => {
    if (!article) return;
    document.title = `${article.title} — Aman Anu`;
    document.querySelector<HTMLMetaElement>('meta[name="description"]')?.setAttribute("content", article.summary);
  }, [article]);
  if (article === undefined) return <p className="article-fallback-state">Loading this published note…</p>;
  if (!article) return <div className="article-fallback-state"><h1>That note is not published.</h1><a href="/#writing">Back to writing</a></div>;
  return <ArticleRenderer article={article as unknown as PublicArticle} variant="page" />;
}

export default function PublicArticleFallback({ convexUrl }: { convexUrl?: string }) {
  const pathname = typeof window === "undefined" ? "" : window.location.pathname;
  const slug = pathname.startsWith("/writing/") ? pathname.replace(/^\/writing\//, "").replace(/\/$/, "") : "";
  if (!slug || !convexUrl) return <div className="article-fallback-state"><h1>Page not found.</h1><a href="/">Back home</a></div>;
  return <ConvexProvider client={new ConvexReactClient(convexUrl)}><ArticleByPath slug={decodeURIComponent(slug)} /></ConvexProvider>;
}
