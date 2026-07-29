const imageKitEndpoint = import.meta.env.PUBLIC_IMAGEKIT_URL_ENDPOINT?.replace(
  /\/$/,
  "",
);

/**
 * Keeps public components provider-agnostic. ImageKit can be connected later
 * without changing the public content contracts.
 */
export const resolveMediaUrl = (source: string) => {
  if (!source || source.startsWith("/") || /^https?:\/\//.test(source)) {
    return source;
  }
  return imageKitEndpoint
    ? `${imageKitEndpoint}/${source.replace(/^\//, "")}`
    : source;
};
