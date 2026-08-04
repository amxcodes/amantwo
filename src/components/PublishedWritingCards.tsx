import {
  ConvexProvider,
  ConvexReactClient,
  usePaginatedQuery,
} from "convex/react";
import { useEffect, useRef, useState } from "react";
import { api } from "../../convex/_generated/api";
import type { PublicArticle } from "./ArticleRenderer";
import ArticleShareButton from "./ArticleShareButton";

export type ArticleCard = Pick<
  PublicArticle,
  "slug" | "meta" | "title" | "summary" | "readingTime" | "tone" | "publishedAt"
>;

const HOME_WRITING_PAGE_SIZE = 6;
const convexClients = new Map<string, ConvexReactClient>();

const getConvexClient = (url: string) => {
  const cached = convexClients.get(url);
  if (cached) return cached;
  const client = new ConvexReactClient(url);
  convexClients.set(url, client);
  return client;
};

const samePostSet = (left: ArticleCard[], right: ArticleCard[]) =>
  left.length === right.length &&
  left.every((post, index) => {
    const other = right[index];
    return (
      post.slug === other?.slug &&
      post.title === other?.title &&
      post.summary === other?.summary &&
      post.tone === other?.tone &&
      post.readingTime === other?.readingTime &&
      post.publishedAt === other?.publishedAt
    );
  });

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
              onPointerEnter={() => {
                window.dispatchEvent(
                  new CustomEvent("portfolio:prefetch-post", {
                    detail: { slug: post.slug },
                  }),
                );
              }}
              onPointerDown={() => {
                window.dispatchEvent(
                  new CustomEvent("portfolio:prefetch-post", {
                    detail: { slug: post.slug },
                  }),
                );
              }}
              onFocus={() => {
                window.dispatchEvent(
                  new CustomEvent("portfolio:prefetch-post", {
                    detail: { slug: post.slug },
                  }),
                );
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
  const [queryEnabled, setQueryEnabled] = useState(false);
  const { results, status } = usePaginatedQuery(
    api.articles.publicCards,
    queryEnabled ? {} : "skip",
    { initialNumItems: HOME_WRITING_PAGE_SIZE },
  );
  const [displayedPosts, setDisplayedPosts] = useState<ArticleCard[] | null>(
    null,
  );
  const updateTimer = useRef<number | undefined>(undefined);
  const loading = !queryEnabled || status === "LoadingFirstPage";

  useEffect(() => {
    let cancelled = false;
    let timeout = 0;
    let idleHandle: number | undefined;
    const enableQuery = () => {
      if (!cancelled) setQueryEnabled(true);
    };
    const requestIdle = (
      window as Window & {
        requestIdleCallback?: (
          callback: () => void,
          options?: { timeout: number },
        ) => number;
      }
    ).requestIdleCallback;
    if (requestIdle) {
      idleHandle = requestIdle(enableQuery, { timeout: 1200 });
    } else {
      timeout = window.setTimeout(enableQuery, 160);
    }

    return () => {
      cancelled = true;
      if (idleHandle !== undefined) {
        const cancelIdle = (
          window as Window & { cancelIdleCallback?: (handle: number) => void }
        ).cancelIdleCallback;
        cancelIdle?.(idleHandle);
      }
      if (timeout) window.clearTimeout(timeout);
    };
  }, []);

  useEffect(() => {
    if (!queryEnabled || loading || !Array.isArray(results)) return;
    const nextPosts = results as unknown as ArticleCard[];
    if (samePostSet(nextPosts, initialPosts)) {
      setDisplayedPosts(initialPosts);
      return;
    }

    // A live response can arrive while the reader is in motion. Apply it on
    // an idle frame so the list never competes with wheel/touch scrolling for
    // the same frame. The SSR cards remain visible until that swap is safe.
    let cancelled = false;
    const apply = () => {
      if (!cancelled) setDisplayedPosts(nextPosts);
    };
    const frame = window.requestAnimationFrame(() => {
      const scheduleIdle = (
        window as Window & {
          requestIdleCallback?: (
            callback: () => void,
            options?: { timeout: number },
          ) => number;
          cancelIdleCallback?: (handle: number) => void;
        }
      ).requestIdleCallback;
      if (scheduleIdle) {
        updateTimer.current = scheduleIdle(apply, { timeout: 700 });
      } else {
        updateTimer.current = window.setTimeout(apply, 80);
      }
    });

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frame);
      if (updateTimer.current !== undefined) {
        const cancelIdle = (
          window as Window & {
            cancelIdleCallback?: (handle: number) => void;
          }
        ).cancelIdleCallback;
        if (cancelIdle) cancelIdle(updateTimer.current);
        else window.clearTimeout(updateTimer.current);
        updateTimer.current = undefined;
      }
    };
  }, [initialPosts, loading, queryEnabled, results]);

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
      posts={displayedPosts ?? initialPosts}
    />
  );
}

export default function PublishedWritingCards({
  initialPosts,
  convexUrl,
}: Props) {
  if (!convexUrl) return <WritingGrid initialPosts={initialPosts} />;
  return (
    <ConvexProvider client={getConvexClient(convexUrl)}>
      <ManagedWritingGrid initialPosts={initialPosts} />
    </ConvexProvider>
  );
}
