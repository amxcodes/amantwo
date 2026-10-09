import { useEffect, useMemo, useRef, useState } from "react";
import {
  LLM_DRAFT_IMPORT_FORMAT,
  LLM_DRAFT_IMPORT_VERSION,
  MAX_LLM_DRAFT_IMPORT_BYTES,
  parseLlmDraftImport,
  articleWordCount,
  type ArticleDocument,
  type LlmDraftImportPreview,
} from "./article-types";

type HandoffMode = "new" | "continue";
const MAX_BRIEF_CONTEXT_CHARS = 12_000;

const compactCanvasContext = (document: ArticleDocument) => {
  const exportable = {
    title: document.title,
    summary: document.summary,
    meta: document.meta,
    body: document.body.map(({ id: _id, inlineAttachments: _attachments, highlights: _highlights, ...block }) => block),
  };
  const serialised = JSON.stringify(exportable, null, 2);
  return serialised.length <= MAX_BRIEF_CONTEXT_CHARS
    ? serialised
    : `${serialised.slice(0, MAX_BRIEF_CONTEXT_CHARS - 220)}\n\n[The existing canvas was shortened here. Preserve its direction, but return a complete new draft.]`;
};

const buildBrief = (document: ArticleDocument, mode: HandoffMode) => {
  const currentCanvas = mode === "continue"
    ? `\n\nCURRENT CANVAS CONTEXT (read-only; it may be shortened):\n${compactCanvasContext(document)}`
    : "";
  return `You are preparing a long-form article for Aman Anu's Writing Studio. Use the conversation above as the source of truth. Write original, specific prose. Do not invent sources or claim that anything has been published.

Return exactly one raw JSON object. Do not wrap it in Markdown, do not add commentary, and do not use HTML. Its envelope must be:
{
  "format": "${LLM_DRAFT_IMPORT_FORMAT}",
  "version": ${LLM_DRAFT_IMPORT_VERSION},
  "document": {
    "title": "string",
    "summary": "string",
    "meta": "string",
    "tone": "blue | orange | green | yellow",
    "body": [
      { "type": "heading", "content": "string", "level": 2 },
      { "type": "paragraph", "content": "string" },
      { "type": "list", "items": ["string"] },
      { "type": "quote", "content": "string", "attribution": "optional string" },
      { "type": "callout", "content": "string", "variant": "note" },
      { "type": "code", "content": "string", "language": "text" },
      { "type": "divider" },
      { "type": "link", "href": "https://...", "label": "string", "description": "string" },
      { "type": "image | video | audio", "src": "https://...", "alt": "string", "caption": "optional string" },
      { "type": "embed", "href": "https://...", "label": "string", "provider": "youtube" }
    ],
    "seo": { "title": "string", "description": "string" }
  },
  "sources": [{ "title": "optional string", "url": "https://...", "excerpt": "optional string" }]
}

Use only the listed block types. Use HTTPS for every external URL. Do not include ids, publishing status, slug, reading time, cover, narration, script, or style fields. Keep code inside code blocks only. The importer will validate the result before it can replace the canvas.${currentCanvas}`;
};

