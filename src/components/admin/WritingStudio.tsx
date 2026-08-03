import { ConvexAuthProvider } from "@convex-dev/auth/react";
import {
  Authenticated,
  AuthLoading,
  ConvexReactClient,
  Unauthenticated,
  useMutation,
  useQuery,
} from "convex/react";
import { useCallback, useEffect, useMemo, useRef, useState, type ClipboardEvent, type KeyboardEvent, type RefObject, type SyntheticEvent } from "react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { siteData } from "../../content/site";
import { publicConvexUrl } from "../../lib/publicConfig";
import AdminMediaUpload from "./AdminMediaUpload";
import SessionLoader from "./SessionLoader";
import StudioAiPanel from "./StudioAiPanel";
import {
  type AiDocumentProposal,
  type ArticleBlock,
  type ArticleBlockType,
  type ArticleMedia,
  type ArticleDocument,
  type ArticleCardTone,
  type InlineAttachment,
  articleWordCount,
  articleReadingTime,
  createBlock,
  inlineToken,
  normalizeAiDocument,
  sanitizeEditorialDocument,
  INLINE_TOKEN_END,
  INLINE_TOKEN_START,
} from "./article-types";
import "./writing-studio.css";

const blockOptions: Array<{
  type: ArticleBlockType;
  label: string;
  detail: string;
}> = [
  { type: "paragraph", label: "Text", detail: "A paragraph" },
  { type: "heading", label: "Heading", detail: "A section title" },
  { type: "image", label: "Image", detail: "Inline capsule or media block" },
  { type: "video", label: "Video", detail: "Inline capsule or media block" },
  { type: "audio", label: "Voice note", detail: "Inline capsule or media block" },
  { type: "link", label: "Source", detail: "Inline source capsule" },
  { type: "embed", label: "Embed", detail: "Inline embed capsule" },
  { type: "quote", label: "Quote", detail: "Quotation" },
  { type: "callout", label: "Callout", detail: "A useful aside" },
  { type: "list", label: "List", detail: "Ordered ideas" },
  { type: "code", label: "Code", detail: "Code sample" },
  { type: "divider", label: "Divider", detail: "A visual pause" },
];

const inspectorTabs = [
  ["publish", "Publish", "◉"],
  ["tools", "Tools", "✦"],
  ["media", "Media", "▧"],
  ["seo", "SEO", "⌕"],
  ["ai", "AI", "✧"],
  ["history", "History", "↺"],
] as const;

const slugify = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72);

const standaloneUrl = (value: string) => {
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" || url.protocol === "http:" ? url : null;
  } catch {
    return null;
  }
};

const draftStorageKey = (articleId: string) => `amananuworks:article-draft:${articleId}`;

const readCachedDraft = (articleId: string): ArticleDocument | null => {
  try {
    const raw = window.localStorage.getItem(draftStorageKey(articleId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ArticleDocument;
    if (!parsed || !Array.isArray(parsed.body) || typeof parsed.title !== "string") return null;
    return parsed;
  } catch {
    return null;
  }
};

const cacheDraft = (articleId: string, document: ArticleDocument) => {
  try {
    window.localStorage.setItem(draftStorageKey(articleId), JSON.stringify(document));
  } catch {
    // A full local cache is a resilience aid, not a reason to block editing.
  }
};

const clearCachedDraft = (articleId: string) => {
  try {
    window.localStorage.removeItem(draftStorageKey(articleId));
  } catch {
    // Ignore storage restrictions (private browsing, disabled storage, etc.).
  }
};

/**
 * Keep the client payload deliberately narrow. Older drafts and AI proposals
 * can carry presentation-only keys; Convex's strict validators should never
 * have to reject an otherwise editable draft because of those keys.
 */
const persistableArticleDocument = (document: ArticleDocument): ArticleDocument => {
  const media = (value?: ArticleMedia) => {
    if (!value || typeof value.src !== "string") return undefined;
    return {
      src: value.src,
      alt: typeof value.alt === "string" ? value.alt : "",
      ...(typeof value.caption === "string" ? { caption: value.caption } : {}),
      kind: value.kind,
    } satisfies ArticleMedia;
  };

  const body = document.body.map((block) => {
    const next: ArticleBlock = { id: block.id, type: block.type };
    const fields = [
      "content", "level", "attribution", "src", "alt", "caption", "label",
      "href", "description", "provider", "display", "sourceId", "timestampStart",
      "timestampEnd", "transcript", "language", "items", "variant",
    ] as const;
    for (const field of fields) {
      const value = block[field];
      if (value !== undefined) (next as Record<string, unknown>)[field] = value;
    }
    if (block.inlineAttachments?.length) {
      next.inlineAttachments = block.inlineAttachments.map((attachment) => ({
        id: attachment.id,
        kind: attachment.kind,
        label: attachment.label,
        ...(attachment.href ? { href: attachment.href } : {}),
        ...(attachment.src ? { src: attachment.src } : {}),
        ...(attachment.alt !== undefined ? { alt: attachment.alt } : {}),
        ...(attachment.transcript !== undefined ? { transcript: attachment.transcript } : {}),
        ...(attachment.provider !== undefined ? { provider: attachment.provider } : {}),
        ...(attachment.display !== undefined ? { display: attachment.display } : {}),
        ...(attachment.sourceId !== undefined ? { sourceId: attachment.sourceId } : {}),
      }));
    }
    if (block.highlights?.length) {
      next.highlights = block.highlights.map(({ start, end, tone }) => ({ start, end, tone }));
    }
    return next;
  });

  return {
    schemaVersion: document.schemaVersion ?? 2,
    slug: document.slug,
    title: document.title,
    summary: document.summary,
    meta: document.meta,
    tone: document.tone ?? "blue",
    readingTime: document.readingTime,
    status: document.status,
    ...(media(document.cover) ? { cover: media(document.cover) } : {}),
    ...(media(document.narration) ? { narration: media(document.narration) } : {}),
    body,
    seo: {
      title: document.seo.title,
      description: document.seo.description,
      canonicalPath: document.seo.canonicalPath,
      ...(document.seo.ogImage ? { ogImage: document.seo.ogImage } : {}),
    },
  };
};

const inlineAttachmentFromUrl = (value: string): InlineAttachment | null => {
  const url = standaloneUrl(value);
  if (!url) return null;
  const source = url.toString();
  const pathname = url.pathname.toLowerCase();
  const label = url.hostname.replace(/^www\./, "");
  if (/youtube\.com|youtu\.be|instagram\.com/.test(url.hostname)) {
    return { id: `inline-${crypto.randomUUID()}`, kind: "embed", href: source, label };
  }
  if (/\.(png|jpe?g|gif|webp|avif|svg)$/i.test(pathname)) {
    return { id: `inline-${crypto.randomUUID()}`, kind: "image", src: source, label: "Image", alt: "" };
  }
  if (/\.(mp4|webm|mov|m4v)$/i.test(pathname)) {
    return { id: `inline-${crypto.randomUUID()}`, kind: "video", src: source, label: "Video", alt: "" };
  }
  if (/\.(mp3|wav|m4a|ogg|aac)$/i.test(pathname)) {
    return { id: `inline-${crypto.randomUUID()}`, kind: "audio", src: source, label: "Voice note", transcript: "" };
  }
  return { id: `inline-${crypto.randomUUID()}`, kind: "link", href: source, label };
};

function EditableText({
  value,
  onChange,
  className,
  placeholder,
  multiline = true,
  onStandaloneUrl,
  onCommand,
  onSelection,
}: {
  value: string;
  onChange: (value: string) => void;
  className: string;
  placeholder: string;
  multiline?: boolean;
  onStandaloneUrl?: (value: string) => void;
  onCommand?: () => void;
  onSelection?: (selection: string, start: number, end: number) => void;
}) {
  const fieldRef = useRef<HTMLTextAreaElement | HTMLInputElement>(null);
  const wrapsTitle = className === "writer-title" || className === "writer-heading";
  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if ((!multiline || wrapsTitle) && event.key === "Enter") event.preventDefault();
    const currentValue = event.currentTarget.value;
    if (event.key === "/" && !currentValue.trim()) {
      event.preventDefault();
      onCommand?.();
    }
  };
  const handlePaste = (event: ClipboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const pasted = event.clipboardData.getData("text/plain").trim();
    if (standaloneUrl(pasted)) {
      event.preventDefault();
      onStandaloneUrl?.(pasted);
    }
  };
  const handleSelect = (event: SyntheticEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const target = event.currentTarget;
    const start = target.selectionStart ?? 0;
    const end = target.selectionEnd ?? 0;
    onSelection?.(target.value.slice(start, end), start, end);
  };
  const handleChange = (next: string) => {
    // Editing invalidates the previous range; keeping it around makes the
    // highlight tool appear armed for text that is no longer selected.
    onSelection?.("", 0, 0);
    onChange(next);
  };
  useEffect(() => {
    const field = fieldRef.current;
    if (!(field instanceof HTMLTextAreaElement)) return;
    field.style.height = "auto";
    field.style.height = `${field.scrollHeight}px`;
  }, [value]);
  if (multiline || wrapsTitle) {
    return (
      <textarea
        ref={fieldRef as RefObject<HTMLTextAreaElement>}
        className={className}
        value={value}
        placeholder={placeholder}
        aria-label={placeholder}
        onChange={(event) => handleChange(event.currentTarget.value)}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        onSelect={handleSelect}
        onMouseUp={handleSelect}
        rows={wrapsTitle ? 1 : className.includes("paragraph") || className.includes("deck") ? 3 : 2}
      />
    );
  }
  return (
    <input
      ref={fieldRef as RefObject<HTMLInputElement>}
      className={className}
      value={value}
      placeholder={placeholder}
      aria-label={placeholder}
      onChange={(event) => handleChange(event.currentTarget.value)}
      onKeyDown={handleKeyDown}
      onPaste={handlePaste}
      onSelect={handleSelect}
      onMouseUp={handleSelect}
    />
  );
}

const INLINE_URL_PATTERN = /https?:\/\/[^\s<>()"']+/gi;
const INLINE_TOKEN_PATTERN = /\uE000([^\uE001]+)\uE001/g;

function escapeInlineHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] ?? character);
}

