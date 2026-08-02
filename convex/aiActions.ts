"use node";

import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import { action, internalAction, type ActionCtx } from "./_generated/server";
import { isDeepResearchModel, isSupportedGenerateModel, isSupportedResearchModel } from "./aiModels";

declare const process: { env: Record<string, string | undefined> };
declare const Buffer: { from(value: Uint8Array | string, encoding?: string): Uint8Array & { toString(encoding: string): string } };

export const saveProvider = action({
  args: { providerId: v.optional(v.id("aiProviders")), label: v.string(), model: v.string(), researchModel: v.optional(v.string()), apiKey: v.string(), priority: v.number(), dailyLimit: v.number(), active: v.boolean() },
  handler: async (ctx, args): Promise<string> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new ConvexError("Sign in is required.");
    const profile = await ctx.runQuery(internal.ai.profileForUser, { userId });
    if (!profile) throw new ConvexError("This account does not have CMS access.");
    const model = args.model.trim();
    const researchModel = args.researchModel?.trim() || "gemini-3.1-pro-preview";
    if (!isSupportedGenerateModel(model)) throw new ConvexError("Choose a supported Gemini generation model.");
    if (!isSupportedResearchModel(researchModel)) throw new ConvexError("Choose a supported Gemini research model.");
    const master = process.env.AI_KEYS_ENCRYPTION_SECRET;
    if (!master) throw new ConvexError("Set AI_KEYS_ENCRYPTION_SECRET in Convex before saving a provider key.");
    return await ctx.runMutation(internal.ai.saveProviderInternal, { providerId: args.providerId, label: args.label, model, researchModel, priority: args.priority, dailyLimit: args.dailyLimit, active: args.active, ciphertext: await encryptSecret(args.apiKey, master), keyHint: `${args.apiKey.slice(0, 4)}****${args.apiKey.slice(-4)}`, userId });
    /* legacy return retained below for reference
    return await ctx.runMutation(internal.ai.saveProviderInternal, { ...args, ciphertext: await encryptSecret(args.apiKey, master), keyHint: `${args.apiKey.slice(0, 4)}••••${args.apiKey.slice(-4)}`, userId });
    */
  },
});

