import { useMutation, useQuery } from "convex/react";
import { useEffect, useMemo, useState } from "react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import {
  type AiDocumentProposal,
  articleWordCount,
  type ArticleDocument,
} from "./article-types";

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

export default function StudioAiPanel({
  articleId,
  title,
  context,
  portfolioContext,
  document,
  articleUpdatedAt,
  selection,
  onApply,
}: {
  articleId: Id<"articles">;
  title: string;
  context: string;
  portfolioContext: string;
  document: ArticleDocument;
  articleUpdatedAt?: number;
  selection: string;
  onApply: (proposal: AiDocumentProposal) => void;
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
          document,
          baseUpdatedAt: articleUpdatedAt,
          context: [
            context,
            `Portfolio seed context:\n${portfolioContext}`,
            "Agent conversation so far:\n" + nextConversation.map((message) => `${message.role}: ${message.text}`).join("\n"),
          ].filter(Boolean).join("\n\n"),
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
    <section className="writer-ai-panel writer-ai-chat-panel" aria-label="AI assistant">
      <header className="writer-ai-chat-header">
        <span className="writer-ai-chat-avatar" aria-hidden="true">✦</span>
        <div>
          <p>AMAN STUDIO</p>
          <h2>How can I help?</h2>
          <span className="writer-ai-chat-subtitle">Ask naturally. I know the portfolio context, the canvas schema, and how to research public sources.</span>
        </div>
        <span className="writer-ai-chat-state" data-state={busy ? "working" : failed ? "error" : "ready"}>
          {busy ? "Thinking" : failed ? "Needs attention" : "Private"}
        </span>
      </header>

      <div className="writer-ai-chat-context">
        <span>{selection ? "Selected passage" : "Current draft"}</span>
        <strong>{selection || title || "Untitled note"}</strong>
      </div>

      <div className="writer-ai-chat-feed" aria-live="polite">
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
      </div>

      <form className="writer-ai-chat-compose" onSubmit={(event) => { event.preventDefault(); void run(); }}>
        <textarea
          value={instruction}
          onChange={(event) => setInstruction(event.target.value)}
          placeholder="Ask for a complete draft, research, or a canvas change…"
          rows={3}
          aria-label="Message Aman Studio"
        />
        <div className="writer-ai-chat-compose-footer">
          <span>{isResearchRequest ? "Public sources will be discovered and cited automatically." : "Drafts stay in review until you approve them."}</span>
          <button type="submit" aria-label="Send message" disabled={busy || !instruction.trim()}>
            <span aria-hidden="true">↑</span>
          </button>
        </div>
      </form>
      {localError ? <p className="writer-ai-error">{localError}</p> : null}
      {job?.status === "failed" ? <p className="writer-ai-error">{job.error}</p> : null}
    </section>
  );
}
