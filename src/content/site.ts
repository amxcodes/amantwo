import { z } from "zod";

const linkSchema = z.object({
  label: z.string().min(1),
  href: z.string().min(1),
});

const inlinePillSchema = z.object({
  type: z.literal("pill"),
  label: z.string().min(1),
  detail: z.string().min(1),
  tone: z.enum(["blue", "orange", "yellow", "green"]),
});

const inlineTextSchema = z.object({
  type: z.literal("text"),
  value: z.string().min(1),
});

const timelineEntrySchema = z.object({
  id: z.string().min(1),
  period: z.string().min(1),
  location: z.string().min(1),
  segments: z.array(z.union([inlineTextSchema, inlinePillSchema])).min(1),
});

const projectSchema = z.object({
  slug: z.string().min(1),
  eyebrow: z.string().min(1),
  title: z.string().min(1),
  summary: z.string().min(1),
  meta: z.string().min(1),
  tone: z.enum(["blue", "cream", "orange", "red", "yellow", "mist", "green"]),
  layout: z.enum(["folder", "compact", "note", "feature", "tile"]),
  status: z.string().min(1),
  categories: z
    .array(z.enum(["product", "ai", "web", "mobile", "film", "experiment"]))
    .min(1),
  detail: z.string().min(1),
  caseStudy: z.string().min(1),
  tags: z.array(z.string().min(1)).min(1),
  media: z
    .object({
      type: z.enum(["image", "video", "youtube"]),
      src: z.string().min(1).optional(),
      alt: z.string().min(1),
    })
    .optional(),
  mediaItems: z
    .array(
      z.object({
        type: z.enum(["image", "video", "youtube"]),
        src: z.string().min(1),
        alt: z.string().min(1),
        caption: z.string().min(1).optional(),
      }),
    )
    .optional(),
  links: z.object({
    live: z.url().optional(),
    github: z.url().optional(),
    figma: z.url().optional(),
  }),
});

const postBodyBlockSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("paragraph"), content: z.string().min(1) }),
  z.object({ type: z.literal("heading"), content: z.string().min(1) }),
  z.object({
    type: z.literal("quote"),
    content: z.string().min(1),
    attribution: z.string().min(1).optional(),
  }),
  z.object({
    type: z.literal("image"),
    src: z.string().min(1),
    alt: z.string().min(1),
    caption: z.string().min(1).optional(),
  }),
  z.object({
    type: z.literal("link"),
    label: z.string().min(1),
    href: z.url(),
    description: z.string().min(1).optional(),
  }),
  z.object({ type: z.literal("divider") }),
]);

const postSchema = z.object({
  slug: z.string().min(1),
  meta: z.string().min(1),
  title: z.string().min(1),
  summary: z.string().min(1),
  tone: z.enum(["blue", "orange", "yellow", "green"]),
  readingTime: z.string().min(1),
  publishedAt: z.string().min(1).optional(),
  author: z
    .object({
      name: z.string().min(1),
      role: z.string().min(1).optional(),
    })
    .optional(),
  cover: z
    .object({
      src: z.string().min(1),
      alt: z.string().min(1),
      caption: z.string().min(1).optional(),
    })
    .optional(),
  links: z
    .array(
      z.object({
        label: z.string().min(1),
        href: z.url(),
      }),
    )
    .default([]),
  body: z.array(postBodyBlockSchema).min(1),
});

