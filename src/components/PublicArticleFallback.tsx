import { ConvexProvider, ConvexReactClient, useQuery } from "convex/react";
import { useEffect } from "react";
import { api } from "../../convex/_generated/api";
import ArticleRenderer, { type PublicArticle } from "./ArticleRenderer";

function ArticleByPath({ slug }: { slug: string }) {
  const article = useQuery(api.articles.publicBySlug, { slug });

  useEffect(() => {
    if (!article) return;
    document.title = `${article.title} — Aman Anu`;
    document
      .querySelector<HTMLMetaElement>('meta[name="description"]')
      ?.setAttribute("content", article.summary);
  }, [article]);

  if (article === undefined) {
    return (
      <p className="article-fallback-state">Loading this published note…</p>
    );
  }
  if (!article) {
    return (
      <div className="article-fallback-state">
        <h1>That note is not published.</h1>
        <a href="/#writing">Back to writing</a>
      </div>
    );
  }
  return (
    <ArticleRenderer
      article={article as unknown as PublicArticle}
      variant="page"
    />
  );
}

export default function PublicArticleFallback({
  convexUrl,
}: {
  convexUrl?: string;
}) {
  const pathname =
    typeof window === "undefined" ? "" : window.location.pathname;
  const slug = pathname.startsWith("/writing/")
    ? pathname.replace(/^\/writing\//, "").replace(/\/$/, "")
    : "";
  if (!slug || !convexUrl) {
    return (
      <div className="article-fallback-state">
        <h1>Page not found.</h1>
        <a href="/">Back home</a>
      </div>
    );
  }
  return (
    <ConvexProvider client={new ConvexReactClient(convexUrl)}>
      <ArticleByPath slug={decodeURIComponent(slug)} />
    </ConvexProvider>
  );
}