function renderInlineEditorHtml(value: string, attachments: InlineAttachment[]) {
  const lookup = new Map(attachments.map((attachment) => [attachment.id, attachment]));
  INLINE_TOKEN_PATTERN.lastIndex = 0;
  let html = "";
  let cursor = 0;
  let match: RegExpExecArray | null;
  while ((match = INLINE_TOKEN_PATTERN.exec(value))) {
    html += escapeInlineHtml(value.slice(cursor, match.index));
    const attachment = lookup.get(match[1]);
    html += attachment
      ? `<span class="writer-inline-token writer-inline-token-${attachment.kind}" contenteditable="false" data-inline-token-id="${escapeInlineHtml(attachment.id)}"><span aria-hidden="true">${attachment.kind === "audio" ? "◉" : attachment.kind === "image" ? "▧" : attachment.kind === "video" ? "▷" : "↗"}</span>${escapeInlineHtml(attachment.label || attachment.kind)}</span>`
      : escapeInlineHtml(match[0]);
    cursor = match.index + match[0].length;
  }
  return html + escapeInlineHtml(value.slice(cursor));
}

function serializeInlineEditor(root: HTMLElement) {
  const serialize = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? "";
    if (node.nodeType !== Node.ELEMENT_NODE) return "";
    const element = node as HTMLElement;
    const tokenId = element.dataset.inlineTokenId;
    if (tokenId) return inlineToken(tokenId);
    const separator = ["DIV", "P", "LI"].includes(element.tagName) ? "\n" : "";
    return Array.from(element.childNodes).map(serialize).join(separator);
  };
  return Array.from(root.childNodes).map(serialize).join("");
}

function serializedNodeLength(node: Node): number {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent?.length ?? 0;
  if (node.nodeType !== Node.ELEMENT_NODE) return 0;
  const element = node as HTMLElement;
  const tokenId = element.dataset.inlineTokenId;
  if (tokenId) return inlineToken(tokenId).length;
  return Array.from(node.childNodes).reduce((total, child) => total + serializedNodeLength(child), 0);
}

/**
 * Convert a DOM selection point into an offset in the marker-rich source string.
 * Contenteditable selection APIs report DOM offsets, while highlights are stored
 * against the serialised article source. Keeping that mapping here prevents
 * selecting a repeated word (or a token next to text) from applying a highlight
 * to the wrong occurrence.
 */
function serializedPointOffset(root: HTMLElement, node: Node, offset: number) {
  let total = 0;
  let current: Node | null = node;
  let point = offset;

  while (current && current !== root) {
    if (current.nodeType === Node.TEXT_NODE) {
      total += (current.textContent ?? "").slice(0, point).length;
    } else if (current.nodeType === Node.ELEMENT_NODE) {
      const tokenId = (current as HTMLElement).dataset.inlineTokenId;
      if (tokenId) total += point > 0 ? inlineToken(tokenId).length : 0;
    }

    const parent: Node | null = current.parentNode;
    if (!parent) break;
    const index = Array.prototype.indexOf.call(parent.childNodes, current) as number;
    for (let siblingIndex = 0; siblingIndex < index; siblingIndex += 1) {
      total += serializedNodeLength(parent.childNodes[siblingIndex]);
    }
    current = parent;
    point = index;
  }

  if (current === root) {
    for (let childIndex = 0; childIndex < point; childIndex += 1) {
      total += serializedNodeLength(root.childNodes[childIndex]);
    }
  }
  return total;
}

