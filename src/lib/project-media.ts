export type ProjectMediaType = "image" | "video" | "youtube";

export type ProjectMedia = {
  type: ProjectMediaType;
  src: string;
  alt: string;
  caption?: string;
};

const videoSourcePattern = /\.(?:mp4|webm|mov|m4v|ogv)(?:[?#]|$)/i;

/**
 * Recognises YouTube links without making the public media contract depend on
 * a provider-specific URL shape. It supports watch, short, embed, live, and
 * youtu.be links.
 */
export const youtubeVideoId = (source: string): string | undefined => {
  try {
    const url = new URL(source);
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    if (host === "youtu.be") {
      return url.pathname.split("/").filter(Boolean)[0];
    }
    if (host !== "youtube.com" && host !== "youtube-nocookie.com") {
      return undefined;
    }
    const queryId = url.searchParams.get("v");
    if (queryId) return queryId;
    const parts = url.pathname.split("/").filter(Boolean);
    if (["embed", "shorts", "live"].includes(parts[0] ?? "")) {
      return parts[1];
    }
  } catch {
    // Invalid/unfinished URLs are normal while editing. They simply remain
    // ordinary media text until a valid URL is supplied.
  }
  return undefined;
};

export const youtubeEmbedUrl = (
  source: string,
  options: { autoplay?: boolean } = {},
): string | undefined => {
  const id = youtubeVideoId(source);
  if (!id) return undefined;

  const params = new URLSearchParams({
    rel: "0",
    modestbranding: "1",
    controls: "0",
    playsinline: "1",
    disablekb: "1",
  });

  if (options.autoplay) {
    // YouTube requires the video id in `playlist` for a single-video loop.
    // Muted autoplay is the reliable browser-safe mode for an ambient drawer
    // preview and keeps the media from interrupting the visitor.
    params.set("autoplay", "1");
    params.set("mute", "1");
    params.set("loop", "1");
    params.set("playlist", id);
  }

  return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?${params.toString()}`;
};

export const classifyProjectMedia = (
  source: string,
  explicitType?: unknown,
): ProjectMediaType => {
  const type = String(explicitType ?? "").trim().toLowerCase();
  // Strong URL signals win over stale editor metadata. Older project records
  // were saved as `image` even when their source was an MP4 or YouTube URL.
  if (youtubeVideoId(source)) return "youtube";
  if (videoSourcePattern.test(source)) return "video";
  if (type === "youtube" || type === "video" || type === "image") {
    return type;
  }
  return "image";
};

/** Normalises content from the editor, ImageKit, and older stored records. */
export const normalizeProjectMedia = (
  value: unknown,
  fallbackAlt: string,
): ProjectMedia | undefined => {
  if (!value || typeof value !== "object") return undefined;
  const raw = value as Record<string, unknown>;
  const source = typeof raw.src === "string" ? raw.src.trim() : "";
  if (!source) return undefined;
  const alt =
    typeof raw.alt === "string" && raw.alt.trim()
      ? raw.alt.trim()
      : fallbackAlt;
  const caption =
    typeof raw.caption === "string" && raw.caption.trim()
      ? raw.caption.trim()
      : undefined;
  const explicitType =
    typeof raw.type === "string" && raw.type.trim()
      ? raw.type
      : raw.kind;
  const type = classifyProjectMedia(source, explicitType);
  return { type, src: source, alt, ...(caption ? { caption } : {}) };
};
