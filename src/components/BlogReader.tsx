import { ConvexProvider, ConvexReactClient, useQuery } from "convex/react";
import { useEffect, useMemo, useState } from "react";
import { Drawer } from "vaul";
import { api } from "../../convex/_generated/api";
import ArticleRenderer, { type PublicArticle } from "./ArticleRenderer";

type Props = {
  convexUrl?: string;
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
) {
  const [post, setPost] = useState<PublicArticle | null>(null);

  useEffect(() => {
    if (!requestedSlug) setPost(null);
  }, [requestedSlug]);

  useEffect(() => {
    if (!requestedSlug || queriedArticle === undefined) return;
    if (queriedArticle) {
      setPost(queriedArticle);
      return;
    }

    // A stale or unpublished shared URL should not leave an empty drawer open.
    setPost(null);
    setRequestedSlug(null);
    updatePostQuery(null, "replaceState");
  }, [queriedArticle, requestedSlug, setRequestedSlug]);

  useEffect(() => {
    const openPost = (event: Event) => {
      const next = (event as CustomEvent<PublicArticle>).detail;
      if (!next?.slug) return;
      setPost(next);
      setRequestedSlug(next.slug);
      updatePostQuery(next.slug, "pushState");
    };

    window.addEventListener("portfolio:open-post", openPost);
    return () => window.removeEventListener("portfolio:open-post", openPost);
  }, [setRequestedSlug]);

  const close = () => {
    setPost(null);
    setRequestedSlug(null);
    updatePostQuery(null, "replaceState");
  };

  return { post, close };
}

function BlogReaderShell({
  post,
  close,
}: {
  post: PublicArticle | null;
  close: () => void;
}) {
  return (
    <Drawer.Root
      open={Boolean(post)}
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
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}

function BlogReaderConvex() {
  const [requestedSlug, setRequestedSlug] = useRequestedSlug();
  const queried = useQuery(
    api.articles.publicBySlug,
    requestedSlug ? { slug: requestedSlug } : "skip",
  );
  const { post, close } = useReaderState(
    requestedSlug,
    setRequestedSlug,
    queried as unknown as PublicArticle | null | undefined,
  );

  return <BlogReaderShell post={post} close={close} />;
}

function BlogReaderFallback() {
  const [requestedSlug, setRequestedSlug] = useRequestedSlug();
  const { post, close } = useReaderState(requestedSlug, setRequestedSlug);
  return <BlogReaderShell post={post} close={close} />;
}

export default function BlogReader({ convexUrl }: Props) {
  const client = useMemo(
    () => (convexUrl ? new ConvexReactClient(convexUrl) : null),
    [convexUrl],
  );

  if (!client) return <BlogReaderFallback />;
  return (
    <ConvexProvider client={client}>
      <BlogReaderConvex />
    </ConvexProvider>
  );
}
