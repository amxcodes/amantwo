import {
  ConvexProvider,
  ConvexReactClient,
  usePaginatedQuery,
} from "convex/react";
import { useEffect } from "react";
import { api } from "../../convex/_generated/api";
import type { PublicArticle } from "./ArticleRenderer";
import ArticleShareButton from "./ArticleShareButton";

export type ArticleCard = Pick<
  PublicArticle,
  "slug" | "meta" | "title" | "summary" | "readingTime" | "tone" | "publishedAt"
>;

const HOME_WRITING_PAGE_SIZE = 6;

type Props = {
  initialPosts: ArticleCard[];
  convexUrl?: string;
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
  posts,
  loading = false,
}: {
  initialPosts: ArticleCard[];
  posts?: ArticleCard[];
  loading?: boolean;
}) {
  const visiblePosts = posts ?? initialPosts;
  useEffect(() => {
    if (!loading)
      window.dispatchEvent(new CustomEvent("portfolio:content-mounted"));
  }, [loading]);

  if (loading) {
    return (
      <div className="blog-grid-loading" aria-live="polite" aria-busy="true">
        <span>Loading published notes</span>
        <i aria-hidden="true">
          <b />
          <b />
          <b />
        </i>
      </div>
    );
  }

  if (!visiblePosts.length) {
    return <p className="blog-empty-state">No published notes yet.</p>;
  }

  return (
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
              onClick={(event) => {
                if (
                  event.metaKey ||
                  event.ctrlKey ||
                  event.shiftKey ||
                  event.altKey
                )
                  return;
                event.preventDefault();
                window.dispatchEvent(
                  new CustomEvent("portfolio:open-post", { detail: post }),
                );
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
              className="blog-card-share"
            />
          </div>
        </article>
      ))}
    </div>
  );
}

function ManagedWritingGrid({ initialPosts }: { initialPosts: ArticleCard[] }) {
  const { results, status } = usePaginatedQuery(
    api.articles.publicCards,
    {},
    { initialNumItems: HOME_WRITING_PAGE_SIZE },
  );
  const loading = status === "LoadingFirstPage";

  if (loading) {
    // The Astro server already supplied the request-time Convex result. Keep
    // it visible while the client subscription connects instead of replacing
    // it with a loading/seed state during hydration.
    return initialPosts.length ? (
      <WritingGrid initialPosts={initialPosts} posts={initialPosts} />
    ) : (
      <WritingGrid initialPosts={initialPosts} posts={[]} loading />
    );
  }

  return (
    <WritingGrid
      initialPosts={initialPosts}
      posts={
        Array.isArray(results)
          ? (results as unknown as ArticleCard[])
          : undefined
      }
    />
  );
}

export default function PublishedWritingCards({
  initialPosts,
  convexUrl,
}: Props) {
  if (!convexUrl) return <WritingGrid initialPosts={initialPosts} />;
  return (
    <ConvexProvider client={new ConvexReactClient(convexUrl)}>
      <ManagedWritingGrid initialPosts={initialPosts} />
    </ConvexProvider>
  );
}
