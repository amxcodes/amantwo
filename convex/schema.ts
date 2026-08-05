import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  ...authTables,
  siteSettings: defineTable({
    key: v.string(),
    value: v.any(),
    updatedAt: v.number(),
  }).index("by_key", ["key"]),

  // Public newsletter sign-ups are intentionally kept separate from the
  // editorial settings document. This gives the admin view a small, indexed
  // audience table without exposing subscriber data to the public client.
  newsletterSubscribers: defineTable({
    email: v.string(),
    normalizedEmail: v.string(),
    status: v.union(v.literal("subscribed"), v.literal("unsubscribed")),
    source: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
    subscribedAt: v.optional(v.number()),
    unsubscribedAt: v.optional(v.number()),
  })
    .index("by_email", ["normalizedEmail"])
    .index("by_status_createdAt", ["status", "createdAt"])
    .index("by_createdAt", ["createdAt"]),

  // A small server-side fixed-window bucket for public newsletter writes.
  // Convex mutations do not expose the caller IP, so this intentionally
  // protects the public endpoint with a shared write budget instead of
  // pretending that a client-supplied identity is trustworthy.
  newsletterRateLimits: defineTable({
    key: v.string(),
    windowStartedAt: v.number(),
    attempts: v.number(),
    updatedAt: v.number(),
  }).index("by_key", ["key"]),

  profiles: defineTable({
    userId: v.id("users"),
    role: v.union(v.literal("owner"), v.literal("editor")),
    displayName: v.optional(v.string()),
    updatedAt: v.number(),
  }).index("by_userId", ["userId"]),

  pages: defineTable({
    slug: v.string(),
    title: v.string(),
    publicationState: v.union(v.literal("draft"), v.literal("published")),
    seo: v.any(),
    updatedAt: v.number(),
  })
    .index("by_slug", ["slug"])
    .index("by_publicationState", ["publicationState"]),

  sections: defineTable({
    pageId: v.id("pages"),
    sectionId: v.string(),
    registryType: v.string(),
    position: v.number(),
    status: v.union(
      v.literal("draft"),
      v.literal("published"),
      v.literal("disabled"),
    ),
    content: v.any(),
    layout: v.any(),
    motion: v.any(),
    schemaVersion: v.number(),
    updatedAt: v.number(),
  })
    .index("by_page", ["pageId"])
    .index("by_page_position", ["pageId", "position"]),

  mediaAssets: defineTable({
    provider: v.literal("imagekit"),
    fileId: v.string(),
    url: v.string(),
    kind: v.union(v.literal("image"), v.literal("video"), v.literal("audio")),
    alt: v.string(),
    width: v.optional(v.number()),
    height: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_fileId", ["fileId"])
    .index("by_createdAt", ["createdAt"]),

  articles: defineTable({
    schemaVersion: v.optional(v.number()),
    slug: v.string(),
    title: v.string(),
    summary: v.string(),
    meta: v.string(),
    readingTime: v.string(),
    // Presentation tone used by the writing cards on the public portfolio.
    // Optional so existing articles continue to read as the default blue tone.
    tone: v.optional(v.union(
      v.literal("blue"),
      v.literal("orange"),
      v.literal("green"),
      v.literal("yellow"),
    )),
    status: v.union(
      v.literal("draft"),
      v.literal("published"),
      v.literal("archived"),
    ),
    cover: v.optional(v.any()),
    narration: v.optional(v.any()),
    body: v.any(),
    seo: v.any(),
    createdBy: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
    publishedAt: v.optional(v.number()),
  })
    .index("by_slug", ["slug"])
    .index("by_status", ["status"])
    .index("by_status_publishedAt", ["status", "publishedAt"])
    .index("by_updatedAt", ["updatedAt"]),

  articleRevisions: defineTable({
    articleId: v.id("articles"),
    state: v.union(v.literal("draft"), v.literal("published")),
    snapshot: v.any(),
    label: v.string(),
    createdAt: v.number(),
    publishedAt: v.optional(v.number()),
  })
    .index("by_article", ["articleId"])
    .index("by_state", ["state"]),

  articleChangeSets: defineTable({
    articleId: v.id("articles"),
    jobId: v.id("aiJobs"),
    userId: v.id("users"),
    baseUpdatedAt: v.optional(v.number()),
    state: v.union(
      v.literal("ready"),
      v.literal("applied"),
      v.literal("dismissed"),
      v.literal("stale"),
    ),
    proposal: v.any(),
    createdAt: v.number(),
    updatedAt: v.number(),
    appliedAt: v.optional(v.number()),
  })
    .index("by_article", ["articleId"])
    .index("by_job", ["jobId"])
    .index("by_user", ["userId"]),

  aiProviders: defineTable({
    provider: v.literal("gemini"),
    label: v.string(),
    model: v.string(),
    researchModel: v.optional(v.string()),
    priority: v.number(),
    active: v.boolean(),
    dailyLimit: v.number(),
    usedToday: v.number(),
    resetAt: v.number(),
    failureCount: v.number(),
    cooldownUntil: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_priority", ["active", "priority"]),

  aiSecrets: defineTable({
    providerId: v.id("aiProviders"),
    ciphertext: v.string(),
    keyHint: v.string(),
    updatedAt: v.number(),
  }).index("by_provider", ["providerId"]),

  aiJobs: defineTable({
    userId: v.id("users"),
    articleId: v.optional(v.id("articles")),
    mode: v.union(v.literal("chat"), v.literal("write"), v.literal("research")),
    status: v.union(v.literal("queued"), v.literal("running"), v.literal("completed"), v.literal("failed")),
    input: v.any(),
    progress: v.optional(v.string()),
    result: v.optional(v.any()),
    error: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
    completedAt: v.optional(v.number()),
  })
    .index("by_user", ["userId"])
    .index("by_updatedAt", ["updatedAt"]),

  aiJobEvents: defineTable({
    jobId: v.id("aiJobs"),
    stage: v.string(),
    message: v.string(),
    createdAt: v.number(),
  }).index("by_job", ["jobId"]),

  researchSources: defineTable({
    jobId: v.id("aiJobs"),
    url: v.string(),
    title: v.string(),
    excerpt: v.string(),
    fetchedAt: v.number(),
    status: v.union(v.literal("ok"), v.literal("failed")),
  }).index("by_job", ["jobId"]),

  aiUsage: defineTable({
    userId: v.id("users"),
    provider: v.literal("gemini"),
    model: v.string(),
    jobId: v.id("aiJobs"),
    ok: v.boolean(),
    durationMs: v.number(),
    createdAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_createdAt", ["createdAt"]),

  // Anonymous, public Ask Aman quota. This stores only a short-lived visitor
  // token and counters, never the visitor's question or chat history.
  assistantRateLimits: defineTable({
    token: v.string(),
    windowStart: v.number(),
    requestCount: v.number(),
    updatedAt: v.number(),
  }).index("by_token", ["token"]),

  publicRevisions: defineTable({
    pageId: v.id("pages"),
    state: v.union(
      v.literal("draft"),
      v.literal("approved"),
      v.literal("published"),
    ),
    snapshot: v.any(),
    label: v.string(),
    createdAt: v.number(),
    publishedAt: v.optional(v.number()),
  })
    .index("by_page", ["pageId"])
    .index("by_state", ["state"]),

  auditEvents: defineTable({
    event: v.string(),
    entityType: v.string(),
    entityId: v.string(),
    actorId: v.optional(v.string()),
    metadata: v.any(),
    createdAt: v.number(),
  }).index("by_createdAt", ["createdAt"]),
});
