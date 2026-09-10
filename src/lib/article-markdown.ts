import type {
  PublicArticle,
  PublicArticleBlock,
} from "../components/ArticleRenderer";
import { siteOrigin } from "./agent-resources";

const text = (value: string | undefined) =>
  (value ?? "").replace(/\uE000[^\uE001]+\uE001/g, "").trim();

const yamlValue = (value: string) =>
  JSON.stringify(value.replace(/\s+/g, " ").trim());

const dateOnly = (value: PublicArticle["publishedAt"]) => {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.valueOf())
    ? undefined
    : date.toISOString().slice(0, 10);
};

const blockToMarkdown = (block: PublicArticleBlock) => {
  const content = text(block.content);
  switch (block.type) {
    case "heading":
      return `${block.level === 3 ? "###" : "##"} ${content || text(block.label)}`;
    case "quote":
      return `> ${content}${block.attribution ? `\n> — ${block.attribution}` : ""}`;
    case "image":
      return `![${text(block.alt)}](${block.src ?? ""})${block.caption ? `\n\n*${block.caption}*` : ""}`;
    case "video":
    case "audio":
      return `[${text(block.label) || block.type}](${block.src ?? ""})${block.caption ? ` — ${block.caption}` : ""}`;
    case "link":
    case "embed":
      return `[${text(block.label) || block.href || "Link"}](${block.href ?? ""})${block.description ? ` — ${block.description}` : ""}`;
    case "divider":
      return "---";
    case "callout":
      return `> ${content}`;
    case "code":
      return `\`\`\`${block.language ?? ""}\n${content}\n\`\`\``;
    case "list":
      return (block.items ?? []).map((item) => `- ${item}`).join("\n");
    default:
      return content;
  }
};

export const articleToMarkdown = (article: PublicArticle) => {
  const metadata = [article.meta, article.readingTime, article.publishedAt]
    .filter(Boolean)
    .join(" · ");
  const body = article.body.map(blockToMarkdown).filter(Boolean).join("\n\n");
  const sources = article.links?.length
    ? `\n\n## Related links\n\n${article.links.map((link) => `- [${link.label}](${link.href})`).join("\n")}`
    : "";
  const author = article.author
    ? `\n\nWritten by ${article.author.name}${article.author.role ? ` · ${article.author.role}` : ""}.`
    : "";
  const lastUpdated = dateOnly(article.publishedAt);
  const frontmatter = [
    "---",
    `title: ${yamlValue(article.title)}`,
    `description: ${yamlValue(article.summary)}`,
    `canonical: ${yamlValue(`${siteOrigin}/writing/${encodeURIComponent(article.slug)}`)}`,
    ...(lastUpdated ? [`last_updated: ${yamlValue(lastUpdated)}`] : []),
    "---",
  ].join("\n");

  return `${frontmatter}\n\n# ${article.title}\n\n${article.summary}\n\n${metadata}${body ? `\n\n${body}` : ""}${sources}${author}\n`;
};