export default function LlmDraftHandoff({
  document,
  open,
  onClose,
  onApply,
}: {
  document: ArticleDocument;
  open: boolean;
  onClose: () => void;
  onApply: (document: ArticleDocument) => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<HandoffMode>("new");
  const [raw, setRaw] = useState("");
  const [preview, setPreview] = useState<LlmDraftImportPreview | null>(null);
  const [message, setMessage] = useState("");
  const brief = useMemo(() => buildBrief(document, mode), [document, mode]);

  useEffect(() => {
    if (!open || !dialogRef.current) return;
    const invokingElement = window.document.activeElement instanceof HTMLElement
      ? window.document.activeElement
      : null;
    dialogRef.current.showModal();
    const timer = window.setTimeout(() => dialogRef.current?.querySelector<HTMLButtonElement>("[data-copy-brief]")?.focus(), 0);
    return () => {
      window.clearTimeout(timer);
      if (dialogRef.current?.open) dialogRef.current.close();
      invokingElement?.focus();
    };
  }, [open]);

  if (!open) return null;

  const inspect = () => {
    setPreview(parseLlmDraftImport(raw, document));
    setMessage("");
  };

  const copyBrief = async () => {
    try {
      await navigator.clipboard.writeText(brief);
      setMessage("Instructions copied. Continue your ChatGPT conversation, paste them, then bring the JSON back here.");
    } catch {
      setMessage("Clipboard access is unavailable. Use Download instructions instead.");
    }
  };

  const downloadBrief = () => {
    const file = new Blob([brief], { type: "text/plain" });
    const url = URL.createObjectURL(file);
    const anchor = window.document.createElement("a");
    anchor.href = url;
    anchor.download = "aman-writing-studio-brief.txt";
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  const loadFile = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > MAX_LLM_DRAFT_IMPORT_BYTES) {
      setMessage("That file is larger than 250 KB. Split the draft into smaller imports.");
      return;
    }
    try {
      setRaw(await file.text());
      setPreview(null);
      setMessage(`Loaded ${file.name}. Review it before applying.`);
    } catch {
      setMessage("That file could not be read as text.");
    }
  };

  const errors = preview?.issues.filter((issue) => issue.level === "error") ?? [];
  const warnings = preview?.issues.filter((issue) => issue.level === "warning") ?? [];
  const canApply = Boolean(preview && !errors.length);
  const importWords = preview ? articleWordCount(preview.document.body) : 0;
  const importHeadings = preview?.document.body.filter((block) => block.type === "heading").length ?? 0;

  return (
    <dialog
      ref={dialogRef}
      className="writer-llm-handoff"
      aria-labelledby="llm-handoff-title"
      onCancel={(event) => { event.preventDefault(); onClose(); }}
      onMouseDown={(event) => { if (event.target === dialogRef.current) onClose(); }}
    >
      <header className="writer-llm-handoff-header">
        <div>
          <p>PORTABLE WRITING</p>
          <h2 id="llm-handoff-title">Bring a draft from any LLM</h2>
          <span>Copy a contract, write where you prefer, then import a reviewable canvas draft.</span>
        </div>
        <button type="button" className="writer-llm-icon-button" onClick={onClose} aria-label="Close draft import">×</button>
      </header>

      <div className="writer-llm-handoff-body">
        <section className="writer-llm-step">
          <div className="writer-llm-step-heading"><span>1</span><div><strong>Give your LLM a clear contract</strong><p>No API connection is needed. Keep discussing your topic in ChatGPT, then paste this brief.</p></div></div>
          <div className="writer-llm-mode" aria-label="Instruction context">
            <button type="button" aria-pressed={mode === "new"} onClick={() => setMode("new")}>New draft</button>
            <button type="button" aria-pressed={mode === "continue"} onClick={() => setMode("continue")}>Improve current draft</button>
          </div>
          <div className="writer-llm-brief-meta"><span>{mode === "continue" ? `Includes up to ${MAX_BRIEF_CONTEXT_CHARS.toLocaleString()} characters of current canvas context.` : "Uses your existing LLM conversation as context."}</span><strong>v{LLM_DRAFT_IMPORT_VERSION}</strong></div>
          <div className="writer-llm-brief-actions">
            <button data-copy-brief type="button" className="writer-button-primary" onClick={() => void copyBrief()}>Copy ChatGPT brief</button>
            <button type="button" className="writer-button-secondary" onClick={downloadBrief}>Download .txt</button>
          </div>
        </section>

        <section className="writer-llm-step">
          <div className="writer-llm-step-heading"><span>2</span><div><strong>Paste or attach the LLM output</strong><p>Only raw JSON or a JSON file up to 250 KB is accepted. Nothing is saved at this step.</p></div></div>
          <textarea value={raw} onChange={(event) => { setRaw(event.target.value); setPreview(null); }} maxLength={MAX_LLM_DRAFT_IMPORT_BYTES} rows={8} placeholder='Paste an aman-writing-import JSON object…' aria-label="LLM draft JSON" />
          <div className="writer-llm-import-actions">
            <button type="button" className="writer-button-secondary" onClick={() => fileInputRef.current?.click()}>Attach .json file</button>
            <input ref={fileInputRef} type="file" accept=".json,application/json,text/json,text/plain" onChange={(event) => void loadFile(event.target.files?.[0])} />
            <span>{raw.length.toLocaleString()} / {MAX_LLM_DRAFT_IMPORT_BYTES.toLocaleString()} characters</span>
            <button type="button" className="writer-button-primary" onClick={inspect} disabled={!raw.trim()}>Validate draft</button>
          </div>
        </section>

        {preview ? <section className="writer-llm-step writer-llm-review" aria-live="polite">
          <div className="writer-llm-step-heading"><span>3</span><div><strong>Review before replacement</strong><p>The import cannot publish or alter your article until you apply it.</p></div></div>
          <div className="writer-llm-preview-card"><strong>{preview.document.title}</strong><p>{preview.document.summary || "No summary provided."}</p><small>{preview.document.body.length} blocks · {importHeadings} headings · {importWords.toLocaleString()} words{preview.sourceCount ? ` · ${preview.sourceCount} source references` : ""}</small></div>
          {errors.length ? <ul className="writer-llm-issues writer-llm-errors">{errors.map((issue, index) => <li key={`error-${index}`}>{issue.message}</li>)}</ul> : null}
          {warnings.length ? <ul className="writer-llm-issues">{warnings.map((issue, index) => <li key={`warning-${index}`}>{issue.message}</li>)}</ul> : null}
          <div className="writer-llm-review-actions"><button type="button" className="writer-button-secondary" onClick={() => setPreview(null)}>Keep editing</button><button type="button" className="writer-button-primary" disabled={!canApply} onClick={() => { if (canApply) { onApply(preview.document); onClose(); } }}>Apply and save draft</button></div>
        </section> : null}
      </div>
      {message ? <p className="writer-llm-message" role="status">{message}</p> : null}
    </dialog>
  );
}
