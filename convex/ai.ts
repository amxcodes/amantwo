import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import {
  internalMutation,
  internalQuery,
  type MutationCtx,
  mutation,
  type QueryCtx,
  query,
} from "./_generated/server";

const aiMode = v.union(
  v.literal("chat"),
  v.literal("write"),
  v.literal("research"),
);

export const profileForUser = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args) =>
    await ctx.db
      .query("profiles")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .unique(),
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

export const providerCatalog = query({
  args: {},
  handler: async (ctx) => {
    await requireEditor(ctx);
    const providers = await ctx.db
      .query("aiProviders")
      .withIndex("by_priority")
      .collect();
    const secrets = await ctx.db.query("aiSecrets").collect();
    const secretIds = new Set(
      secrets.map((secret) => String(secret.providerId)),
    );
    return providers.map((provider) => ({
      ...provider,
      secretConfigured: secretIds.has(String(provider._id)),
    }));
  },
});

export const createJob = mutation({
  args: {
    articleId: v.optional(v.id("articles")),
    mode: aiMode,
    input: v.any(),
  },
  handler: async (ctx, args) => {
    const { userId } = await requireEditor(ctx);
    const now = Date.now();
    const jobId = await ctx.db.insert("aiJobs", {
      userId,
      articleId: args.articleId,
      mode: args.mode,
      status: "queued",
      input: args.input,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.scheduler.runAfter(0, internal.aiActions.runJob, { jobId });
    return jobId;
  },
});

export const createChangeSet = internalMutation({
  args: {
    jobId: v.id("aiJobs"),
    articleId: v.id("articles"),
    userId: v.id("users"),
    baseUpdatedAt: v.optional(v.number()),
    proposal: v.any(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("articleChangeSets")
      .withIndex("by_job", (q) => q.eq("jobId", args.jobId))
      .unique();
    if (existing) return existing._id;
    const now = Date.now();
    return await ctx.db.insert("articleChangeSets", {
      jobId: args.jobId,
      articleId: args.articleId,
      userId: args.userId,
      baseUpdatedAt: args.baseUpdatedAt,
      state: "ready",
      proposal: args.proposal,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const getChangeSet = query({
  args: { jobId: v.id("aiJobs") },
  handler: async (ctx, args) => {
    const { userId } = await requireEditor(ctx);
    const changeSet = await ctx.db
      .query("articleChangeSets")
      .withIndex("by_job", (q) => q.eq("jobId", args.jobId))
      .unique();
    return changeSet?.userId === userId ? changeSet : null;
  },
});

export const getJob = query({
  args: { jobId: v.id("aiJobs") },
  handler: async (ctx, args) => {
    const { userId } = await requireEditor(ctx);
    const job = await ctx.db.get(args.jobId);
    return job?.userId === userId ? job : null;
  },
});

export const getJobEvents = query({
  args: { jobId: v.id("aiJobs") },
  handler: async (ctx, args) => {
    const { userId } = await requireEditor(ctx);
    const job = await ctx.db.get(args.jobId);
    if (!job || job.userId !== userId) return [];
    return await ctx.db
      .query("aiJobEvents")
      .withIndex("by_job", (q) => q.eq("jobId", args.jobId))
      .collect();
  },
});

export const getJobInternal = internalQuery({
  args: { jobId: v.id("aiJobs") },
  handler: async (ctx, args) => await ctx.db.get(args.jobId),
});

export const saveProviderInternal = internalMutation({
  args: {
    providerId: v.optional(v.id("aiProviders")),
    label: v.string(),
    model: v.string(),
    researchModel: v.optional(v.string()),
    thinkingLevel: v.optional(
      v.union(v.literal("low"), v.literal("medium"), v.literal("high")),
    ),
    priority: v.number(),
    dailyLimit: v.number(),
    active: v.boolean(),
    ciphertext: v.optional(v.string()),
    keyHint: v.optional(v.string()),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const data = {
      provider: "gemini" as const,
      label: args.label.trim(),
      model: args.model.trim(),
      researchModel: args.researchModel?.trim() || undefined,
      thinkingLevel: args.thinkingLevel,
      priority: Math.max(1, Math.round(args.priority)),
      dailyLimit: Math.max(1, Math.round(args.dailyLimit)),
      active: args.active,
      updatedAt: now,
    };
    let providerId = args.providerId;
    if (providerId) await ctx.db.patch(providerId, data);
    else
      providerId = await ctx.db.insert("aiProviders", {
        ...data,
        usedToday: 0,
        resetAt: now + 86_400_000,
        failureCount: 0,
        createdAt: now,
      });
    if (!providerId)
      throw new ConvexError("Could not resolve the AI provider.");
    if (args.ciphertext && args.keyHint) {
      const existing = await ctx.db
        .query("aiSecrets")
        .withIndex("by_provider", (q) => q.eq("providerId", providerId))
        .unique();
      if (existing)
        await ctx.db.patch(existing._id, {
          ciphertext: args.ciphertext,
          keyHint: args.keyHint,
          updatedAt: now,
        });
      else
        await ctx.db.insert("aiSecrets", {
          providerId,
          ciphertext: args.ciphertext,
          keyHint: args.keyHint,
          updatedAt: now,
        });
    }
    await ctx.db.insert("auditEvents", {
      event: "ai.provider.saved",
      entityType: "aiProvider",
      entityId: String(providerId),
      actorId: String(args.userId),
      metadata: {
        label: args.label,
        model: args.model,
        researchModel: args.researchModel,
        thinkingLevel: args.thinkingLevel,
        keyRotated: Boolean(args.ciphertext),
      },
      createdAt: now,
    });
    return providerId;
  },
});

export const reserveProvider = internalMutation({
  args: { providerId: v.id("aiProviders") },
  handler: async (ctx, args) => {
    const provider = await ctx.db.get(args.providerId);
    if (!provider) return false;
    if (!provider.active || (provider.cooldownUntil ?? 0) > Date.now())
      return false;
    const now = Date.now();
    const resetAt =
      provider.resetAt <= now ? now + 86_400_000 : provider.resetAt;
    const usedToday = provider.resetAt <= now ? 0 : provider.usedToday;
    if (usedToday >= provider.dailyLimit) {
      if (provider.resetAt <= now)
        await ctx.db.patch(args.providerId, {
          usedToday,
          resetAt,
          updatedAt: now,
        });
      return false;
    }
    await ctx.db.patch(args.providerId, {
      usedToday: usedToday + 1,
      resetAt,
      updatedAt: now,
    });
    return true;
  },
});

export const setJobState = internalMutation({
  args: {
    jobId: v.id("aiJobs"),
    status: v.union(
      v.literal("queued"),
      v.literal("running"),
      v.literal("completed"),
      v.literal("failed"),
    ),
    progress: v.optional(v.string()),
    result: v.optional(v.any()),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) =>
    await ctx.db.patch(args.jobId, {
      status: args.status,
      progress: args.progress,
      result: args.result,
      error: args.error,
      updatedAt: Date.now(),
      completedAt:
        args.status === "completed" || args.status === "failed"
          ? Date.now()
          : undefined,
    }),
});

export const addJobEvent = internalMutation({
  args: { jobId: v.id("aiJobs"), stage: v.string(), message: v.string() },
  handler: async (ctx, args) => {
    const now = Date.now();
    await ctx.db.insert("aiJobEvents", { ...args, createdAt: now });
    await ctx.db.patch(args.jobId, { progress: args.message, updatedAt: now });
  },
});

export const addSource = internalMutation({
  args: {
    jobId: v.id("aiJobs"),
    url: v.string(),
    title: v.string(),
    excerpt: v.string(),
    status: v.union(v.literal("ok"), v.literal("failed")),
  },
  handler: async (ctx, args) =>
    await ctx.db.insert("researchSources", { ...args, fetchedAt: Date.now() }),
});

export const recordUsage = internalMutation({
  args: {
    userId: v.id("users"),
    providerId: v.optional(v.id("aiProviders")),
    jobId: v.id("aiJobs"),
    model: v.string(),
    ok: v.boolean(),
    durationMs: v.number(),
  },
  handler: async (ctx, args) =>
    await ctx.db.insert("aiUsage", {
      ...args,
      provider: "gemini",
      createdAt: Date.now(),
    }),
});