export const runJob = internalAction({
  args: { jobId: v.id("aiJobs") },
  handler: async (ctx, args) => {
    const job = await ctx.runQuery(internal.ai.getJobInternal, { jobId: args.jobId });
    if (!job) return;
    const started = Date.now();
    await ctx.runMutation(internal.ai.setJobState, { jobId: args.jobId, status: "running", progress: "Preparing your workspace…" });
    try {
      const input = (job.input ?? {}) as Record<string, unknown>;
      let context = typeof input.context === "string" ? input.context : "";
      const instruction = typeof input.instruction === "string" ? input.instruction : "";
      const portfolio = await ctx.runQuery(internal.cms.portfolioContext, {});
      if (portfolio) {
        await ctx.runMutation(internal.ai.addJobEvent, { jobId: args.jobId, stage: "context", message: "Loading portfolio context…" });
        context = [
          context,
          `Portfolio context (public content only):\n${JSON.stringify(portfolio).slice(0, 24_000)}`,
        ].filter(Boolean).join("\n\n");
      }
      const explicitUrls = extractUrls(input);
      const shouldResearch = job.mode === "research" || researchIntent(instruction) || explicitUrls.length > 0;
      if (shouldResearch) {
        let urls = explicitUrls;
        if (!urls.length) {
          await ctx.runMutation(internal.ai.addJobEvent, { jobId: args.jobId, stage: "research", message: "Finding public sources..." });
          urls = await discoverSearchResults(instruction || String(input.title ?? ""));
        }
        const sources: Array<{ title: string; url: string; excerpt: string }> = [];
        await ctx.runMutation(internal.ai.addJobEvent, { jobId: args.jobId, stage: "research", message: "Reading approved sources…" });
        for (const url of urls.slice(0, 6)) {
          const page = await crawlPage(url);
          await ctx.runMutation(internal.ai.addSource, { jobId: args.jobId, url, title: page.title, excerpt: page.excerpt, status: page.ok ? "ok" : "failed" });
          if (page.ok) sources.push({ title: page.title, url, excerpt: page.excerpt });
        }
        const sourceContext = sources.map((source, index) => `[${index + 1}] ${source.title}\nURL: ${source.url}\n${source.excerpt}`).join("\n\n");
        context = [context, sourceContext].filter(Boolean).join("\n\n");
      }
      await ctx.runMutation(internal.ai.addJobEvent, { jobId: args.jobId, stage: "model", message: "Drafting a response…" });
      const answer = await callGemini(ctx, job.mode, input, context);
      let result = answer;
      if (job.articleId && answer.document && answer.proposal?.state === "ready") {
        const changeSetId = await ctx.runMutation(internal.ai.createChangeSet, {
          jobId: args.jobId,
          articleId: job.articleId,
          userId: job.userId,
          baseUpdatedAt: typeof input.baseUpdatedAt === "number" ? input.baseUpdatedAt : undefined,
          proposal: answer,
        });
        result = { ...answer, changeSetId: String(changeSetId) };
      }
      await ctx.runMutation(internal.ai.setJobState, { jobId: args.jobId, status: "completed", progress: "Ready to review", result });
      await ctx.runMutation(internal.ai.recordUsage, { userId: job.userId, jobId: args.jobId, model: answer.model ?? "unknown", ok: true, durationMs: Date.now() - started });
    } catch (error) {
      const message = error instanceof Error ? error.message : "The AI request could not be completed.";
      await ctx.runMutation(internal.ai.setJobState, { jobId: args.jobId, status: "failed", progress: "Needs attention", error: message });
      await ctx.runMutation(internal.ai.recordUsage, { userId: job.userId, jobId: args.jobId, model: "unknown", ok: false, durationMs: Date.now() - started });
    }
  },
});

