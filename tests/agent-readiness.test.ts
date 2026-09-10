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

describe("agent-readiness resources", () => {
  it("keeps the primary markdown resources substantive and linked", () => {
    expect(homepageMarkdown).toMatch(/^# Aman Anu/m);
    expect(homepageMarkdown).toContain("https://amananu.me/llms.txt");
    expect(llmsIndexMarkdown).toMatch(/^# Aman Anu — agent guide/m);
    expect(llmsIndexMarkdown.length).toBeGreaterThan(500);
  });

  it("publishes parseable discovery and plugin manifests", () => {
    const ard = readWorkspaceJson("public/.well-known/ard.json");
    const entries = ard.entries as Array<Record<string, unknown>>;
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      identifier: "urn:air:amananu.me:skill:portfolio-context",
      type: "application/ai-skill+md",
    });

    const plugin = readWorkspaceJson("agent-plugin/plugin.json");
    expect(plugin).toMatchObject({
      $schema: "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json",
      name: "amananu-portfolio",
    });
  });
});
