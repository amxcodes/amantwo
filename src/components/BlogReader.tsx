import { ConvexProvider, ConvexReactClient, useQuery } from "convex/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Drawer } from "vaul";
import { api } from "../../convex/_generated/api";
import ArticleRenderer, { type PublicArticle } from "./ArticleRenderer";
import { resolveMediaUrl } from "../lib/media";

type Props = {
  convexUrl?: string;
};

const articleCache = new Map<string, PublicArticle>();
const articleRequests = new Map<string, Promise<PublicArticle | null>>();
const prefetchedArticleAssets = new Set<string>();

const prefetchArticleAssets = (article: PublicArticle) => {
  if (typeof window === "undefined") return;

  const assets: Array<{
    src?: string;
    kind: "image" | "video" | "audio";
  }> = [];
  if (article.cover?.src) {
    assets.push({
      src: article.cover.src,
      kind: article.cover.kind === "video" ? "video" : "image",
    });
  }
  if (article.narration?.src) {
    assets.push({ src: article.narration.src, kind: "audio" });
  }
  for (const block of article.body ?? []) {
    if (!block.src || !["image", "video", "audio"].includes(block.type)) continue;
    assets.push({
      src: block.src,
      kind: block.type as "image" | "video" | "audio",
    });
    if (assets.length >= 4) break;
  }

  for (const asset of assets) {
    const url = resolveMediaUrl(asset.src ?? "");
    if (!url || prefetchedArticleAssets.has(url)) continue;
    prefetchedArticleAssets.add(url);

    if (asset.kind === "image") {
      const image = new Image();
      image.decoding = "async";
      image.src = url;
      continue;
    }

    // Metadata preloading makes the drawer's first paint independent from a
    // later media request, without eagerly downloading the entire asset.
    const media =
      asset.kind === "audio" ? new Audio() : document.createElement("video");
    media.preload = "metadata";
    media.src = url;
  }
};

const prefetchArticle = (client: ConvexReactClient, slug: string) => {
  const cached = articleCache.get(slug);
  if (cached) return Promise.resolve(cached);

  const pending = articleRequests.get(slug);
  if (pending) return pending;

  const request = client
    .query(api.articles.publicBySlug, { slug })
    .then((article) => {
      const resolved = article as unknown as PublicArticle | null;
      if (resolved) {
        articleCache.set(slug, resolved);
        prefetchArticleAssets(resolved);
      }
      return resolved;
    })
    .finally(() => articleRequests.delete(slug));
  articleRequests.set(slug, request);
  return request;
};

const readPostSlug = () => {
  if (typeof window === "undefined") return null;
  return new URL(window.location.href).searchParams.get("post")?.trim() || null;
};

const updatePostQuery = (
  slug: string | null,
  mode: "pushState" | "replaceState",
) => {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (slug) url.searchParams.set("post", slug);
  else url.searchParams.delete("post");
  window.history[mode]({}, "", `${url.pathname}${url.search}${url.hash}`);
};