function InlineTextEditor({
  value,
  attachments,
  onChange,
  onInlineUrl,
  onSelection,
  onCommand,
  placeholder,
}: {
  value: string;
  attachments: InlineAttachment[];
  onChange: (value: string) => void;
  onInlineUrl: (url: string, value: string) => void;
  onSelection: (selection: string, start: number, end: number) => void;
  onCommand?: () => void;
  placeholder: string;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const initialized = useRef(false);
  const lastValue = useRef(value);
  const lastAttachments = useRef(attachments.map((attachment) => `${attachment.id}:${attachment.label}:${attachment.src ?? ""}`).join("|"));
  const pastePending = useRef(false);
  const attachmentSignature = attachments.map((attachment) => `${attachment.id}:${attachment.label}:${attachment.src ?? ""}`).join("|");

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    if (!initialized.current || value !== lastValue.current || attachmentSignature !== lastAttachments.current) {
      root.innerHTML = renderInlineEditorHtml(value, attachments);
      lastValue.current = value;
      lastAttachments.current = attachmentSignature;
      initialized.current = true;
    }
  }, [attachmentSignature, attachments, value]);

  return (
    <div
      ref={rootRef}
      className="writer-paragraph writer-inline-editor"
      contentEditable
      suppressContentEditableWarning
      data-placeholder={placeholder}
      aria-label={placeholder}
      role="textbox"
      aria-multiline="true"
      spellCheck
      onInput={(event) => {
        const next = serializeInlineEditor(event.currentTarget);
        onSelection("", 0, 0);
        const match = INLINE_URL_PATTERN.exec(next);
        INLINE_URL_PATTERN.lastIndex = 0;
        if (match && (pastePending.current || /\s|$/.test(next.slice(match.index + match[0].length)))) {
          pastePending.current = false;
          onInlineUrl(match[0].replace(/[),.!?]+$/, ""), next);
          return;
        }
        pastePending.current = false;
        lastValue.current = next;
        onChange(next);
      }}
      onPaste={(event) => {
        pastePending.current = /https?:\/\/[^\s<>()"']+/i.test(event.clipboardData.getData("text/plain"));
      }}
      onKeyDown={(event) => {
        if (event.key === "/" && !serializeInlineEditor(event.currentTarget).trim()) {
          event.preventDefault();
          onCommand?.();
        }
      }}
      onSelect={(event) => {
        const selection = window.getSelection();
        const text = selection?.toString() ?? "";
        const root = event.currentTarget;
        if (
          !text ||
          !selection ||
          !root.contains(selection.anchorNode) ||
          !root.contains(selection.focusNode)
        ) {
          onSelection("", 0, 0);
          return;
        }
        const source = serializeInlineEditor(event.currentTarget);
        const anchor = serializedPointOffset(root, selection.anchorNode!, selection.anchorOffset);
        const focus = serializedPointOffset(root, selection.focusNode!, selection.focusOffset);
        const start = Math.min(anchor, focus);
        const end = Math.max(anchor, focus);
        const selected = source.slice(start, end);
        // A highlight should never split an inline attachment marker. If the
        // selection touches one, leave it available for moving/deleting instead.
        if (!selected.trim() || selected.includes(INLINE_TOKEN_START) || selected.includes(INLINE_TOKEN_END)) {
          onSelection("", 0, 0);
          return;
        }
        onSelection(selected, start, end);
      }}
    />
  );
}

function LegacyMediaBlock({
  block,
  patch,
}: {
  block: ArticleBlock;
  patch: (patch: Partial<ArticleBlock>) => void;
}) {
  const kind =
    block.type === "audio"
      ? "audio"
      : block.type === "video"
        ? "video"
        : "image";
  return (
    <div className="writer-media-block">
      {block.src ? (
        <div className="writer-media-preview">
          {kind === "image" ? (
            <img src={block.src} alt={block.alt ?? ""} />
          ) : null}
          {kind === "video" ? (
            <video src={block.src} controls preload="metadata">
              <track kind="captions" srcLang="en" label="English captions" />
            </video>
          ) : null}
          {kind === "audio" ? (
            <>
              {/* biome-ignore lint/a11y/useMediaCaption: the editor collects a transcript directly below this player. */}
              <audio src={block.src} controls preload="metadata" />
            </>
          ) : null}
          <button type="button" onClick={() => patch({ src: "" })}>
            Replace
          </button>
        </div>
      ) : (
        <AdminMediaUpload
          folder="/portfolio/writing"
          accept={
            kind === "audio"
              ? "audio/*"
              : kind === "video"
                ? "video/*"
                : "image/*"
          }
          label={`Add ${kind}`}
          onUploaded={(asset) => patch({ src: asset.src, alt: asset.alt })}
        />
      )}
      {kind === "audio" ? (
        <>
          <input
            className="writer-inline-input"
            value={block.label ?? ""}
            placeholder="Voice-note label"
            onChange={(event) => patch({ label: event.target.value })}
          />
          <textarea
            className="writer-inline-input"
            value={block.transcript ?? ""}
            placeholder="Transcript for accessibility"
            onChange={(event) => patch({ transcript: event.target.value })}
            rows={3}
          />
        </>
      ) : (
        <>
          <input
            className="writer-inline-input"
            value={block.alt ?? ""}
            placeholder="Alt text"
            onChange={(event) => patch({ alt: event.target.value })}
          />
          <input
            className="writer-inline-input"
            value={block.caption ?? ""}
            placeholder="Optional caption"
            onChange={(event) => patch({ caption: event.target.value })}
          />
        </>
      )}
    </div>
  );
}

function MediaBlock({
  block,
  patch,
}: {
  block: ArticleBlock;
  patch: (patch: Partial<ArticleBlock>) => void;
}) {
  const kind = block.type === "audio" ? "audio" : block.type === "video" ? "video" : "image";
  if (!["image", "video", "audio"].includes(block.type)) {
    return <LegacyMediaBlock block={block} patch={patch} />;
  }
  return (
    <div className="writer-inline-asset" data-kind={kind}>
      <div className="writer-asset-chip" aria-label={`${kind} block`}>
        <span aria-hidden="true">{kind === "audio" ? "◉" : kind === "video" ? "▷" : "▧"}</span>
        <strong>{block.label || (block.src ? `${kind} attached` : `Add ${kind}`)}</strong>
        <small>{block.src ? "Ready" : "Needs media"}</small>
      </div>
      <details className="writer-asset-details">
        <summary>{block.src ? "Edit media" : "Add media"}</summary>
        <div className="writer-asset-editor">
          {block.src ? (
            <div className="writer-media-preview">
              {kind === "image" ? <img src={block.src} alt={block.alt ?? ""} /> : null}
              {kind === "video" ? <video src={block.src} controls preload="metadata"><track kind="captions" srcLang="en" label="English captions" /></video> : null}
              {kind === "audio" ? <audio src={block.src} controls preload="metadata" /> : null}
              <button type="button" onClick={() => patch({ src: "" })}>Replace</button>
            </div>
          ) : (
            <AdminMediaUpload
              folder="/portfolio/writing"
              accept={kind === "audio" ? "audio/*" : kind === "video" ? "video/*" : "image/*"}
              label={`Add ${kind}`}
              onUploaded={(asset) => patch({ src: asset.src, alt: asset.alt })}
            />
          )}
          {kind === "audio" ? (
            <>
              <input className="writer-inline-input" value={block.label ?? ""} placeholder="Voice-note label" onChange={(event) => patch({ label: event.target.value })} />
              <textarea className="writer-inline-input" value={block.transcript ?? ""} placeholder="Transcript for accessibility" onChange={(event) => patch({ transcript: event.target.value })} rows={3} />
            </>
          ) : (
            <>
              <input className="writer-inline-input" value={block.alt ?? ""} placeholder="Alt text" onChange={(event) => patch({ alt: event.target.value })} />
              <input className="writer-inline-input" value={block.caption ?? ""} placeholder="Optional caption" onChange={(event) => patch({ caption: event.target.value })} />
            </>
          )}
        </div>
      </details>
    </div>
  );
}

function InlineAttachmentShelf({ attachments }: { attachments: InlineAttachment[] }) {
  if (!attachments.length) return null;
  return (
    <div className="writer-attachment-shelf" aria-label="Inline attachments">
      <span className="writer-attachment-shelf-label">ATTACHED</span>
      {attachments.map((attachment) => (
        <span className={`writer-attachment-chip writer-attachment-chip-${attachment.kind}`} key={attachment.id} title={attachment.href ?? attachment.src ?? attachment.label}>
          <i aria-hidden="true">{attachment.kind === "audio" ? "◉" : attachment.kind === "image" ? "▧" : attachment.kind === "video" ? "▷" : "↗"}</i>
          {attachment.label || attachment.kind}
        </span>
      ))}
    </div>
  );
}

