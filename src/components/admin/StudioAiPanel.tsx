import { useMutation, useQuery } from "convex/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import {
  type AiDocumentProposal,
  articleWordCount,
  type ArticleDocument,
} from "./article-types";
import LlmDraftHandoff from "./LlmDraftHandoff";

type AiResult = {
  answer?: string;
  changeSetId?: string;
  model?: string;
  document?: Partial<ArticleDocument>;
  proposal?: AiDocumentProposal;
  sources?: AiDocumentProposal["sources"];
  citations?: AiDocumentProposal["citations"];
};

type ThinkingStep = {
  label: string;
  status: "complete" | "active" | "pending";
};

type ConversationMessage = {
  role: "you" | "assistant";
  text: string;
};

const MAX_ASSISTANT_MESSAGE_CHARS = 12_000;
const MAX_ASSISTANT_DOCUMENT_CHARS = 20_000;
const MAX_ASSISTANT_CONVERSATION_MESSAGES = 8;

const trimBlockForAssistant = (
  content: string,
  maxLength: number,
  selection: string,
) => {
  if (content.length <= maxLength) return content;

  const marker = "[…snipped…]";
  const windowLength = Math.max(0, maxLength - marker.length * 2);
  const selectedText = selection.trim();
  const selectedIndex = selectedText ? content.indexOf(selectedText) : -1;

  if (selectedIndex >= 0 && selectedText.length <= windowLength) {
    const start = Math.max(
      0,
      Math.min(
        selectedIndex - Math.floor((windowLength - selectedText.length) / 2),
        content.length - windowLength,
      ),
    );
    const end = start + windowLength;
    return `${start > 0 ? marker : ""}${content.slice(start, end)}${end < content.length ? marker : ""}`;
  }

  return `${content.slice(0, Math.max(0, maxLength - marker.length))}${marker}`;
};

const compactDocumentForAssistant = (
  document: ArticleDocument,
  selection: string,
) => {
  const selected = selection.trim()
    ? document.body.filter((block) => block.content?.includes(selection))
    : [];
  const remaining = document.body.filter((block) => !selected.includes(block));
  const body: ArticleDocument["body"] = [];
  const emptyDocumentLength = JSON.stringify({ ...document, body: [] }).length;

  for (const block of [...selected, ...remaining]) {
    const candidate = [...body, block];
    if (JSON.stringify({ ...document, body: candidate }).length <= MAX_ASSISTANT_DOCUMENT_CHARS) {
      body.push(block);
      continue;
    }

    // A single unusually large block should not make the whole canvas vanish
    // from context. Include a bounded excerpt, keeping the selected passage in
    // view when it fits, then stop before later blocks exceed the budget.
    if (body.length === 0 && typeof block.content === "string") {
      const blockShellLength = JSON.stringify({ ...block, content: "" }).length;
      let contentLimit = Math.max(
        0,
        MAX_ASSISTANT_DOCUMENT_CHARS - emptyDocumentLength - blockShellLength,
      );
      let boundedContent = trimBlockForAssistant(
        block.content,
        contentLimit,
        selection,
      );
      let boundedBlock = { ...block, content: boundedContent };
      let boundedDocument = { ...document, body: [boundedBlock] };

      while (
        contentLimit > 0 &&
        JSON.stringify(boundedDocument).length > MAX_ASSISTANT_DOCUMENT_CHARS
      ) {
        contentLimit = Math.max(
          0,
          contentLimit -
            (JSON.stringify(boundedDocument).length - MAX_ASSISTANT_DOCUMENT_CHARS),
        );
        boundedContent = trimBlockForAssistant(
          block.content,
          contentLimit,
          selection,
        );
        boundedBlock = { ...block, content: boundedContent };
        boundedDocument = { ...document, body: [boundedBlock] };
      }

      if (JSON.stringify(boundedDocument).length <= MAX_ASSISTANT_DOCUMENT_CHARS) {
        body.push(boundedBlock);
      }
    }

    break;
  }
  return { ...document, body };
};

const compactConversationForAssistant = (conversation: ConversationMessage[]) =>
  conversation
    .slice(-MAX_ASSISTANT_CONVERSATION_MESSAGES)
    .map((message) => `${message.role}: ${message.text.slice(0, 1_500)}`)
    .join("\n");

