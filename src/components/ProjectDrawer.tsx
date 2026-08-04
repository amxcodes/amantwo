import { useEffect, useMemo, useRef, useState } from "react";
import { Drawer } from "vaul";
import { resolveMediaUrl } from "../lib/media";

type DrawerProject = {
  eyebrow?: string;
  title?: string;
  summary?: string;
  caseStudy?: string;
  meta?: string;
  status?: string;
  tags?: string[];
  links?: Record<string, string>;
  media?: {
    type?: "image" | "video";
    src?: string;
    alt?: string;
  };
  mediaItems?: Array<{
    type?: "image" | "video";
    src?: string;
    alt?: string;
    caption?: string;
  }>;
};

const linkLabels: Record<string, string> = {
  live: "Live site",
  github: "GitHub",
  figma: "Figma",
};

const prefetchedProjectMedia = new Set<string>();

const prefetchProjectMedia = (project: DrawerProject) => {
  if (typeof window === "undefined") return;
  const sources = [
    ...(project.mediaItems ?? []),
    ...(project.media ? [project.media] : []),
  ];
  for (const item of sources) {
    if (!item.src) continue;
    const src = resolveMediaUrl(item.src);
    if (!src || prefetchedProjectMedia.has(src)) continue;
    prefetchedProjectMedia.add(src);
    if (item.type === "video") {
      const video = document.createElement("video");
      video.preload = "metadata";
      video.src = src;
    } else {
      const image = new Image();
      image.decoding = "async";
      image.src = src;
    }
  }
};

