import type { MiddlewareHandler } from "astro";
import {
  homepageMarkdown,
  markdownHeaders,
  notFoundMarkdown,
} from "./lib/agent-resources";

const markdownBotPattern =
  /(?:GPTBot|ClaudeBot|ChatGPT-User|PerplexityBot|Google-Extended|Applebot-Extended|ora-agent|DeepSeekBot)/i;

const appendVary = (current: string | null, value: string) => {
  const fields = (current ?? "")
    .split(",")
    .map((field) => field.trim())
    .filter(Boolean);
  if (
    !fields.some(
      (field) => field.toLocaleLowerCase() === value.toLocaleLowerCase(),
    )
  )
    fields.push(value);
  return fields.join(", ");
};

/**
 * Let agents choose a compact, cache-safe representation without changing
 * normal browser visits. The user-agent path is deliberately limited to the
 * documented answer-engine bots; every other request follows Accept headers.
 */
export const onRequest: MiddlewareHandler = async (context, next) => {
  const accept = context.request.headers.get("accept") ?? "";
  const userAgent = context.request.headers.get("user-agent") ?? "";
  const wantsMarkdown =
    /(?:^|,)\s*text\/markdown(?:\s*;|,|$)/i.test(accept) ||
    markdownBotPattern.test(userAgent);

  if (context.url.pathname === "/" && wantsMarkdown) {
    return new Response(homepageMarkdown, {
      headers: {
        ...markdownHeaders,
        Link: '</index.md>; rel="alternate"; type="text/markdown", </sitemap.xml>; rel="sitemap", </.well-known/ard.json>; rel="ard"',
        Vary: "Accept, Accept-Encoding, User-Agent",
      },
    });
  }

  const response = await next();
  if (response.status === 404 && wantsMarkdown) {
    return new Response(notFoundMarkdown, {
      status: 404,
      headers: {
        ...markdownHeaders,
        Link: '</sitemap.xml>; rel="sitemap", </llms.txt>; rel="alternate"; type="text/markdown"',
        Vary: "Accept, User-Agent",
      },
    });
  }
  if (context.url.pathname !== "/") return response;

  response.headers.set(
    "Vary",
    appendVary(
      appendVary(
        appendVary(response.headers.get("Vary"), "Accept"),
        "Accept-Encoding",
      ),
      "User-Agent",
    ),
  );
  response.headers.append(
    "Link",
    '</index.md>; rel="alternate"; type="text/markdown"',
  );
  response.headers.append("Link", '</sitemap.xml>; rel="sitemap"');
  response.headers.append("Link", '</.well-known/ard.json>; rel="ard"');
  return response;
};