async function callGemini(ctx: ActionCtx, requestMode: "chat" | "write" | "research", input: Record<string, unknown>, context: string) {
  const providers = await ctx.runAction(internal.aiActions.activeProviders, {});
  const envKey = process.env.GEMINI_API_KEY;
  const candidates = providers.length ? providers : envKey ? [{ model: process.env.GEMINI_MODEL || "gemini-3.6-flash", researchModel: process.env.GEMINI_RESEARCH_MODEL || "gemini-3.1-pro-preview", apiKey: envKey }] : [];
  if (!candidates.length) {
    throw new Error("No usable Gemini provider is configured. Save an active provider in AI settings, then try again.");
  }
  const instruction = typeof input.instruction === "string" ? input.instruction : "Help improve this article.";
  const selection = typeof input.selection === "string" ? input.selection : "";
  const currentDocument = input.document && typeof input.document === "object" ? JSON.stringify(input.document).slice(0, 28_000) : "{}";
  const hasSources = context.includes("URL:");
  const sourceRule = hasSources ? " Use the supplied public sources for factual claims and include citation markers like [1] when making sourced claims." : "";
  const system = requestMode === "research"
    ? `You are a careful research editor for Aman Anu's portfolio. Use only the supplied sources for factual claims and include citation markers like [1].${sourceRule}`
    : requestMode === "write"
      ? `You are a precise writing assistant and structured article editor. Preserve the author's voice, but return the complete proposed document rather than a short excerpt. Never invent facts.${sourceRule}`
      : `You are Aman Studio, a thoughtful editorial agent and guarded canvas editor. Understand the portfolio context, keep its quiet human voice, and return useful complete drafts instead of brief filler.${sourceRule}`;
  const canvasContract = `
The editor stores an ArticleDocument with an ordered body[] of typed blocks. Supported block types are paragraph, heading, quote, image, video, link, embed, audio, callout, code, list, and divider. A paragraph may contain an inline attachment token backed by inlineAttachments[]. Inline attachments have kind link|audio|video|image|embed, a label, and an href or src. Inline attachments use display="inline" and are compact capsules; standalone media uses display="block". You must treat the canvas as a constrained schema, never emit HTML or executable markup, and never claim that a change was applied.`;
  const agentContract = `
Return JSON only with these keys: answer, proposal, document, sources, citations, questions.
answer is a short conversational summary of what you prepared, not the article itself.
proposal must include state (none|needs_clarification|ready), intent (create_article|extend_article|edit_article|research), summary, placement (replace_document|replace_selection|inline_selected|inline_after_selection|top|end), and an optional question.
For a create/extend/write request, produce a complete long-form document in document, normally 1,200–1,800 words unless the user explicitly requests another length. Include a strong title, summary, meta line, 5–8 useful section headings, paragraphs, and a real conclusion. Do not put the title only in answer.
document must contain title, summary, meta, body, and seo. body must be a complete ordered block array, not Markdown and not a single giant paragraph. Use headings for structure and dividers only where they improve pacing.
Write original copy in the portfolio voice. Do not imitate a named writer, do not copy source phrasing, and do not add markdown emphasis markers such as * or _. Do not use em dashes or en dashes; use commas, periods, or a normal hyphen instead. Never add an empty quote block. Only use a quote block when the user supplied an exact quote, and only include attribution when the user supplied the attribution.
When a URL is supplied or discovered, add a source entry and cite it. If the user has not said where a supplied media/link belongs, set proposal.state to needs_clarification and ask one short placement question instead of guessing.
For YouTube use an inline embed attachment with provider="youtube". For audio use an inline audio attachment. For ordinary links use an inline link attachment. Put the token in the paragraph content at the intended sentence position. Only use display="block" when the user asks for a full-width media block or cover.
All source URLs must be supplied by the user or by the research results. Never invent a URL. Keep every proposal reviewable; never treat it as already applied.
For a research request, use the supplied public sources, include citation markers like [1], and return sources/citations with title, url, and excerpt.`;
  const editorialSafety = `
Editorial guardrails: write original, well-sourced copy in a human portfolio voice. Never imitate a named writer, copy source phrasing, or use markdown emphasis markers. Never output em dashes or en dashes; use commas, periods, or a normal hyphen. Never emit an empty quote or attribution field. Keep the title, summary, metadata, headings, paragraphs, and conclusion inside document.body as structured blocks. If a link, image, video, or audio placement is ambiguous, return needs_clarification with one concise placement question and do not apply it. Use inline attachment tokens only for inline capsules, and use block media only when explicitly requested. Return valid JSON even when the request is conversational.`;
  const prompt = `${system}\n${canvasContract}\n${agentContract}\n${editorialSafety}\n\nInstruction: ${instruction}\n\nSelected text:\n${selection}\n\nCurrent article document JSON:\n${currentDocument}\n\nArticle and portfolio context:\n${context.slice(0, 42_000)}`;
  const requestErrors: string[] = [];
  for (const provider of candidates) {
    const selectedModel = requestMode === "research" ? provider.researchModel ?? provider.model : provider.model;
    if (requestMode === "research" && isDeepResearchModel(selectedModel)) {
      const text = await runDeepResearch(provider.apiKey, selectedModel, prompt);
      return parseAssistantResponse(text, selectedModel);
    }
    // Gemini 3.x rejects legacy sampling controls such as temperature. Keep
    // the request conservative for newer models and only send temperature to
    // older generateContent models that still support it.
    const generationConfig: Record<string, unknown> = { responseMimeType: "application/json" };
    if (!selectedModel.startsWith("gemini-3")) generationConfig.temperature = 0.35;
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${selectedModel}:generateContent?key=${provider.apiKey}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }] }], generationConfig }),
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      requestErrors.push(`${selectedModel} (${response.status})${detail ? `: ${detail.slice(0, 280)}` : ""}`);
      continue;
    }
    const payload = (await response.json()) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
    const text = payload.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}";
    return parseAssistantResponse(text, selectedModel);
  }
  throw new Error(requestErrors.length ? `Gemini request failed. ${requestErrors.join(" | ")}` : "Gemini did not return a usable response.");
}

