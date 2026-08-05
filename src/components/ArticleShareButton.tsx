import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { createPortal } from "react-dom";

type Props = {
  slug: string;
  title: string;
  summary?: string;
  meta?: string;
  readingTime?: string;
  publishedLabel?: string;
  tone?: "blue" | "orange" | "green" | "yellow";
  coverSrc?: string;
  className?: string;
};

const shareUrl = (slug: string) => {
  const url = new URL("/", window.location.origin);
  url.searchParams.set("post", slug);
  return url.toString();
};

const copyText = async (value: string) => {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(value);
      return;
    } catch {
      // Fall through to the older selection-based copy path.
    }
  }

  const input = document.createElement("textarea");
  input.value = value;
  input.setAttribute("readonly", "");
  input.style.position = "fixed";
  input.style.opacity = "0";
  document.body.appendChild(input);
  input.select();
  const legacyCopy = Reflect.get(document, "execCommand") as
    | ((command: string) => boolean)
    | undefined;
  try {
    if (!legacyCopy?.call(document, "copy")) {
      throw new Error("Clipboard access is unavailable");
    }
  } finally {
    input.remove();
  }
};

export default function ArticleShareButton({
  slug,
  title,
  summary,
  meta,
  readingTime,
  publishedLabel,
  tone = "blue",
  coverSrc,
  className = "",
}: Props) {
  const [copied, setCopied] = useState(false);
  const [storyOpen, setStoryOpen] = useState(false);
  const [storyImageUrl, setStoryImageUrl] = useState<string | null>(null);
  const [storyPreparing, setStoryPreparing] = useState(false);
  const [storyLinkCopied, setStoryLinkCopied] = useState(false);
  const longPressTimer = useRef<number | undefined>(undefined);
  const longPressTriggered = useRef(false);
  const storyObjectUrl = useRef<string | null>(null);

  useEffect(
    () => () => {
      if (longPressTimer.current) window.clearTimeout(longPressTimer.current);
      if (storyObjectUrl.current) URL.revokeObjectURL(storyObjectUrl.current);
    },
    [],
  );

  const share = async () => {
    const url = shareUrl(slug);

    try {
      if (navigator.share) {
        await navigator.share({
          title,
          text: `Read ${title}`,
          url,
        });
        return;
      }

      await copyText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      try {
        await copyText(url);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1800);
      } catch {
        // Clipboard access can be unavailable in embedded or restricted contexts.
      }
    }
  };

  const clearLongPress = () => {
    if (longPressTimer.current) {
      window.clearTimeout(longPressTimer.current);
      longPressTimer.current = undefined;
    }
  };

  const isMobilePointer = (event: ReactPointerEvent<HTMLButtonElement>) =>
    event.pointerType === "touch" &&
    window.matchMedia("(max-width: 820px) and (pointer: coarse)").matches;

  const openStoryFlow = () => {
    const url = shareUrl(slug);
    setStoryLinkCopied(false);
    void copyText(url)
      .then(() => {
        setStoryLinkCopied(true);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1800);
      })
      .catch(() => setStoryLinkCopied(false));
    setStoryOpen(true);
    setStoryPreparing(true);
    void import("../lib/story-card")
      .then(({ createStoryCard }) =>
        createStoryCard({
          title,
          summary,
          meta,
          readingTime,
          publishedLabel,
          url,
          tone,
          coverSrc,
        }),
      )
      .then((blob) => {
        if (storyObjectUrl.current) URL.revokeObjectURL(storyObjectUrl.current);
        storyObjectUrl.current = URL.createObjectURL(blob);
        setStoryImageUrl(storyObjectUrl.current);
      })
      .catch(() => setStoryImageUrl(null))
      .finally(() => setStoryPreparing(false));
  };

  const downloadStory = () => {
    if (!storyImageUrl) return;
    const link = document.createElement("a");
    link.href = storyImageUrl;
    link.download = `${slug}-story.png`;
    link.click();
  };

  const shareStory = async () => {
    if (!storyImageUrl) return;
    const response = await fetch(storyImageUrl);
    const file = new File([await response.blob()], `${slug}-story.png`, {
      type: "image/png",
    });
    try {
      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          files: [file],
          title,
          text: `Read ${title}`,
          url: shareUrl(slug),
        });
      } else if (navigator.share) {
        await navigator.share({
          title,
          text: `Read ${title}`,
          url: shareUrl(slug),
        });
      } else {
        downloadStory();
      }
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) {
        downloadStory();
      }
    }
  };

  return (
    <>
      <button
        className={`article-share-button ${className}`.trim()}
        type="button"
        data-vaul-no-drag
        onPointerDown={(event) => {
          event.stopPropagation();
          if (!isMobilePointer(event)) return;
          clearLongPress();
          longPressTriggered.current = false;
          longPressTimer.current = window.setTimeout(() => {
            longPressTriggered.current = true;
            openStoryFlow();
          }, 720);
        }}
        onPointerMove={(event) => {
          if (
            isMobilePointer(event) &&
            Math.abs(event.movementX) + Math.abs(event.movementY) > 10
          ) {
            clearLongPress();
          }
        }}
        onPointerUp={() => clearLongPress()}
        onPointerCancel={() => clearLongPress()}
        onContextMenu={(event) => event.preventDefault()}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          if (longPressTriggered.current) {
            longPressTriggered.current = false;
            return;
          }
          void share();
        }}
        aria-label={copied ? "Link copied" : `Share ${title}`}
        data-copied={copied ? "true" : undefined}
      >
        <span>{copied ? "Copied" : "Share note"}</span>
      </button>
      {storyOpen && typeof document !== "undefined"
        ? createPortal(
            <div
              className="story-share-sheet"
              role="presentation"
              onPointerDown={() => setStoryOpen(false)}
            >
              <section
                className="story-share-sheet-panel"
                role="dialog"
                aria-modal="true"
                aria-labelledby="story-share-title"
                onPointerDown={(event) => event.stopPropagation()}
              >
                <div className="story-share-sheet-handle" aria-hidden="true" />
                <header>
                  <div>
                    <p>STORY CARD</p>
                    <h2 id="story-share-title">Share this note</h2>
                  </div>
                  <button
                    type="button"
                    className="story-share-close"
                    onClick={() => setStoryOpen(false)}
                    aria-label="Close story sharing"
                  >
                    ×
                  </button>
                </header>
                <div className="story-share-preview">
                  {storyImageUrl ? (
                    <img
                      src={storyImageUrl}
                      alt="Generated story card preview"
                    />
                  ) : (
                    <div
                      className="story-share-preview-loading"
                      aria-busy="true"
                    >
                      {storyPreparing
                        ? "Preparing your card…"
                        : "Story card unavailable"}
                    </div>
                  )}
                </div>
                <p className="story-share-note">
                  {storyLinkCopied
                    ? "The note link is copied. Choose Instagram from the share sheet, or save the card and add the link sticker in Instagram."
                    : "Copy the link below, then choose Instagram from the share sheet or add the link sticker manually."}
                </p>
                <div className="story-share-actions">
                  <button
                    type="button"
                    className="story-share-primary"
                    disabled={!storyImageUrl}
                    onClick={() => void shareStory()}
                  >
                    Share story image
                  </button>
                  <button
                    type="button"
                    className="story-share-secondary"
                    disabled={!storyImageUrl}
                    onClick={downloadStory}
                  >
                    Save image
                  </button>
                  <button
                    type="button"
                    className="story-share-secondary"
                    onClick={() =>
                      void copyText(shareUrl(slug))
                        .then(() => {
                          setStoryLinkCopied(true);
                          setCopied(true);
                          window.setTimeout(() => setCopied(false), 1800);
                        })
                        .catch(() => setStoryLinkCopied(false))
                    }
                  >
                    Copy link
                  </button>
                </div>
              </section>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