function InlineAttachmentComposer({
  kind,
  onCancel,
  onInsert,
}: {
  kind: InlineAttachment["kind"];
  onCancel: () => void;
  onInsert: (source: string, label: string) => void;
}) {
  const [source, setSource] = useState("");
  const [label, setLabel] = useState("");
  const uploadKind = kind === "image" || kind === "video" || kind === "audio" ? kind : null;
  return (
    <form
      className="writer-inline-composer"
      onSubmit={(event) => {
        event.preventDefault();
        if (source.trim()) onInsert(source.trim(), label.trim());
      }}
    >
      <div className="writer-inline-composer-heading">
        <div>
          <p>INLINE CAPSULE</p>
          <strong>Add {kind}</strong>
        </div>
        <button type="button" onClick={onCancel} aria-label="Back to insert options">Back</button>
      </div>
      <input
        type="url"
        value={source}
        onChange={(event) => setSource(event.target.value)}
        placeholder={uploadKind ? `Paste a ${kind} URL or upload below` : "Paste the source URL"}
        autoFocus
      />
      <input
        value={label}
        onChange={(event) => setLabel(event.target.value)}
        placeholder={kind === "audio" ? "Voice note label" : "Optional label"}
      />
      <div className="writer-inline-composer-actions">
        {uploadKind ? (
          <AdminMediaUpload
            folder="/portfolio/writing/inline"
            accept={`${uploadKind}/*`}
            label={`Upload ${uploadKind}`}
            onUploaded={(asset) => {
              setSource(asset.src);
              setLabel((current) => current || asset.alt || "");
            }}
          />
        ) : null}
        <button type="submit" className="writer-inline-composer-primary" disabled={!source.trim()}>
          Insert capsule
        </button>
      </div>
    </form>
  );
}

function ArticleCanvasBlock({
  block,
  index,
  count,
  update,
  move,
  remove,
  insertAfter,
  openContextMenu,
  onSelectText,
  onInlineUrl,
}: {
  block: ArticleBlock;
  index: number;
  count: number;
  update: (patch: Partial<ArticleBlock>) => void;
  move: (direction: -1 | 1) => void;
  remove: () => void;
  insertAfter: () => void;
  openContextMenu: (point: { x: number; y: number }) => void;
  onSelectText: (selection: string, start: number, end: number) => void;
  onInlineUrl: (url: string, value: string) => void;
}) {
  return (
    <section
      className="writer-block"
      id={`writer-block-${block.id}`}
      data-type={block.type}
      onContextMenu={(event) => {
        event.preventDefault();
        openContextMenu({ x: event.clientX, y: event.clientY });
      }}
    >
      <nav
        className="writer-block-tools"
        aria-label={`${block.type} block actions`}
      >
        <span aria-hidden="true">⋮⋮</span>
        <button
          type="button"
          disabled={index === 0}
          onClick={() => move(-1)}
          aria-label="Move block up"
        >
          ↑
        </button>
        <button
          type="button"
          disabled={index === count - 1}
          onClick={() => move(1)}
          aria-label="Move block down"
        >
          ↓
        </button>
        <button type="button" onClick={insertAfter} aria-label="Insert after">
          +
        </button>
        <button type="button" onClick={remove} aria-label="Remove block">
          ×
        </button>
      </nav>
      {block.type === "paragraph" ? (
        <InlineAttachmentShelf attachments={block.inlineAttachments ?? []} />
      ) : null}
      {block.type === "paragraph" ? (
        <InlineTextEditor
          value={block.content ?? ""}
          attachments={block.inlineAttachments ?? []}
          onChange={(content) => update({
            content,
            inlineAttachments: (block.inlineAttachments ?? []).filter((attachment) =>
              content.includes(inlineToken(attachment.id)),
            ),
          })}
          placeholder="Write something…"
          onCommand={insertAfter}
          onSelection={onSelectText}
          onInlineUrl={onInlineUrl}
        />
      ) : null}
      {block.type === "heading" ? (
        <EditableText
          value={block.content ?? ""}
          onChange={(content) => update({ content })}
          className="writer-heading"
          placeholder="Section heading"
          multiline={false}
          onSelection={onSelectText}
        />
      ) : null}
      {block.type === "quote" ? (
        <div className="writer-quote">
          <EditableText
            value={block.content ?? ""}
            onChange={(content) => update({ content })}
            className="writer-quote-copy"
            onSelection={onSelectText}
            placeholder="A quotation…"
          />
          {block.attribution ? (
            <input
              className="writer-inline-input"
              value={block.attribution}
              placeholder="Attribution"
              onChange={(event) => update({ attribution: event.target.value })}
            />
          ) : (
            <button
              type="button"
              className="writer-quote-add-attribution"
              onClick={() => update({ attribution: "" })}
            >
              Add attribution
            </button>
          )}
        </div>
      ) : null}
      {block.type === "callout" ? (
        <div className="writer-callout">
          <EditableText
            value={block.content ?? ""}
            onChange={(content) => update({ content })}
            className="writer-callout-copy"
            onSelection={onSelectText}
            placeholder="A useful aside…"
          />
        </div>
      ) : null}
      {["image", "video", "audio"].includes(block.type) ? (
        <MediaBlock block={block} patch={update} />
      ) : null}
      {block.type === "link" ? (
        <div className="writer-inline-asset writer-smart-card">
          <details className="writer-asset-details" open>
            <summary>Source</summary>
          <span aria-hidden="true">↗</span>
          <div>
            <input
              className="writer-inline-input"
              value={block.label ?? ""}
              placeholder="Source title"
              onChange={(event) => update({ label: event.target.value })}
            />
            <input
              className="writer-inline-input"
              type="url"
              value={block.href ?? ""}
              placeholder="https://"
              onChange={(event) => update({ href: event.target.value })}
            />
            <textarea
              className="writer-inline-input"
              value={block.description ?? ""}
              placeholder="Quoted text or a short source description"
              onChange={(event) => update({ description: event.target.value })}
              rows={3}
           />
          </div>
          </details>
        </div>
      ) : null}
      {block.type === "embed" ? (
        <div className="writer-inline-asset writer-embed-card">
          <details className="writer-asset-details" open>
            <summary>Embed settings</summary>
          <select
            value={block.provider ?? "youtube"}
            onChange={(event) => update({ provider: event.target.value })}
          >
            <option value="youtube">YouTube</option>
            <option value="instagram">Instagram</option>
            <option value="website">Website</option>
          </select>
          <input
            className="writer-inline-input"
            type="url"
            value={block.href ?? ""}
            placeholder="Paste the embed URL"
            onChange={(event) => update({ href: event.target.value })}
          />
          <div className="writer-embed-time">
            <label>
              Start
              <input
                type="number"
                min="0"
                value={block.timestampStart ?? ""}
                onChange={(event) =>
                  update({
                    timestampStart: event.target.value
                      ? Number(event.target.value)
                      : undefined,
                  })
                }
              />
            </label>
            <label>
              End
              <input
                type="number"
                min="0"
                value={block.timestampEnd ?? ""}
                onChange={(event) =>
                  update({
                    timestampEnd: event.target.value
                      ? Number(event.target.value)
                      : undefined,
                  })
                }
              />
           </label>
          </div>
          </details>
        </div>
      ) : null}
      {block.type === "code" ? (
        <div className="writer-code">
          <input
            value={block.language ?? "text"}
            onChange={(event) => update({ language: event.target.value })}
            aria-label="Code language"
          />
          <textarea
            value={block.content ?? ""}
            onChange={(event) => update({ content: event.target.value })}
            rows={8}
            spellCheck={false}
          />
        </div>
      ) : null}
      {block.type === "list" ? (
        <textarea
          className="writer-list"
          value={(block.items ?? []).join("\n")}
          onChange={(event) =>
            update({ items: event.target.value.split("\n") })
          }
          rows={Math.max(3, block.items?.length ?? 1)}
          placeholder="One item per line"
        />
      ) : null}
      {block.type === "divider" ? <hr className="writer-divider" /> : null}
      <button
        type="button"
        className="writer-inline-inserter"
        onClick={insertAfter}
        aria-label="Insert a block after this content"
      >
        +
      </button>
    </section>
  );
}

