import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError, v } from "convex/values";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";

const settingsKey = "newsletter";

export const defaultSettings = {
  enabled: true,
  title: "Get occasional notes",
  description: "A small, occasional note on products, systems, and moving images.",
  placeholder: "Email address",
  buttonLabel: "Join",
  successMessage: "You're on the list.",
};

type NewsletterSettings = typeof defaultSettings;

const asSettings = (value: unknown): NewsletterSettings => {
  if (!value || typeof value !== "object") return defaultSettings;
  const record = value as Record<string, unknown>;
  return {
    enabled: record.enabled !== false,
    title: typeof record.title === "string" && record.title.trim() ? record.title : defaultSettings.title,
    description: typeof record.description === "string" && record.description.trim() ? record.description : defaultSettings.description,
    placeholder: typeof record.placeholder === "string" && record.placeholder.trim() ? record.placeholder : defaultSettings.placeholder,
    buttonLabel: typeof record.buttonLabel === "string" && record.buttonLabel.trim() ? record.buttonLabel : defaultSettings.buttonLabel,
    successMessage: typeof record.successMessage === "string" && record.successMessage.trim() ? record.successMessage : defaultSettings.successMessage,
  };
};

const normalizeEmail = (value: string) => value.trim().toLowerCase();

const validEmail = (value: string) =>
  value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

const rateLimitKey = "public-newsletter-subscribe";
const rateLimitWindowMs = 60_000;
const rateLimitMaxAttempts = 30;

/**
 * Consume one write from the public newsletter bucket.
 *
 * This is deliberately enforced in the Convex mutation, rather than in the
 * form, so refreshes and scripted requests cannot bypass it. The bucket is
 * fixed-window and transactionally updated by Convex, which keeps concurrent
 * submissions from racing past the limit.
 */
async function consumePublicRateLimit(ctx: MutationCtx, now: number) {
  const existing = await ctx.db
    .query("newsletterRateLimits")
    .withIndex("by_key", (q) => q.eq("key", rateLimitKey))
    .unique();

  if (!existing || now - existing.windowStartedAt >= rateLimitWindowMs) {
    if (existing) {
      await ctx.db.patch(existing._id, {
        windowStartedAt: now,
        attempts: 1,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("newsletterRateLimits", {
        key: rateLimitKey,
        windowStartedAt: now,
        attempts: 1,
        updatedAt: now,
      });
    }
    return true;
  }

  if (existing.attempts >= rateLimitMaxAttempts) return false;

  await ctx.db.patch(existing._id, {
    attempts: existing.attempts + 1,
    updatedAt: now,
  });
  return true;
}

async function requireEditorQuery(ctx: QueryCtx) {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new ConvexError("Sign in to view newsletter data.");
  const profile = await ctx.db
    .query("profiles")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .unique();
  if (!profile) throw new ConvexError("This account does not have CMS access.");
  return profile;
}

/** Public, non-sensitive newsletter presentation settings. */
export const getPublicSettings = query({
  args: {},
  handler: async (ctx) => {
    const row = await ctx.db
      .query("siteSettings")
      .withIndex("by_key", (q) => q.eq("key", settingsKey))
      .unique();
    return asSettings(row?.value);
  },
});

/** Create or restore a subscription without exposing the audience list. */
export const subscribe = mutation({
  args: { email: v.string(), source: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const settingsRow = await ctx.db
      .query("siteSettings")
      .withIndex("by_key", (q) => q.eq("key", settingsKey))
      .unique();
    if (!asSettings(settingsRow?.value).enabled) {
      throw new ConvexError("Newsletter sign-ups are currently closed.");
    }

    const normalizedEmail = normalizeEmail(args.email);
    if (!validEmail(normalizedEmail)) {
      throw new ConvexError("Enter a valid email address.");
    }

    const now = Date.now();
    const existing = await ctx.db
      .query("newsletterSubscribers")
      .withIndex("by_email", (q) => q.eq("normalizedEmail", normalizedEmail))
      .unique();

    if (existing?.status === "subscribed") return { status: "alreadySubscribed" as const };

    if (!(await consumePublicRateLimit(ctx, now))) {
      throw new ConvexError("Too many sign-up attempts. Please try again in a minute.");
    }

    if (existing) {
      await ctx.db.patch(existing._id, {
        email: args.email.trim(),
        status: "subscribed",
        source: args.source?.trim() || existing.source,
        updatedAt: now,
        subscribedAt: now,
        unsubscribedAt: undefined,
      });
      return { status: "resubscribed" as const };
    }

    await ctx.db.insert("newsletterSubscribers", {
      email: args.email.trim(),
      normalizedEmail,
      status: "subscribed",
      source: args.source?.trim() || undefined,
      createdAt: now,
      updatedAt: now,
      subscribedAt: now,
    });
    return { status: "subscribed" as const };
  },
});

/** Admin-only settings plus a compact, paginated audience snapshot. */
export const adminDashboard = query({
  args: {
    status: v.optional(v.union(v.literal("subscribed"), v.literal("unsubscribed"))),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireEditorQuery(ctx);
    const limit = Math.min(Math.max(Math.floor(args.limit ?? 50), 1), 200);
    const settingsRow = await ctx.db
      .query("siteSettings")
      .withIndex("by_key", (q) => q.eq("key", settingsKey))
      .unique();
    const items = args.status
      ? await ctx.db
        .query("newsletterSubscribers")
        .withIndex("by_status_createdAt", (q) => q.eq("status", args.status!))
        .order("desc")
        .take(limit)
      : await ctx.db
        .query("newsletterSubscribers")
        .withIndex("by_createdAt")
        .order("desc")
        .take(limit);
    const subscribed = await ctx.db
      .query("newsletterSubscribers")
      .withIndex("by_status_createdAt", (q) => q.eq("status", "subscribed"))
      .collect();
    const unsubscribed = await ctx.db
      .query("newsletterSubscribers")
      .withIndex("by_status_createdAt", (q) => q.eq("status", "unsubscribed"))
      .collect();
    return {
      settings: asSettings(settingsRow?.value),
      items: items.map(({ _id, _creationTime, email, status, source, createdAt, updatedAt, subscribedAt, unsubscribedAt }) => ({
        _id,
        _creationTime,
        email,
        status,
        source,
        createdAt,
        updatedAt,
        subscribedAt,
        unsubscribedAt,
      })),
      counts: {
        subscribed: subscribed.length,
        unsubscribed: unsubscribed.length,
        total: subscribed.length + unsubscribed.length,
      },
    };
  },
});

export const updateSettings = mutation({
  args: {
    enabled: v.boolean(),
    title: v.string(),
    description: v.string(),
    placeholder: v.string(),
    buttonLabel: v.string(),
    successMessage: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new ConvexError("Sign in to update newsletter settings.");
    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();
    if (!profile) throw new ConvexError("This account does not have CMS access.");
    const settings = asSettings(args);
    const now = Date.now();
    const existing = await ctx.db
      .query("siteSettings")
      .withIndex("by_key", (q) => q.eq("key", settingsKey))
      .unique();
    if (existing) await ctx.db.patch(existing._id, { value: settings, updatedAt: now });
    else await ctx.db.insert("siteSettings", { key: settingsKey, value: settings, updatedAt: now });
    return settings;
  },
});
