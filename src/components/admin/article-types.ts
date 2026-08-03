export type ArticleStatus = "draft" | "published" | "archived";
export type ArticleMediaKind = "image" | "video" | "audio";
export type ArticleCardTone = "blue" | "orange" | "green" | "yellow";

export type ArticleMedia = {
  src: string;
  alt: string;
  caption?: string;
  kind: ArticleMediaKind;
};

export type InlineAttachment = {
  id: string;
  kind: "link" | "audio" | "video" | "image" | "embed";
  label: string;
  href?: string;
  src?: string;
  alt?: string;
  transcript?: string;
  provider?: string;
  display?: "inline" | "block";
  sourceId?: string;
};

export const INLINE_TOKEN_START = "\uE000";
export const INLINE_TOKEN_END = "\uE001";
export const inlineToken = (id: string) => `${INLINE_TOKEN_START}${id}${INLINE_TOKEN_END}`;
export const inlineTokenPattern = new RegExp(`${INLINE_TOKEN_START}([^${INLINE_TOKEN_END}]+)${INLINE_TOKEN_END}`, "g");

/**
 * Keep AI/editorial copy clean when it enters the canvas. The editor stores
 * plain text, so markdown emphasis markers and typographic em dashes should
 * never leak into the public article as literal characters.
 */
const legacyCleanEditorialCopy = (value: string) =>
  value
    .replace(/[—–]/g, ",")
    .replace(/\*/g, "")
    .replace(/[ \t]{2,}/g, " ")
    .trim();

void legacyCleanEditorialCopy;

export const cleanEditorialCopy = (value: string) =>
  value
    .replace(/[\u2014\u2013]/g, ",")
    .replace(/\*/g, "")
    .replace(/[ \t]{2,}/g, " ")
    .trim();

export const sanitizeEditorialDocument = (document: ArticleDocument): ArticleDocument => {
  const body: ArticleBlock[] = document.body
    .map((block) => ({
      ...block,
      content: typeof block.content === "string" ? cleanEditorialCopy(block.content) : block.content,
      attribution: typeof block.attribution === "string" && cleanEditorialCopy(block.attribution).toLowerCase() !== "attribution"
        ? cleanEditorialCopy(block.attribution)
        : undefined,
      label: typeof block.label === "string" ? cleanEditorialCopy(block.label) : block.label,
      description: typeof block.description === "string" ? cleanEditorialCopy(block.description) : block.description,
      caption: typeof block.caption === "string" ? cleanEditorialCopy(block.caption) : block.caption,
      transcript: typeof block.transcript === "string" ? cleanEditorialCopy(block.transcript) : block.transcript,
      items: block.items?.map(cleanEditorialCopy),
      inlineAttachments: block.inlineAttachments?.map((attachment) => ({
        ...attachment,
        label: cleanEditorialCopy(attachment.label),
        alt: attachment.alt ? cleanEditorialCopy(attachment.alt) : attachment.alt,
        transcript: attachment.transcript ? cleanEditorialCopy(attachment.transcript) : attachment.transcript,
      })),
    }))
    .filter((block) => {
      if (block.type === "divider") return true;
      if (block.type === "list") return Boolean(block.items?.some(Boolean));
      if (["image", "video", "audio"].includes(block.type)) return Boolean(block.src);
      return Boolean(block.content?.trim() || block.href || block.src || block.items?.length);
    });
  if (!body.length && document.body.some((block) => block.type === "paragraph")) {
    body.push({ id: document.body[0].id, type: "paragraph", content: "" } as ArticleBlock);
  }
  return {
  ...document,
  title: cleanEditorialCopy(document.title),
  summary: cleanEditorialCopy(document.summary),
  meta: cleanEditorialCopy(document.meta),
  body,
  seo: {
    ...document.seo,
    title: cleanEditorialCopy(document.seo.title),
    description: cleanEditorialCopy(document.seo.description),
  },
  };
};

export type ArticleBlockType =
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

export type ArticleBlock = {
  id: string;
  type: ArticleBlockType;
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
  display?: "inline" | "block";
  sourceId?: string;
  timestampStart?: number;
  timestampEnd?: number;
  transcript?: string;
  language?: string;
  items?: string[];
  variant?: string;
  inlineAttachments?: InlineAttachment[];
  highlights?: Array<{
    start: number;
    end: number;
    tone: "yellow" | "blue" | "green" | "orange";
  }>;
};

