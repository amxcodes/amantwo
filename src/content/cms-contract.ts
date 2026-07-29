import { z } from "zod";

export const sectionInstanceSchema = z.object({
  id: z.string().min(1),
  registryType: z.enum([
    "hero",
    "projects",
    "githubActivity",
    "about",
    "experience",
    "education",
    "footer",
  ]),
  position: z.number().int().nonnegative(),
  status: z.enum(["draft", "published", "disabled"]),
  content: z.record(z.string(), z.unknown()),
  layout: z.record(z.string(), z.unknown()),
  motion: z.record(z.string(), z.unknown()),
  schemaVersion: z.literal(1),
});

export const pageSnapshotSchema = z.object({
  slug: z.string().min(1),
  title: z.string().min(1),
  sections: z.array(sectionInstanceSchema),
  updatedAt: z.number().int().nonnegative(),
});

export type SectionInstance = z.infer<typeof sectionInstanceSchema>;
export type PageSnapshot = z.infer<typeof pageSnapshotSchema>;

export const sectionRegistry = {
  hero: { label: "Hero", media: "portrait" },
  projects: { label: "Projects", media: "gallery" },
  githubActivity: { label: "GitHub activity", media: "none" },
  about: { label: "About", media: "portrait" },
  experience: { label: "Experience", media: "none" },
  education: { label: "Education", media: "none" },
  footer: { label: "Footer", media: "landscape" },
} as const;
