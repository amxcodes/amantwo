import {
  Authenticated,
  AuthLoading,
  ConvexReactClient,
  Unauthenticated,
  useAction,
  useMutation,
  useQuery,
} from "convex/react";
import { ConvexAuthProvider, useAuthActions } from "@convex-dev/auth/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../../../convex/_generated/api";
import { siteData } from "../../content/site";
import { publicConvexUrl } from "../../lib/publicConfig";
import AiProviderSettings from "./AiProviderSettings";
import "./admin.css";

type AdminSection = {
  sectionId: string;
  registryType: "projects" | "experience" | "education" | "writing" | string;
  position: number;
  status: "draft" | "published" | "disabled";
  content: Record<string, unknown>;
  layout: Record<string, unknown>;
  motion: Record<string, unknown>;
  schemaVersion: 1;
};

type ContentItem = Record<string, unknown>;
type SectionKind = "projects" | "experience" | "education" | "writing";

const normalizeAdminSection = (section: AdminSection): AdminSection => ({
  sectionId: section.sectionId,
  registryType: section.registryType,
  position: section.position,
  status: section.status,
  content: section.content ?? {},
  layout: section.layout ?? {},
  motion: section.motion ?? {},
  schemaVersion: section.schemaVersion ?? 1,
});

const editableKinds: Array<{
  kind: SectionKind;
  label: string;
  collection: string;
  singular: string;
}> = [
  {
    kind: "projects",
    label: "Projects",
    collection: "projects",
    singular: "project",
  },
  {
    kind: "experience",
    label: "Experience",
    collection: "entries",
    singular: "experience",
  },
  {
    kind: "education",
    label: "Education",
    collection: "entries",
    singular: "education entry",
  },
  { kind: "writing", label: "Writing", collection: "posts", singular: "post" },
];

const homeSections: AdminSection[] = [
  ["hero", { identity: siteData.identity, roles: siteData.heroRoles }],
  ["projects", { projects: siteData.projects }],
  ["about", siteData.about],
  ["experience", { entries: siteData.experience }],
  ["education", { entries: siteData.education }],
  ["writing", { posts: siteData.posts }],
  ["footer", { links: siteData.links, email: siteData.identity.email }],
].map(([registryType, content], position) => ({
  sectionId: String(registryType),
  registryType: String(registryType),
  position,
  status: "draft",
  content: content as Record<string, unknown>,
  layout: {},
  motion: {},
  schemaVersion: 1,
}));

const readable = (value: unknown, fallback = "Untitled") =>
  typeof value === "string" && value.trim() ? value : fallback;

const hasText = (value: unknown) =>
  typeof value === "string" && value.trim().length > 0;

const validateDraftSections = (sections: AdminSection[]): string | null => {
  const projects = sections.find((section) => section.registryType === "projects")?.content.projects;
  if (Array.isArray(projects)) {
    for (const value of projects) {
      const project = value && typeof value === "object" ? (value as ContentItem) : {};
      if (
        !hasText(project.title) ||
        !hasText(project.slug) ||
        !hasText(project.summary) ||
        !hasText(project.eyebrow) ||
        !hasText(project.meta) ||
        !hasText(project.status) ||
        !hasText(project.detail) ||
        !hasText(project.caseStudy) ||
        !Array.isArray(project.categories) ||
        project.categories.length === 0 ||
        !Array.isArray(project.tags) ||
        project.tags.length === 0 ||
        project.title === "Untitled project" ||
        project.summary === "Describe the work in one clear sentence."
      ) {
        return "Finish or remove the project before saving.";
      }
    }
  }

  for (const kind of ["experience", "education"] as const) {
    const entries = sections.find((section) => section.registryType === kind)?.content.entries;
    if (!Array.isArray(entries)) continue;
    for (const value of entries) {
      const entry = value && typeof value === "object" ? (value as ContentItem) : {};
      const segments = Array.isArray(entry.segments) ? (entry.segments as ContentItem[]) : [];
      const meaningful = segments.some((segment) =>
        segment && typeof segment === "object" && segment.type === "pill"
          ? hasText(segment.label) && hasText(segment.detail)
          : segment && typeof segment === "object" && segment.type === "text" && hasText(segment.value) && segment.value !== "A new sentence about this work.",
      );
      if (!hasText(entry.id) || !hasText(entry.period) || !meaningful) {
        return "Finish or remove the timeline entry before saving.";
      }
    }
  }
  return null;
};

const keyFor = (kind: SectionKind) =>
  editableKinds.find((entry) => entry.kind === kind)!;