type AssistantResponse = {
  model: string;
  answer?: string;
  document?: Record<string, unknown>;
  changeSetId?: string;
  patch?: { operation?: "replace" | "insert" | "none"; text?: string; blockType?: string };
  proposal?: { state?: "none" | "needs_clarification" | "ready"; intent?: string; summary?: string; question?: string; placement?: string; sourceUrl?: string; label?: string; blockType?: string };
  sources?: unknown[];
  citations?: unknown[];
  questions?: string[];
};

function parseAssistantResponse(text: string, model: string): AssistantResponse {
  const cleaned = text.replace(/^```(?:json)?\s*|\s*```$/gi, "").trim();
  try {
    return { ...(JSON.parse(cleaned) as Record<string, unknown>), model } as AssistantResponse;
  } catch {
    const objectStart = cleaned.indexOf("{");
    const objectEnd = cleaned.lastIndexOf("}");
    if (objectStart >= 0 && objectEnd > objectStart) {
      try {
        return { ...(JSON.parse(cleaned.slice(objectStart, objectEnd + 1)) as Record<string, unknown>), model } as AssistantResponse;
      } catch {
        // Fall through to a safe conversational response when the model returned malformed JSON.
      }
    }
    return { model, answer: text.trim() || "The assistant returned an empty response. Try again with a more specific request.", proposal: { state: "none" }, citations: [] };
  }
}

