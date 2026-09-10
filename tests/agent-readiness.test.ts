import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  homepageMarkdown,
  llmsIndexMarkdown,
} from "../src/lib/agent-resources";

const readWorkspaceJson = (path: string) =>
  JSON.parse(readFileSync(resolve(process.cwd(), path), "utf8")) as Record<
    string,
    unknown
  >;

const readWorkspaceText = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8");

describe("agent-readiness resources", () => {
  it("keeps the primary markdown resources substantive and linked", () => {
    expect(homepageMarkdown).toMatch(/^---\n/);
    expect(homepageMarkdown).toMatch(/^# Aman Anu/m);
    expect(homepageMarkdown).toContain("https://amananu.me/llms.txt");
    expect(llmsIndexMarkdown).toMatch(/^# Aman Anu — agent guide/m);
    expect(llmsIndexMarkdown.length).toBeGreaterThan(500);
  });

  it("publishes parseable discovery and plugin manifests", () => {
    const ard = readWorkspaceJson("public/.well-known/ard.json");
    expect(ard.specVersion).toBe("1.0");
    const entries = ard.entries as Array<Record<string, unknown>>;
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      identifier: "urn:air:amananu.me:skill:portfolio-context",
      type: "application/ai-skill+md",
      url: "https://amananu.me/.well-known/agent-skills/amananu-portfolio-context/SKILL.md",
    });

    const aiCatalog = readWorkspaceJson("public/.well-known/ai-catalog.json");
    const aiCatalogEntries = aiCatalog.entries as Array<
      Record<string, unknown>
    >;
    expect(aiCatalog).toMatchObject({ specVersion: "1.0" });
    expect(aiCatalogEntries[0]).toMatchObject({
      identifier: entries[0]?.identifier,
      displayName: entries[0]?.displayName,
      type: entries[0]?.type,
      url: entries[0]?.url,
    });

    const skillsIndex = readWorkspaceJson(
      "public/.well-known/agent-skills/index.json",
    );
    const skill = readWorkspaceText(
      "public/.well-known/agent-skills/amananu-portfolio-context/SKILL.md",
    );
    const skillEntry = (skillsIndex.skills as Array<Record<string, string>>)[0];
    expect(skillsIndex.$schema).toBe(
      "https://schemas.agentskills.io/discovery/0.2.0/schema.json",
    );
    expect(skillEntry).toMatchObject({
      name: "amananu-portfolio-context",
      type: "skill-md",
      description:
        "Ground answers about Aman Anu's public profile, creative-technology practice, selected work, writing, and professional contact path. Use only for public portfolio research; it is read-only and does not authorize actions or access to private systems.",
      url: "https://amananu.me/.well-known/agent-skills/amananu-portfolio-context/SKILL.md",
      digest: `sha256:${createHash("sha256").update(skill).digest("hex")}`,
    });
    expect(skill.replaceAll("\r\n", "\n")).toBe(
      readWorkspaceText(
        "agent-plugin/skills/portfolio-context/SKILL.md",
      ).replaceAll("\r\n", "\n"),
    );

    const plugin = readWorkspaceJson("agent-plugin/plugin.json");
    expect(plugin).toMatchObject({
      $schema: "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json",
      name: "amananu-portfolio",
    });
  });

  it("keeps the Schema Feed and modular LLM resources discoverable", () => {
    const robots = readWorkspaceText("public/robots.txt");
    const schemaMap = readWorkspaceText("public/schemamap.xml");
    const schemaFeed = readWorkspaceText("public/feeds/portfolio.schema.jsonl")
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as Record<string, unknown>);

    expect(robots).toContain("schemamap: https://amananu.me/schemamap.xml");
    expect(schemaMap).toContain(
      "https://amananu.me/feeds/portfolio.schema.jsonl",
    );
    expect(schemaFeed.map((entry) => entry["@type"])).toEqual(
      expect.arrayContaining(["Person", "WebSite", "FAQPage", "Service"]),
    );
    expect(readWorkspaceText("public/index.md")).toMatch(/^---\n/);
    expect(readWorkspaceText("public/developers/llms.txt")).toContain(
      "https://amananu.me/.well-known/ai-catalog.json",
    );
    expect(readWorkspaceText("public/writing/llms.txt")).toContain(
      "https://amananu.me/writing/{slug}.md",
    );
  });
});