function Login() {
  const { signIn } = useAuthActions();
  const setup = useQuery(api.cms.setupState);
  const [mode, setMode] = useState<"signIn" | "signUp">("signIn");
  const [error, setError] = useState("");
  const canCreateOwner = setup?.ownerExists === false;
  const activeMode = canCreateOwner ? mode : "signIn";

  return (
    <main className="admin-auth">
      <div className="admin-auth-card">
        <p>AMAN / CONTENT STUDIO</p>
        <h1>
          {activeMode === "signIn"
            ? "Welcome back."
            : "Create the owner account."}
        </h1>
        <span>
          {activeMode === "signIn"
            ? "Sign in to edit the portfolio in place."
            : "This account is only available while no owner exists."}
        </span>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            setError("");
            const data = new FormData(event.currentTarget);
            data.set("flow", activeMode);
            void signIn("password", data).catch(() =>
              setError("Unable to continue. Check the email and password."),
            );
          }}
        >
          <label>
            Email
            <input name="email" type="email" autoComplete="email" required />
          </label>
          <label>
            Password
            <input
              name="password"
              type="password"
              autoComplete={
                activeMode === "signIn" ? "current-password" : "new-password"
              }
              minLength={8}
              required
            />
          </label>
          <button type="submit">
            {activeMode === "signIn" ? "Sign in" : "Create account"}{" "}
            <span>↗</span>
          </button>
        </form>
        {error ? <small role="alert">{error}</small> : null}
        {canCreateOwner ? (
          <button
            className="admin-text-button"
            type="button"
            onClick={() => setMode(mode === "signIn" ? "signUp" : "signIn")}
          >
            {mode === "signIn"
              ? "First time? Create the owner account"
              : "Already have an account? Sign in"}
          </button>
        ) : null}
      </div>
    </main>
  );
}
function MediaUpload({
  folder,
  onUploaded,
}: {
  folder: string;
  onUploaded: (asset: {
    src: string;
    alt: string;
    type: "image" | "video" | "audio";
  }) => void;
}) {
  const createUploadToken = useAction(api.media.createUploadToken);
  const registerAsset = useMutation(api.media.registerAsset);
  const [message, setMessage] = useState("");
  const upload = async (file: File | undefined) => {
    if (!file) return;
    setMessage("Preparing secure upload…");
    try {
      const auth = await createUploadToken({ fileName: file.name, folder });
      const form = new FormData();
      form.append("file", file);
      Object.entries(auth.fields).forEach(([key, value]) => {
        form.append(key, value);
      });
      form.append("token", auth.token);
      const response = await fetch(auth.uploadUrl, {
        method: "POST",
        body: form,
      });
      const result = (await response.json()) as {
        fileId?: string;
        url?: string;
        fileType?: string;
        width?: number;
        height?: number;
        message?: string;
      };
      if (!response.ok || !result.fileId || !result.url)
        throw new Error(result.message ?? "Upload failed.");
      const kind = result.fileType?.startsWith("video")
        ? "video"
        : result.fileType?.startsWith("audio")
          ? "audio"
          : "image";
      await registerAsset({
        fileId: result.fileId,
        url: result.url,
        kind,
        alt: file.name,
        width: result.width,
        height: result.height,
      });
      onUploaded({ src: result.url, alt: file.name, type: kind });
      setMessage("Uploaded to ImageKit.");
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "Upload failed.");
    }
  };
  return (
    <label className="manager-upload">
      <input
        type="file"
        accept="image/*,video/*"
        onChange={(event) => void upload(event.currentTarget.files?.[0])}
      />
      <span>Upload to ImageKit</span>
      {message ? <small>{message}</small> : null}
    </label>
  );
}

type TimelineTone = "blue" | "orange" | "yellow" | "green";
type TimelineSegment =
  | { id?: string; type: "text"; value: string }
  | {
      id?: string;
      type: "pill";
      label: string;
      title?: string;
      detail: string;
      tone: TimelineTone;
      href?: string;
    };
const timelineText = (segments: TimelineSegment[]) =>
  segments
    .map((segment) => (segment.type === "pill" ? segment.label : segment.value))
    .join("");
const splitIntoSegments = (
  segments: TimelineSegment[],
  start: number,
  end: number,
) => {
  const full = timelineText(segments);
  if (start === end || start < 0 || end > full.length) return segments;
  const selected = full.slice(start, end);
  const leading = selected.length - selected.trimStart().length;
  const trailing = selected.length - selected.trimEnd().length;
  const adjustedStart = start + leading;
  const adjustedEnd = end - trailing;
  if (adjustedStart >= adjustedEnd) return segments;
  let offset = 0;
  for (const segment of segments) {
    const length = (segment.type === "pill" ? segment.label : segment.value)
      .length;
    if (
      segment.type === "pill" &&
      adjustedStart < offset + length &&
      adjustedEnd > offset
    )
      return segments;
    offset += length;
  }
  offset = 0;
  const next: TimelineSegment[] = [];
  for (const segment of segments) {
    const value = segment.type === "pill" ? segment.label : segment.value;
    const segmentStart = offset;
    const segmentEnd = offset + value.length;
    if (
      segment.type === "text" &&
      adjustedStart >= segmentStart &&
      adjustedEnd <= segmentEnd
    ) {
      const localStart = adjustedStart - segmentStart;
      const localEnd = adjustedEnd - segmentStart;
      const before = segment.value.slice(0, localStart);
      const label = segment.value.slice(localStart, localEnd);
      const after = segment.value.slice(localEnd);
      if (before) next.push({ type: "text", value: before });
      next.push({
        id: crypto.randomUUID(),
        type: "pill",
        label,
        title: label,
        detail: "Add the detail people should see when they open this phrase.",
        tone: "blue",
      });
      if (after) next.push({ type: "text", value: after });
    } else {
      next.push(segment);
    }
    offset = segmentEnd;
  }
  return next;
};

const preserveTimelineDetails = (
  text: string,
  segments: TimelineSegment[],
): TimelineSegment[] => {
  const pills = segments.filter(
    (segment): segment is Extract<TimelineSegment, { type: "pill" }> =>
      segment.type === "pill",
  );
  if (!pills.length) return [{ type: "text", value: text } as TimelineSegment];
  const next: TimelineSegment[] = [];
  let cursor = 0;
  for (const pill of pills) {
    const index = text.indexOf(pill.label, cursor);
    if (index < 0) continue;
    if (index > cursor)
      next.push({ type: "text", value: text.slice(cursor, index) });
    next.push(pill);
    cursor = index + pill.label.length;
  }
  if (cursor < text.length)
    next.push({ type: "text", value: text.slice(cursor) });
  return next.length ? next : [{ type: "text", value: text }];
};

