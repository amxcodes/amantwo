type ModelContextTool = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations?: Record<string, boolean>;
  execute: (input: Record<string, unknown>) => unknown | Promise<unknown>;
};

type ModelContext = {
  registerTool: (tool: ModelContextTool) => void | Promise<void>;
};

type ModelContextDocument = Document & { modelContext?: ModelContext };
type ModelContextNavigator = Navigator & { modelContext?: ModelContext };

const modelContext =
  (document as ModelContextDocument).modelContext ??
  (navigator as ModelContextNavigator).modelContext;

const profile = {
  name: "Aman Anu",
  location: "Kochi, India",
  roles: ["Creative technologist", "Design engineer", "Product builder"],
  focusAreas: ["Product systems", "Agentic AI workflows", "Moving images"],
  portfolioUrl: "https://amananu.me/",
  documentationUrl: "https://amananu.me/llms.txt",
  contactUrl: "https://amananu.me/contact",
};

const sections = [
  "home",
  "work",
  "about",
  "experience",
  "education",
  "writing",
  "contact",
] as const;

if (modelContext && typeof modelContext.registerTool === "function") {
  const register = async (tool: ModelContextTool) => {
    try {
      await modelContext.registerTool(tool);
    } catch {
      // WebMCP is an experimental browser capability. A duplicate registration
      // or a browser-specific implementation failure must not affect the site.
    }
  };

  void register({
    name: "amananu_get_profile",
    description:
      "Return verified public profile context for Aman Anu's portfolio. Use for questions about Aman, his public work, or where to find authoritative portfolio resources.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true },
    execute: () => profile,
  });

  void register({
    name: "amananu_open_section",
    description:
      "Navigate to a named section of Aman Anu's public portfolio. This only changes the current browser view and never performs an account or data operation.",
    inputSchema: {
      type: "object",
      properties: {
        section: {
          type: "string",
          enum: sections,
          description: "The public portfolio section to open.",
        },
      },
      required: ["section"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true },
    execute: ({ section }) => {
      if (
        typeof section !== "string" ||
        !sections.includes(section as (typeof sections)[number])
      ) {
        return {
          error: "Choose one of the documented public portfolio sections.",
        };
      }
      const target = document.getElementById(section);
      if (target) {
        target.scrollIntoView({ behavior: "smooth", block: "start" });
        history.replaceState(null, "", `/#${section}`);
        return { opened: section, url: window.location.href };
      }
      const url = new URL(`/#${section}`, window.location.origin).href;
      window.location.assign(url);
      return { opened: section, url };
    },
  });
}