export type ArticleDocument = {
  schemaVersion?: number;
  slug: string;
  title: string;
  summary: string;
  meta: string;
  readingTime: string;
  tone?: ArticleCardTone;
  status: ArticleStatus;
  cover?: ArticleMedia;
  narration?: ArticleMedia;
  body: ArticleBlock[];
  seo: {
    title: string;
    description: string;
    canonicalPath: string;
    ogImage?: string;
  };
};

export type AiSource = {
  id?: string;
  title?: string;
  url?: string;
  excerpt?: string;
  kind?: "article" | "video" | "image" | "audio" | "official" | "search";
};

export type AiCitation = {
  sourceId?: string;
  title?: string;
  url?: string;
  excerpt?: string;
};

export type AiDocumentProposal = {
  schemaVersion?: number;
  intent?: "create_article" | "extend_article" | "edit_article" | "research";
  state?: "none" | "needs_clarification" | "ready";
  summary?: string;
  question?: string;
  placement?: "replace_document" | "replace_selection" | "inline_selected" | "inline_after_selection" | "top" | "end";
  document?: Partial<ArticleDocument>;
  sources?: AiSource[];
  citations?: AiCitation[];
};

export const createBlock = (type: ArticleBlockType): ArticleBlock => {
  const id = `${type}-${crypto.randomUUID()}`;
  if (type === "heading")
    return { id, type, content: "Section heading", level: 2 };
  if (type === "quote")
    return { id, type, content: "A considered quotation.", attribution: "" };
  if (type === "image") return { id, type, src: "", alt: "", caption: "" };
  if (type === "video") return { id, type, src: "", alt: "", caption: "" };
  if (type === "audio")
    return { id, type, src: "", label: "Voice note", transcript: "" };
  if (type === "link")
    return {
      id,
      type,
      label: "Source title",
      href: "https://",
      description: "",
    };
  if (type === "embed")
    return { id, type, provider: "youtube", href: "https://", label: "" };
  if (type === "callout")
    return { id, type, content: "A useful aside.", variant: "note" };
  if (type === "code") return { id, type, content: "", language: "text" };
  if (type === "list") return { id, type, items: ["First item"] };
  if (type === "divider") return { id, type };
  return { id, type: "paragraph", content: "" };
};

export const normalizeAiDocument = (
  candidate: Partial<ArticleDocument> | undefined,
  current: ArticleDocument,
): ArticleDocument => {
  const body = Array.isArray(candidate?.body)
    ? candidate.body.filter((block): block is ArticleBlock => Boolean(block && typeof block === "object" && "type" in block))
    : current.body;
  const title = typeof candidate?.title === "string" && candidate.title.trim() ? candidate.title.trim() : current.title;
  const slug = typeof candidate?.slug === "string" && candidate.slug.trim() ? candidate.slug.trim() : current.slug;
  const summary = typeof candidate?.summary === "string" ? candidate.summary.trim() : current.summary;
  const meta = typeof candidate?.meta === "string" ? candidate.meta.trim() : current.meta;
  const seo = candidate?.seo && typeof candidate.seo === "object" ? { ...current.seo, ...candidate.seo } : current.seo;
  const normalized = {
    ...current,
    ...candidate,
    schemaVersion: 2,
    title,
    slug,
    summary,
    meta,
    seo,
    body,
    readingTime: articleReadingTime(body),
  };
  return sanitizeEditorialDocument(normalized);
};

export const articleWordCount = (body: ArticleBlock[]) =>
  body.reduce((count, block) => {
    const text = [
      block.content,
      block.description,
      block.caption,
      block.label,
      block.transcript,
      ...(block.items ?? []),
    ]
      .filter(Boolean)
      .join(" ");
    return count + text.replace(inlineTokenPattern, " ").trim().split(/\s+/).filter(Boolean).length;
  }, 0);

/**
 * Keep reading time editorially consistent: it is derived from the actual
 * article body instead of being a field an editor has to maintain by hand.
 * 200 words/minute is a calm, readable pace for this portfolio's long-form
 * notes and still produces a useful value for very short drafts.
 */
export const articleReadingTime = (body: ArticleBlock[]) => {
  const minutes = Math.max(1, Math.ceil(articleWordCount(body) / 200));
  return `${minutes} min read`;
};
