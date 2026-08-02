import { useEffect, useState } from "react";
import { Drawer } from "vaul";
import ArticleRenderer, {
  type PublicArticle,
} from "./ArticleRenderer";

export default function BlogReader() {
  const [post, setPost] = useState<PublicArticle | null>(null);

  useEffect(() => {
    const openPost = (event: Event) =>
      setPost((event as CustomEvent<PublicArticle>).detail);
    window.addEventListener("portfolio:open-post", openPost);
    return () => window.removeEventListener("portfolio:open-post", openPost);
  }, []);

  return (
    <Drawer.Root
      open={Boolean(post)}
      closeThreshold={0.24}
      onOpenChange={(open) => !open && setPost(null)}
    >
      <Drawer.Portal>
        <Drawer.Overlay className="blog-reader-overlay" />
        <Drawer.Content
          className="blog-reader"
          aria-describedby="blog-reader-summary"
        >
          <Drawer.Title className="sr-only">{post?.title}</Drawer.Title>
          <Drawer.Description className="sr-only" id="blog-reader-summary">
            {post?.summary}
          </Drawer.Description>
          <div className="blog-reader-panel">
            <div className="drawer-drag-handle" aria-hidden="true">
              <span className="drawer-handle" />
            </div>
            {post ? (
              <ArticleRenderer article={post} variant="drawer" />
            ) : null}
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
