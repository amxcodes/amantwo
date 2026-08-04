import { getAuthUserId } from "@convex-dev/auth/server";
import { paginationOptsValidator } from "convex/server";
import { ConvexError, v } from "convex/values";
import {
  type MutationCtx,
  mutation,
  type QueryCtx,
  query,
} from "./_generated/server";

const articleStatus = v.union(
  v.literal("draft"),
  v.literal("published"),
  v.literal("archived"),
);

const articleCardTone = v.union(
  v.literal("blue"),
  v.literal("orange"),
  v.literal("green"),
  v.literal("yellow"),
);

const mediaValue = v.object({
  src: v.string(),
  alt: v.string(),
  caption: v.optional(v.string()),
  kind: v.union(v.literal("image"), v.literal("video"), v.literal("audio")),
});

const inlineAttachment = v.object({
  id: v.string(),
  kind: v.union(v.literal("link"), v.literal("audio"), v.literal("video"), v.literal("image"), v.literal("embed")),
  label: v.string(),
  href: v.optional(v.string()),
  src: v.optional(v.string()),
  alt: v.optional(v.string()),
  transcript: v.optional(v.string()),
  provider: v.optional(v.string()),
  display: v.optional(v.union(v.literal("inline"), v.literal("block"))),
  sourceId: v.optional(v.string()),
});

const articleBlock = v.object({
  id: v.string(),
  type: v.union(
    v.literal("paragraph"),
    v.literal("heading"),
    v.literal("quote"),
    v.literal("image"),
    v.literal("video"),
    v.literal("link"),
    v.literal("embed"),
    v.literal("audio"),
    v.literal("divider"),
    v.literal("callout"),
    v.literal("code"),
    v.literal("list"),
  ),
  content: v.optional(v.string()),
  level: v.optional(v.number()),
  attribution: v.optional(v.string()),
  src: v.optional(v.string()),
  alt: v.optional(v.string()),
  caption: v.optional(v.string()),
  label: v.optional(v.string()),
  href: v.optional(v.string()),
  description: v.optional(v.string()),
  provider: v.optional(v.string()),
  display: v.optional(v.union(v.literal("inline"), v.literal("block"))),
  sourceId: v.optional(v.string()),
  timestampStart: v.optional(v.number()),
  timestampEnd: v.optional(v.number()),
  transcript: v.optional(v.string()),
  language: v.optional(v.string()),
  items: v.optional(v.array(v.string())),
  variant: v.optional(v.string()),
  inlineAttachments: v.optional(v.array(inlineAttachment)),
  highlights: v.optional(v.array(v.object({
    start: v.number(),
    end: v.number(),
    tone: v.union(v.literal("yellow"), v.literal("blue"), v.literal("green"), v.literal("orange")),
  }))),
});

const articleDocument = v.object({
  schemaVersion: v.optional(v.number()),
  slug: v.string(),
  title: v.string(),
  summary: v.string(),
  meta: v.string(),
  readingTime: v.string(),
  tone: v.optional(articleCardTone),
  status: articleStatus,
  cover: v.optional(mediaValue),
  narration: v.optional(mediaValue),
  body: v.array(articleBlock),
  seo: v.object({
    title: v.string(),
    description: v.string(),
    canonicalPath: v.string(),
    ogImage: v.optional(v.string()),
  }),
});

async function requireEditor(ctx: QueryCtx | MutationCtx) {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new ConvexError("Sign in is required.");
  const profile = await ctx.db
    .query("profiles")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .unique();
  if (!profile) throw new ConvexError("This account does not have CMS access.");
  return { userId, profile };
}

async function audit(
  ctx: MutationCtx,
  event: string,
  articleId: string,
  actorId: string,
  metadata: unknown,
) {
  await ctx.db.insert("auditEvents", {
    event,
    entityType: "article",
    entityId: articleId,
    actorId,
    metadata,
    createdAt: Date.now(),
  });
}

const slugify = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72) || "untitled-note";

function automaticReadingTime(body: unknown) {
  const blocks = Array.isArray(body) ? body : [];
  const words = blocks.reduce((total, item) => {
    if (!item || typeof item !== "object") return total;
    const block = item as Record<string, unknown>;
    const values = [
      block.content,
      block.description,
      block.caption,
      block.label,
      block.transcript,
      ...(Array.isArray(block.items) ? block.items : []),
    ];
    const text = values.filter((value): value is string => typeof value === "string").join(" ");
    return total + text.replace(/[\uE000-\uE001]/g, " ").trim().split(/\s+/).filter(Boolean).length;
  }, 0);
  return `${Math.max(1, Math.ceil(words / 200))} min read`;
}