async function runDeepResearch(apiKey: string, agent: string, prompt: string) {
  const create = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify({ input: prompt, agent, background: true }),
  });
  if (!create.ok) throw new Error(`Gemini Deep Research could not start (${create.status}).`);
  const started = (await create.json()) as { id?: string };
  if (!started.id) throw new Error("Gemini Deep Research did not return an interaction id.");
  for (let attempt = 0; attempt < 24; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 4_000));
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/interactions/${encodeURIComponent(started.id)}`, { headers: { "x-goog-api-key": apiKey } });
    if (!response.ok) continue;
    const interaction = (await response.json()) as { status?: string; error?: { message?: string }; steps?: Array<{ content?: Array<{ type?: string; text?: string }> }> };
    if (interaction.status === "failed") throw new Error(interaction.error?.message || "Gemini Deep Research failed.");
    if (interaction.status !== "completed") continue;
    const text = (interaction.steps ?? []).flatMap((step) => step.content ?? []).filter((item) => item.type === "text" && item.text).map((item) => item.text).join("\n\n");
    return text || "Deep Research completed without a text report.";
  }
  throw new Error("Gemini Deep Research timed out. Try a shorter question or the Pro research model.");
}

export const activeProviders = internalAction({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.runQuery(internal.aiProviderRuntime.list, {});
    const master = process.env.AI_KEYS_ENCRYPTION_SECRET;
    if (!master) return [];
    const output: Array<{ model: string; researchModel?: string; apiKey: string }> = [];
    for (const row of rows) {
      if (!row.active || (row.cooldownUntil ?? 0) > Date.now() || row.usedToday >= row.dailyLimit || !row.secret) continue;
      try { output.push({ model: row.model, researchModel: row.researchModel, apiKey: await decryptSecret(row.secret.ciphertext, master) }); } catch { /* ignore unusable secrets */ }
    }
    return output;
  },
});

async function encryptSecret(value: string, master: string) {
  const keyBytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(master));
  const key = await crypto.subtle.importKey("raw", keyBytes, "AES-GCM", false, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(value));
  return `${toBase64(iv)}.${toBase64(new Uint8Array(encrypted))}`;
}

async function decryptSecret(value: string, master: string) {
  const [ivText, cipherText] = value.split(".");
  const keyBytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(master));
  const key = await crypto.subtle.importKey("raw", keyBytes, "AES-GCM", false, ["decrypt"]);
  const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromBase64(ivText), }, key, fromBase64(cipherText));
  return new TextDecoder().decode(decrypted);
}

function toBase64(bytes: Uint8Array) { return Buffer.from(bytes).toString("base64url"); }
function fromBase64(value: string) { return new Uint8Array(Buffer.from(value, "base64url") as unknown as Uint8Array); }

const researchPattern = /\b(research|look\s*up|find\s+sources?|latest|current|compare|cite|according\s+to|what\s+does\s+the\s+web\s+say)\b/i;
function researchIntent(value: string) { return researchPattern.test(value); }

function extractUrls(input: Record<string, unknown>) {
  const values = [
    ...(Array.isArray(input.urls) ? input.urls.filter((url): url is string => typeof url === "string") : []),
    typeof input.instruction === "string" ? input.instruction : "",
    typeof input.selection === "string" ? input.selection : "",
  ];
  return Array.from(new Set(values.flatMap((value) => value.match(/https?:\/\/[^\s<>()"']+/gi) ?? []))).slice(0, 6);
}

async function discoverSearchResults(query: string) {
  const trimmed = query.trim().slice(0, 220);
  if (!trimmed) return [];
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 7000);
  try {
    const response = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(trimmed)}`, {
      signal: controller.signal,
      headers: { "user-agent": "AmanAnuResearch/1.0" },
    });
    if (!response.ok) return [];
    const html = await response.text();
    const matches = Array.from(html.matchAll(/<a[^>]*result__a[^>]*>/gi));
    const urls: string[] = [];
    for (const match of matches) {
      const href = match[0].match(/href=["']([^"']+)["']/i)?.[1];
      if (!href) continue;
      const url = normalizeSearchUrl(decodeEntities(href));
      if (url && !urls.includes(url)) urls.push(url);
      if (urls.length >= 3) break;
    }
    return urls;
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

function normalizeSearchUrl(value: string) {
  try {
    const url = new URL(value, "https://html.duckduckgo.com");
    const redirected = url.searchParams.get("uddg");
    const candidate = redirected ? decodeURIComponent(redirected) : url.toString();
    const result = new URL(candidate);
    return result.protocol === "https:" && !/duckduckgo\.com$/i.test(result.hostname) ? result.toString() : null;
  } catch {
    return null;
  }
}

async function crawlPage(value: string) {
  let url: URL;
  try { url = new URL(value); } catch { return { ok: false, title: value, excerpt: "Invalid URL." }; }
  if (url.protocol !== "https:" || /^(localhost|127\.0\.0\.1|0\.0\.0\.0|::1)$/i.test(url.hostname)) return { ok: false, title: url.hostname, excerpt: "Only public HTTPS pages are allowed." };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 7000);
  try {
    const response = await fetch(url, { signal: controller.signal, redirect: "follow", headers: { "user-agent": "AmanAnuResearch/1.0" } });
    if (!response.ok) return { ok: false, title: url.hostname, excerpt: `Source returned ${response.status}.` };
    const html = (await response.text()).slice(0, 1_000_000);
    const title = decodeEntities((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? url.hostname).replace(/<[^>]+>/g, " ").trim());
    const text = decodeEntities(html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<[^>]+>/gi, " ").replace(/\s+/g, " ").trim());
    return { ok: true, title, excerpt: text.slice(0, 6500) };
  } catch (error) { return { ok: false, title: url.hostname, excerpt: error instanceof Error ? error.message : "Unable to read source." }; }
  finally { clearTimeout(timer); }
}

function decodeEntities(value: string) { return value.replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">"); }
