import { ConvexError, v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { internalQuery, mutation, query, type MutationCtx } from "./_generated/server";

declare const process: { env: Record<string, string | undefined> };

const state = v.union(v.literal("draft"), v.literal("published"));
const timelineSegment = v.union(
  v.object({ type: v.literal("text"), value: v.string() }),
  v.object({ type: v.literal("pill"), label: v.string(), detail: v.string(), tone: v.union(v.literal("blue"), v.literal("orange"), v.literal("yellow"), v.literal("green")) }),
);
const timelineEntry = v.object({
  id: v.string(),
  period: v.string(),
  location: v.string(),
  segments: v.array(timelineSegment),
});

function recordValue(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

function nonEmptyString(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * Keep malformed editor placeholders out of the published content path. The
 * section schema intentionally stays flexible for future block types, but the
 * collections that power the public portfolio need a small, explicit contract.
 * Validation happens before the existing rows are deleted so a failed save is
 * recoverable and cannot leave a half-written page.
 */
function validateManagedSection(section: { registryType: string; content: unknown }) {
  const content = recordValue(section.content);
  if (!content) return;

  if (section.registryType === "projects") {
    const projects = content.projects;
    if (!Array.isArray(projects)) return;
    for (const value of projects) {
      const project = recordValue(value);
      const title = project?.title;
      const slug = project?.slug;
      const summary = project?.summary;
      const categories = project?.categories;
      const tags = project?.tags;
      if (
        !project ||
        !nonEmptyString(title) ||
        !nonEmptyString(slug) ||
        !nonEmptyString(summary) ||
        !nonEmptyString(project.eyebrow) ||
        !nonEmptyString(project.meta) ||
        !nonEmptyString(project.status) ||
        !nonEmptyString(project.detail) ||
        !nonEmptyString(project.caseStudy) ||
        !Array.isArray(categories) ||
        categories.length === 0 ||
        !Array.isArray(tags) ||
        tags.length === 0 ||
        title === "Untitled project" ||
        summary === "Describe the work in one clear sentence."
      ) {
        throw new ConvexError("Finish or remove the project before saving.");
      }
    }
  }

  if (section.registryType === "experience" || section.registryType === "education") {
    const entries = content.entries;
    if (!Array.isArray(entries)) return;
    for (const value of entries) {
      const entry = recordValue(value);
      const segments = entry?.segments;
      const meaningfulSegment = Array.isArray(segments) && segments.some((segment) => {
        const item = recordValue(segment);
        if (item?.type === "pill") return nonEmptyString(item.label) && nonEmptyString(item.detail);
        return item?.type === "text" && nonEmptyString(item.value) && item.value !== "A new sentence about this work.";
      });
      if (!entry || !nonEmptyString(entry.id) || !nonEmptyString(entry.period) || !meaningfulSegment) {
        throw new ConvexError("Finish or remove the timeline entry before saving.");
      }
    }
  }
}

async function requireEditor(ctx: MutationCtx) {
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
  entityType: string,
  entityId: string,
  actorId: string,
  metadata: unknown,
) {
  await ctx.db.insert("auditEvents", {
    event,
    entityType,
    entityId,
    actorId,
    metadata,
    createdAt: Date.now(),
  });
}

export const bootstrapOwner = mutation({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new ConvexError("Sign in is required.");
    const ownerEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
    if (!ownerEmail || ownerEmail !== args.email.trim().toLowerCase()) {
      throw new ConvexError("Set ADMIN_EMAIL in Convex before creating the owner.");
    }
    const existingOwner = await ctx.db
      .query("profiles")
      .filter((q) => q.eq(q.field("role"), "owner"))
      .first();
    if (existingOwner && existingOwner.userId !== userId) {
      throw new ConvexError("An owner already exists.");
    }
    const current = await ctx.db
      .query("profiles")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();
    if (current) await ctx.db.patch(current._id, { role: "owner", updatedAt: Date.now() });
    else await ctx.db.insert("profiles", { userId, role: "owner", updatedAt: Date.now() });
    await audit(ctx, "owner.bootstrapped", "profile", String(userId), String(userId), {});
  },
});

export const workspace = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const profile = await ctx.db.query("profiles").withIndex("by_userId", (q) => q.eq("userId", userId)).unique();
    if (!profile) return { profile: null, settings: null, pages: [] };
    const settings = await ctx.db.query("siteSettings").withIndex("by_key", (q) => q.eq("key", "primary")).unique();
    const pages = await ctx.db.query("pages").collect();
    return { profile, settings, pages };
  },
});