function TimelineSentenceEditor({
  item,
  onChange,
}: {
  item: ContentItem;
  onChange: (next: ContentItem) => void;
}) {
  const textarea = useRef<HTMLTextAreaElement>(null);
  const segments: TimelineSegment[] = Array.isArray(item.segments)
    ? (item.segments as TimelineSegment[])
    : [{ type: "text", value: "" }];
  const [selection, setSelection] = useState<{
    start: number;
    end: number;
    text: string;
  } | null>(null);
  const update = (next: TimelineSegment[]) =>
    onChange({ ...item, segments: next });
  const captureSelection = () => {
    const field = textarea.current;
    if (!field || field.selectionStart === field.selectionEnd) {
      setSelection(null);
      return;
    }
    setSelection({
      start: field.selectionStart,
      end: field.selectionEnd,
      text: field.value.slice(field.selectionStart, field.selectionEnd).trim(),
    });
  };
  const markSelection = () => {
    if (!selection) return;
    const next = splitIntoSegments(segments, selection.start, selection.end);
    if (next === segments) return;
    update(next);
    setSelection(null);
  };
  return (
    <div className="manager-form">
      <div className="manager-form-grid">
        <label className="manager-field">
          Period
          <input
            value={readable(item.period, "")}
            onChange={(event) =>
              onChange({ ...item, period: event.target.value })
            }
          />
        </label>
        <label className="manager-field">
          Location
          <input
            value={readable(item.location, "")}
            onChange={(event) =>
              onChange({ ...item, location: event.target.value })
            }
          />
        </label>
      </div>
      <section
        className="timeline-composer"
        aria-labelledby="sentence-composer-title"
      >
        <header>
          <div>
            <p>PUBLIC SENTENCE</p>
            <h3 id="sentence-composer-title">
              Write it as people will read it.
            </h3>
          </div>
          <span>
            {segments.filter((segment) => segment.type === "pill").length}{" "}
            details
          </span>
        </header>
        <div className="timeline-live-preview" aria-label="Sentence preview">
          {segments.map((segment, index) =>
            segment.type === "pill" ? (
              <span
                className={`timeline-preview-pill tone-${segment.tone}`}
                key={segment.id ?? `${index}-${segment.label}`}
              >
                {segment.label}
              </span>
            ) : (
              <span key={`${index}-${segment.value}`}>{segment.value}</span>
            ),
          )}
        </div>
        <label className="timeline-canvas-label" htmlFor="timeline-sentence">
          Sentence
        </label>
        <textarea
          id="timeline-sentence"
          ref={textarea}
          className="timeline-canvas"
          value={timelineText(segments)}
          onChange={(event) =>
            update(preserveTimelineDetails(event.target.value, segments))
          }
          onSelect={captureSelection}
          onKeyUp={captureSelection}
          onPointerUp={captureSelection}
          rows={5}
        />
        {selection?.text ? (
          <div className="timeline-selection-toolbar">
            <span>“{selection.text}”</span>
            <button type="button" onClick={markSelection}>
              Attach detail
            </button>
          </div>
        ) : (
          <p className="timeline-composer-help">
            Select any words in the sentence. A small action will appear here to
            attach the hover or tap detail.
          </p>
        )}
      </section>
      <section
        className="timeline-details"
        aria-labelledby="timeline-details-title"
      >
        <header>
          <div>
            <p>ATTACHED DETAILS</p>
            <h3 id="timeline-details-title">What each phrase reveals</h3>
          </div>
        </header>
        <div className="manager-segments">
          {segments.map((segment, index) =>
            segment.type === "pill" ? (
              <article
                className={`manager-segment tone-${segment.tone}`}
                key={segment.id ?? `${index}-${segment.label}`}
              >
                <header>
                  <span className="timeline-detail-chip">
                    <i aria-hidden="true" />
                    {segment.label}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      update(
                        segments.filter(
                          (_, currentIndex) => currentIndex !== index,
                        ),
                      )
                    }
                    aria-label={`Remove ${segment.label}`}
                  >
                    ×
                  </button>
                </header>
                <div className="manager-form-grid">
                  <label className="manager-field">
                    Phrase
                    <input
                      value={segment.label}
                      onChange={(event) =>
                        update(
                          segments.map((current, currentIndex) =>
                            currentIndex === index
                              ? {
                                  ...segment,
                                  label: event.target.value,
                                  title:
                                    segment.title === segment.label
                                      ? event.target.value
                                      : segment.title,
                                }
                              : current,
                          ),
                        )
                      }
                    />
                  </label>
                  <label className="manager-field">
                    Preview title
                    <input
                      value={segment.title ?? segment.label}
                      onChange={(event) =>
                        update(
                          segments.map((current, currentIndex) =>
                            currentIndex === index
                              ? { ...segment, title: event.target.value }
                              : current,
                          ),
                        )
                      }
                    />
                  </label>
                </div>
                <label className="manager-field">
                  Detail
                  <textarea
                    value={segment.detail}
                    onChange={(event) =>
                      update(
                        segments.map((current, currentIndex) =>
                          currentIndex === index
                            ? { ...segment, detail: event.target.value }
                            : current,
                        ),
                      )
                    }
                    rows={3}
                  />
                </label>
                <div className="timeline-tone-row">
                  <span>Colour</span>
                  <div>
                    {(
                      ["blue", "green", "yellow", "orange"] as TimelineTone[]
                    ).map((tone) => (
                      <button
                        key={tone}
                        type="button"
                        className={`tone-${tone}`}
                        aria-label={tone}
                        aria-pressed={segment.tone === tone}
                        onClick={() =>
                          update(
                            segments.map((current, currentIndex) =>
                              currentIndex === index
                                ? { ...segment, tone }
                                : current,
                            ),
                          )
                        }
                      >
                        <i />
                      </button>
                    ))}
                  </div>
                </div>
              </article>
            ) : null,
          )}
        </div>
        {!segments.some((segment) => segment.type === "pill") ? (
          <div className="timeline-empty-detail">
            Select a meaningful phrase above to create the first detail.
          </div>
        ) : null}
      </section>
    </div>
  );
}

