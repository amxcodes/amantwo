import { ConvexError, v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { action, internalQuery, mutation, type MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";

declare const process: { env: Record<string, string | undefined> };

async function requireOwner(ctx: MutationCtx) {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new ConvexError("Sign in is required.");
  const profile = await ctx.db.query("profiles").withIndex("by_userId", (q) => q.eq("userId", userId)).unique();
  if (!profile || (profile.role !== "owner" && profile.role !== "editor")) {
    throw new ConvexError("This account does not have media access.");
  }
  return userId;
}

export const canUpload = internalQuery({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return false;
    const profile = await ctx.db.query("profiles").withIndex("by_userId", (q) => q.eq("userId", userId)).unique();
    return Boolean(profile && (profile.role === "owner" || profile.role === "editor"));
  },
});

const encode = (value: string) => new TextEncoder().encode(value);
const base64Url = (bytes: Uint8Array) => {
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

async function signedToken(header: Record<string, string>, payload: Record<string, string | number>, privateKey: string) {
  const unsigned = `${base64Url(encode(JSON.stringify(header)))}.${base64Url(encode(JSON.stringify(payload)))}`;
  const key = await crypto.subtle.importKey("raw", encode(privateKey), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", key, encode(unsigned)));
  return `${unsigned}.${base64Url(signature)}`;
}

export const createUploadToken = action({
  args: { fileName: v.string(), folder: v.string() },
  handler: async (ctx, args) => {
    if (!await ctx.runQuery(internal.media.canUpload)) throw new ConvexError("This account does not have media access.");
    const privateKey = process.env.IMAGEKIT_PRIVATE_KEY;
    const publicKey = process.env.IMAGEKIT_PUBLIC_KEY;
    const urlEndpoint = process.env.IMAGEKIT_URL_ENDPOINT;
    if (!privateKey || !publicKey || !urlEndpoint) throw new ConvexError("ImageKit is not configured.");
    const now = Math.floor(Date.now() / 1000);
    const fields: Record<string, string> = { fileName: args.fileName, useUniqueFileName: "true" };
    if (args.folder.trim()) fields.folder = args.folder.trim();
    const token = await signedToken({ alg: "HS256", typ: "JWT", kid: publicKey }, { ...fields, iat: now, exp: now + 900 }, privateKey);
    return { token, fields, expire: now + 900, uploadUrl: "https://upload.imagekit.io/api/v2/files/upload", urlEndpoint };
  },
});

export const registerAsset = mutation({
  args: { fileId: v.string(), url: v.string(), kind: v.union(v.literal("image"), v.literal("video"), v.literal("audio")), alt: v.string(), width: v.optional(v.number()), height: v.optional(v.number()) },
  handler: async (ctx, args) => {
    await requireOwner(ctx);
    const existing = await ctx.db.query("mediaAssets").withIndex("by_fileId", (q) => q.eq("fileId", args.fileId)).unique();
    if (existing) return existing._id;
    return await ctx.db.insert("mediaAssets", { provider: "imagekit", ...args, createdAt: Date.now() });
  },
});