export default function ProjectDrawer() {
  const [project, setProject] = useState<DrawerProject | null>(null);
  const [mediaIndex, setMediaIndex] = useState(0);
  const [open, setOpen] = useState(false);
  const clearProjectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  const cancelPendingProjectClear = () => {
    if (clearProjectTimerRef.current === null) return;
    clearTimeout(clearProjectTimerRef.current);
    clearProjectTimerRef.current = null;
  };

  const close = () => {
    cancelPendingProjectClear();
    setOpen(false);
    // Keep the current media and copy mounted while Vaul runs the downward
    // exit animation. Clearing it immediately causes a visible content flash.
    clearProjectTimerRef.current = setTimeout(() => {
      setProject(null);
      clearProjectTimerRef.current = null;
    }, 520);
  };

  useEffect(() => {
    const openProject = (event: Event) => {
      const next = (event as CustomEvent<DrawerProject>).detail;
      if (!next) return;
      cancelPendingProjectClear();
      prefetchProjectMedia(next);
      setProject(next);
      setMediaIndex(0);
      setOpen(true);
    };

    const prefetch = (event: Event) => {
      const next = (event as CustomEvent<DrawerProject>).detail;
      if (next) prefetchProjectMedia(next);
    };

    window.addEventListener("portfolio:open-project", openProject);
    window.addEventListener("portfolio:prefetch-project", prefetch);
    return () => {
      cancelPendingProjectClear();
      window.removeEventListener("portfolio:open-project", openProject);
      window.removeEventListener("portfolio:prefetch-project", prefetch);
    };
  }, []);

  const mediaItems = useMemo(() => {
    const items =
      project?.mediaItems
        ?.filter((item) => item.src)
        .map((item) => ({
          ...item,
          src: resolveMediaUrl(item.src ?? ""),
        })) ?? [];
    if (!items.length && project?.media?.src) {
      items.push({
        ...project.media,
        src: resolveMediaUrl(project.media.src),
      });
    }
    return items;
  }, [project]);
  const media = mediaItems[mediaIndex];

  return (
    <Drawer.Root
      open={open}
      direction="bottom"
      dismissible
      handleOnly={false}
      scrollLockTimeout={120}
      closeThreshold={0.22}
      onOpenChange={(nextOpen) => {
        if (nextOpen) {
          cancelPendingProjectClear();
          setOpen(true);
          return;
        }
        close();
      }}
    >
      <Drawer.Portal>
        <Drawer.Overlay className="project-drawer-overlay" />
        <Drawer.Content
          className="project-drawer"
          aria-describedby="project-drawer-summary"
        >
          <section
            className="project-drawer-panel"
            aria-label="Project details"
          >
            <div className="drawer-drag-handle" aria-hidden="true">
              <span className="drawer-handle" aria-hidden="true" />
            </div>
            {media ? (
              <div className="drawer-media-stack">
                <div className="drawer-media">
                  {media.type === "video" ? (
                    <video
                      controls
                      playsInline
                      data-vaul-no-drag
                      preload="metadata"
                      src={media.src}
                    >
                      <track
                        kind="captions"
                        srcLang="en"
                        label="English captions"
                      />
                    </video>
                  ) : (
                    <img
                      src={media.src}
                      alt={media.alt ?? ""}
                      loading="eager"
                      decoding="async"
                      fetchPriority="high"
                    />
                  )}
                </div>
                {media.caption ? (
                  <p className="drawer-media-caption">{media.caption}</p>
                ) : null}
                {mediaItems.length > 1 ? (
                  <nav
                    className="drawer-media-pagination"
                    aria-label="Project media"
                    data-vaul-no-drag
                    onPointerDown={(event) => event.stopPropagation()}
                  >
                    <button
                      type="button"
                      data-vaul-no-drag
                      disabled={mediaIndex === 0}
                      onClick={() =>
                        setMediaIndex((index) => Math.max(0, index - 1))
                      }
                      aria-label="Previous media"
                    >
                      ←
                    </button>
                    <div>
                      {mediaItems.map((item, index) => (
                        <button
                          key={item.src}
                          type="button"
                          data-vaul-no-drag
                          aria-label={`Show media ${index + 1}`}
                          aria-current={index === mediaIndex}
                          onClick={() => setMediaIndex(index)}
                        />
                      ))}
                    </div>
                    <button
                      type="button"
                      data-vaul-no-drag
                      disabled={mediaIndex === mediaItems.length - 1}
                      onClick={() =>
                        setMediaIndex((index) =>
                          Math.min(mediaItems.length - 1, index + 1),
                        )
                      }
                      aria-label="Next media"
                    >
                      →
                    </button>
                  </nav>
                ) : null}
              </div>
            ) : (
              <div className="drawer-media-empty">
                <div>
                  <p>Media is being prepared</p>
                  <small>
                    The case study will open with images or film when it is
                    ready.
                  </small>
                </div>
              </div>
            )}
            <div className="drawer-content">
              <div className="drawer-topline">
                <p>{project?.eyebrow ?? "Selected work"}</p>
              </div>
              <Drawer.Title id="project-drawer-title">
                {project?.title ?? "Project"}
              </Drawer.Title>
              <Drawer.Description
                id="project-drawer-summary"
                className="drawer-summary"
              >
                {project?.summary}
              </Drawer.Description>
              <section
                className="drawer-case-study"
                aria-labelledby="case-study-title"
              >
                <p id="case-study-title">Case study</p>
                <p>{project?.caseStudy}</p>
              </section>
              {project?.tags?.length ? (
                <ul className="drawer-tags" aria-label="Project tags">
                  {project.tags.map((tag) => (
                    <li key={tag}>{tag}</li>
                  ))}
                </ul>
              ) : null}
              {project?.links ? (
                <nav
                  className="drawer-links"
                  aria-label="Project links"
                  data-vaul-no-drag
                  onPointerDown={(event) => event.stopPropagation()}
                >
                  {Object.entries(project.links).map(([key, href]) =>
                    href && linkLabels[key] ? (
                      <a
                        key={key}
                        href={href}
                        target="_blank"
                        rel="noreferrer"
                        data-vaul-no-drag
                      >
                        {linkLabels[key]} ↗
                      </a>
                    ) : null,
                  )}
                </nav>
              ) : null}
              <dl className="drawer-meta">
                <div>
                  <dt>Focus</dt>
                  <dd>{project?.meta}</dd>
                </div>
                <div>
                  <dt>State</dt>
                  <dd>{project?.status}</dd>
                </div>
              </dl>
            </div>
          </section>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