/**
 * Read-only context for the editorial agent. This intentionally returns only
 * published/public portfolio content and is callable only from Convex
 * internal functions; it never exposes admin credentials or provider secrets.
 */
export const portfolioContext = internalQuery({
  args: {},
  handler: async (ctx) => {
    const settings = await ctx.db
      .query("siteSettings")
      .withIndex("by_key", (q) => q.eq("key", "primary"))
      .unique();
    const page = await ctx.db
      .query("pages")
      .withIndex("by_slug", (q) => q.eq("slug", "home"))
      .unique();
    const sections = page
      ? await ctx.db
        .query("sections")
        .withIndex("by_page_position", (q) => q.eq("pageId", page._id))
        .collect()
      : [];
    return {
      settings: settings?.value ?? null,
      page: page ? { slug: page.slug, title: page.title, seo: page.seo } : null,
      sections: sections
        .filter((section) => section.status !== "disabled")
        .sort((a, b) => a.position - b.position)
        .map((section) => ({
          registryType: section.registryType,
          position: section.position,
          content: section.content,
        })),
    };
  },
});

export const setupState = query({
  args: {},
  handler: async (ctx) => {
    const owner = await ctx.db
      .query("profiles")
      .filter((q) => q.eq(q.field("role"), "owner"))
      .first();
    return { ownerExists: Boolean(owner) };
  },
});

export const publicHome = query({
  args: {},
  handler: async (ctx) => {
    const page = await ctx.db.query("pages").withIndex("by_slug", (q) => q.eq("slug", "home")).unique();
    if (!page || page.publicationState !== "published") return null;
    const revisions = await ctx.db
      .query("publicRevisions")
      .withIndex("by_page", (q) => q.eq("pageId", page._id))
      .collect();
    // A publish creates an immutable snapshot. Select the newest snapshot
    // deterministically, including when two publishes happen in the same
    // millisecond (which is common while iterating in the studio).
    const published = revisions
      .filter((revision) => revision.state === "published" && revision.publishedAt)
      .sort((a, b) =>
        (b.publishedAt ?? 0) - (a.publishedAt ?? 0) ||
        b.createdAt - a.createdAt ||
        b._creationTime - a._creationTime,
      )[0];
    if (!published || typeof published.snapshot !== "object" || published.snapshot === null) return null;
    const snapshot = published.snapshot as { sections?: unknown };
    if (!Array.isArray(snapshot.sections)) return null;

    // Convex's indexed query is ordered today, but a public revision is a
    // durable API boundary. Sort again so section order (and therefore the
    // project array/pagination order rendered by the site) never depends on
    // storage iteration details.
    return snapshot.sections
      .map((value) => recordValue(value))
      .filter((value): value is Record<string, unknown> => Boolean(value))
      .sort((a, b) => Number(a.position ?? 0) - Number(b.position ?? 0));
  },
});

export const pageDetail = query({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();
    if (!profile) throw new ConvexError("This account does not have CMS access.");
    const page = await ctx.db
      .query("pages")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .unique();
    if (!page) return null;
    const sections = await ctx.db
      .query("sections")
      .withIndex("by_page_position", (q) => q.eq("pageId", page._id))
      .collect();
    return { page, sections };
  },
});

export const upsertSettings = mutation({
  args: { value: v.any() },
  handler: async (ctx, args) => {
    const { userId } = await requireEditor(ctx);
    const existing = await ctx.db.query("siteSettings").withIndex("by_key", (q) => q.eq("key", "primary")).unique();
    if (existing) await ctx.db.patch(existing._id, { value: args.value, updatedAt: Date.now() });
    else await ctx.db.insert("siteSettings", { key: "primary", value: args.value, updatedAt: Date.now() });
    await audit(ctx, "settings.saved", "siteSettings", "primary", String(userId), {});
  },
});