const allowedBlockTypes = new Set([
  "paragraph",
  "heading",
  "quote",
  "image",
  "video",
  "link",
  "embed",
  "audio",
  "divider",
  "callout",
  "code",
  "list",
]);
const allowedInlineKinds = new Set(["link", "audio", "video", "image", "embed"]);

function cleanText(value: unknown, limit = 24_000) {
  return typeof value === "string"
    ? value
      .replaceAll("\u0000", "")
      .replace(/<\/?script[^>]*>/gi, "")
      .replace(/[\u2014\u2013]/g, ",")
      .replace(/\*/g, "")
      .replace(/[ \t]{2,}/g, " ")
      .slice(0, limit)
    : undefined;
}

function safeUrl(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return undefined;
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

function sanitizeInlineAttachment(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  const kind = typeof item.kind === "string" && allowedInlineKinds.has(item.kind) ? item.kind : null;
  const id = cleanText(item.id, 160);
  const label = cleanText(item.label, 240);
  if (!kind || !id || !label) return null;
  const href = safeUrl(item.href) ?? (kind === "link" || kind === "embed" ? safeUrl(item.src) : undefined);
  const src = safeUrl(item.src) ?? (kind === "audio" || kind === "image" || kind === "video" ? safeUrl(item.href) : undefined);
  return {
    id,
    kind,
    label,
    href,
    src,
    alt: cleanText(item.alt, 500),
    transcript: cleanText(item.transcript, 12_000),
    provider: cleanText(item.provider, 80),
    display: item.display === "block" ? "block" : "inline",
    sourceId: cleanText(item.sourceId, 160),
  };
}

function sanitizeArticleBlock(value: unknown, index: number) {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  const type = typeof item.type === "string" && allowedBlockTypes.has(item.type) ? item.type : null;
  const id = cleanText(item.id, 160) || `ai-block-${index + 1}`;
  if (!type) return null;
  const block: Record<string, unknown> = {
    id,
    type,
    content: cleanText(item.content),
    level: typeof item.level === "number" ? Math.min(6, Math.max(1, Math.round(item.level))) : undefined,
    attribution: cleanText(item.attribution, 500)?.toLowerCase() === "attribution" ? undefined : cleanText(item.attribution, 500),
    src: safeUrl(item.src) ?? (type === "image" || type === "video" || type === "audio" ? safeUrl(item.href) : undefined),
    alt: cleanText(item.alt, 500),
    caption: cleanText(item.caption, 1_000),
    label: cleanText(item.label, 500),
    href: safeUrl(item.href),
    description: cleanText(item.description, 4_000),
    provider: cleanText(item.provider, 100),
    display: item.display === "inline" ? "inline" : "block",
    sourceId: cleanText(item.sourceId, 160),
    timestampStart: typeof item.timestampStart === "number" ? item.timestampStart : undefined,
    timestampEnd: typeof item.timestampEnd === "number" ? item.timestampEnd : undefined,
    transcript: cleanText(item.transcript, 12_000),
    language: cleanText(item.language, 80),
    items: Array.isArray(item.items)
      ? item.items.map((entry) => cleanText(entry, 2_000)).filter((entry): entry is string => Boolean(entry)).slice(0, 40)
      : undefined,
    variant: cleanText(item.variant, 80),
    inlineAttachments: Array.isArray(item.inlineAttachments)
      ? item.inlineAttachments.map(sanitizeInlineAttachment).filter((entry): entry is NonNullable<typeof entry> => Boolean(entry)).slice(0, 24)
      : undefined,
    highlights: Array.isArray(item.highlights)
      ? item.highlights
        .filter((entry): entry is Record<string, unknown> => Boolean(entry && typeof entry === "object"))
        .map((entry) => ({
          start: typeof entry.start === "number" ? Math.max(0, Math.round(entry.start)) : 0,
          end: typeof entry.end === "number" ? Math.max(0, Math.round(entry.end)) : 0,
          tone: entry.tone === "blue" || entry.tone === "green" || entry.tone === "orange" ? entry.tone : "yellow",
        }))
        .filter((entry) => entry.end > entry.start)
        .slice(0, 30)
      : undefined,
  };
  if (type === "quote" && !String(block.content ?? "").trim()) return null;
  if (type === "quote" && block.attribution === "Attribution") block.attribution = undefined;
  return Object.fromEntries(Object.entries(block).filter(([, entry]) => entry !== undefined));
}

function applyAiDocument(current: Record<string, unknown>, candidate: unknown) {
  if (!candidate || typeof candidate !== "object") {
    throw new ConvexError("The assistant returned no structured article document.");
  }
  const next = candidate as Record<string, unknown>;
  const body = Array.isArray(next.body)
    ? next.body.map(sanitizeArticleBlock).filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
    : [];
  const usableBody = body.filter((block) => {
    if (block.type === "divider") return true;
    const content = typeof block.content === "string" ? block.content : "";
    const items = Array.isArray(block.items) ? block.items : [];
    if (block.type === "list") return items.length > 0;
    if (["image", "video", "audio"].includes(String(block.type))) return Boolean(block.src);
    return Boolean(content.trim() || block.href || block.src || items.length);
  });
  if (!usableBody.length) throw new ConvexError("The proposed article needs at least one valid content block.");
  const title = cleanText(next.title, 240)?.trim();
  if (!title) throw new ConvexError("The proposed article needs a title.");
  const summary = cleanText(next.summary, 2_000) ?? "";
  const meta = cleanText(next.meta, 300) ?? "";
  const tone: "blue" | "orange" | "green" | "yellow" = next.tone === "orange" || next.tone === "green" || next.tone === "yellow" || next.tone === "blue"
    ? next.tone
    : current.tone === "orange" || current.tone === "green" || current.tone === "yellow" || current.tone === "blue"
      ? current.tone
      : "blue";
  const seoCandidate = next.seo && typeof next.seo === "object" ? next.seo as Record<string, unknown> : {};
  const currentSeo = current.seo && typeof current.seo === "object" ? current.seo as Record<string, unknown> : {};
  const slug = cleanText(next.slug, 120)?.trim() || slugify(title);
  return {
    slug,
    title,
    summary,
    meta,
    tone,
    readingTime: automaticReadingTime(usableBody),
    cover: next.cover ?? current.cover,
    narration: next.narration ?? current.narration,
    body: usableBody,
    seo: {
      ...currentSeo,
      ...seoCandidate,
      title: cleanText(seoCandidate.title, 240) || title,
      description: cleanText(seoCandidate.description, 2_000) || summary,
      canonicalPath: cleanText(seoCandidate.canonicalPath, 240) || `/writing/${slug}`,
      ogImage: safeUrl(seoCandidate.ogImage),
    },
  };
}

export const adminList = query({
  args: {},
  handler: async (ctx) => {
    await requireEditor(ctx);
    const articles = await ctx.db
      .query("articles")
      .withIndex("by_updatedAt")
      .collect();
    return articles
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .map((article) => ({ ...article, readingTime: automaticReadingTime(article.body) }));
  },
});

export const adminGet = query({
  args: { articleId: v.id("articles") },
  handler: async (ctx, args) => {
    await requireEditor(ctx);
    const article = await ctx.db.get(args.articleId);
    return article ? { ...article, readingTime: automaticReadingTime(article.body) } : null;
  },
});

export const adminRevisions = query({
  args: { articleId: v.id("articles") },
  handler: async (ctx, args) => {
    await requireEditor(ctx);
    const revisions = await ctx.db
      .query("articleRevisions")
      .withIndex("by_article", (q) => q.eq("articleId", args.articleId))
      .collect();
    return revisions.sort((a, b) => b.createdAt - a.createdAt).slice(0, 12);
  },
});

export const createDraft = mutation({
  args: { title: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const { userId } = await requireEditor(ctx);
    const now = Date.now();
    const title = args.title?.trim() || "Untitled note";
    const baseSlug = slugify(title);
    const existing = await ctx.db
      .query("articles")
      .withIndex("by_slug", (q) => q.eq("slug", baseSlug))
      .unique();
    const slug = existing ? `${baseSlug}-${String(now).slice(-6)}` : baseSlug;
    const articleId = await ctx.db.insert("articles", {
      slug,
      title,
      summary: "",
      meta: "Working note",
      readingTime: "1 min read",
      tone: "blue",
      status: "draft",
      body: [
        {
          id: `paragraph-${now}`,
          type: "paragraph",
          content: "",
        },
      ],
      seo: {
        title,
        description: "",
        canonicalPath: `/writing/${slug}`,
      },
      createdBy: userId,
      createdAt: now,
      updatedAt: now,
    });
    await audit(ctx, "article.created", String(articleId), String(userId), {
      slug,
    });
    return articleId;
  },
});

export const saveDraft = mutation({
  args: {
    articleId: v.id("articles"),
    document: articleDocument,
  },
  handler: async (ctx, args) => {
    const { userId } = await requireEditor(ctx);
    const current = await ctx.db.get(args.articleId);
    if (!current) throw new ConvexError("Article not found.");
    const duplicate = await ctx.db
      .query("articles")
      .withIndex("by_slug", (q) => q.eq("slug", args.document.slug))
      .unique();
    if (duplicate && duplicate._id !== args.articleId) {
      throw new ConvexError("Another article already uses this slug.");
    }
    const document = {
      ...args.document,
      readingTime: automaticReadingTime(args.document.body),
    };
    await ctx.db.patch(args.articleId, {
      ...document,
      status: document.status === "archived" ? "archived" : current.status,
      updatedAt: Date.now(),
    });
    await audit(
      ctx,
      "article.draft.saved",
      String(args.articleId),
      String(userId),
      {
        blocks: args.document.body.length,
      },
    );
  },
});

export const publish = mutation({
  args: {
    articleId: v.id("articles"),
    document: articleDocument,
    label: v.string(),
  },
  handler: async (ctx, args) => {
    const { userId } = await requireEditor(ctx);
    if (!args.document.title.trim())
      throw new ConvexError("Add a title before publishing.");
    if (!args.document.slug.trim())
      throw new ConvexError("Add a slug before publishing.");
    const duplicate = await ctx.db
      .query("articles")
      .withIndex("by_slug", (q) => q.eq("slug", args.document.slug))
      .unique();
    if (duplicate && duplicate._id !== args.articleId) {
      throw new ConvexError("Another article already uses this slug.");
    }
    const publishedAt = Date.now();
    const document = {
      ...args.document,
      readingTime: automaticReadingTime(args.document.body),
    };
    const snapshot = {
      ...document,
      status: "published" as const,
      publishedAt,
    };
    await ctx.db.patch(args.articleId, {
      ...document,
      status: "published",
      publishedAt,
      updatedAt: publishedAt,
    });
    await ctx.db.insert("articleRevisions", {
      articleId: args.articleId,
      state: "published",
      snapshot,
      label: args.label,
      createdAt: publishedAt,
      publishedAt,
    });
    await audit(
      ctx,
      "article.published",
      String(args.articleId),
      String(userId),
      {
        slug: args.document.slug,
      },
    );
  },
});

export const setArchived = mutation({
  args: {
    articleId: v.id("articles"),
    archived: v.boolean(),
  },
  handler: async (ctx, args) => {
    const { userId } = await requireEditor(ctx);
    const article = await ctx.db.get(args.articleId);
    if (!article) throw new ConvexError("Article not found.");
    await ctx.db.patch(args.articleId, {
      status: args.archived ? "archived" : "draft",
      updatedAt: Date.now(),
    });
    await audit(
      ctx,
      args.archived ? "article.archived" : "article.restored",
      String(args.articleId),
      String(userId),
      {},
    );
  },
});

export const deleteArticle = mutation({
  args: {
    articleId: v.id("articles"),
  },
  handler: async (ctx, args) => {
    const { userId } = await requireEditor(ctx);
    const article = await ctx.db.get(args.articleId);
    if (!article) throw new ConvexError("Article not found.");
    const revisions = await ctx.db
      .query("articleRevisions")
      .withIndex("by_article", (q) => q.eq("articleId", args.articleId))
      .collect();
    await Promise.all(revisions.map((revision) => ctx.db.delete(revision._id)));
    await ctx.db.delete(args.articleId);
    await audit(
      ctx,
      "article.deleted",
      String(args.articleId),
      String(userId),
      { slug: article.slug },
    );
  },
});

export const applyAiChangeSet = mutation({
  args: { changeSetId: v.id("articleChangeSets") },
  handler: async (ctx, args) => {
    const { userId } = await requireEditor(ctx);
    const changeSet = await ctx.db.get(args.changeSetId);
    if (!changeSet || changeSet.userId !== userId) throw new ConvexError("That AI proposal could not be found.");
    if (changeSet.state !== "ready") throw new ConvexError("That AI proposal is no longer available.");
    const article = await ctx.db.get(changeSet.articleId);
    if (!article) throw new ConvexError("The article for this proposal no longer exists.");
    if (changeSet.baseUpdatedAt && article.updatedAt !== changeSet.baseUpdatedAt) {
      throw new ConvexError("The article changed while this proposal was being prepared. Run the assistant again to avoid overwriting your edits.");
    }
    const proposal = changeSet.proposal as { document?: unknown };
    const next = applyAiDocument(article as unknown as Record<string, unknown>, proposal?.document);
    const now = Date.now();
    await ctx.db.patch(article._id, {
      ...next,
      status: "draft",
      updatedAt: now,
    });
    await ctx.db.insert("articleRevisions", {
      articleId: article._id,
      state: "draft",
      snapshot: { ...next, status: "draft" },
      label: "AI proposal applied",
      createdAt: now,
    });
    await ctx.db.patch(changeSet._id, { state: "applied", updatedAt: now, appliedAt: now });
    await audit(ctx, "article.ai_proposal.applied", String(article._id), String(userId), {
      changeSetId: String(changeSet._id),
      jobId: String(changeSet.jobId),
      blocks: next.body.length,
    });
  },
});

export const dismissAiChangeSet = mutation({
  args: { changeSetId: v.id("articleChangeSets") },
  handler: async (ctx, args) => {
    const { userId } = await requireEditor(ctx);
    const changeSet = await ctx.db.get(args.changeSetId);
    if (!changeSet || changeSet.userId !== userId) throw new ConvexError("That AI proposal could not be found.");
    if (changeSet.state === "ready") await ctx.db.patch(changeSet._id, { state: "dismissed", updatedAt: Date.now() });
  },
});

export const restoreRevision = mutation({
  args: {
    articleId: v.id("articles"),
    revisionId: v.id("articleRevisions"),
  },
  handler: async (ctx, args) => {
    const { userId } = await requireEditor(ctx);
    const [article, revision] = await Promise.all([
      ctx.db.get(args.articleId),
      ctx.db.get(args.revisionId),
    ]);
    if (!article || !revision || revision.articleId !== args.articleId) {
      throw new ConvexError("That article revision could not be found.");
    }
    const snapshot = revision.snapshot as {
      slug: string;
      title: string;
      summary: string;
      meta: string;
      readingTime: string;
      cover?: typeof article.cover;
      narration?: typeof article.narration;
      body: typeof article.body;
      seo: typeof article.seo;
    };
    await ctx.db.patch(args.articleId, {
      slug: snapshot.slug,
      title: snapshot.title,
      summary: snapshot.summary,
      meta: snapshot.meta,
      readingTime: snapshot.readingTime,
      cover: snapshot.cover,
      narration: snapshot.narration,
      body: snapshot.body,
      seo: snapshot.seo,
      status: "draft",
      updatedAt: Date.now(),
    });
    await audit(
      ctx,
      "article.revision.restored",
      String(args.articleId),
      String(userId),
      {
        revisionId: String(args.revisionId),
      },
    );
  },
});

export const publicList = query({
  args: {},
  handler: async (ctx) => {
    const articles = await ctx.db
      .query("articles")
      .withIndex("by_status", (q) => q.eq("status", "published"))
      .collect();
    return articles
      .sort(
        (a, b) => (b.publishedAt ?? b.updatedAt) - (a.publishedAt ?? a.updatedAt),
      )
      .map((article) => ({ ...article, readingTime: automaticReadingTime(article.body) }));
  },
});

/**
 * Lightweight, cursor-paginated records for public writing collections.
 *
 * Article bodies, narration metadata, cover metadata, and SEO documents stay
 * behind `publicBySlug`. That keeps collection payloads bounded as the archive
 * grows while preserving the writing studio's existing document contract.
 */
export const publicCards = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    const result = await ctx.db
      .query("articles")
      .withIndex("by_status_publishedAt", (q) =>
        q.eq("status", "published"),
      )
      .order("desc")
      .paginate(args.paginationOpts);

    return {
      ...result,
      page: result.page.map((article) => ({
        slug: article.slug,
        title: article.title,
        summary: article.summary,
        meta: article.meta,
        readingTime: article.readingTime,
        tone: article.tone,
        publishedAt: article.publishedAt,
        // Keep the first media frame with the lightweight card record so a
        // reader can paint its drawer immediately. The article body remains
        // behind publicBySlug, so collection payloads stay bounded.
        cover: article.cover,
        narration: article.narration,
      })),
    };
  },
});

export const publicBySlug = query({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    const exactArticle = await ctx.db
      .query("articles")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .unique();
    if (exactArticle?.status === "published") {
      return {
        ...exactArticle,
        readingTime: automaticReadingTime(exactArticle.body),
      };
    }

    // Preserve old shared aliases after an editor expands a slug. This scan is
    // deliberately confined to the exceptional alias path; normal card and
    // canonical slug reads remain indexed.
    const wanted = slugify(args.slug);
    const published = await ctx.db
      .query("articles")
      .withIndex("by_status", (q) => q.eq("status", "published"))
      .collect();
    const alias = published.find((article) => {
      const articleSlug = slugify(article.slug);
      const titleSlug = slugify(article.title);
      return (
        articleSlug === wanted ||
        titleSlug === wanted ||
        articleSlug.endsWith(`-${wanted}`)
      );
    });
    return alias
      ? { ...alias, readingTime: automaticReadingTime(alias.body) }
      : null;
  },
});
