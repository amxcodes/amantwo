import type { MiddlewareHandler } from "astro";
import {
  homepageMarkdown,
  markdownHeaders,
  notFoundMarkdown,
} from "./lib/agent-resources";

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

const explicitlyAcceptsMarkdown = (accept: string) =>
  accept.split(",").some((mediaRange) => {
    const [mediaType, ...parameters] = mediaRange.split(";");
    if (mediaType?.trim().toLowerCase() !== "text/markdown") return false;

    const quality = parameters
      .map((parameter) => parameter.trim().match(/^q\s*=\s*(.+)$/i)?.[1])
      .find((value): value is string => value !== undefined);

    return quality === undefined || Number(quality) > 0;
  });

/**
 * Serve Markdown only when the client explicitly requests it. Crawler
 * user-agents that request HTML should receive the same HTML as browsers.
 */
export const onRequest: MiddlewareHandler = async (context, next) => {
  const accept = context.request.headers.get("accept") ?? "";
  const wantsMarkdown = explicitlyAcceptsMarkdown(accept);

  const legacyPostSlug =
    context.url.pathname === "/"
      ? context.url.searchParams.get("post")?.trim()
      : undefined;
  if (legacyPostSlug) {
    return Response.redirect(
      new URL(
        `/writing/${encodeURIComponent(legacyPostSlug)}`,
        context.url.origin,
      ),
      308,
    );
  }

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
        Vary: "Accept",
      },
    });
  }
  if (context.url.pathname !== "/") return response;

  response.headers.set(
    "Vary",
    appendVary(
      appendVary(response.headers.get("Vary"), "Accept"),
      "Accept-Encoding",
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