export const upsertPage = mutation({
  args: { slug: v.string(), title: v.string(), seo: v.any(), publicationState: state },
  handler: async (ctx, args) => {
    const { userId } = await requireEditor(ctx);
    const existing = await ctx.db.query("pages").withIndex("by_slug", (q) => q.eq("slug", args.slug)).unique();
    const patch = { title: args.title, seo: args.seo, publicationState: args.publicationState, updatedAt: Date.now() };
    let pageId;
    if (existing) {
      await ctx.db.patch(existing._id, patch);
      pageId = existing._id;
    } else {
      pageId = await ctx.db.insert("pages", { slug: args.slug, ...patch });
    }
    await audit(ctx, "page.saved", "page", String(pageId), String(userId), { slug: args.slug });
    return pageId;
  },
});

export const replaceSections = mutation({
  args: { pageId: v.id("pages"), sections: v.array(v.object({ sectionId: v.string(), registryType: v.string(), position: v.number(), status: v.union(v.literal("draft"), v.literal("published"), v.literal("disabled")), content: v.any(), layout: v.any(), motion: v.any(), schemaVersion: v.number() })) },
  handler: async (ctx, args) => {
    const { userId } = await requireEditor(ctx);
    for (const section of args.sections) validateManagedSection(section);
    const old = await ctx.db.query("sections").withIndex("by_page", (q) => q.eq("pageId", args.pageId)).collect();
    await Promise.all(old.map((section) => ctx.db.delete(section._id)));
    const updatedAt = Date.now();
    await Promise.all(args.sections.map((section) => ctx.db.insert("sections", { ...section, pageId: args.pageId, updatedAt })));
    await audit(ctx, "page.sections.replaced", "page", String(args.pageId), String(userId), { count: args.sections.length });
  },
});

export const resetManagedCollections = mutation({
  args: {
    pageId: v.id("pages"),
    experience: v.array(timelineEntry),
    education: v.array(timelineEntry),
  },
  handler: async (ctx, args) => {
    const { userId } = await requireEditor(ctx);
    const current = await ctx.db.query("sections").withIndex("by_page", (q) => q.eq("pageId", args.pageId)).collect();
    const replacement = new Map([
      ["projects", { projects: [] }],
      ["writing", { posts: [] }],
      ["experience", { entries: args.experience }],
      ["education", { entries: args.education }],
    ]);
    await Promise.all(current.map(async (section) => {
      const content = replacement.get(section.registryType);
      if (content) await ctx.db.patch(section._id, { content, status: "draft", updatedAt: Date.now() });
    }));
    await audit(ctx, "collections.reset", "page", String(args.pageId), String(userId), { projects: 0, posts: 0, experience: args.experience.length, education: args.education.length });
  },
});

export const publishPage = mutation({
  args: { pageId: v.id("pages"), label: v.string() },
  handler: async (ctx, args) => {
    const { userId } = await requireEditor(ctx);
    const page = await ctx.db.get(args.pageId);
    if (!page) throw new ConvexError("Page not found.");
    const sections = (await ctx.db.query("sections").withIndex("by_page_position", (q) => q.eq("pageId", args.pageId)).collect())
      .sort((a, b) => a.position - b.position || a._creationTime - b._creationTime);
    for (const section of sections) validateManagedSection(section);
    const publishedAt = Date.now();
    const publishedSections = sections.map((section) => ({ ...section, status: "published" as const, updatedAt: publishedAt }));
    await Promise.all(sections.filter((section) => section.status !== "published").map((section) => ctx.db.patch(section._id, { status: "published", updatedAt: publishedAt })));
    const snapshot = {
      page: { ...page, publicationState: "published" as const, updatedAt: publishedAt },
      sections: publishedSections,
    };
    await ctx.db.insert("publicRevisions", { pageId: args.pageId, state: "published", snapshot, label: args.label, createdAt: publishedAt, publishedAt });
    await ctx.db.patch(args.pageId, { publicationState: "published", updatedAt: publishedAt });
    await audit(ctx, "page.published", "page", String(args.pageId), String(userId), { label: args.label });
  },
});
