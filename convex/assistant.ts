import { v } from "convex/values";
import { internalMutation, internalQuery, query } from "./_generated/server";

type PublicWriting = {
  slug: string;
  title: string;
  summary: string;
  meta: string;
  readingTime: string;
  tone?: "blue" | "orange" | "green" | "yellow";
  publishedAt?: number;
};

const normalize = (value: string) => value.trim().toLocaleLowerCase().slice(0, 180);

const toPublicWriting = (article: {
  slug: string;
  title: string;
  summary: string;
  meta: string;
  readingTime: string;
  tone?: "blue" | "orange" | "green" | "yellow";
  publishedAt?: number;
}): PublicWriting => ({
  slug: article.slug,
  title: article.title,
  summary: article.summary,
  meta: article.meta,
  readingTime: article.readingTime,
  tone: article.tone,
  publishedAt: article.publishedAt,
});

function scoreWriting(article: PublicWriting, queryText: string) {
  const query = normalize(queryText);
  if (!query) return 0;
  const terms = query.split(/\s+/).filter(Boolean).slice(0, 12);
  const haystack = `${article.title} ${article.summary} ${article.meta} ${article.slug}`.toLocaleLowerCase();
  return terms.reduce((score, term) => {
    if (!haystack.includes(term)) return score;
    if (article.title.toLocaleLowerCase().includes(term)) return score + 5;
    if (article.meta.toLocaleLowerCase().includes(term)) return score + 3;
    return score + 2;
  }, 0);
}

async function publishedWritingRows(ctx: { db: any }) {
  return await ctx.db
    .query("articles")
    .withIndex("by_status", (q: any) => q.eq("status", "published"))
    .collect();
}

/** Lightweight public search. Article bodies, drafts, and studio fields never leave this query. */
export const publicWritingSearch = query({
  args: { query: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const term = normalize(args.query);
    const limit = Math.max(1, Math.min(Math.floor(args.limit ?? 6), 12));
    if (!term) return [];
    const rows = await publishedWritingRows(ctx);
    return rows
      .map(toPublicWriting)
      .map((article: PublicWriting) => ({ article, score: scoreWriting(article, term) }))
      .filter((entry: { score: number }) => entry.score > 0)
      .sort((a: { score: number }, b: { score: number }) => b.score - a.score)
      .slice(0, limit)
      .map((entry: { article: PublicWriting }) => entry.article);
  },
});

/**
 * Compact context for the public assistant. It is deliberately internal so a
 * browser can never request the portfolio context directly or inspect drafts.
 */
export const publicContext = internalQuery({
  args: {},
  handler: async (ctx) => {
    const page = await ctx.db
      .query("pages")
      .withIndex("by_slug", (q: any) => q.eq("slug", "home"))
      .unique();
    const revisions = page
      ? await ctx.db.query("publicRevisions").withIndex("by_page", (q: any) => q.eq("pageId", page._id)).collect()
      : [];
    const revision = revisions
      .filter((item: any) => item.state === "published" && item.publishedAt)
      .sort((a: any, b: any) => (b.publishedAt ?? 0) - (a.publishedAt ?? 0) || b.createdAt - a.createdAt)[0];
    const snapshot = revision?.snapshot as { sections?: unknown[] } | undefined;
    const sections = Array.isArray(snapshot?.sections) ? snapshot.sections : [];
    const section = (registryType: string) => {
      const value = sections.find((entry) => Boolean(entry && typeof entry === "object" && (entry as Record<string, unknown>).registryType === registryType));
      return value && typeof value === "object" ? (value as Record<string, unknown>).content : null;
    };
    const hero = section("hero") as Record<string, any> | null;
    const about = section("about") as Record<string, any> | null;
    const projects = section("projects") as Record<string, any> | null;
    const projectItems = Array.isArray(projects?.projects) ? projects.projects : [];
    const writings = (await publishedWritingRows(ctx)).sort((a: any, b: any) => (b.publishedAt ?? 0) - (a.publishedAt ?? 0));

    return {
      identity: hero?.identity ?? null,
      roles: Array.isArray(hero?.roles) ? hero.roles.slice(0, 6) : [],
      about: about
        ? { title: about.title, description: about.description, labels: about.labels }
        : null,
      projects: projectItems.slice(0, 24).map((project: any) => ({
        title: project?.title,
        summary: project?.summary,
        categories: project?.categories,
      })),
      writings: writings.slice(0, 80).map(toPublicWriting),
    };
  },
});

const WINDOW_MS = 10 * 60 * 1000;
const MAX_REQUESTS = 18;

/** A small anonymous token bucket used by the public action. */
export const consumeQuota = internalMutation({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const token = args.token.trim().slice(0, 96) || "anonymous";
    const now = Date.now();
    const existing = await ctx.db.query("assistantRateLimits").withIndex("by_token", (q: any) => q.eq("token", token)).unique();
    if (!existing || now - existing.windowStart >= WINDOW_MS) {
      if (existing) await ctx.db.patch(existing._id, { windowStart: now, requestCount: 1, updatedAt: now });
      else await ctx.db.insert("assistantRateLimits", { token, windowStart: now, requestCount: 1, updatedAt: now });
      return { allowed: true, retryAfter: 0 };
    }
    if (existing.requestCount >= MAX_REQUESTS) {
      return { allowed: false, retryAfter: Math.max(1, Math.ceil((WINDOW_MS - (now - existing.windowStart)) / 1000)) };
    }
    await ctx.db.patch(existing._id, { requestCount: existing.requestCount + 1, updatedAt: now });
    return { allowed: true, retryAfter: 0 };
  },
});
