"use node";

import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import { action, type ActionCtx } from "./_generated/server";

declare const process: { env: Record<string, string | undefined> };

type Source = { title: string; url: string; excerpt: string };
type Provider = { model: string; apiKey: string };
type PublicResult = {
  status: "ready" | "temporarily_unavailable";
  model: string;
  answer: string;
  resultSlugs: string[];
  citations: unknown[];
};

const GEMINI_RETRYABLE_STATUSES = new Set([408, 500, 502, 503, 504]);
const GEMINI_MAX_RETRIES = 2;

function wait(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function retryDelay(retryIndex: number) {
  return 500 * 2 ** retryIndex + Math.floor(Math.random() * 250);
}

async function requestGeminiWithRetry(
  model: string,
  apiKey: string,
  prompt: string,
): Promise<{ response: Response } | { networkError: string }> {
  const generationConfig: Record<string, unknown> = {
    responseMimeType: "application/json",
  };
  if (!model.startsWith("gemini-3")) generationConfig.temperature = 0.25;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  for (let retryIndex = 0; retryIndex <= GEMINI_MAX_RETRIES; retryIndex += 1) {
    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig,
        }),
      });
    } catch (error) {
      if (retryIndex === GEMINI_MAX_RETRIES) {
        return {
          networkError:
            error instanceof Error ? error.message : "Network request failed",
        };
      }
      await wait(retryDelay(retryIndex));
      continue;
    }

    if (
      response.ok ||
      !GEMINI_RETRYABLE_STATUSES.has(response.status) ||
      retryIndex === GEMINI_MAX_RETRIES
    ) {
      return { response };
    }

    await response.body?.cancel().catch(() => undefined);
    await wait(retryDelay(retryIndex));
  }

  return { networkError: "Network request failed" };
}