export default function StudioAiPanel({
  articleId,
  title,
  document,
  articleUpdatedAt,
  selection,
  onApply,
  onImport,
  canUndoImport,
  onUndoImport,
}: {
  articleId: Id<"articles">;
  title: string;
  document: ArticleDocument;
  articleUpdatedAt?: number;
  selection: string;
  onApply: (proposal: AiDocumentProposal) => void;
  onImport: (document: ArticleDocument) => void;
  canUndoImport: boolean;
  onUndoImport: () => void;
}) {
  const createJob = useMutation(api.ai.createJob);
  const applyChangeSet = useMutation(api.articles.applyAiChangeSet);
  const dismissChangeSet = useMutation(api.articles.dismissAiChangeSet);
  const [instruction, setInstruction] = useState("");
  const [activeRequest, setActiveRequest] = useState("");
  const [jobId, setJobId] = useState<Id<"aiJobs"> | null>(null);
  const [conversation, setConversation] = useState<ConversationMessage[]>([]);
  const [recordedJob, setRecordedJob] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);
  const [applied, setApplied] = useState(false);
  const [handoffOpen, setHandoffOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const feedRef = useRef<HTMLDivElement>(null);
  const shouldStickToBottom = useRef(true);
  const job = useQuery(api.ai.getJob, jobId ? { jobId } : "skip");
  const events = useQuery(api.ai.getJobEvents, jobId ? { jobId } : "skip") ?? [];
  const result = (job?.result ?? null) as AiResult | null;
  const changeSet = useQuery(api.ai.getChangeSet, jobId ? { jobId } : "skip");
  const busy = job?.status === "queued" || job?.status === "running";
  const failed = job?.status === "failed";
  const latestMessage = useMemo(
    () => events.slice().sort((a, b) => a.createdAt - b.createdAt).at(-1)?.message ?? job?.progress,
    [events, job?.progress],
  );
  const isResearchRequest = /\b(research|look\s*up|find\s+sources?|latest|current|compare|cite|according\s+to|what\s+does\s+the\s+web\s+say)\b/i.test(instruction.trim() || activeRequest);
  const thinkingSteps = useMemo<ThinkingStep[]>(() => {
    const hasResearchEvent = events.some((event) => event.stage === "research");
    const hasContextEvent = events.some((event) => event.stage === "context");
    const hasModelEvent = events.some((event) => event.stage === "model");
    const finished = job?.status === "completed";
    const stage = failed ? -1 : finished ? 4 : hasModelEvent ? 3 : hasResearchEvent ? 2 : hasContextEvent ? 1 : busy ? 0 : -1;
    const status = (step: number): ThinkingStep["status"] => {
      if (failed) return "pending";
      if (finished || stage > step) return "complete";
      if (stage === step) return "active";
      return "pending";
    };
    return [
      { label: "Understanding your request", status: status(0) },
      { label: isResearchRequest ? "Finding and reading public sources" : "Reviewing portfolio context", status: status(1) },
      { label: "Shaping a structured article", status: status(2) },
      { label: failed ? "Needs attention" : "Ready to review", status: finished ? "complete" : status(3) },
    ];
  }, [busy, events, failed, isResearchRequest, job?.status]);

  useEffect(() => {
    if (!jobId || !job || job.status !== "completed" || recordedJob === String(jobId)) return;
    const answer = (job.result as AiResult | undefined)?.answer;
    if (answer) setConversation((current) => [...current, { role: "assistant", text: answer }]);
    setRecordedJob(String(jobId));
  }, [job, jobId, recordedJob]);

  useEffect(() => {
    const feed = feedRef.current;
    if (!feed || !shouldStickToBottom.current) return;
    feed.scrollTo({ top: feed.scrollHeight, behavior: conversation.length > 1 ? "smooth" : "auto" });
  }, [conversation.length, job?.status, latestMessage]);

  const run = async () => {
    const prompt = instruction.trim();
    if (!prompt || busy) return;
    setLocalError(null);
    setApplied(false);
    setActiveRequest(prompt);
    setConversation((current) => [...current, { role: "you", text: prompt }]);
    setInstruction("");
    setJobId(null);
    setRecordedJob(null);
    try {
      const nextConversation = [...conversation, { role: "you" as const, text: prompt }];
      const created = await createJob({
        articleId,
        mode: "chat",
        input: {
          instruction: prompt,
          selection,
          title,
          document: compactDocumentForAssistant(document, selection),
          baseUpdatedAt: articleUpdatedAt,
          context: "Agent conversation so far:\n" + compactConversationForAssistant(nextConversation),
          urls: [],
        },
      });
      setJobId(created);
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : "The assistant could not start this run.");
    }
  };

  const handleApply = async () => {
    if (!result?.changeSetId || !result.document || result.proposal?.state !== "ready" || applying) return;
    setApplying(true);
    setLocalError(null);
    try {
      await applyChangeSet({ changeSetId: result.changeSetId as Id<"articleChangeSets"> });
      onApply({
        ...(result.proposal ?? {}),
        document: result.document,
        sources: result.sources,
        citations: result.citations,
      });
      setApplied(true);
      setConversation((current) => [...current, { role: "assistant", text: "Applied the structured draft to the canvas. You can keep editing before publishing." }]);
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : "The proposal could not be applied.");
    } finally {
      setApplying(false);
    }
  };

  const handleDismiss = async () => {
    if (!result?.changeSetId) return;
    try {
      await dismissChangeSet({ changeSetId: result.changeSetId as Id<"articleChangeSets"> });
      setConversation((current) => [...current, { role: "assistant", text: "Dismissed that proposal. Nothing was changed on the canvas." }]);
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : "The proposal could not be dismissed.");
    }
  };

  const proposedDocument = result?.document as Partial<ArticleDocument> | undefined;
  const proposedBody = Array.isArray(proposedDocument?.body) ? proposedDocument.body : [];
  const proposedWords = articleWordCount(proposedBody);
  const proposedHeadings = proposedBody.filter((block) => block.type === "heading").length;
  const hasReadyProposal = Boolean(result?.changeSetId && result.document && result.proposal?.state === "ready" && changeSet?.state === "ready");

  return (
    <section className={`writer-ai-panel writer-ai-chat-panel${expanded ? " is-expanded" : ""}`} aria-label="AI assistant">
      <header className="writer-ai-chat-header">
        <span className="writer-ai-chat-avatar" aria-hidden="true">✦</span>
        <div>
          <p>AMAN STUDIO</p>
          <h2>How can I help?</h2>
          <span className="writer-ai-chat-subtitle">Ask naturally. I know the portfolio context, the canvas schema, and how to research public sources.</span>
        </div>
        <div className="writer-ai-chat-controls">
          <span className="writer-ai-chat-state" data-state={busy ? "working" : failed ? "error" : "ready"}>{busy ? "Thinking" : failed ? "Needs attention" : "Private"}</span>
          <button type="button" className="writer-ai-chat-control" onClick={() => setHandoffOpen(true)}>Bring draft</button>
          <button type="button" className="writer-ai-chat-control" onClick={() => setExpanded((value) => !value)} aria-expanded={expanded}>{expanded ? "Compact" : "Expand"}</button>
        </div>
      </header>

      <div className="writer-ai-chat-context">
        <span>{selection ? "Selected passage" : "Current draft"}</span>
        <strong>{selection || title || "Untitled note"}</strong>
      </div>

      <div ref={feedRef} className="writer-ai-chat-feed" aria-live="polite" onScroll={(event) => { const target = event.currentTarget; shouldStickToBottom.current = target.scrollHeight - target.scrollTop - target.clientHeight < 96; }}>
        {conversation.length ? conversation.map((message, index) => (
          <div className={`writer-ai-chat-message writer-ai-chat-message-${message.role}`} key={`${message.role}-${index}`}>
            <span>{message.role === "you" ? "You" : "Aman Studio"}</span>
            <p>{message.text}</p>
          </div>
        )) : (
          <div className="writer-ai-chat-welcome">
            <span className="writer-ai-chat-welcome-mark" aria-hidden="true">✦</span>
            <div>
              <strong>Hi, I’m ready when you are.</strong>
              <p>Ask for a complete blog, a rewrite, research, sources, or a link/media placement. Nothing reaches the canvas until you approve it.</p>
            </div>
          </div>
        )}

        {jobId ? (
          <details className="writer-ai-chat-thinking" open={busy}>
            <summary>
              <span className="writer-ai-chat-thinking-orb" aria-hidden="true"><i /><i /><i /></span>
              <span>{busy ? latestMessage || "Working through the request" : failed ? "The run needs attention" : "Finished"}</span>
              <small>{busy ? "Live" : "Details"}</small>
            </summary>
            <ol aria-label="Assistant progress">
              {thinkingSteps.map((step) => (
                <li key={step.label} data-status={step.status}>
                  <span aria-hidden="true" />
                  <span>{step.label}</span>
                </li>
              ))}
            </ol>
          </details>
        ) : null}

        {result?.sources?.length ? (
          <div className="writer-ai-chat-citations">
            <span>Sources read</span>
            {result.sources.map((source, index) => (
              <a key={`${source.url}-${index}`} href={source.url} target="_blank" rel="noreferrer">
                {source.title || source.url || `Source ${index + 1}`}
              </a>
            ))}
          </div>
        ) : null}

        {result?.proposal && result.proposal.state !== "none" ? (
          <div className="writer-ai-agent-proposal">
            <span>{result.proposal.state === "needs_clarification" ? "Needs your direction" : "Structured draft ready"}</span>
            <strong>{result.proposal.summary || "I have a complete article proposal ready for review."}</strong>
            {result.proposal.question ? <p>{result.proposal.question}</p> : null}
            {result.proposal.placement ? <small>Placement: {result.proposal.placement.replaceAll("_", " ")}</small> : null}
          </div>
        ) : null}

        {proposedDocument ? (
          <div className="writer-ai-document-preview">
            <div>
              <span>ARTICLE PREVIEW</span>
              <strong>{proposedDocument.title || "Untitled article"}</strong>
              <p>{proposedDocument.summary || "A structured draft is ready to inspect."}</p>
            </div>
            <small>{proposedWords} words · {proposedHeadings} sections · calculated reading time</small>
          </div>
        ) : null}

        {hasReadyProposal && !applied ? (
          <div className="writer-ai-chat-actions">
            <span>Nothing has been changed yet.</span>
            <div>
              <button type="button" onClick={() => void handleApply()} disabled={applying}>{applying ? "Applying…" : "Apply full draft"}</button>
              <button type="button" className="writer-ai-chat-action-secondary" onClick={() => void handleDismiss()} disabled={applying}>Dismiss</button>
            </div>
          </div>
        ) : null}
        {applied ? <div className="writer-ai-applied-note">Applied to the canvas. Review it, then publish when it feels right.</div> : null}
        {canUndoImport ? <div className="writer-ai-import-note"><span>External LLM draft is on the canvas.</span><button type="button" onClick={onUndoImport}>Undo import</button></div> : null}
      </div>

      <form className="writer-ai-chat-compose" onSubmit={(event) => { event.preventDefault(); void run(); }}>
        <textarea
          value={instruction}
          onChange={(event) => setInstruction(event.target.value)}
          placeholder="Ask for a complete draft, research, or a canvas change…"
          rows={3}
          maxLength={MAX_ASSISTANT_MESSAGE_CHARS}
          aria-label="Message Aman Studio"
        />
        <div className="writer-ai-chat-compose-footer">
          <span>{isResearchRequest ? "Public sources will be discovered and cited automatically." : "Drafts stay in review until you approve them."} {instruction.length.toLocaleString()}/{MAX_ASSISTANT_MESSAGE_CHARS.toLocaleString()}</span>
          <button type="submit" aria-label="Send message" disabled={busy || !instruction.trim()}>
            <span aria-hidden="true">↑</span>
          </button>
        </div>
      </form>
      {localError ? <p className="writer-ai-error">{localError}</p> : null}
      {job?.status === "failed" ? <p className="writer-ai-error">{job.error}</p> : null}
      <LlmDraftHandoff document={document} open={handoffOpen} onClose={() => setHandoffOpen(false)} onApply={onImport} />
    </section>
  );
}
