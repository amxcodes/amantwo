import { z } from "zod";

const linkSchema = z.object({
  label: z.string().min(1),
  href: z.string().min(1),
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
  categories: z.array(z.enum(["ai", "film", "experiment"])).min(1),
  detail: z.string().min(1),
  caseStudy: z.string().min(1),
  tags: z.array(z.string().min(1)).min(1),
  media: z
    .object({
      type: z.enum(["image", "video"]),
      src: z.string().min(1).optional(),
      alt: z.string().min(1),
    })
    .optional(),
  links: z.object({
    live: z.url().optional(),
    github: z.url().optional(),
    figma: z.url().optional(),
  }),
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
  projects: z.array(projectSchema),
});

export const siteData = siteSchema.parse({
  identity: {
    name: "Aman Anu",
    location: "Kochi, India",
    availability: "Available for thoughtful collaborations",
    email: "hello@amananu.com",
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
    { label: "Email", href: "mailto:hello@amananu.com" },
    { label: "LinkedIn", href: "https://www.linkedin.com/" },
    { label: "GitHub", href: "https://github.com/" },
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
      categories: ["ai"],
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
      categories: ["ai", "experiment"],
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
