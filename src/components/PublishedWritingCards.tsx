import { ConvexProvider, ConvexReactClient, useQuery } from "convex/react";
import { useEffect, useState } from "react";
import { api } from "../../convex/_generated/api";
import type { PublicArticle } from "./ArticleRenderer";
import ArticleShareButton from "./ArticleShareButton";

type ArticleCard = PublicArticle & { tone?: string };

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
  }, [loading, visiblePosts]);

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
    <div className="blog-grid" aria-label="Writing">
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
  const managed = useQuery(api.articles.publicList, {});
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    if (managed !== undefined) return;
    const timeout = window.setTimeout(() => setTimedOut(true), 8_000);
    return () => window.clearTimeout(timeout);
  }, [managed]);

  if (managed === undefined && !timedOut) {
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
        Array.isArray(managed)
          ? (managed as unknown as ArticleCard[])
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