function useRequestedSlug() {
  const [requestedSlug, setRequestedSlug] = useState<string | null>(null);

  useEffect(() => {
    const sync = () => setRequestedSlug(readPostSlug());
    sync();
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);

  return [requestedSlug, setRequestedSlug] as const;
}

function useReaderState(
  requestedSlug: string | null,
  setRequestedSlug: (slug: string | null) => void,
  queriedArticle?: PublicArticle | null,
  readCachedArticle?: (slug: string) => PublicArticle | undefined,
) {
  const [post, setPost] = useState<PublicArticle | null>(null);
  const clearPostTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closingRef = useRef(false);

  const cancelPendingPostClear = () => {
    if (clearPostTimerRef.current === null) return;
    clearTimeout(clearPostTimerRef.current);
    clearPostTimerRef.current = null;
  };

  useEffect(() => {
    if (requestedSlug) {
      closingRef.current = false;
      cancelPendingPostClear();
      return;
    }
    // Keep the article mounted while the sheet translates off-screen. This
    // prevents the close from looking like a fade or a blank flash.
    if (!closingRef.current) setPost(null);
  }, [requestedSlug]);

  useEffect(() => () => cancelPendingPostClear(), []);

  useEffect(() => {
    if (!requestedSlug || queriedArticle === undefined) return;
    if (queriedArticle) {
      closingRef.current = false;
      cancelPendingPostClear();
      articleCache.set(queriedArticle.slug, queriedArticle);
      prefetchArticleAssets(queriedArticle);
      setPost(queriedArticle);
      return;
    }

    // A stale or unpublished shared URL should not leave an empty drawer open.
    closingRef.current = false;
    cancelPendingPostClear();
    setPost(null);
    setRequestedSlug(null);
    updatePostQuery(null, "replaceState");
  }, [queriedArticle, requestedSlug, setRequestedSlug]);

  useEffect(() => {
    const openPost = (event: Event) => {
      const next = (event as CustomEvent<PublicArticle>).detail;
      if (!next?.slug) return;
      closingRef.current = false;
      cancelPendingPostClear();
      const cached = readCachedArticle?.(next.slug);
      // Open immediately from the lightweight card metadata. The body query
      // resolves during the sheet's entrance animation, while intent-based
      // prefetch makes repeat and pointer/focus opens effectively instant.
      setPost(
        cached ??
          (Array.isArray(next.body) ? next : { ...next, body: [] }),
      );
      setRequestedSlug(next.slug);
      updatePostQuery(next.slug, "pushState");
    };

    window.addEventListener("portfolio:open-post", openPost);
    return () => window.removeEventListener("portfolio:open-post", openPost);
  }, [readCachedArticle, setRequestedSlug]);

  const close = () => {
    if (!post) {
      setRequestedSlug(null);
      updatePostQuery(null, "replaceState");
      return;
    }
    closingRef.current = true;
    cancelPendingPostClear();
    setRequestedSlug(null);
    updatePostQuery(null, "replaceState");
    clearPostTimerRef.current = setTimeout(() => {
      setPost(null);
      closingRef.current = false;
      clearPostTimerRef.current = null;
    }, 460);
  };

  return { post, close };
}

function BlogReaderShell({
  post,
  open,
  loading,
  close,
}: {
  post: PublicArticle | null;
  open: boolean;
  loading?: boolean;
  close: () => void;
}) {
  return (
    <Drawer.Root
      open={open}
      closeThreshold={0.24}
      onOpenChange={(open) => !open && close()}
    >
      <Drawer.Portal>
        <Drawer.Overlay className="blog-reader-overlay" />
        <Drawer.Content
          className="blog-reader"
          aria-describedby="blog-reader-summary"
        >
          <Drawer.Title className="sr-only">
            {post?.title ?? "Writing"}
          </Drawer.Title>
          <Drawer.Description className="sr-only" id="blog-reader-summary">
            {post?.summary ?? ""}
          </Drawer.Description>
          <div className="blog-reader-panel">
            <div className="drawer-drag-handle" aria-hidden="true">
              <span className="drawer-handle" />
            </div>
            {post ? <ArticleRenderer article={post} variant="drawer" /> : null}
            {loading ? (
              <div
                className={`blog-reader-loading${post ? "" : " blog-reader-loading-page"}`}
                aria-live="polite"
                aria-label="Loading article"
              >
                <span />
                <span />
                <span />
              </div>
            ) : null}
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}

function BlogReaderConvex({ client }: { client: ConvexReactClient }) {
  const [requestedSlug, setRequestedSlug] = useRequestedSlug();
  const queried = useQuery(
    api.articles.publicBySlug,
    requestedSlug ? { slug: requestedSlug } : "skip",
  );
  const readCachedArticle = useMemo(
    () => (slug: string) => articleCache.get(slug),
    [],
  );
  const { post, close } = useReaderState(
    requestedSlug,
    setRequestedSlug,
    queried as unknown as PublicArticle | null | undefined,
    readCachedArticle,
  );

  useEffect(() => {
    const prefetch = (event: Event) => {
      const slug = (event as CustomEvent<{ slug?: string }>).detail?.slug;
      if (slug) void prefetchArticle(client, slug);
    };
    window.addEventListener("portfolio:prefetch-post", prefetch);
    return () => window.removeEventListener("portfolio:prefetch-post", prefetch);
  }, [client]);

  return (
    <BlogReaderShell
      post={post}
      open={Boolean(requestedSlug)}
      loading={Boolean(
        requestedSlug &&
          queried === undefined &&
          !articleCache.has(requestedSlug),
      )}
      close={close}
    />
  );
}

function BlogReaderFallback() {
  const [requestedSlug, setRequestedSlug] = useRequestedSlug();
  const { post, close } = useReaderState(requestedSlug, setRequestedSlug);
  return (
    <BlogReaderShell
      post={post}
      open={Boolean(requestedSlug && post)}
      close={close}
    />
  );
}

export default function BlogReader({ convexUrl }: Props) {
  const client = useMemo(
    () => (convexUrl ? new ConvexReactClient(convexUrl) : null),
    [convexUrl],
  );

  if (!client) return <BlogReaderFallback />;
  return (
    <ConvexProvider client={client}>
      <BlogReaderConvex client={client} />
    </ConvexProvider>
  );
}