export const siteSchema = z.object({
  identity: z.object({
    name: z.string().min(1),
    location: z.string().min(1),
    availability: z.string().min(1),
    email: z.email(),
    avatarSrc: z.url(),
    portraitSrc: z.string().min(1),
    introduction: z.string().min(1),
    heroClosing: z.string().min(1),
    statement: z.string().min(1),
  }),
  roles: z.array(z.string().min(1)).min(1).max(4),
  heroRoles: z.array(z.string().min(1)).min(1).max(4),
  links: z.array(linkSchema),
  github: z.object({
    account: z.string().regex(/^(?!-)[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i),
    profileUrl: z.url(),
  }),
  about: z.object({
    eyebrow: z.string().min(1),
    heading: z.string().min(1),
    description: z.string().min(1),
    details: z
      .array(
        z.object({
          label: z.string().min(1),
          value: z.string().min(1),
        }),
      )
      .min(1),
    portraitSrc: z.string().min(1),
    portraitAlt: z.string().min(1),
    links: z.array(linkSchema).min(1),
  }),
  experience: z.array(timelineEntrySchema),
  education: z.array(timelineEntrySchema),
  posts: z.array(postSchema).min(1),
  projects: z.array(projectSchema),
});

export const siteData = siteSchema.parse({
  identity: {
    name: "Aman Anu",
    location: "Kochi, India",
    availability: "Available for thoughtful collaborations",
    email: "amananuworks@gmail.com",
    avatarSrc: "https://assets.watermelon.sh/wm_alex.png",
    portraitSrc: "/media/aman-portrait.png",
    introduction: "I’m Aman",
    heroClosing: "building thoughtful systems.",
    statement: "Products · AI · moving images",
  },
  roles: ["Creative technologist", "Design engineer", "Product builder"],
  heroRoles: [
    "— a Creative Technologist",
    "— a Design Engineer",
    "— a Product Builder",
  ],
  links: [
    { label: "Email", href: "mailto:amananuworks@gmail.com" },
    { label: "GitHub", href: "https://github.com/amxcodes" },
    { label: "Instagram", href: "https://www.instagram.com/amanxnu/" },
    { label: "YouTube", href: "https://www.youtube.com/@Amananu" },
  ],
  github: {
    account: "amxcodes",
    profileUrl: "https://github.com/amxcodes",
  },
  about: {
    eyebrow: "A few notes",
    heading: "What I’m drawn to.",
    description:
      "I move between product thinking, code, and moving images. The small details are usually where the feeling begins.",
    details: [
      { label: "Usually thinking about", value: "systems with feeling" },
      { label: "Keeps me curious", value: "frames, code & music" },
      { label: "Current state", value: "making & noticing" },
    ],
    portraitSrc: "/media/aman-about-annotated-paper.png",
    portraitAlt:
      "A cobalt-blue line drawing of Aman Anu in profile, with three handwritten annotations.",
    links: [
      { label: "Email", href: "mailto:amananuworks@gmail.com" },
      { label: "GitHub", href: "https://github.com/amxcodes" },
    ],
  },
  experience: [
    {
      id: "digicult",
      period: "Jun 2025 - Present",
      location: "Kochi, India",
      segments: [
        { type: "text", value: "At " },
        {
          type: "pill",
          label: "Digicult Global Media",
          detail:
            "A creative and technology-led media practice where I work across products, campaigns, tools, and emerging technology.",
          tone: "orange",
        },
        { type: "text", value: ", I work as a " },
        {
          type: "pill",
          label: "Creative Technologist",
          detail:
            "A hybrid role spanning product thinking, engineering, emerging tools, creative direction, and practical execution.",
          tone: "blue",
        },
        { type: "text", value: " - owning " },
        {
          type: "pill",
          label: "product architecture",
          detail:
            "Mapping workflows, data models, permissions, interfaces, and implementation for products such as Covena and onFlow.",
          tone: "yellow",
        },
        { type: "text", value: ", " },
        {
          type: "pill",
          label: "agentic AI systems",
          detail:
            "Designing safe AI tool-calling and workflow systems with deliberate boundaries for real operational work.",
          tone: "green",
        },
        { type: "text", value: ", " },
        {
          type: "pill",
          label: "intern mentorship",
          detail:
            "Led a four-month programme for six interns across development and creative tracks, resulting in four shipped projects and two commercial AI-video projects.",
          tone: "blue",
        },
        { type: "text", value: ", and " },
        {
          type: "pill",
          label: "creative campaigns",
          detail:
            "Directed AI-driven brand films and campaign content by translating brand strategy into visual storytelling.",
          tone: "orange",
        },
        { type: "text", value: "." },
      ],
    },
    {
      id: "ergo",
      period: "Dec 2024",
      location: "Kochi, India",
      segments: [
        { type: "text", value: "Earlier, with " },
        {
          type: "pill",
          label: "Ergo Consulting",
          detail:
            "A short international guest-relations internship during the International Rubber Conference 2024.",
          tone: "yellow",
        },
        { type: "text", value: ", I supported " },
        {
          type: "pill",
          label: "international guest relations",
          detail:
            "Handled onboarding, scheduling, and logistics for high-profile international delegates as part of the core reception team.",
          tone: "green",
        },
        { type: "text", value: "." },
      ],
    },
  ],
  education: [
    {
      id: "bca",
      period: "2022 - 2025",
      location: "Kochi, India",
      segments: [
        { type: "text", value: "I completed a " },
        {
          type: "pill",
          label: "BCA with First-Class Honours",
          detail:
            "A full-time Bachelor of Computer Applications degree, completed in 2025 with First-Class Honours.",
          tone: "blue",
        },
        { type: "text", value: " at " },
        {
          type: "pill",
          label: "SCMS School of Technology and Management",
          detail:
            "The Kochi institution where I developed the software foundation that now supports my product and creative-technology work.",
          tone: "green",
        },
        { type: "text", value: ", building a base in " },
        {
          type: "pill",
          label: "software development",
          detail:
            "A practical foundation across application development, technical problem-solving, and working with software systems.",
          tone: "yellow",
        },
        { type: "text", value: ", " },
        {
          type: "pill",
          label: "product design",
          detail:
            "Learning to shape interfaces, journeys, and system decisions around the people using them.",
          tone: "orange",
        },
        { type: "text", value: ", and " },
        {
          type: "pill",
          label: "AI systems",
          detail:
            "An ongoing technical practice in generative tools, agentic workflows, and controlled AI actions.",
          tone: "green",
        },
        { type: "text", value: "." },
      ],
    },
  ],
  posts: [
    {
      slug: "systems-with-feeling",
      meta: "Notes on making",
      title: "Systems can be precise without feeling cold.",
      summary:
        "A few notes on keeping the human part present while building products that need to hold real complexity.",
      tone: "blue",
      readingTime: "4 min read",
      publishedAt: "July 2026",
      author: { name: "Aman Anu", role: "Author" },
      links: [],
      body: [
        {
          type: "paragraph",
          content:
            "The most useful systems rarely announce themselves. They make the next step clearer, remove a little friction, and leave enough room for a person to remain a person.",
        },
        {
          type: "paragraph",
          content:
            "When I work on a product, I start with the small moments around the main task: the state someone sees when they are unsure, the hand-off between two people, and the language that makes an action feel safe to take.",
        },
        {
          type: "quote",
          content:
            "Precision is not the opposite of feeling. It is often the thing that gives feeling a place to land.",
        },
      ],
    },
    {
      slug: "the-space-before-motion",
      meta: "Moving images",
      title: "The space before motion is part of the story.",
      summary:
        "On pacing, restraint, and why a frame needs time to become an image rather than simply a transition.",
      tone: "orange",
      readingTime: "3 min read",
      publishedAt: "July 2026",
      author: { name: "Aman Anu", role: "Author" },
      links: [],
      body: [
        {
          type: "paragraph",
          content:
            "Motion is most convincing when it has a reason to begin. Before a cut, a gesture, or a camera move, there is usually a fraction of stillness doing quiet work.",
        },
        {
          type: "paragraph",
          content:
            "I like to treat that pause as material. It gives an image weight, lets a detail register, and makes the movement that follows feel chosen instead of automatic.",
        },
        {
          type: "quote",
          content:
            "The same idea carries into interfaces: let a person arrive before asking them to move.",
        },
      ],
    },
    {
      slug: "building-in-public",
      meta: "Working notes",
      title: "Small experiments are how larger ideas earn trust.",
      summary:
        "A working practice for testing an interaction, a tool, or a visual direction before it has to carry a whole product.",
      tone: "green",
      readingTime: "5 min read",
      publishedAt: "July 2026",
      author: { name: "Aman Anu", role: "Author" },
      links: [],
      body: [
        {
          type: "paragraph",
          content:
            "A small experiment has a useful kind of honesty. It does not need to pretend to be a finished answer; it only needs to make one question easier to see.",
        },
        {
          type: "paragraph",
          content:
            "That can mean a rough interface, a short film study, or a tool used for one very specific workflow. The point is not speed for its own sake. It is learning with enough clarity to know what deserves the next iteration.",
        },
        {
          type: "quote",
          content:
            "Over time, those small proofs become a more dependable way to build.",
        },
      ],
    },
  ],
  projects: [
    {
      slug: "covena",
      eyebrow: "Current build",
      title: "COVENA",
      summary:
        "An agentic HR operating system designed around the work people actually do.",
      meta: "Product · Systems · AI",
      tone: "cream",
      layout: "compact",
      status: "In development",
      categories: ["product", "ai"],
      detail:
        "A people-first operating system that brings the everyday work of teams into one calm, considered product.",
      caseStudy:
        "COVENA starts with the repetitive, high-context work around people operations and turns it into one deliberate product system.",
      tags: ["Product systems", "HR tech", "AI workflows"],
      links: {},
    },
    {
      slug: "rune",
      eyebrow: "Personal systems",
      title: "Rune",
      summary:
        "A persistent, PC-first personal AI assistant and agent control plane.",
      meta: "Agents · Voice · Runtime",
      tone: "orange",
      layout: "note",
      status: "Active research",
      categories: ["product", "ai", "experiment"],
      detail:
        "An ongoing exploration of a personal agent that can hold context, coordinate tools, and remain useful over time.",
      caseStudy:
        "Rune is designed as a persistent personal system: one that can keep context, coordinate work, and earn trust through predictable behaviour.",
      tags: ["Agents", "Voice", "Runtime"],
      links: {},
    },
    {
      slug: "harrier-ev",
      eyebrow: "Direction",
      title: "Harrier EV",
      summary:
        "A cinematic automotive story shaped from concept through final frame.",
      meta: "Film · Direction · Post",
      tone: "red",
      layout: "feature",
      status: "Case study soon",
      categories: ["film"],
      detail:
        "A directional study that carries one automotive idea from early visual language to the final moving image.",
      caseStudy:
        "The work moves from concept and visual language through edit, sound, and final delivery—keeping the story coherent at every hand-off.",
      tags: ["Direction", "Film", "Post-production"],
      links: {},
    },
    {
      slug: "experiments",
      eyebrow: "Working notes",
      title: "Small things, tested seriously.",
      summary:
        "Interfaces, motion studies, image systems, and tools that earn their place.",
      meta: "Design engineering",
      tone: "mist",
      layout: "tile",
      status: "Ongoing",
      categories: ["experiment"],
      detail:
        "A living collection of small, opinionated studies in motion, interface behaviour, and image-making.",
      caseStudy:
        "A place for experiments that test a specific interaction, image system, or working method before it becomes part of a larger product.",
      tags: ["Prototypes", "Motion", "Interface studies"],
      links: {},
    },
  ],
});

export type SiteData = z.infer<typeof siteSchema>;
export type Project = z.infer<typeof projectSchema>;
export type Post = z.infer<typeof postSchema>;