function BlogBlocksEditor({
  body,
  onChange,
}: {
  body: ContentItem[];
  onChange: (next: ContentItem[]) => void;
}) {
  const patch = (index: number, value: ContentItem) =>
    onChange(
      body.map((block, blockIndex) => (blockIndex === index ? value : block)),
    );
  const remove = (index: number) =>
    onChange(body.filter((_, blockIndex) => blockIndex !== index));
  const add = (type: string) => {
    const block: ContentItem =
      type === "heading"
        ? { type, content: "Section heading" }
        : type === "quote"
          ? { type, content: "A quote", attribution: "" }
          : type === "image"
            ? { type, src: "", alt: "", caption: "" }
            : type === "link"
              ? { type, label: "Link label", href: "https://", description: "" }
              : type === "divider"
                ? { type }
                : { type: "paragraph", content: "Start writing here." };
    onChange([...body, block]);
  };
  return (
    <fieldset className="manager-media">
      <legend>Article blocks</legend>
      <p>
        Build the reader page in order. Each block maps directly to the public
        blog viewer.
      </p>
      <div className="manager-block-list">
        {body.map((block, index) => (
          <article key={`${index}-${readable(block.type, "block")}`}>
            <header>
              <strong>{readable(block.type, "paragraph")}</strong>
              <button type="button" onClick={() => remove(index)}>
                Remove
              </button>
            </header>
            {block.type === "divider" ? (
              <span className="manager-inline-help">
                A visual pause between sections.
              </span>
            ) : null}
            {block.type === "image" ? (
              <>
                <label className="manager-field">
                  Image URL
                  <input
                    value={readable(block.src, "")}
                    onChange={(event) =>
                      patch(index, { ...block, src: event.target.value })
                    }
                  />
                </label>
                <label className="manager-field">
                  Alt text
                  <input
                    value={readable(block.alt, "")}
                    onChange={(event) =>
                      patch(index, { ...block, alt: event.target.value })
                    }
                  />
                </label>
                <label className="manager-field">
                  Caption
                  <input
                    value={readable(block.caption, "")}
                    onChange={(event) =>
                      patch(index, { ...block, caption: event.target.value })
                    }
                  />
                </label>
                <MediaUpload
                  folder="/portfolio/writing"
                  onUploaded={(asset) => patch(index, { ...block, ...asset })}
                />
              </>
            ) : null}
            {block.type === "link" ? (
              <>
                <label className="manager-field">
                  Link label
                  <input
                    value={readable(block.label, "")}
                    onChange={(event) =>
                      patch(index, { ...block, label: event.target.value })
                    }
                  />
                </label>
                <label className="manager-field">
                  URL
                  <input
                    value={readable(block.href, "")}
                    onChange={(event) =>
                      patch(index, { ...block, href: event.target.value })
                    }
                  />
                </label>
                <label className="manager-field">
                  Description
                  <input
                    value={readable(block.description, "")}
                    onChange={(event) =>
                      patch(index, {
                        ...block,
                        description: event.target.value,
                      })
                    }
                  />
                </label>
              </>
            ) : null}
            {["paragraph", "heading", "quote"].includes(
              readable(block.type, "paragraph"),
            ) ? (
              <label className="manager-field">
                {block.type === "heading"
                  ? "Heading"
                  : block.type === "quote"
                    ? "Quote"
                    : "Paragraph"}
                <textarea
                  value={readable(block.content, "")}
                  onChange={(event) =>
                    patch(index, { ...block, content: event.target.value })
                  }
                  rows={3}
                />
              </label>
            ) : null}
            {block.type === "quote" ? (
              <label className="manager-field">
                Attribution
                <input
                  value={readable(block.attribution, "")}
                  onChange={(event) =>
                    patch(index, { ...block, attribution: event.target.value })
                  }
                />
              </label>
            ) : null}
          </article>
        ))}
      </div>
      <div className="manager-inline-actions">
        {["paragraph", "heading", "quote", "image", "link", "divider"].map(
          (type) => (
            <button key={type} type="button" onClick={() => add(type)}>
              + {type}
            </button>
          ),
        )}
      </div>
    </fieldset>
  );
}

