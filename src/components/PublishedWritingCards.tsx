import type { PublicArticle } from "./ArticleRenderer";
import ArticleShareButton from "./ArticleShareButton";
import { emitPortfolioEvent } from "../lib/portfolio-events";

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
  /** Kept for the Astro component API while the home page is SSR-driven. */
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

function WritingGrid({ initialPosts }: { initialPosts: ArticleCard[] }) {
  const visiblePosts = initialPosts;

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
  );
}

export default function PublishedWritingCards({ initialPosts }: Props) {
  // The home page already fetches the same six public cards during SSR. A
  // second Convex subscription here caused duplicate requests, a hydration
  // swap, and a visible scroll hitch. The cards remain fully interactive and
  // the reader still fetches the selected article on demand.
  return <WritingGrid initialPosts={initialPosts} />;
}
