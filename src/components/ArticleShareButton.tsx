import { useState } from "react";

type Props = {
  slug: string;
  title: string;
  className?: string;
};

const shareUrl = (slug: string) => {
  const url = new URL("/", window.location.origin);
  url.searchParams.set("post", slug);
  return url.toString();
};

const copyText = async (value: string) => {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
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
  legacyCopy?.call(document, "copy");
  input.remove();
};

export default function ArticleShareButton({
  slug,
  title,
  className = "",
}: Props) {
  const [copied, setCopied] = useState(false);

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

  return (
    <button
      className={`article-share-button ${className}`.trim()}
      type="button"
      data-vaul-no-drag
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        void share();
      }}
      aria-label={copied ? "Link copied" : `Share ${title}`}
      data-copied={copied ? "true" : undefined}
    >
      <span>{copied ? "Copied" : "Share note"}</span>
    </button>
  );
}