function ItemForm({
  kind,
  item,
  onChange,
}: {
  kind: SectionKind;
  item: ContentItem;
  onChange: (next: ContentItem) => void;
}) {
  const set = (field: string, value: string) =>
    onChange({ ...item, [field]: value });
  const input = (label: string, field: string, multiline = false) => (
    <label className="manager-field">
      {label}
      {multiline ? (
        <textarea
          value={readable(item[field], "")}
          onChange={(event) => set(field, event.target.value)}
          rows={field === "body" ? 8 : 3}
        />
      ) : (
        <input
          value={readable(item[field], "")}
          onChange={(event) => set(field, event.target.value)}
        />
      )}
    </label>
  );

  if (kind === "projects") {
    const media = (item.media ?? {}) as ContentItem;
    const links = (item.links ?? {}) as ContentItem;
    const gallery = (
      Array.isArray(item.mediaItems) ? item.mediaItems : []
    ) as ContentItem[];
    const tagsText = Array.isArray(item.tags)
      ? item.tags.map((tag) => String(tag)).join(", ")
      : "";
    const categoriesText = Array.isArray(item.categories)
      ? item.categories.map((category) => String(category)).join(", ")
      : "";
    const setMedia = (field: string, value: string) =>
      onChange({
        ...item,
        media: {
          ...media,
          type: media.type === "video" ? "video" : "image",
          [field]: value,
        },
      });
    const setLink = (field: string, value: string) =>
      onChange({ ...item, links: { ...links, [field]: value } });
    return (
      <div className="manager-form">
        <div className="manager-form-grid">
          {input("Project name", "title")}
          {input("Slug", "slug")}
        </div>
        {input("Short description", "summary", true)}
        <div className="manager-form-grid">
          {input("Label", "eyebrow")}
          {input("Status", "status")}
        </div>
        <div className="manager-form-grid">
          {input("Project metadata", "meta")}
          <label className="manager-field">
            Tags (comma-separated)
            <input
              value={tagsText}
              onChange={(event) =>
                onChange({
                  ...item,
                  tags: event.target.value
                    .split(",")
                    .map((value) => value.trim())
                    .filter(Boolean),
                })
              }
            />
          </label>
        </div>
        <div className="manager-form-grid">
          <label className="manager-field">
            Categories (comma-separated)
            <input
              value={categoriesText}
              onChange={(event) =>
                onChange({
                  ...item,
                  categories: event.target.value
                    .split(",")
                    .map((value) => value.trim())
                    .filter(Boolean),
                })
              }
            />
          </label>
          {input("Card tone", "tone")}
        </div>
        {input("Drawer introduction", "detail", true)}
        {input("Case-study summary", "caseStudy", true)}
        <fieldset className="manager-media">
          <legend>Project media</legend>
          <p>
            Paste an ImageKit image/video URL now. The upload picker appears
            here after the secure ImageKit key setup.
          </p>
          <div className="manager-form-grid">
            <label className="manager-field">
              Media URL
              <input
                value={readable(media.src, "")}
                onChange={(event) => setMedia("src", event.target.value)}
              />
            </label>
            <label className="manager-field">
              Alt text
              <input
                value={readable(media.alt, "")}
                onChange={(event) => setMedia("alt", event.target.value)}
              />
            </label>
          </div>
          <MediaUpload
            folder="/portfolio/projects"
            onUploaded={(asset) =>
              onChange({ ...item, media: { ...media, ...asset } })
            }
          />
        </fieldset>
        <fieldset className="manager-media">
          <legend>Project gallery</legend>
          <p>
            Add images or videos for the case-study drawer. The first uploaded
            item is used as the lead media.
          </p>
          {gallery.map((asset, index) => (
            <div
              className="manager-form-grid"
              key={`${index}-${readable(asset.src, "media")}`}
            >
              <label className="manager-field">
                Media URL
                <input
                  value={readable(asset.src, "")}
                  onChange={(event) =>
                    onChange({
                      ...item,
                      mediaItems: gallery.map((current, currentIndex) =>
                        currentIndex === index
                          ? { ...current, src: event.target.value }
                          : current,
                      ),
                    })
                  }
                />
              </label>
              <label className="manager-field">
                Alt text
                <input
                  value={readable(asset.alt, "")}
                  onChange={(event) =>
                    onChange({
                      ...item,
                      mediaItems: gallery.map((current, currentIndex) =>
                        currentIndex === index
                          ? { ...current, alt: event.target.value }
                          : current,
                      ),
                    })
                  }
                />
              </label>
              <button
                type="button"
                className="manager-remove-media"
                onClick={() =>
                  onChange({
                    ...item,
                    mediaItems: gallery.filter(
                      (_, currentIndex) => currentIndex !== index,
                    ),
                  })
                }
              >
                Remove media
              </button>
            </div>
          ))}
          <MediaUpload
            folder="/portfolio/projects"
            onUploaded={(asset) =>
              onChange({
                ...item,
                media: gallery.length ? media : asset,
                mediaItems: [...gallery, asset],
              })
            }
          />
        </fieldset>
        <div className="manager-form-grid">
          <label className="manager-field">
            Live URL
            <input
              value={readable(links.live, "")}
              onChange={(event) => setLink("live", event.target.value)}
            />
          </label>
          <label className="manager-field">
            GitHub URL
            <input
              value={readable(links.github, "")}
              onChange={(event) => setLink("github", event.target.value)}
            />
          </label>
        </div>
      </div>
    );
  }

  if (kind === "writing") {
    const cover = (item.cover ?? {}) as ContentItem;
    const body = Array.isArray(item.body) ? item.body : [];
    const setCover = (field: string, value: string) =>
      onChange({ ...item, cover: { ...cover, [field]: value } });
    return (
      <div className="manager-form">
        <div className="manager-form-grid">
          {input("Post title", "title")}
          {input("Slug", "slug")}
        </div>
        {input("Summary", "summary", true)}
        <div className="manager-form-grid">
          {input("Reading time", "readingTime")}
          {input("Meta", "meta")}
        </div>
        <fieldset className="manager-media">
          <legend>Optional cover</legend>
          <div className="manager-form-grid">
            <label className="manager-field">
              Cover URL
              <input
                value={readable(cover.src, "")}
                onChange={(event) => setCover("src", event.target.value)}
              />
            </label>
            <label className="manager-field">
              Cover alt text
              <input
                value={readable(cover.alt, "")}
                onChange={(event) => setCover("alt", event.target.value)}
              />
            </label>
          </div>
          <MediaUpload
            folder="/portfolio/writing"
            onUploaded={(asset) =>
              onChange({ ...item, cover: { ...cover, ...asset } })
            }
          />
        </fieldset>
        <BlogBlocksEditor
          body={body as ContentItem[]}
          onChange={(next) => onChange({ ...item, body: next })}
        />
      </div>
    );
  }

  return <TimelineSentenceEditor item={item} onChange={onChange} />;
}

