import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import "./article-renderer.css";
import VoiceNotePlayer from "./VoiceNotePlayer";
import ArticleShareButton from "./ArticleShareButton";
import { resolveMediaUrl } from "../lib/media";

export type PublicArticleBlock = {
  id?: string;
  type:
    | "paragraph"
    | "heading"
    | "quote"
    | "image"
    | "video"
    | "link"
    | "embed"
    | "audio"
    | "divider"
    | "callout"
    | "code"
    | "list";
  content?: string;
  level?: number;
  attribution?: string;
  src?: string;
  alt?: string;
  caption?: string;
  label?: string;
  href?: string;
  description?: string;
  provider?: string;
  timestampStart?: number;
  timestampEnd?: number;
  transcript?: string;
  language?: string;
  items?: string[];
  variant?: string;
  inlineAttachments?: Array<{
    id: string;
    kind: "link" | "audio" | "video" | "image" | "embed";
    label: string;
    href?: string;
    src?: string;
    alt?: string;
    transcript?: string;
  }>;
  highlights?: Array<{
    start: number;
    end: number;
    tone: "yellow" | "blue" | "green" | "orange";
  }>;
};

export type PublicArticle = {
  slug: string;
  meta: string;
  title: string;
  summary: string;
  readingTime: string;
  tone?: "blue" | "orange" | "green" | "yellow";
  publishedAt?: string | number;
  author?: { name: string; role?: string };
  cover?: {
    src: string;
    alt: string;
    caption?: string;
    kind?: "image" | "video" | "audio";
  };
  narration?: {
    src: string;
    alt: string;
    caption?: string;
    kind?: "image" | "video" | "audio";
  };
  links?: Array<{ label: string; href: string }>;
  body: PublicArticleBlock[];
};

type Props = {
  article: PublicArticle;
  variant?: "page" | "drawer";
  showPreferences?: boolean;
};

const slugify = (value: string, index: number) =>
  `${
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "section"
  }-${index + 1}`;

const headingLabel = (block: PublicArticleBlock) => {
  const content = typeof block.content === "string" ? block.content.trim() : "";
  if (content) return content;
  return typeof block.label === "string" ? block.label.trim() : "";
};

const formatDate = (value?: string | number) => {
  if (!value) return "";
  if (typeof value === "string" && Number.isNaN(Number(value))) return value;
  return new Intl.DateTimeFormat("en", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(Number(value)));
};

const youtubeId = (href = "") => {
  try {
    const url = new URL(href);
    return url.hostname.includes("youtu.be")
      ? url.pathname.slice(1)
      : (url.searchParams.get("v") ?? "");
  } catch {
    return "";
  }
};

function HighlightedText({
  value,
  highlights,
  offset = 0,
}: {
  value: string;
  highlights?: PublicArticleBlock["highlights"];
  offset?: number;
}) {
  const ranges = (highlights ?? [])
    .filter(
      (range) => range.end > offset && range.start < offset + value.length,
    )
    .sort((a, b) => a.start - b.start);
  if (!ranges.length) return <>{value}</>;
  const nodes: Array<ReactNode> = [];
  let cursor = 0;
  ranges.forEach((range, index) => {
    const start = Math.max(cursor, range.start - offset);
    const end = Math.min(value.length, Math.max(start, range.end - offset));
    if (start > cursor) nodes.push(value.slice(cursor, start));
    if (end > start)
      nodes.push(
        <mark
          className={`article-highlight tone-${range.tone}`}
          key={`${range.start}-${index}`}
        >
          {value.slice(start, end)}
        </mark>,
      );
    cursor = end;
  });
  if (cursor < value.length) nodes.push(value.slice(cursor));
  return <>{nodes}</>;
}

