/**
 * Public runtime endpoints. Environment configuration remains preferred, but
 * the production endpoint prevents Netlify builds from silently reverting to
 * starter content when a public build variable was omitted.
 */
const productionConvexUrl = "https://dynamic-llama-581.convex.cloud";
const configuredConvexUrl =
  typeof import.meta.env.PUBLIC_CONVEX_URL === "string"
    ? import.meta.env.PUBLIC_CONVEX_URL.trim()
    : "";

export const publicConvexUrl = (
  configuredConvexUrl || productionConvexUrl
).replace(/\/+$/, "");