function Writer({
  initialArticleId,
  createOnLoad = false,
}: {
  initialArticleId?: string;
  createOnLoad?: boolean;
}) {
  const createDraft = useMutation(api.articles.createDraft);
  const saveDraft = useMutation(api.articles.saveDraft);
  const publish = useMutation(api.articles.publish);
  const setArchived = useMutation(api.articles.setArchived);
  const restoreRevision = useMutation(api.articles.restoreRevision);
  const [articleId, setArticleId] = useState<Id<"articles"> | null>(
    initialArticleId ? (initialArticleId as Id<"articles">) : null,
  );
  const article = useQuery(
    api.articles.adminGet,
    articleId ? { articleId } : "skip",
  );
  const revisions =
    useQuery(api.articles.adminRevisions, articleId ? { articleId } : "skip") ??
    [];
  const [document, setDocument] = useState<ArticleDocument | null>(null);
  const [saveState, setSaveState] = useState<
    "idle" | "dirty" | "saving" | "saved" | "error"
  >("idle");
  const [insertAt, setInsertAt] = useState<number | null>(null);
  const [insertOrigin, setInsertOrigin] = useState<"inline" | "context">(
    "inline",
  );
  const [insertPoint, setInsertPoint] = useState<{ x: number; y: number } | null>(
    null,
  );
  const [inlineComposer, setInlineComposer] = useState<{
    kind: InlineAttachment["kind"];
    blockIndex: number;
  } | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(true);
  const [canvasMode, setCanvasMode] = useState<"fit" | "paper">("fit");
  const [inspectorTab, setInspectorTab] = useState<
    "publish" | "tools" | "media" | "seo" | "history" | "ai"
  >("publish");
  const [selectedText, setSelectedText] = useState("");
  const [selectedRange, setSelectedRange] = useState<{
    blockIndex: number;
    start: number;
    end: number;
    text: string;
  } | null>(null);
  const [confirmDeleteDraft, setConfirmDeleteDraft] = useState(false);
  const creating = useRef(false);
  const hydratedId = useRef<string | null>(null);
  const latestDocument = useRef<ArticleDocument | null>(null);
  const changeVersion = useRef(0);

  useEffect(() => {
    if (!createOnLoad || articleId || creating.current) return;
    creating.current = true;
    void createDraft({}).then((id) => {
      setArticleId(id);
      const url = new URL(window.location.href);
      url.searchParams.set("article", String(id));
      window.history.replaceState({}, "", url);
    });
  }, [articleId, createDraft, createOnLoad]);

  useEffect(() => {
    if (!article || hydratedId.current === String(article._id)) return;
    hydratedId.current = String(article._id);
    const serverDocument: ArticleDocument = {
      schemaVersion: 2,
      slug: article.slug,
      title: article.title,
      summary: article.summary,
      meta: article.meta,
      tone: (article as unknown as { tone?: ArticleCardTone }).tone ?? "blue",
      readingTime: articleReadingTime(article.body as ArticleBlock[]),
      status: article.status,
      cover: article.cover,
      narration: article.narration,
      body: article.body as ArticleBlock[],
      seo: article.seo as ArticleDocument["seo"],
    };
    const cachedDocument = readCachedDraft(String(article._id));
    const hydratedDocument = sanitizeEditorialDocument(cachedDocument ?? serverDocument);
    const editorialCleanupNeeded = JSON.stringify(hydratedDocument) !== JSON.stringify(cachedDocument ?? serverDocument);
    setDocument({
      ...hydratedDocument,
      readingTime: articleReadingTime(hydratedDocument.body),
    });
    latestDocument.current = {
      ...hydratedDocument,
      readingTime: articleReadingTime(hydratedDocument.body),
    };
    changeVersion.current = 0;
    setSaveState(cachedDocument || editorialCleanupNeeded ? "dirty" : "saved");
  }, [article]);

  useEffect(() => {
    latestDocument.current = document;
  }, [document]);

  const saveCurrentDraft = useCallback(async (nextDocument?: ArticleDocument) => {
    const target = nextDocument ?? latestDocument.current;
    if (!articleId || !target) return false;
    const versionAtStart = changeVersion.current;
    const payload = persistableArticleDocument(target);
    setSaveState("saving");
    try {
      await saveDraft({ articleId, document: payload });
      if (versionAtStart === changeVersion.current) {
        clearCachedDraft(String(articleId));
        setSaveState("saved");
      } else {
        setSaveState("dirty");
      }
      return true;
    } catch (error) {
      console.error("Writing studio draft save failed", error);
      if (versionAtStart === changeVersion.current) setSaveState("error");
      return false;
    }
  }, [articleId, saveDraft]);

  useEffect(() => {
    if (!articleId || !document || saveState !== "dirty") return;
    const timer = window.setTimeout(() => void saveCurrentDraft(document), 700);
    return () => window.clearTimeout(timer);
  }, [articleId, document, saveCurrentDraft, saveState]);

  useEffect(() => {
    const flushOnHide = () => {
      if (window.document.visibilityState === "hidden" && saveState === "dirty") {
        void saveCurrentDraft();
      }
    };
    window.document.addEventListener("visibilitychange", flushOnHide);
    return () => window.document.removeEventListener("visibilitychange", flushOnHide);
  }, [saveCurrentDraft, saveState]);

  const change = (
    next: ArticleDocument | ((current: ArticleDocument) => ArticleDocument),
  ) => {
    setDocument((current) => {
      if (!current) return current;
      const updated = typeof next === "function" ? next(current) : next;
      const normalized = {
        ...updated,
        readingTime: articleReadingTime(updated.body),
      };
      latestDocument.current = normalized;
      if (articleId) cacheDraft(String(articleId), normalized);
      return normalized;
    });
    changeVersion.current += 1;
    setSaveState("dirty");
  };

  const updateBlock = (index: number, patch: Partial<ArticleBlock>) =>
    change((current) => ({
      ...current,
      body: current.body.map((block, blockIndex) =>
        blockIndex === index ? { ...block, ...patch } : block,
      ),
    }));

  const insertBlock = (
    type: ArticleBlockType,
    index = document?.body.length ?? 0,
  ) => {
    change((current) => {
      const body = [...current.body];
      body.splice(index, 0, createBlock(type));
      return { ...current, body };
    });
    setInsertAt(null);
    setInsertOrigin("inline");
    setInsertPoint(null);
    setInlineComposer(null);
  };

  const insertInlineAttachment = (
    blockIndex: number,
    kind: InlineAttachment["kind"],
    source: string,
    label: string,
  ) => {
    const detected = inlineAttachmentFromUrl(source);
    const attachment: InlineAttachment = detected
      ? {
          ...detected,
          kind,
          label: label || detected.label,
          ...(kind === "link" || kind === "embed"
            ? { href: source, src: undefined }
            : { src: source, href: undefined }),
        }
      : {
          id: `inline-${crypto.randomUUID()}`,
          kind,
          label: label || kind,
          ...(kind === "link" || kind === "embed" ? { href: source } : { src: source }),
        };
    const token = inlineToken(attachment.id);
    change((current) => ({
      ...current,
      body: current.body.map((block, index) => {
        if (index !== blockIndex || block.type !== "paragraph") return block;
        const value = block.content ?? "";
        const insertionPoint = selectedRange?.blockIndex === blockIndex
          ? selectedRange.end
          : value.length;
        const before = value.slice(0, insertionPoint).replace(/\s*$/, "");
        const after = value.slice(insertionPoint).replace(/^\s*/, "");
        const content = `${before}${before ? " " : ""}${token}${after ? " " : ""}${after}`;
        return {
          ...block,
          content,
          inlineAttachments: [...(block.inlineAttachments ?? []), attachment],
        };
      }),
    }));
    setSelectedText("");
    setSelectedRange(null);
    setInlineComposer(null);
    setInsertAt(null);
    setInsertPoint(null);
    setInsertOrigin("inline");
  };

  const selectInsertOption = (type: ArticleBlockType) => {
    const contextBlockIndex = insertOrigin === "context" && insertAt !== null ? insertAt - 1 : null;
    const contextBlock = contextBlockIndex === null ? null : document?.body[contextBlockIndex];
    const inlineKind = ["image", "video", "audio", "link", "embed"].includes(type)
      ? (type as InlineAttachment["kind"])
      : null;
    if (contextBlock && contextBlock.type === "paragraph" && contextBlockIndex !== null && inlineKind) {
      setInlineComposer({ kind: inlineKind, blockIndex: contextBlockIndex });
      return;
    }
    insertBlock(type, insertAt ?? undefined);
  };

  const convertInlineUrl = (index: number, url: string, value: string) => {
    const attachment = inlineAttachmentFromUrl(url);
    if (!attachment) return;
    const token = inlineToken(attachment.id);
    change((current) => ({
      ...current,
      body: current.body.map((block, blockIndex) => {
        if (blockIndex !== index) return block;
        const content = (value || block.content || "").replace(url, token);
        const inlineAttachments = [...(block.inlineAttachments ?? []), attachment];
        return { ...block, content, inlineAttachments };
      }),
    }));
    setSelectedText("");
    setSelectedRange(null);
  };

  const openInsertMenu = (
    index: number,
    origin: "inline" | "context" = "inline",
    point?: { x: number; y: number },
  ) => {
    setInsertOrigin(origin);
    setInsertPoint(point ?? null);
    setInsertAt(index);
  };

  const moveBlock = (index: number, direction: -1 | 1) =>
    change((current) => {
      const target = index + direction;
      if (target < 0 || target >= current.body.length) return current;
      const body = [...current.body];
      [body[index], body[target]] = [body[target], body[index]];
      return { ...current, body };
    });

  const removeBlock = (index: number) =>
    change((current) => ({
      ...current,
      body: current.body.filter((_, blockIndex) => blockIndex !== index),
    }));

  const headings = useMemo(
    () => document?.body.filter((block) => block.type === "heading") ?? [],
    [document?.body],
  );
  const words = useMemo(
    () => articleWordCount(document?.body ?? []),
    [document?.body],
  );
  const articleContext = useMemo(
    () => [document?.title, document?.summary, ...(document?.body ?? []).map((block) => [block.content, block.description, block.label, block.href, block.src, block.transcript, block.caption, ...(block.items ?? []), ...(block.inlineAttachments ?? []).map((attachment) => `${attachment.label} ${attachment.href ?? attachment.src ?? ""}`)].filter(Boolean).join(" "))].filter(Boolean).join("\n\n"),
    [document],
  );

  const portfolioContext = useMemo(
    () => JSON.stringify({
      identity: siteData.identity,
      roles: siteData.roles,
      about: siteData.about,
      experience: siteData.experience,
      education: siteData.education,
      projects: siteData.projects,
      links: siteData.links,
      github: siteData.github,
      editorialVoice: "Quiet, specific, thoughtful, human. Prefer clear observations over hype.",
    }).slice(0, 28_000),
    [],
  );

  const applyAiProposal = (proposal: AiDocumentProposal) => {
    if (!proposal.document) return;
    change((current) => normalizeAiDocument(proposal.document, current));
    setSelectedText("");
    setSelectedRange(null);
  };

  const applyHighlight = (tone: NonNullable<ArticleBlock["highlights"]>[number]["tone"]) => {
    if (!selectedRange?.text.trim()) return;
    change((current) => {
      const block = current.body[selectedRange.blockIndex];
      const content = block?.content ?? "";
      const start = content.slice(selectedRange.start, selectedRange.end) === selectedRange.text
        ? selectedRange.start
        : content.indexOf(selectedRange.text);
      if (!block || start < 0) return current;
      const end = Math.min(content.length, start + selectedRange.text.length);
      const highlights = [...(block.highlights ?? [])]
        .filter((range) => range.end <= start || range.start >= end)
        .concat({ start, end, tone })
        .sort((a, b) => a.start - b.start);
      return {
        ...current,
        body: current.body.map((candidate, index) => index === selectedRange.blockIndex ? { ...candidate, highlights } : candidate),
      };
    });
    setSelectedText("");
    setSelectedRange(null);
  };

  if (!articleId && !createOnLoad) {
    return (
      <main className="writer-empty-state">
        <div>
          <p>WRITING STUDIO</p>
          <h1>Choose a note, or begin a new one.</h1>
          <span>Nothing is created until you explicitly start a post.</span>
          <nav>
            <a href="/admin">Back to content</a>
            <a className="writer-empty-primary" href="/admin/writing?new=1">
              + New post
            </a>
          </nav>
        </div>
      </main>
    );
  }
  if (!articleId || article === undefined || !document) {
    return <SessionLoader message="Preparing the writing studio…" />;
  }
  if (article === null) {
    return (
      <main className="writer-loading">This article could not be found.</main>
    );
  }

  const publishCurrent = async () => {
    setSaveState("saving");
    const publishDocument = persistableArticleDocument({
      ...document,
      readingTime: articleReadingTime(document.body),
    });
    try {
      await publish({
        articleId,
        document: publishDocument,
        label: `Published ${publishDocument.title}`,
      });
      clearCachedDraft(String(articleId));
      change({ ...publishDocument, status: "published" });
      setSaveState("saved");
    } catch {
      setSaveState("error");
    }
  };

  return (
    <main className="writing-studio">
      <header className="writer-toolbar">
        <div className="writer-toolbar-start">
          <a className="writer-back-button" href="/admin" aria-label="Back to content studio">
            Studio
          </a>
          <div>
            <strong>{document.title || "Untitled note"}</strong>
            <span>
              {saveState === "saving"
                ? "Saving…"
                : saveState === "dirty"
                  ? "Unsaved changes"
                  : saveState === "error"
                    ? "Save failed"
                    : "Saved"}
            </span>
          </div>
        </div>
        <div className="writer-toolbar-actions">
          <div className="writer-canvas-toggle" aria-label="Canvas view">
            {(["fit", "paper"] as const).map((mode) => (
              <button
                type="button"
                key={mode}
                aria-label={mode === "fit" ? "Fit canvas to viewport" : "Use paper canvas"}
                aria-pressed={canvasMode === mode}
                onClick={() => setCanvasMode(mode)}
              >
                {mode === "fit" ? "Fit" : "Paper"}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="writer-tool-button writer-save-button"
            onClick={() => void saveCurrentDraft()}
            disabled={saveState === "saving" || saveState === "saved"}
          >
            {saveState === "saving" ? "Saving" : saveState === "saved" ? "Saved" : "Save"}
          </button>
          <button
            type="button"
            className="writer-tool-button"
            onClick={() => setSettingsOpen((open) => !open)}
            aria-pressed={settingsOpen}
          >
            Settings
          </button>
          <a
            className="writer-tool-button"
            href={`/writing/${document.slug}`}
            target="_blank"
            rel="noreferrer"
          >
            Preview
          </a>
          <button
            type="button"
            className="writer-tool-button writer-tool-primary"
            onClick={() => void publishCurrent()}
          >
            Publish
          </button>
        </div>
      </header>
      <div
        className={`writer-layout ${settingsOpen ? "" : "settings-collapsed"}`}
      >
        <aside className="writer-index">
          <header>
            <p>DOCUMENT</p>
            <strong>Index</strong>
            <span>
              {words} words · {document.readingTime}
            </span>
          </header>
          <nav aria-label="Article sections">
            <button
              type="button"
              onClick={() =>
                window.document
                  .getElementById("writer-title")
                  ?.scrollIntoView({ behavior: "smooth" })
              }
            >
              Introduction
            </button>
            {headings.map((heading) => (
              <button
                type="button"
                key={heading.id}
                onClick={() =>
                  window.document
                    .getElementById(`writer-block-${heading.id}`)
                    ?.scrollIntoView({ behavior: "smooth", block: "center" })
                }
              >
                {heading.content || "Untitled section"}
              </button>
            ))}
          </nav>
          <div className="writer-index-footer">
            <span>{document.body.length} blocks</span>
            <small>Type / or right-click</small>
          </div>
        </aside>
        <section className={`writer-canvas-wrap writer-canvas-${canvasMode}`}>
          <article
            className="writer-paper"
            onMouseDown={(event) => {
              const target = event.target as HTMLElement;
              if (!target.closest("input, textarea, [contenteditable], button")) {
                setSelectedText("");
                setSelectedRange(null);
              }
            }}
          >
            {document.cover?.src ? (
              <figure className="writer-cover">
                <img src={document.cover.src} alt={document.cover.alt} />
                <button
                  type="button"
                  onClick={() => change({ ...document, cover: undefined })}
                >
                  Remove cover
                </button>
              </figure>
            ) : null}
            <header className="writer-document-header" id="writer-title">
              <input
                className="writer-meta-line"
                value={document.meta}
                onChange={(event) =>
                  change({ ...document, meta: event.target.value })
                }
                aria-label="Article label"
                placeholder="Working note"
              />
              <EditableText
                value={document.title}
                onChange={(title) =>
                  change((current) => ({
                    ...current,
                    title,
                    slug: current.slug.startsWith("untitled-note")
                      ? slugify(title)
                      : current.slug,
                    seo: {
                      ...current.seo,
                      title:
                        current.seo.title === current.title
                          ? title
                          : current.seo.title,
                    },
                  }))
                }
                className="writer-title"
                placeholder="Untitled note"
                multiline={false}
              />
              <EditableText
                value={document.summary}
                onChange={(summary) => change({ ...document, summary })}
                className="writer-deck"
                placeholder="A concise introduction to the idea…"
              />
            </header>
            <div className="writer-document-body">
              {document.body.map((block, index) => (
                <ArticleCanvasBlock
                  key={block.id}
                  block={block}
                  index={index}
                  count={document.body.length}
                  update={(patch) => updateBlock(index, patch)}
                  move={(direction) => moveBlock(index, direction)}
                  remove={() => removeBlock(index)}
                  insertAfter={() => openInsertMenu(index + 1)}
                  openContextMenu={(point) =>
                    openInsertMenu(index + 1, "context", point)
                  }
                  onInlineUrl={(url, value) => convertInlineUrl(index, url, value)}
                  onSelectText={(selection, start, end) => {
                    if (!selection.trim()) {
                      setSelectedText("");
                      setSelectedRange(null);
                      return;
                    }
                    setSelectedText(selection);
                    setSelectedRange({ blockIndex: index, start, end, text: selection });
                  }}
                />
              ))}
              {!document.body.length ? (
                <button
                  className="writer-empty-canvas"
                  type="button"
                  onClick={() => openInsertMenu(0)}
                >
                  Start with a paragraph
                </button>
              ) : null}
            </div>
          </article>
        </section>
        {settingsOpen ? (
          <button
            className="writer-inspector-backdrop"
            type="button"
            aria-label="Close studio panel"
            onClick={() => setSettingsOpen(false)}
          />
        ) : null}
        <aside className="writer-inspector" aria-label="Post settings">
          <div className="writer-inspector-mobile-head">
            <span className="writer-inspector-mobile-handle" aria-hidden="true" />
            <button type="button" onClick={() => setSettingsOpen(false)}>
              Done
            </button>
          </div>
          <nav className="writer-inspector-tabs" aria-label="Post settings">
            {inspectorTabs.map(([tab, label, icon]) => (
              <button
                type="button"
                key={tab}
                aria-label={label}
                title={label}
                aria-pressed={inspectorTab === tab}
                onMouseDown={(event) => {
                  if (tab === "tools") event.preventDefault();
                }}
                onClick={() => setInspectorTab(tab)}
              >
                <span className="writer-inspector-tab-icon" aria-hidden="true">{icon}</span>
                <span className="writer-inspector-tab-label">{label}</span>
              </button>
            ))}
          </nav>
          {inspectorTab === "tools" ? <section>
            <header>
              <p>EDITOR TOOLS</p>
              <h2>Highlights</h2>
            </header>
            <p className="writer-inspector-note">Select words in the paper, then tint them for the public reader.</p>
            <div className="writer-highlight-status">
              {selectedText ? <><span>Selected</span><strong>{selectedText.slice(0, 90)}{selectedText.length > 90 ? "…" : ""}</strong></> : <span>Select text in a paragraph, heading, quote, or callout.</span>}
            </div>
            <div className="writer-highlight-grid" aria-label="Highlight tone">
              {(["yellow", "blue", "green", "orange"] as const).map((tone) => (
                <button type="button" key={tone} className={`writer-highlight-${tone}`} disabled={!selectedText} onMouseDown={(event) => event.preventDefault()} onClick={() => applyHighlight(tone)}>
                  {tone}
                </button>
              ))}
            </div>
          </section> : null}
          {inspectorTab === "publish" ? <section>
            <header>
              <p>PUBLISHING</p>
              <h2>Post settings</h2>
            </header>
            <div className="writer-status-row">
              <span>Status</span>
              <strong data-status={document.status}>{document.status}</strong>
            </div>
            <fieldset className="writer-card-tone">
              <legend>Card color</legend>
              <p>Choose the tone used for this note on the writing grid.</p>
              <div className="writer-card-tone-grid" role="radiogroup" aria-label="Writing card color">
                {([
                  ["blue", "Sky"],
                  ["orange", "Apricot"],
                  ["green", "Sage"],
                  ["yellow", "Butter"],
                ] as const).map(([tone, label]) => (
                  <button
                    type="button"
                    key={tone}
                    className={`writer-card-tone-button tone-${tone}`}
                    aria-label={`${label} card color`}
                    aria-pressed={(document.tone ?? "blue") === tone}
                    onClick={() => change({ ...document, tone: tone as ArticleCardTone })}
                  >
                    <i aria-hidden="true" />
                    <span>{label}</span>
                  </button>
                ))}
              </div>
            </fieldset>
            <label>
              Slug
              <div className="writer-prefix-input">
                <span>/writing/</span>
                <input
                  value={document.slug}
                  onChange={(event) =>
                    change({
                      ...document,
                      slug: slugify(event.target.value),
                      seo: {
                        ...document.seo,
                        canonicalPath: `/writing/${slugify(event.target.value)}`,
                      },
                    })
                  }
                />
              </div>
            </label>
            <div className="writer-reading-time" aria-live="polite">
              <div>
                <span>Reading time</span>
                <strong>{document.readingTime}</strong>
              </div>
              <small>Calculated from the article text</small>
            </div>
            {document.status === "draft" ? (
              <div className="writer-draft-delete">
                {confirmDeleteDraft ? (
                  <>
                    <p>Delete this draft? This cannot be restored from the studio.</p>
                    <div>
                      <button type="button" onClick={() => setConfirmDeleteDraft(false)}>
                        Keep draft
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          void setArchived({ articleId, archived: true }).then(() =>
                            location.assign("/admin"),
                          )
                        }
                      >
                        Delete draft
                      </button>
                    </div>
                  </>
                ) : (
                  <button type="button" onClick={() => setConfirmDeleteDraft(true)}>
                    Delete draft
                  </button>
                )}
              </div>
            ) : null}
          </section> : null}
          {inspectorTab === "ai" ? (
            <StudioAiPanel
              articleId={articleId}
              title={document.title}
              context={articleContext}
              portfolioContext={portfolioContext}
              document={document}
              articleUpdatedAt={article.updatedAt}
              selection={selectedText}
              onApply={applyAiProposal}
            />
          ) : null}
          {inspectorTab === "media" ? <section>
            <header>
              <p>MEDIA</p>
              <h2>Cover & audio</h2>
            </header>
            {document.cover?.src ? (
              <div className="writer-inspector-media">
                <img src={document.cover.src} alt="" />
                <button
                  type="button"
                  onClick={() => change({ ...document, cover: undefined })}
                >
                  Remove
                </button>
              </div>
            ) : (
              <AdminMediaUpload
                folder="/portfolio/writing/covers"
                accept="image/*"
                label="Upload cover"
                onUploaded={(cover) => change({ ...document, cover })}
              />
            )}
            {document.narration?.src ? (
              <div className="writer-inspector-audio">
                {/* biome-ignore lint/a11y/useMediaCaption: article narration is paired with editorial transcript content. */}
                <audio src={document.narration.src} controls />
                <button
                  type="button"
                  onClick={() => change({ ...document, narration: undefined })}
                >
                  Remove narration
                </button>
              </div>
            ) : (
              <AdminMediaUpload
                folder="/portfolio/writing/narration"
                accept="audio/*"
                label="Add article narration"
                onUploaded={(narration) => change({ ...document, narration })}
              />
            )}
          </section> : null}
          {inspectorTab === "seo" ? <section>
            <header>
              <p>SEARCH</p>
              <h2>SEO</h2>
            </header>
            <label>
              SEO title
              <input
                value={document.seo.title}
                onChange={(event) =>
                  change({
                    ...document,
                    seo: { ...document.seo, title: event.target.value },
                  })
                }
              />
            </label>
            <label>
              Description
              <textarea
                rows={4}
                value={document.seo.description}
                onChange={(event) =>
                  change({
                    ...document,
                    seo: { ...document.seo, description: event.target.value },
                  })
                }
              />
            </label>
          </section> : null}
          {inspectorTab === "history" ? <section>
            <header>
              <p>HISTORY</p>
              <h2>Published versions</h2>
            </header>
            <div className="writer-revisions">
              {revisions.length ? (
                revisions.map((revision) => (
                  <article key={revision._id}>
                    <div>
                      <strong>{revision.label}</strong>
                      <span>
                        {new Date(revision.createdAt).toLocaleString()}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        void restoreRevision({
                          articleId,
                          revisionId: revision._id,
                        }).then(() => {
                          hydratedId.current = null;
                          setSaveState("saved");
                        })
                      }
                    >
                      Restore as draft
                    </button>
                  </article>
                ))
              ) : (
                <p>No published versions yet.</p>
              )}
            </div>
          </section> : null}
          {inspectorTab === "history" ? <section className="writer-danger-zone">
            <button
              type="button"
              onClick={() =>
                void setArchived({ articleId, archived: true }).then(() =>
                  location.assign("/admin"),
                )
              }
            >
              Archive article
            </button>
          </section> : null}
        </aside>
      </div>
      {insertAt !== null ? (
        <>
          {/* biome-ignore lint/a11y/noStaticElementInteractions: clicking the non-interactive backdrop is the expected modal-dismiss gesture. */}
          <div
            className="writer-insert-backdrop"
            role="presentation"
            onMouseDown={() => {
              setInsertAt(null);
              setInsertPoint(null);
              setInlineComposer(null);
            }}
          >
            <section
              className={`writer-insert-menu writer-insert-menu-${insertOrigin}`}
              style={
                insertOrigin === "context" && insertPoint
                  ? {
                      left: Math.min(insertPoint.x, window.innerWidth - 520),
                      top: Math.min(insertPoint.y, window.innerHeight - 390),
                    }
                  : undefined
              }
              role="dialog"
              aria-modal="true"
              aria-label="Insert content"
              onMouseDown={(event) => event.stopPropagation()}
            >
              <header>
                <div>
                  <p>{insertOrigin === "context" ? "ADD AFTER THIS BLOCK" : "INSERT"}</p>
                  <h2>
                    {insertOrigin === "context"
                      ? document?.body[(insertAt ?? 1) - 1]?.type === "paragraph"
                        ? "Add a capsule or block"
                        : "Choose a block"
                      : "Add to the article"}
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setInsertAt(null);
                    setInsertPoint(null);
                    setInlineComposer(null);
                  }}
                  aria-label="Close"
                >
                  ×
                </button>
              </header>
              {inlineComposer ? (
                <InlineAttachmentComposer
                  kind={inlineComposer.kind}
                  onCancel={() => setInlineComposer(null)}
                  onInsert={(source, label) =>
                    insertInlineAttachment(inlineComposer.blockIndex, inlineComposer.kind, source, label)
                  }
                />
              ) : (
                <div className="writer-insert-options">
                  {blockOptions.map((option) => (
                    <button
                      type="button"
                      key={option.type}
                      data-block-type={option.type}
                      data-inline={(["image", "video", "audio", "link", "embed"] as ArticleBlockType[]).includes(option.type) ? "true" : "false"}
                      onClick={() => selectInsertOption(option.type)}
                    >
                      <strong>{option.label}</strong>
                      <span>{option.detail}</span>
                    </button>
                  ))}
                </div>
              )}
            </section>
          </div>
        </>
      ) : null}
    </main>
  );
}

function ConnectedWritingStudio() {
  const search =
    typeof window === "undefined"
      ? null
      : new URLSearchParams(window.location.search);
  const articleId = search?.get("article") ?? undefined;
  const createOnLoad = search?.get("new") === "1";
  return (
    <>
      <AuthLoading>
        <SessionLoader />
      </AuthLoading>
      <Unauthenticated>
        <main className="writer-loading">
          <a href="/admin">Sign in through the content studio.</a>
        </main>
      </Unauthenticated>
      <Authenticated>
        <Writer initialArticleId={articleId} createOnLoad={createOnLoad} />
      </Authenticated>
    </>
  );
}

export default function WritingStudio() {
  const url = publicConvexUrl;
  if (!url)
    return (
      <main className="writer-loading">
        Connect Convex before opening the writing studio.
      </main>
    );
  return (
    <ConvexAuthProvider client={new ConvexReactClient(url)}>
      <ConnectedWritingStudio />
    </ConvexAuthProvider>
  );
}
