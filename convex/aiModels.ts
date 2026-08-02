/**
 * Gemini models that are supported by the API surfaces used by this app.
 * Keep this list intentionally small: it is an allow-list for admin settings,
 * not a free-form model proxy. The model page is the source of truth when
 * Google retires or introduces a model.
 */
export const GEMINI_GENERATE_MODELS = [
  "gemini-3.6-flash",
  "gemini-3.5-flash",
  "gemini-3.5-flash-lite",
  "gemini-3.1-flash-lite",
  "gemini-3.1-pro-preview",
  "gemini-3-flash-preview",
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
  "gemini-2.5-pro",
  // Kept for existing deployments that have not migrated yet.
  "gemini-2.0-flash",
] as const;

export const GEMINI_RESEARCH_MODELS = [
  "deep-research-preview-04-2026",
  "deep-research-max-preview-04-2026",
  // Pro is the generateContent-compatible research fallback.
  "gemini-3.1-pro-preview",
  "gemini-3.6-flash",
  "gemini-3.5-flash",
  "gemini-2.5-pro",
] as const;

export function isSupportedGenerateModel(model: string) {
  return (GEMINI_GENERATE_MODELS as readonly string[]).includes(model);
}

export function isSupportedResearchModel(model: string) {
  return (GEMINI_RESEARCH_MODELS as readonly string[]).includes(model);
}

export function isDeepResearchModel(model: string) {
  return model.startsWith("deep-research-");
}