function InlineAttachmentPill({
  attachment,
}: {
  attachment: NonNullable<PublicArticleBlock["inlineAttachments"]>[number];
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const icon =
    attachment.kind === "audio"
      ? "◉"
      : attachment.kind === "image"
        ? "▧"
        : attachment.kind === "video"
          ? "▷"
          : "↗";
  if (attachment.kind === "audio" && attachment.src) {
    return (
      <span className="article-inline-pill article-inline-pill-audio">
        <button
          type="button"
          onClick={() => {
            const audio = audioRef.current;
            if (!audio) return;
            if (playing) audio.pause();
            else void audio.play();
            setPlaying(!playing);
          }}
          aria-label={`${playing ? "Pause" : "Play"} ${attachment.label}`}
        >
          <span aria-hidden="true">{playing ? "Ⅱ" : icon}</span>
          {attachment.label}
        </button>
        {/* biome-ignore lint/a11y/useMediaCaption: inline voice notes expose their transcript in the article model. */}
        <audio
          ref={audioRef}
          src={resolveMediaUrl(attachment.src)}
          preload="metadata"
          onEnded={() => setPlaying(false)}
        />
      </span>
    );
  }
  const href = attachment.href ?? attachment.src ?? "#";
  return (
    <a
      className={`article-inline-pill article-inline-pill-${attachment.kind}`}
      href={href}
      target="_blank"
      rel="noreferrer"
    >
      <span aria-hidden="true">{icon}</span>
      {attachment.label || attachment.kind}
    </a>
  );
}

function InlineContent({
  value,
  highlights,
  inlineAttachments,
}: {
  value: string;
  highlights?: PublicArticleBlock["highlights"];
  inlineAttachments?: PublicArticleBlock["inlineAttachments"];
}) {
  if (!inlineAttachments?.length || !value.includes("\uE000")) {
    return <HighlightedText value={value} highlights={highlights} />;
  }
  const nodes: Array<ReactNode> = [];
  const lookup = new Map(
    inlineAttachments.map((attachment) => [attachment.id, attachment]),
  );
  const pattern = /\uE000([^\uE001]+)\uE001/g;
  let cursor = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(value))) {
    const start = match.index;
    if (start > cursor)
      nodes.push(
        <HighlightedText
          key={`text-${start}`}
          value={value.slice(cursor, start)}
          highlights={highlights}
          offset={cursor}
        />,
      );
    const attachment = lookup.get(match[1]);
    if (attachment)
      nodes.push(
        <InlineAttachmentPill
          key={`attachment-${attachment.id}`}
          attachment={attachment}
        />,
      );
    else nodes.push(match[0]);
    cursor = start + match[0].length;
  }
  if (cursor < value.length)
    nodes.push(
      <HighlightedText
        key={`text-${cursor}`}
        value={value.slice(cursor)}
        highlights={highlights}
        offset={cursor}
      />,
    );
  return <>{nodes}</>;
}

function SmartLink({ block }: { block: PublicArticleBlock }) {
  const href = block.href ?? "#";
  let host = "Link";
  try {
    host = new URL(href).hostname.replace(/^www\./, "");
  } catch {
    /* keep generic label */
  }
  return (
    <a
      className="article-smart-link"
      href={href}
      target="_blank"
      rel="noreferrer"
    >
      <span className="article-smart-link-domain">
        <i aria-hidden="true">↗</i>
        {host}
      </span>
      <strong>{block.label || href}</strong>
      {block.description ? <small>{block.description}</small> : null}
    </a>
  );
}

function RichEmbed({ block }: { block: PublicArticleBlock }) {
  const [active, setActive] = useState(false);
  const id = youtubeId(block.href);
  const start = Math.max(0, block.timestampStart ?? 0);
  if ((block.provider === "youtube" || id) && id) {
    return (
      <figure className="article-embed">
        {active ? (
          <iframe
            src={`https://www.youtube-nocookie.com/embed/${id}?autoplay=1&start=${start}`}
            title={block.label || "YouTube video"}
            allow="accelerometer; autoplay; encrypted-media; picture-in-picture"
            allowFullScreen
            loading="lazy"
          />
        ) : (
          <button type="button" onClick={() => setActive(true)}>
            <span>▶</span>
            <strong>{block.label || "Play embedded video"}</strong>
            {start ? (
              <small>
                Starts at {Math.floor(start / 60)}:
                {String(start % 60).padStart(2, "0")}
              </small>
            ) : null}
          </button>
        )}
        {block.caption ? <figcaption>{block.caption}</figcaption> : null}
      </figure>
    );
  }
  return <SmartLink block={block} />;
}

