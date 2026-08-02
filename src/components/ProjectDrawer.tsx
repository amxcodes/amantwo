import { useEffect, useState } from "react";
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

export default function ProjectDrawer() {
  const [project, setProject] = useState<DrawerProject | null>(null);
  const [mediaIndex, setMediaIndex] = useState(0);

  useEffect(() => {
    const openProject = (event: Event) => {
      setProject((event as CustomEvent<DrawerProject>).detail);
      setMediaIndex(0);
    };

    window.addEventListener("portfolio:open-project", openProject);
    return () =>
      window.removeEventListener("portfolio:open-project", openProject);
  }, []);

  const mediaItems = project?.mediaItems
    ?.filter((item) => item.src)
    .map((item) => ({ ...item, src: resolveMediaUrl(item.src ?? "") })) ?? [];
  if (!mediaItems.length && project?.media?.src) {
    mediaItems.push({
      ...project.media,
      src: resolveMediaUrl(project.media.src),
    });
  }
  const media = mediaItems[mediaIndex];

  return (
    <Drawer.Root
      open={Boolean(project)}
      closeThreshold={0.22}
      onOpenChange={(open) => {
        if (!open) setProject(null);
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
                    <img src={media.src} alt={media.alt ?? ""} />
                  )}
                </div>
                {media.caption ? (
                  <p className="drawer-media-caption">{media.caption}</p>
                ) : null}
                {mediaItems.length > 1 ? (
                  <nav
                    className="drawer-media-pagination"
                    aria-label="Project media"
                  >
                    <button
                      type="button"
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
                          aria-label={`Show media ${index + 1}`}
                          aria-current={index === mediaIndex}
                          onClick={() => setMediaIndex(index)}
                        />
                      ))}
                    </div>
                    <button
                      type="button"
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
                <nav className="drawer-links" aria-label="Project links">
                  {Object.entries(project.links).map(([key, href]) =>
                    href && linkLabels[key] ? (
                      <a key={key} href={href} target="_blank" rel="noreferrer">
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