export const answerPublic = action({
  args: {
    query: v.string(),
    mode: v.union(v.literal("ask"), v.literal("web")),
    visitorToken: v.optional(v.string()),
    sourceUrls: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args): Promise<PublicResult & { sources: Source[] }> => {
    const instruction = args.query.trim().slice(0, 700);
    if (!instruction) throw new ConvexError("Ask a question or search for a published note.");
    const quota = await ctx.runMutation(internal.assistant.consumeQuota, {
      token: args.visitorToken?.trim().slice(0, 96) || "anonymous",
    });
    if (!quota.allowed) throw new ConvexError(`Ask Aman is taking a short pause. Try again in about ${Math.ceil(quota.retryAfter / 60)} minutes.`);
    const portfolio = await ctx.runQuery(internal.assistant.publicContext, {});
    const requestedUrls = Array.from(new Set([
      ...(args.sourceUrls ?? []),
      ...(instruction.match(/https?:\/\/[^\s<>()"']+/gi) ?? []),
    ])).slice(0, 4);
    const shouldSearch = args.mode === "web" || researchIntent(instruction);
    const urls = requestedUrls.length || !shouldSearch ? requestedUrls : await discoverSearchResults(instruction);
    const sources: Source[] = [];
    for (const url of urls.slice(0, 4)) {
      const page = await crawlPage(url);
      if (page.ok) sources.push({ title: page.title, url, excerpt: page.excerpt.slice(0, 900) });
    }
    const result = await callPublicGemini(ctx, instruction, portfolio as Record<string, unknown>, sources, args.mode === "web");
    return { ...result, sources };
  },
});

async function callPublicGemini(
  ctx: ActionCtx,
  instruction: string,
  portfolio: Record<string, unknown>,
  sources: Source[],
  webMode: boolean,
): Promise<PublicResult> {
  const providers: Provider[] = await ctx.runAction(internal.aiActions.activeProviders, {});
  const envKey = process.env.GEMINI_API_KEY;
  const candidates: Provider[] = providers.length
    ? providers
    : envKey
      ? [{ model: process.env.GEMINI_MODEL || "gemini-3.6-flash", apiKey: envKey }]
      : [];
  if (!candidates.length) throw new ConvexError("Ask Aman is not configured yet.");
  const publicContext = JSON.stringify(portfolio).slice(0, 22_000);
  const sourceContext = sources.length
    ? sources.map((source, index) => `[${index + 1}] ${source.title}\nURL: ${source.url}\n${source.excerpt}`).join("\n\n")
    : "No external sources were read.";
  const prompt = `You are Ask Aman, a concise public portfolio guide for Aman Anu. You can answer about Aman's public identity, public projects, and published writing metadata. You cannot access drafts, the writing studio, admin controls, private keys, or full unpublished article bodies. For hiring, role-fit, shortlist, comparison, or “pick three” requests, use the supplied project titles, summaries, and categories to make a clear ranked recommendation and explain the fit briefly. For personal questions, answer only from the supplied identity/about context. ${webMode ? "Use the supplied web sources for current claims and cite them as [1], [2]." : "Do not invent facts or imply that a source was read when none is supplied."}

Return JSON only with keys: answer, resultSlugs, citations.
answer should be warm, useful, and 2 to 5 short paragraphs. Never use markdown emphasis markers, em dashes, or en dashes. Use normal punctuation and plain links only when needed.
resultSlugs is an array of published writing slugs that are relevant to the question, using only the supplied metadata.
citations is an array of objects with title and url, using only supplied sources.

Question: ${instruction}

Public portfolio context: ${publicContext}

External sources: ${sourceContext}`;
  const errors: string[] = [];
  let hadTransientFailure = false;
  for (const provider of candidates) {
    const model = provider.model;
    const request = await requestGeminiWithRetry(model, provider.apiKey, prompt);
    if ("networkError" in request) {
      errors.push(`${model} (network unavailable)`);
      hadTransientFailure = true;
      continue;
    }
    const { response } = request;
    if (!response.ok) {
      errors.push(`${model} (${response.status})`);
      hadTransientFailure ||= GEMINI_RETRYABLE_STATUSES.has(response.status);
      continue;
    }
    let payload: { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
    try {
      payload = (await response.json()) as typeof payload;
    } catch {
      errors.push(`${model} (invalid response)`);
      hadTransientFailure = true;
      continue;
    }
    const parsed = parsePublicAssistant(payload.candidates?.[0]?.content?.parts?.[0]?.text ?? "");
    return { status: "ready", model, answer: parsed.answer, resultSlugs: parsed.resultSlugs, citations: parsed.citations };
  }
  if (hadTransientFailure) {
    return {
      status: "temporarily_unavailable",
      model: candidates[0]?.model ?? "",
      answer: "Ask Aman is temporarily busy. Please try again shortly.",
      resultSlugs: [],
      citations: [],
    };
  }
  throw new ConvexError(errors.length ? `Ask Aman could not reach Gemini (${errors.join(", ")}).` : "Gemini did not return a usable response.");
}

function parsePublicAssistant(value: string): { answer: string; resultSlugs: string[]; citations: unknown[] } {
  const cleaned = value.replace(/^```(?:json)?\s*|\s*```$/gi, "").trim();
  try {
    const parsed = JSON.parse(cleaned) as Record<string, unknown>;
    return {
      answer: typeof parsed.answer === "string" && parsed.answer.trim() ? parsed.answer.trim() : "I could not find a clear answer yet. Try a more specific question.",
      resultSlugs: Array.isArray(parsed.resultSlugs) ? parsed.resultSlugs.filter((item): item is string => typeof item === "string").slice(0, 6) : [],
      citations: Array.isArray(parsed.citations) ? parsed.citations.slice(0, 6) : [],
    };
  } catch {
    return { answer: cleaned || "I could not find a clear answer yet. Try a more specific question.", resultSlugs: [], citations: [] };
  }
}

const researchPattern = /\b(research|look\s*up|find\s+sources?|latest|current|compare|cite|according\s+to|what\s+does\s+the\s+web\s+say)\b/i;
const researchIntent = (value: string) => researchPattern.test(value);

async function discoverSearchResults(query: string): Promise<string[]> {
  const trimmed = query.trim().slice(0, 220);
  if (!trimmed) return [];
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 7000);
  try {
    const response = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(trimmed)}`, { signal: controller.signal, headers: { "user-agent": "AmanAnuAssistant/1.0" } });
    if (!response.ok) return [];
    const html = await response.text();
    const urls: string[] = [];
    for (const match of Array.from(html.matchAll(/<a[^>]*result__a[^>]*>/gi))) {
      const href = match[0].match(/href=["']([^"']+)["']/i)?.[1];
      const url = href ? normalizeSearchUrl(decodeEntities(href)) : null;
      if (url && !urls.includes(url)) urls.push(url);
      if (urls.length >= 3) break;
    }
    return urls;
  } catch { return []; } finally { clearTimeout(timer); }
}

function normalizeSearchUrl(value: string) {
  try {
    const url = new URL(value, "https://html.duckduckgo.com");
    const redirected = url.searchParams.get("uddg");
    const candidate = redirected ? decodeURIComponent(redirected) : url.toString();
    const result = new URL(candidate);
    return result.protocol === "https:" && !/duckduckgo\.com$/i.test(result.hostname) ? result.toString() : null;
  } catch { return null; }
}

async function crawlPage(value: string): Promise<{ ok: boolean; title: string; excerpt: string }> {
  let url: URL;
  try { url = new URL(value); } catch { return { ok: false, title: value, excerpt: "Invalid URL." }; }
  if (url.protocol !== "https:" || /^(localhost|127\.0\.0\.1|0\.0\.0\.0|::1)$/i.test(url.hostname)) return { ok: false, title: url.hostname, excerpt: "Only public HTTPS pages are allowed." };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 7000);
  try {
    const response = await fetch(url, { signal: controller.signal, redirect: "follow", headers: { "user-agent": "AmanAnuAssistant/1.0" } });
    if (!response.ok) return { ok: false, title: url.hostname, excerpt: `Source returned ${response.status}.` };
    const html = (await response.text()).slice(0, 1_000_000);
    const title = decodeEntities((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? url.hostname).replace(/<[^>]+>/g, " ").trim());
    const excerpt = decodeEntities(html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<[^>]+>/gi, " ").replace(/\s+/g, " ").trim()).slice(0, 6500);
    return { ok: true, title, excerpt };
  } catch (error) { return { ok: false, title: url.hostname, excerpt: error instanceof Error ? error.message : "Unable to read source." }; }
  finally { clearTimeout(timer); }
}

const decodeEntities = (value: string) => value.replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