function SiteManager({
  pageId,
  savedSections,
}: {
  pageId?: string;
  savedSections?: AdminSection[];
}) {
  const replaceSections = useMutation(api.cms.replaceSections);
  const publishPage = useMutation(api.cms.publishPage);
  const deleteArticle = useMutation(api.articles.deleteArticle);
  const articles = useQuery(api.articles.adminList) ?? [];
  const { signOut } = useAuthActions();
  const [sections, setSections] = useState<AdminSection[]>(homeSections);
  const [activeKind, setActiveKind] = useState<SectionKind | null>(null);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<number | null>(null);
  const [pendingArticleDelete, setPendingArticleDelete] = useState<string | null>(
    null,
  );
  const [aiSettingsOpen, setAiSettingsOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (savedSections?.length) {
      // Convex query results include database metadata. Keep only the public
      // replaceSections input shape so `_id`, `pageId`, and timestamps never
      // leak back into the mutation validator.
      setSections(savedSections.map(normalizeAdminSection));
    }
  }, [savedSections]);
  useEffect(() => {
    const modalOpen = Boolean(
      activeKind || editorOpen || aiSettingsOpen || pendingDelete !== null || pendingArticleDelete !== null,
    );
    if (!modalOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeTopLayer = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (pendingDelete !== null) setPendingDelete(null);
      else if (pendingArticleDelete !== null) setPendingArticleDelete(null);
      else if (editorOpen) setEditorOpen(false);
      else if (aiSettingsOpen) setAiSettingsOpen(false);
      else {
        setActiveKind(null);
        setActiveIndex(null);
      }
    };
    window.addEventListener("keydown", closeTopLayer);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeTopLayer);
    };
  }, [activeKind, editorOpen, aiSettingsOpen, pendingDelete, pendingArticleDelete]);
  const section = useMemo(
    () => sections.find((entry) => entry.registryType === activeKind),
    [activeKind, sections],
  );
  const definition = activeKind ? keyFor(activeKind) : null;
  const collection =
    definition &&
    section &&
    Array.isArray(section.content[definition.collection])
      ? (section.content[definition.collection] as ContentItem[])
      : [];
  const activeItem =
    activeIndex === null ? null : (collection[activeIndex] ?? null);
  const countFor = (kind: SectionKind) => {
    if (kind === "writing") return articles.length;
    const target = sections.find((entry) => entry.registryType === kind);
    const targetDefinition = keyFor(kind);
    const records = target?.content[targetDefinition.collection];
    return Array.isArray(records) ? records.length : 0;
  };

  const updateCollection = (next: ContentItem[]) => {
    if (!section || !definition) return;
    setSections((current) =>
      current.map((entry) =>
        entry.sectionId === section.sectionId
          ? {
              ...entry,
              content: { ...entry.content, [definition.collection]: next },
            }
          : entry,
      ),
    );
  };
  const importStarterProjects = () => {
    if (activeKind !== "projects" || collection.length) return;
    updateCollection(siteData.projects.map((project) => ({ ...project })) as ContentItem[]);
    setNotice("Starter projects are ready. Save the draft or publish when you are ready.");
  };
  const changeItem = (index: number, next: ContentItem) =>
    updateCollection(
      collection.map((item, itemIndex) => (itemIndex === index ? next : item)),
    );
  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= collection.length) return;
    const next = [...collection];
    [next[index], next[target]] = [next[target], next[index]];
    updateCollection(next);
    setActiveIndex(target);
  };
  const remove = (index: number) => {
    updateCollection(collection.filter((_, itemIndex) => itemIndex !== index));
    setActiveIndex(null);
    setEditorOpen(false);
    setPendingDelete(null);
  };
  const add = () => {
    if (!definition || !activeKind) return;
    const stamp = Date.now();
    const item: ContentItem =
      activeKind === "projects"
        ? {
            slug: `project-${stamp}`,
            title: "Untitled project",
            eyebrow: "New project",
            summary: "Describe the work in one clear sentence.",
            status: "In progress",
            media: { type: "image", src: "", alt: "" },
          }
        : activeKind === "writing"
          ? {
              slug: `note-${stamp}`,
              title: "Untitled note",
              meta: "Working note",
              summary: "A new note in progress.",
              readingTime: "2 min read",
              body: [{ type: "paragraph", content: "Start writing here." }],
            }
          : {
              id: `${activeKind}-${stamp}`,
              period: "Present",
              location: "",
              segments: [
                { type: "text", value: "A new sentence about this work." },
              ],
            };
    updateCollection([...collection, item]);
    setActiveIndex(collection.length);
    setEditorOpen(true);
  };
  const save = async (publish = false) => {
    if (!pageId) return;
    const validationMessage = validateDraftSections(sections);
    if (validationMessage) {
      setNotice(validationMessage);
      return;
    }
    setBusy(true);
    setNotice("");
    try {
      await replaceSections({ pageId: pageId as never, sections });
      if (publish)
        await publishPage({
          pageId: pageId as never,
          label: "In-place content revision",
        });
      setNotice(publish ? "Published the current content." : "Draft saved.");
    } catch {
      setNotice(
        "The change could not be saved. Check the Convex connection and try again.",
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <main className="site-manager studio-shell">
      <iframe
        className="site-manager-preview"
        title="Portfolio edit mode"
        src="/"
      />
      <header className="studio-toolbar" aria-label="Content studio toolbar">
        <div className="studio-toolbar-brand">
          <a href="/" aria-label="Open portfolio">
            Aman
          </a>
          <span className="studio-status">
            <i aria-hidden="true" />
            Admin
          </span>
        </div>
        <nav className="studio-toolbar-actions" aria-label="Editing actions">
          <a
            className="studio-button studio-button-quiet"
            href="/"
            target="_blank"
            rel="noreferrer"
          >
            Preview
          </a>
          <button
            className="studio-button"
            type="button"
            onClick={() => setActiveKind(activeKind ? null : "projects")}
          >
            Manage content
          </button>
          <button
            className="studio-button studio-button-quiet studio-ai-settings-button"
            type="button"
            onClick={() => setAiSettingsOpen(true)}
          >
            AI settings
          </button>
          <button
            className="studio-button studio-button-quiet"
            type="button"
            disabled={busy || !pageId}
            onClick={() => void save()}
          >
            {busy ? "Saving..." : "Save draft"}
          </button>
          <button
            className="studio-button studio-button-primary"
            type="button"
            disabled={busy || !pageId}
            onClick={() => void save(true)}
          >
            Publish
          </button>
          <button
            className="studio-button studio-button-quiet studio-signout-button"
            type="button"
            onClick={() => void signOut()}
            aria-label="Sign out"
          >
            Sign out
          </button>
        </nav>
      </header>
      {activeKind && definition ? (
        <div
          className="studio-control-backdrop"
          role="presentation"
          onMouseDown={() => {
            setActiveKind(null);
            setActiveIndex(null);
          }}
        >
          <section
            className="studio-control-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="studio-control-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header className="studio-control-header">
              <div>
                <p>CONTENT CONTROL</p>
                <h2 id="studio-control-title">Manage the portfolio</h2>
                <span>
                  Organise content here. The public site changes only after
                  publishing.
                </span>
              </div>
              <button
                className="studio-icon-button"
                type="button"
                onClick={() => {
                  setActiveKind(null);
                  setActiveIndex(null);
                }}
                aria-label="Close content manager"
              >
                ×
              </button>
            </header>
            <div className="studio-control-layout">
              <nav
                className="studio-collection-nav"
                aria-label="Content collections"
              >
                {editableKinds.map((entry) => (
                  <button
                    key={entry.kind}
                    type="button"
                    aria-current={activeKind === entry.kind}
                    onClick={() => {
                      setActiveKind(entry.kind);
                      setActiveIndex(null);
                      setEditorOpen(false);
                    }}
                  >
                    <span>{entry.label}</span>
                    <small>{countFor(entry.kind)}</small>
                  </button>
                ))}
              </nav>
              <div className="studio-collection-workspace">
                <header className="studio-collection-heading">
                  <div>
                    <p>COLLECTION</p>
                    <h3>{definition.label}</h3>
                  </div>
                  {activeKind === "writing" ? (
                    <a
                      className="studio-button studio-button-primary"
                      href="/admin/writing?new=1"
                    >
                      + New post
                    </a>
                  ) : (
                    <button
                      type="button"
                      className="studio-button studio-button-primary"
                      onClick={add}
                    >
                      + New {definition.singular}
                    </button>
                  )}
                </header>
                <p className="manager-intro">
                  {activeKind === "writing"
                    ? "Posts open in the full writing studio with autosave, media, structured embeds, preview, and independent publishing."
                    : "Choose an item to edit it. Reorder items here, then save the draft or publish when ready."}
                </p>
                {activeKind === "writing" ? (
                  <div
                    className="manager-collection"
                    aria-label="Writing items"
                  >
                    {articles.map((article) => (
                      <article key={article._id}>
                        <a
                          className="manager-item-select"
                          href={`/admin/writing?article=${article._id}`}
                        >
                          <strong>{article.title}</strong>
                          <span>
                            {article.status} · {article.readingTime}
                          </span>
                        </a>
                        <nav>
                          <a
                            href={`/writing/${article.slug}`}
                            target="_blank"
                            rel="noreferrer"
                            aria-label={`Preview ${article.title}`}
                          >
                            View
                          </a>
                          {pendingArticleDelete === String(article._id) ? (
                            <button
                              type="button"
                              className="manager-writing-delete manager-writing-delete-confirm"
                              onClick={() =>
                                void deleteArticle({ articleId: article._id }).then(() => {
                                  setPendingArticleDelete(null);
                                  setNotice("Writing entry deleted.");
                                })
                              }
                              aria-label={`Confirm delete ${article.title}`}
                            >
                              Delete
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="manager-writing-delete"
                              onClick={() =>
                                setPendingArticleDelete(String(article._id))
                              }
                              aria-label={`Delete ${article.title}`}
                            >
                              Remove
                            </button>
                          )}
                        </nav>
                      </article>
                    ))}
                  </div>
                ) : (
                  <div
                    className="manager-collection"
                    aria-label={`${definition.label} items`}
                  >
                    {collection.map((item, index) => (
                      <article
                        key={readable(
                          item.slug,
                          readable(item.id, String(index)),
                        )}
                        data-active={activeIndex === index}
                      >
                        <button
                          className="manager-item-select"
                          type="button"
                          onClick={() => {
                            setActiveIndex(index);
                            setEditorOpen(true);
                          }}
                        >
                          <strong>
                            {readable(item.title, readable(item.period))}
                          </strong>
                          <span>
                            {readable(
                              item.summary,
                              readable(item.location, "Sentence entry"),
                            )}
                          </span>
                        </button>
                        <nav aria-label={`Actions for item ${index + 1}`}>
                          <button
                            type="button"
                            disabled={index === 0}
                            onClick={() => move(index, -1)}
                            aria-label="Move earlier"
                          >
                            ↑
                          </button>
                          <button
                            type="button"
                            disabled={index === collection.length - 1}
                            onClick={() => move(index, 1)}
                            aria-label="Move later"
                          >
                            ↓
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setActiveIndex(index);
                              setPendingDelete(index);
                              setEditorOpen(true);
                            }}
                            aria-label={`Delete ${readable(item.title, readable(item.period))}`}
                          >
                            ×
                          </button>
                        </nav>
                      </article>
                    ))}
                  </div>
                )}
                {(
                  activeKind === "writing"
                    ? !articles.length
                    : !collection.length
                ) ? (
                  <div className="manager-empty-state">
                    <strong>No {definition.label.toLowerCase()} yet.</strong>
                    <span>
                      {activeKind === "projects"
                        ? "Bring the current starter projects into this editable collection, or create a new one."
                        : `Create the first ${definition.singular} to begin this collection.`}
                    </span>
                    {activeKind === "projects" ? (
                      <button
                        type="button"
                        className="studio-button studio-button-quiet"
                        onClick={importStarterProjects}
                      >
                        Import starter projects
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>
            <footer className="studio-control-footer">
              <span>
                {activeKind === "writing"
                  ? "Writing drafts autosave and publish independently in the studio."
                  : notice || "Draft changes are private until published."}
              </span>
              {activeKind === "writing" ? (
                <div>
                  <a
                    className="studio-button studio-button-primary"
                    href="/admin/writing?new=1"
                  >
                    Open writing studio
                  </a>
                </div>
              ) : (
                <div>
                  <button
                    className="studio-button studio-button-quiet"
                    type="button"
                    disabled={busy || !pageId}
                    onClick={() => void save()}
                  >
                    {busy ? "Saving..." : "Save draft"}
                  </button>
                  <button
                    className="studio-button studio-button-primary"
                    type="button"
                    disabled={busy || !pageId}
                    onClick={() => void save(true)}
                  >
                    Publish changes
                  </button>
                </div>
              )}
            </footer>
          </section>
        </div>
      ) : null}
      {aiSettingsOpen ? <AiProviderSettings onClose={() => setAiSettingsOpen(false)} /> : null}
      {editorOpen &&
      activeItem !== null &&
      activeIndex !== null &&
      activeKind ? (
        <div
          className="manager-modal-backdrop manager-editor-layer"
          role="presentation"
          onMouseDown={() => {
            setEditorOpen(false);
            setPendingDelete(null);
          }}
        >
          <section
            className="manager-modal"
            role="dialog"
            aria-modal="true"
            aria-label={`Edit ${definition?.singular ?? "item"}`}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header>
              <div>
                <p>EDITING {definition?.singular?.toUpperCase()} · DRAFT</p>
                <h2>
                  {readable(activeItem.title, readable(activeItem.period))}
                </h2>
                <span>Changes are kept in this draft until you save.</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setEditorOpen(false);
                  setPendingDelete(null);
                }}
                aria-label="Back to collection"
              >
                ×
              </button>
            </header>
            <div className="manager-modal-scroll">
              <ItemForm
                kind={activeKind}
                item={activeItem}
                onChange={(next) => changeItem(activeIndex, next)}
              />
            </div>
            <footer>
              {pendingDelete === activeIndex ? (
                <div className="manager-delete-inline">
                  <span>Remove this {definition?.singular}? This only changes the draft.</span>
                  <button type="button" onClick={() => setPendingDelete(null)}>
                    Keep it
                  </button>
                  <button
                    type="button"
                    className="manager-modal-delete"
                    onClick={() => remove(activeIndex)}
                  >
                    Remove
                  </button>
                </div>
              ) : (
                <>
                  <button type="button" onClick={() => setEditorOpen(false)}>
                    Done
                  </button>
                  <button
                    type="button"
                    className="manager-modal-delete"
                    onClick={() => setPendingDelete(activeIndex)}
                  >
                    Delete {definition?.singular}
                  </button>
                </>
              )}
            </footer>
          </section>
        </div>
      ) : null}
    </main>
  );
}

function Editor() {
  const workspace = useQuery(api.cms.workspace);
  const homeDetail = useQuery(api.cms.pageDetail, { slug: "home" });
  const bootstrapOwner = useMutation(api.cms.bootstrapOwner);
  const upsertPage = useMutation(api.cms.upsertPage);
  const replaceSections = useMutation(api.cms.replaceSections);
  const [notice, setNotice] = useState("");
  if (workspace === undefined)
    return <main className="admin-loading">Loading your content studio…</main>;
  if (!workspace?.profile)
    return (
      <main className="admin-auth">
        <div className="admin-auth-card">
          <p>OWNER SETUP</p>
          <h1>Authorize this account.</h1>
          <span>
            Use the same email configured as <code>ADMIN_EMAIL</code> in Convex.
            This step appears only before an owner is approved.
          </span>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const email =
                new FormData(event.currentTarget).get("email")?.toString() ??
                "";
              void bootstrapOwner({ email })
                .then(() => location.reload())
                .catch((reason) =>
                  setNotice(
                    reason.message ?? "Could not authorize this account.",
                  ),
                );
            }}
          >
            <label>
              Owner email
              <input name="email" type="email" required />
            </label>
            <button type="submit">
              Authorize owner <span>↗</span>
            </button>
          </form>
          {notice ? <small role="alert">{notice}</small> : null}
        </div>
      </main>
    );
  if (homeDetail === undefined)
    return (
      <main className="admin-loading">Loading your editable collections…</main>
    );
  if (!homeDetail)
    return (
      <main className="admin-auth">
        <div className="admin-auth-card">
          <p>CONTENT SETUP</p>
          <h1>Bring the four collections into editing mode.</h1>
          <span>
            This makes one versioned starting snapshot from the projects,
            experience, education, and writing already on the portfolio.
          </span>
          <button
            type="button"
            onClick={() =>
              void (async () => {
                try {
                  const pageId = await upsertPage({
                    slug: "home",
                    title: "Home",
                    seo: {
                      title: "Aman Anu — Creative technologist",
                      description:
                        "Aman Anu builds thoughtful products, systems, and moving images.",
                      canonicalPath: "/",
                    },
                    publicationState: "draft",
                  });
                  await replaceSections({ pageId, sections: homeSections });
                  location.reload();
                } catch {
                  setNotice(
                    "Could not prepare the collections. Check the Convex connection and try again.",
                  );
                }
              })()
            }
          >
            Prepare editable content <span>↗</span>
          </button>
          {notice ? <small role="alert">{notice}</small> : null}
        </div>
      </main>
    );
  return (
    <SiteManager
      pageId={homeDetail.page._id}
      savedSections={homeDetail.sections as AdminSection[] | undefined}
    />
  );
}

function ConnectedAdmin() {
  return (
    <>
      <AuthLoading>
        <main className="admin-loading">Checking secure session…</main>
      </AuthLoading>
      <Unauthenticated>
        <Login />
      </Unauthenticated>
      <Authenticated>
        <Editor />
      </Authenticated>
    </>
  );
}

export default function AdminApp() {
  const url = publicConvexUrl;
  if (!url)
    return (
      <main className="admin-auth">
        <div className="admin-auth-card">
          <p>CONVEX SETUP</p>
          <h1>Connect the content studio.</h1>
          <span>
            Run <code>bunx convex dev</code>, then add its client URL as{" "}
            <code>PUBLIC_CONVEX_URL</code> in <code>.env.local</code>.
          </span>
        </div>
      </main>
    );
  return (
    <ConvexAuthProvider client={new ConvexReactClient(url)}>
      <ConnectedAdmin />
    </ConvexAuthProvider>
  );
}
