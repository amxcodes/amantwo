import type { PublicArticle } from "./ArticleRenderer";
import ArticleShareButton from "./ArticleShareButton";
import { emitPortfolioEvent } from "../lib/portfolio-events";
import { ConvexHttpClient } from "convex/browser";
import { useCallback, useMemo, useState } from "react";
import { api } from "../../convex/_generated/api";

export type ArticleCard = Pick<
  PublicArticle,
  | "slug"
  | "meta"
  | "title"
  | "summary"
  | "readingTime"
  | "tone"
  | "publishedAt"
  | "cover"
  | "narration"
>;

type Props = {
  initialPosts: ArticleCard[];
  convexUrl?: string;
  nextCursor?: string;
  hasMore?: boolean;
};

type CardPage = {
  page: ArticleCard[];
  continueCursor: string;
  isDone: boolean;
};

const publishedLabel = (value?: string | number) => {
  if (!value) return "";
  if (typeof value === "string") return value;
  return new Date(value).toLocaleDateString("en", {
    month: "short",
    year: "numeric",
  });
};

function WritingGrid({
  initialPosts,
  convexUrl,
  nextCursor,
  hasMore = false,
}: Props) {
  const [visiblePosts, setVisiblePosts] = useState(initialPosts);
  const [cursor, setCursor] = useState(nextCursor);
  const [canLoadMore, setCanLoadMore] = useState(
    Boolean(hasMore && nextCursor && convexUrl),
  );
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  // A one-off HTTP request is lighter than a live subscription and keeps the
  // archive dormant until a visitor explicitly asks for another page.
  const client = useMemo(
    () => (convexUrl ? new ConvexHttpClient(convexUrl) : null),
    [convexUrl],
  );

  const loadMore = useCallback(async () => {
    if (!client || !cursor || isLoading) return;
    setIsLoading(true);
    setLoadError(false);

    try {
      const result = (await client.query(api.articles.publicCards, {
        paginationOpts: { numItems: 6, cursor },
      })) as unknown as CardPage;
      setVisiblePosts((currentPosts) => {
        const knownSlugs = new Set(currentPosts.map((post) => post.slug));
        return [
          ...currentPosts,
          ...result.page.filter((post) => !knownSlugs.has(post.slug)),
        ];
      });
      setCursor(result.continueCursor);
      setCanLoadMore(!result.isDone);
    } catch {
      setLoadError(true);
    } finally {
      setIsLoading(false);
    }
  }, [client, cursor, isLoading]);

  if (!visiblePosts.length) {
    return <p className="blog-empty-state">No published notes yet.</p>;
  }

  return (
    <>
      <div className="blog-grid">
        {visiblePosts.map((post) => (
          <article
            className={`blog-card tone-${post.tone ?? "blue"}`}
            data-reveal="project"
            key={post.slug}
          >
            <p>{post.meta}</p>
            <h3 title={post.title}>{post.title}</h3>
            <span>{post.summary}</span>
            <div className="blog-card-actions">
              <a
                className="blog-card-read"
                href={`/writing/${post.slug}`}
                aria-label={`Read ${post.title}`}
                onPointerEnter={() => {
                  emitPortfolioEvent("portfolio:prefetch-post", { slug: post.slug });
                }}
                onPointerDown={() => {
                  emitPortfolioEvent("portfolio:prefetch-post", { slug: post.slug });
                }}
                onFocus={() => {
                  emitPortfolioEvent("portfolio:prefetch-post", { slug: post.slug });
                }}
                onClick={(event) => {
                  if (
                    event.metaKey ||
                    event.ctrlKey ||
                    event.shiftKey ||
                    event.altKey
                  )
                    return;
                  event.preventDefault();
                  emitPortfolioEvent("portfolio:open-post", post);
                }}
              >
                <i className="blog-card-arrow" aria-hidden="true">
                  →
                </i>
                Open note{" "}
                <small>
                  {post.readingTime}
                  {post.publishedAt
                    ? ` · ${publishedLabel(post.publishedAt)}`
                    : ""}
                </small>
              </a>
              <ArticleShareButton
                slug={post.slug}
                title={post.title}
                summary={post.summary}
                meta={post.meta}
                readingTime={post.readingTime}
                publishedLabel={
                  post.publishedAt ? publishedLabel(post.publishedAt) : undefined
                }
                tone={post.tone}
                coverSrc={post.cover?.src}
                className="blog-card-share"
              />
            </div>
          </article>
        ))}
      </div>
      {canLoadMore ? (
        <div className="blog-load-more">
          <button
            type="button"
            onClick={() => void loadMore()}
            disabled={isLoading}
            aria-busy={isLoading}
          >
            {isLoading ? "Loading more notes…" : "Show 6 more"}
          </button>
          {loadError ? (
            <p className="blog-load-more-error" role="status">
              Couldn&rsquo;t load more notes. Please try again.
            </p>
          ) : null}
        </div>
      ) : null}
    </>
  );
}

export default function PublishedWritingCards(props: Props) {
  return <WritingGrid {...props} />;
}
