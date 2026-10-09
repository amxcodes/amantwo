import { v } from "convex/values";
import { internalQuery } from "./_generated/server";

export const list = internalQuery({
  args: {},
  handler: async (ctx) => {
    const providers = await ctx.db
      .query("aiProviders")
      .withIndex("by_priority")
      .collect();
    const secrets = await ctx.db.query("aiSecrets").collect();
    const byProvider = new Map(
      secrets.map((secret) => [String(secret.providerId), secret]),
    );
    return providers.map((provider) => ({
      ...provider,
      secret: byProvider.get(String(provider._id)),
    }));
  },
});

export const get = internalQuery({
  args: { providerId: v.id("aiProviders") },
  handler: async (ctx, args) => {
    const provider = await ctx.db.get(args.providerId);
    if (!provider) return null;
    const secret = await ctx.db
      .query("aiSecrets")
      .withIndex("by_provider", (q) => q.eq("providerId", args.providerId))
      .unique();
    return { provider, secret };
  },
});
