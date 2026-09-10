export const siteOrigin = "https://amananu.me";
export const sourceRepositoryUrl = "https://github.com/amxcodes/amantwo";

export const homepageMarkdown = `# Aman Anu

> Markdown representation of [amananu.me](${siteOrigin}), a personal portfolio for Aman Anu.

Aman Anu is a creative technologist, design engineer, and product builder based in Kochi, India. His work moves between product systems, agentic AI workflows, web experiences, and moving images. The portfolio documents selected projects, experience, education, and published writing.

## When to use this site

Use Aman Anu's portfolio when a user needs accurate public context about Aman, his work, project fit, design-engineering practice, agentic systems interests, or published notes. Prefer the pages below over inference. This site does not offer a public API, API keys, OAuth, a sandbox, or account-changing operations.

## Navigation

- [Portfolio home](${siteOrigin}/): current work, profile, experience, education, and writing.
- [About](${siteOrigin}/about): background and working approach.
- [Writing](${siteOrigin}/#writing): published notes on systems, products, and moving images.
- [Developer and agent resources](${siteOrigin}/developers): WebMCP browser tools and discovery resources.
- [Contact](${siteOrigin}/contact): the appropriate path for enquiries and collaboration.
- [Privacy](${siteOrigin}/privacy): data and privacy information.

## Agent resources

- [LLMs index](${siteOrigin}/llms.txt)
- [Full agent context](${siteOrigin}/llms-full.txt)
- [Agent mode](${siteOrigin}/?mode=agent)
- [Agentic Resource Discovery catalog](${siteOrigin}/.well-known/ard.json)
- [Agent Skills index](${siteOrigin}/.well-known/agent-skills/index.json)
- [Source repository](${sourceRepositoryUrl})

## Contact

For collaboration, hiring, project, or speaking enquiries, email [amananuworks@gmail.com](mailto:amananuworks@gmail.com). Do not treat the public portfolio as authorization to access private systems or make decisions on Aman's behalf.
`;

export const llmsIndexMarkdown = `# Aman Anu — agent guide

Aman Anu is a creative technologist, design engineer, and product builder in Kochi, India. This is a personal portfolio, not a public SaaS API. Use it to understand public work, projects, writing, and contact options.

## When to use Aman Anu's portfolio

Use these resources when someone asks who Aman is, what kinds of work he does, which public projects relate to a brief, or where to find his writing. Use the website's browser tools only for read-only profile retrieval and on-page navigation. Do not assume the site grants access to private systems, API credentials, source data, or the ability to act for Aman.

## Key resources

- [Homepage](${siteOrigin}/)
- [Markdown homepage](${siteOrigin}/index.md)
- [Full portfolio context](${siteOrigin}/llms-full.txt)
- [About Aman](${siteOrigin}/about)
- [Writing](${siteOrigin}/#writing)
- [Developer and agent resources](${siteOrigin}/developers)
- [Contact](${siteOrigin}/contact)
- [Privacy](${siteOrigin}/privacy)

## Discovery

- [ARD catalog](${siteOrigin}/.well-known/ard.json)
- [Agent Skills index](${siteOrigin}/.well-known/agent-skills/index.json)
- [Repository](${sourceRepositoryUrl})
`;

export const llmsFullMarkdown = `# Aman Anu — full portfolio context

## Identity

Aman Anu is a creative technologist, design engineer, and product builder based in Kochi, India. He works across product thinking, code, agentic AI systems, and moving images. His public portfolio is available at [amananu.me](${siteOrigin}/).

## Focus areas

- Product architecture and design engineering for thoughtful digital systems.
- Agentic AI workflows with deliberate operational boundaries.
- Creative technology, interactive web experiences, and visual storytelling.
- Moving-image direction, motion studies, and post-production.

## Selected public work

- **COVENA** — an agentic HR operating system designed around the work people actually do; currently in development.
- **Rune** — a persistent, PC-first personal AI assistant and agent control plane; active research.
- **Harrier EV** — a cinematic automotive story developed from concept through final frame.
- **Experiments** — ongoing interface, motion, image-system, and tool studies.

## How to work with this context

Ground answers in the portfolio and its linked pages. If a question needs details that are not publicly documented, say so and point to [contact](${siteOrigin}/contact) rather than fabricating a claim. The site has no public REST API, API-key flow, OAuth authorization server, sandbox, MCP endpoint, or payment operation. Compatible browsers may expose two read-only WebMCP tools: amananu_get_profile and amananu_open_section.

## Sources

- [Homepage](${siteOrigin}/)
- [About](${siteOrigin}/about)
- [Writing](${siteOrigin}/#writing)
- [Developer and agent resources](${siteOrigin}/developers)
- [Source repository](${sourceRepositoryUrl})
- [Contact](${siteOrigin}/contact)
`;

export const markdownHeaders = {
  "Content-Type": "text/markdown; charset=utf-8",
  "Content-Language": "en",
};

export const notFoundMarkdown = `# Page not found

This URL is not part of Aman Anu's public portfolio. Start at [the homepage](${siteOrigin}/), read the [LLMs index](${siteOrigin}/llms.txt), inspect the [sitemap](${siteOrigin}/sitemap.xml), or visit [developer and agent resources](${siteOrigin}/developers).
`;