export default function ArticleRenderer({
  article,
  variant = "page",
  showPreferences = true,
}: Props) {
  const articleRef = useRef<HTMLElement>(null);
  const [progress, setProgress] = useState(0);
  const [textSize, setTextSize] = useState<"small" | "medium" | "large">(
    "medium",
  );
  const [measure, setMeasure] = useState<"comfortable" | "wide">("comfortable");
  const [typeface, setTypeface] = useState<"serif" | "sans">("serif");
  const [spacing, setSpacing] = useState<"compact" | "relaxed">("relaxed");
  const [preferencesOpen, setPreferencesOpen] = useState(false);
  const [indexOpen, setIndexOpen] = useState(false);
  const [indexMenuReady, setIndexMenuReady] = useState(false);
  const indexTriggerRef = useRef<HTMLButtonElement>(null);
  const indexPopoverRef = useRef<HTMLDivElement>(null);
  const [indexMenuStyle, setIndexMenuStyle] = useState<React.CSSProperties>({});
  const headings = useMemo(
    () =>
      article.body.flatMap((block, index) =>
        block.type === "heading"
          ? (() => {
              const label = headingLabel(block);
              return label
                ? [{ id: block.id || slugify(label, index), label }]
                : [];
            })()
          : [],
      ),
    [article.body],
  );

  useEffect(() => {
    if (!indexOpen) {
      setIndexMenuReady(false);
      return;
    }

    // Measure before revealing the portal so a press never flashes an
    // unpositioned, full-width menu at the viewport origin.
    setIndexMenuReady(false);
    const updateIndexPosition = () => {
      const trigger = indexTriggerRef.current;
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      const width = Math.min(400, Math.max(220, window.innerWidth - 24));
      const left = Math.min(
        Math.max(12, rect.right - width),
        Math.max(12, window.innerWidth - width - 12),
      );
      const viewportPadding = 12;
      const menuGap = 8;
      const availableAbove = Math.max(
        0,
        rect.top - menuGap - viewportPadding,
      );
      const availableBelow = Math.max(
        0,
        window.innerHeight - rect.bottom - menuGap - viewportPadding,
      );
      const opensAbove = availableAbove >= availableBelow;
      const availableRoom = opensAbove ? availableAbove : availableBelow;
      const viewportRoom = Math.max(
        96,
        window.innerHeight - viewportPadding * 2,
      );
      // If the trigger is pressed against an edge, use the full safe viewport
      // rather than allowing a tiny menu to spill past the drawer/window.
      const maxHeight =
        availableRoom < 96
          ? Math.min(360, viewportRoom)
          : Math.min(360, availableRoom);
      setIndexMenuStyle({
        left,
        width,
        maxHeight,
        ...(availableRoom < 96
          ? {
              top: viewportPadding,
              bottom: undefined,
            }
          : opensAbove
            ? {
                top: undefined,
                bottom: Math.max(
                  viewportPadding,
                  window.innerHeight - rect.top + menuGap,
                ),
              }
            : {
                top: Math.min(
                  window.innerHeight - viewportPadding - 96,
                  rect.bottom + menuGap,
                ),
                bottom: undefined,
              }),
      });
      setIndexMenuReady(true);
    };
    updateIndexPosition();
    const scrollRoot =
      indexTriggerRef.current?.closest<HTMLElement>(".blog-reader-panel");
    (scrollRoot ?? window).addEventListener("scroll", updateIndexPosition, {
      passive: true,
    });
    window.addEventListener("resize", updateIndexPosition);
    return () => {
      (scrollRoot ?? window).removeEventListener("scroll", updateIndexPosition);
      window.removeEventListener("resize", updateIndexPosition);
    };
  }, [indexOpen]);

  const handleIndexSelect = (id: string) => {
    // The page and drawer can contain the same article at the same time.
    // Resolve the heading inside this renderer, never the first global match.
    const target = Array.from(
      articleRef.current?.querySelectorAll<HTMLElement>("[id]") ?? [],
    ).find((element) => element.id === id);
    if (!target) return;

    const scrollRoot = articleRef.current?.closest<HTMLElement>(
      ".blog-reader-panel",
    );
    if (scrollRoot) {
      const targetRect = target.getBoundingClientRect();
      const rootRect = scrollRoot.getBoundingClientRect();
      scrollRoot.scrollBy({
        top: targetRect.top - rootRect.top - 56,
        behavior: "smooth",
      });
    } else {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    setIndexOpen(false);
  };

  useEffect(() => {
    if (!indexOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIndexOpen(false);
    };
    // Dismiss on click rather than pointerdown. A native document-level
    // pointerdown listener runs before React's portal handlers and can close
    // the menu before an index item receives its click, especially on touch.
    const closeOnOutsideClick = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (
        target &&
        !indexTriggerRef.current?.contains(target) &&
        !indexPopoverRef.current?.contains(target)
      ) {
        setIndexOpen(false);
      }
    };
    document.addEventListener("keydown", closeOnEscape);
    document.addEventListener("click", closeOnOutsideClick);
    return () => {
      document.removeEventListener("keydown", closeOnEscape);
      document.removeEventListener("click", closeOnOutsideClick);
    };
  }, [indexOpen]);

  useEffect(() => {
    const update = () => {
      const element = articleRef.current;
      if (!element) return;
      const scrollRoot = element.closest<HTMLElement>(".blog-reader-panel");
      if (scrollRoot) {
        const distance = Math.max(
          1,
          scrollRoot.scrollHeight - scrollRoot.clientHeight,
        );
        setProgress(
          Math.min(100, Math.max(0, (scrollRoot.scrollTop / distance) * 100)),
        );
        return;
      }
      const rect = element.getBoundingClientRect();
      const distance = Math.max(1, rect.height - window.innerHeight);
      setProgress(Math.min(100, Math.max(0, (-rect.top / distance) * 100)));
    };
    const scrollRoot =
      articleRef.current?.closest<HTMLElement>(".blog-reader-panel");
    update();
    (scrollRoot ?? window).addEventListener("scroll", update, {
      passive: true,
    });
    window.addEventListener("resize", update);
    return () => {
      (scrollRoot ?? window).removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  return (
    <article
      ref={articleRef}
      className={`article-renderer article-renderer-${variant} size-${textSize} measure-${measure} type-${typeface} spacing-${spacing}`}
    >
      <div className="article-reading-progress" aria-hidden="true">
        <i style={{ width: `${progress}%` }} />
      </div>
      <header className="article-renderer-header">
        <div className="article-renderer-meta">
          <span>{article.meta}</span>
          <span>
            {[article.readingTime, formatDate(article.publishedAt)]
              .filter(Boolean)
              .join(" · ")}
          </span>
        </div>
        <h1>{article.title}</h1>
        <p>{article.summary}</p>
        <div
          className={`article-renderer-header-tools${article.narration?.src ? " has-narration" : ""}`}
        >
          {article.narration?.src ? (
            <VoiceNotePlayer
              src={resolveMediaUrl(article.narration.src)}
              label={article.narration.alt}
              links={article.links}
            />
          ) : null}
          <div className="article-renderer-actions">
            <ArticleShareButton slug={article.slug} title={article.title} />
          </div>
        </div>
      </header>

      {showPreferences ? (
        <section
          className="article-reader-tools"
          aria-label="Reading preferences"
        >
          <button
            className="article-reader-trigger"
            type="button"
            aria-expanded={preferencesOpen}
            aria-controls="article-reader-preferences"
            onClick={() => setPreferencesOpen((open) => !open)}
          >
            <span aria-hidden="true">Aa</span>
            <strong>Reading</strong>
            <small>{Math.round(progress)}%</small>
          </button>
          {preferencesOpen ? (
            <div
              className="article-reader-preferences"
              id="article-reader-preferences"
            >
              <fieldset>
                <legend>Text size</legend>
                {(["small", "medium", "large"] as const).map((value) => (
                  <button
                    type="button"
                    key={value}
                    aria-pressed={textSize === value}
                    onClick={() => setTextSize(value)}
                  >
                    {value}
                  </button>
                ))}
              </fieldset>
              <fieldset>
                <legend>Measure</legend>
                {(["comfortable", "wide"] as const).map((value) => (
                  <button
                    type="button"
                    key={value}
                    aria-pressed={measure === value}
                    onClick={() => setMeasure(value)}
                  >
                    {value}
                  </button>
                ))}
              </fieldset>
              <fieldset>
                <legend>Typeface</legend>
                {(["serif", "sans"] as const).map((value) => (
                  <button
                    type="button"
                    key={value}
                    aria-pressed={typeface === value}
                    onClick={() => setTypeface(value)}
                  >
                    {value}
                  </button>
                ))}
              </fieldset>
              <fieldset>
                <legend>Spacing</legend>
                {(["compact", "relaxed"] as const).map((value) => (
                  <button
                    type="button"
                    key={value}
                    aria-pressed={spacing === value}
                    onClick={() => setSpacing(value)}
                  >
                    {value}
                  </button>
                ))}
              </fieldset>
            </div>
          ) : null}
        </section>
      ) : null}

      {article.cover?.src ? (
        <figure className="article-renderer-cover">
          {article.cover.kind === "video" ? (
            <video
              controls
              preload="metadata"
              src={resolveMediaUrl(article.cover.src)}
            >
              <track kind="captions" srcLang="en" label="English captions" />
            </video>
          ) : (
            <img
              src={resolveMediaUrl(article.cover.src)}
              alt={article.cover.alt}
              loading="eager"
              decoding="async"
              fetchPriority="high"
            />
          )}
          {article.cover.caption ? (
            <figcaption>{article.cover.caption}</figcaption>
          ) : null}
        </figure>
      ) : null}

      {headings.length > 0 ? (
        <nav className="article-index" aria-label="On this page">
          <button
            className="article-index-trigger"
            ref={indexTriggerRef}
            type="button"
            aria-expanded={indexOpen}
            aria-controls="article-index-popover"
            onClick={() => {
              setIndexMenuReady(false);
              setIndexOpen((open) => !open);
            }}
          >
            <span>Index</span>
            <span aria-hidden="true">{headings.length}</span>
          </button>
        </nav>
      ) : null}

      {indexOpen && typeof document !== "undefined"
        ? createPortal(
            <div
              className="article-index-popover"
              ref={indexPopoverRef}
              id="article-index-popover"
              role="dialog"
              aria-label="Article index"
              data-positioned={indexMenuReady ? "true" : "false"}
              style={indexMenuStyle}
              onPointerDown={(event) => event.stopPropagation()}
              onPointerMove={(event) => event.stopPropagation()}
              onTouchStart={(event) => event.stopPropagation()}
              onTouchMove={(event) => event.stopPropagation()}
              onWheel={(event) => event.stopPropagation()}
              onClick={(event) => event.stopPropagation()}
            >
              <div className="article-index-popover-header">
                <span>Index</span>
                <span>{headings.length}</span>
              </div>
              <ol>
                {headings.map((heading, index) => (
                  <li key={heading.id}>
                    <a
                      href={`#${heading.id}`}
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        handleIndexSelect(heading.id);
                      }}
                    >
                      <span aria-hidden="true">{index + 1}</span>
                      {heading.label}
                    </a>
                  </li>
                ))}
              </ol>
            </div>,
            document.body,
          )
        : null}

      <div className="article-renderer-body">
        {article.body.map((block, index) => {
          const key = block.id ?? `${block.type}-${index}`;
          if (block.type === "heading") {
            const label = headingLabel(block);
            const id = block.id || slugify(label, index);
            return block.level === 3 ? (
              <h3 id={id} key={key}>
                <InlineContent
                  value={label}
                  highlights={block.highlights}
                  inlineAttachments={block.inlineAttachments}
                />
              </h3>
            ) : (
              <h2 id={id} key={key}>
                <InlineContent
                  value={label}
                  highlights={block.highlights}
                  inlineAttachments={block.inlineAttachments}
                />
              </h2>
            );
          }
          if (block.type === "quote")
            return (
              <blockquote key={key}>
                <p>
                  <InlineContent
                    value={block.content ?? ""}
                    highlights={block.highlights}
                    inlineAttachments={block.inlineAttachments}
                  />
                </p>
                {block.attribution ? <cite>{block.attribution}</cite> : null}
              </blockquote>
            );
          if (block.type === "image")
            return (
              <figure key={key}>
                <img
                  src={resolveMediaUrl(block.src ?? "")}
                  alt={block.alt ?? ""}
                  loading="lazy"
                />
                {block.caption ? (
                  <figcaption>{block.caption}</figcaption>
                ) : null}
              </figure>
            );
          if (block.type === "video")
            return (
              <figure key={key}>
                <video
                  src={resolveMediaUrl(block.src ?? "")}
                  controls
                  preload="metadata"
                >
                  <track
                    kind="captions"
                    srcLang="en"
                    label="English captions"
                  />
                </video>
                {block.caption ? (
                  <figcaption>{block.caption}</figcaption>
                ) : null}
              </figure>
            );
          if (block.type === "audio")
            return (
              <VoiceNotePlayer
                key={key}
                src={resolveMediaUrl(block.src ?? "")}
                label={block.label}
                transcript={block.transcript}
              />
            );
          if (block.type === "link")
            return <SmartLink key={key} block={block} />;
          if (block.type === "embed")
            return <RichEmbed key={key} block={block} />;
          if (block.type === "divider") return <hr key={key} />;
          if (block.type === "callout")
            return (
              <aside
                className={`article-callout variant-${block.variant ?? "note"}`}
                key={key}
              >
                <InlineContent
                  value={block.content ?? ""}
                  highlights={block.highlights}
                  inlineAttachments={block.inlineAttachments}
                />
              </aside>
            );
          if (block.type === "code")
            return (
              <pre key={key} data-language={block.language ?? "text"}>
                <code>{block.content}</code>
              </pre>
            );
          if (block.type === "list")
            return (
              <ul key={key}>
                {block.items?.map((item) => (
                  <li key={`${key}-${item}`}>{item}</li>
                ))}
              </ul>
            );
          return (
            <p key={key}>
              <InlineContent
                value={block.content ?? ""}
                highlights={block.highlights}
                inlineAttachments={block.inlineAttachments}
              />
            </p>
          );
        })}
      </div>
      {article.links?.length && !article.narration?.src ? (
        <nav className="article-related-links" aria-label="Related links">
          {article.links.map((link) => (
            <a
              key={link.href}
              href={link.href}
              target="_blank"
              rel="noreferrer"
            >
              {link.label}
              <span>↗</span>
            </a>
          ))}
        </nav>
      ) : null}
      {article.author ? (
        <footer className="article-author">
          Written by <strong>{article.author.name}</strong>
          {article.author.role ? ` · ${article.author.role}` : ""}
        </footer>
      ) : null}
    </article>
  );
}
