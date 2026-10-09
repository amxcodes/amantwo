import { describe, expect, it } from "vitest";
import {
  LLM_DRAFT_IMPORT_FORMAT,
  LLM_DRAFT_IMPORT_VERSION,
  MAX_LLM_DRAFT_IMPORT_BYTES,
  parseLlmDraftImport,
  type ArticleDocument,
} from "../src/components/admin/article-types";

const current: ArticleDocument = {
  schemaVersion: 2,
  slug: "working-note",
  title: "Working note",
  summary: "Existing summary",
  meta: "Notes",
  readingTime: "1 min read",
  status: "draft",
  tone: "blue",
  body: [{ id: "old", type: "paragraph", content: "Existing canvas text." }],
  seo: { title: "Working note", description: "Existing summary", canonicalPath: "/writing/working-note" },
};

describe("portable LLM draft imports", () => {
  it("accepts a fenced v1 draft, normalizes blocks, and keeps publication fields local", () => {
    const raw = `\`\`\`json
${JSON.stringify({
  format: LLM_DRAFT_IMPORT_FORMAT,
  version: LLM_DRAFT_IMPORT_VERSION,
  document: {
    title: "Imported <b>draft</b>",
    summary: "A useful summary",
    meta: "Field notes",
    tone: "green",
    status: "published",
    body: [
      { type: "heading", content: "The opening", level: 9 },
      { type: "paragraph", content: "A <script>bad()</script> careful paragraph." },
      { type: "list", items: ["One", "Two"] },
      { type: "image", src: "https://images.example.com/cover.jpg", alt: "Cover" },
    ],
    seo: { title: "Imported SEO", description: "Search description", canonicalPath: "/unsafe" },
  },
  sources: [{ title: "Reference", url: "https://example.com" }],
}, null, 2)}
\`\`\``;

    const result = parseLlmDraftImport(raw, current);

    expect(result.issues.some((issue) => issue.level === "error")).toBe(false);
    expect(result.document.status).toBe("draft");
    expect(result.document.seo.canonicalPath).toBe("/writing/working-note");
    expect(result.document.title).toBe("Imported draft");
    expect(result.document.body.map((block) => block.type)).toEqual(["heading", "paragraph", "list", "image"]);
    expect(result.document.body[0].level).toBe(4);
    expect(result.document.body[1].content).not.toContain("<script>");
    expect(result.sourceCount).toBe(1);
  });

  it("skips unsafe URLs and reports a draft with no usable blocks", () => {
    const raw = JSON.stringify({
      format: LLM_DRAFT_IMPORT_FORMAT,
      version: LLM_DRAFT_IMPORT_VERSION,
      document: {
        title: "Unsafe attachment",
        body: [{ type: "image", src: "javascript:alert(1)" }],
      },
    });

    const result = parseLlmDraftImport(raw, current);

    expect(result.issues.some((issue) => issue.level === "error")).toBe(true);
    expect(result.issues.some((issue) => issue.message.includes("HTTPS"))).toBe(true);
    expect(result.document).toBe(current);
  });

  it("rejects output that does not use the Studio envelope", () => {
    const result = parseLlmDraftImport('{"title":"Almost there"}', current);

    expect(result.issues[0]?.level).toBe("error");
    expect(result.issues[0]?.message).toContain("Aman Writing Import v1");
  });

  it("refuses oversized pasted output before attempting to parse it", () => {
    const result = parseLlmDraftImport("x".repeat(MAX_LLM_DRAFT_IMPORT_BYTES + 1), current);

    expect(result.issues[0]?.level).toBe("error");
    expect(result.issues[0]?.message).toContain("250 KB");
  });
});
