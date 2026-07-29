import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  siteSettings: defineTable({
    key: v.string(),
    value: v.any(),
    updatedAt: v.number(),
  }).index("by_key", ["key"]),

  profiles: defineTable({
    key: v.string(),
    content: v.any(),
    updatedAt: v.number(),
  }).index("by_key", ["key"]),

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
    kind: v.union(v.literal("image"), v.literal("video")),
    alt: v.string(),
    width: v.optional(v.number()),
    height: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_fileId", ["fileId"])
    .index("by_createdAt", ["createdAt"]),

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
