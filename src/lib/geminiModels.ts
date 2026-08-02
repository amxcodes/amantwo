export const GEMINI_MODEL_OPTIONS = [
  { value: "gemini-3.6-flash", label: "Gemini 3.6 Flash", note: "Latest stable · agentic + multimodal" },
  { value: "gemini-3.5-flash", label: "Gemini 3.5 Flash", note: "Stable · sustained agentic workflows" },
  { value: "gemini-3.5-flash-lite", label: "Gemini 3.5 Flash-Lite", note: "Stable · fastest cost-conscious option" },
  { value: "gemini-3.1-flash-lite", label: "Gemini 3.1 Flash-Lite", note: "Stable · high-volume tasks" },
  { value: "gemini-3.1-pro-preview", label: "Gemini 3.1 Pro", note: "Preview · deep reasoning and coding" },
  { value: "gemini-3-flash-preview", label: "Gemini 3 Flash", note: "Preview · frontier speed/intelligence" },
  { value: "gemini-2.5-flash", label: "Gemini 2.5 Flash", note: "Stable · reliable price-performance" },
  { value: "gemini-2.5-flash-lite", label: "Gemini 2.5 Flash-Lite", note: "Stable · budget-friendly" },
  { value: "gemini-2.5-pro", label: "Gemini 2.5 Pro", note: "Stable · complex reasoning" },
] as const;

export const GEMINI_RESEARCH_OPTIONS = [
  { value: "deep-research-preview-04-2026", label: "Gemini Deep Research", note: "Preview · autonomous cited web research" },
  { value: "deep-research-max-preview-04-2026", label: "Gemini Deep Research Max", note: "Preview · maximum comprehensiveness" },
  { value: "gemini-3.1-pro-preview", label: "Gemini 3.1 Pro", note: "GenerateContent fallback · reasoning + search" },
  { value: "gemini-3.6-flash", label: "Gemini 3.6 Flash", note: "Stable fallback · fast research synthesis" },
  { value: "gemini-3.5-flash", label: "Gemini 3.5 Flash", note: "Stable fallback · grounded synthesis" },
  { value: "gemini-2.5-pro", label: "Gemini 2.5 Pro", note: "Stable fallback · complex research" },
] as const;
