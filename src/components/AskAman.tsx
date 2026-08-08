import { ConvexProvider, ConvexReactClient, useAction, useQuery } from "convex/react";
import { ThinkingOrb } from "thinking-orbs";
import { useEffect, useMemo, useRef, useState } from "react";
import { Drawer } from "vaul";
import { api } from "../../convex/_generated/api";
import { emitPortfolioEvent } from "../lib/portfolio-events";

type Props = { convexUrl: string };
type SubmitLikeEvent = { preventDefault: () => void };
type SearchMode = "writings" | "ask";
type WritingResult = {
  slug: string;
  title: string;
  summary: string;
  meta: string;
  readingTime: string;
  tone?: string;
};
type OrbState = "searching" | "composing" | "shaping" | "working" | "listening";

const writingSearchPattern = /^(?:find|search|show|open|read|look\s+(?:me\s+)?for)\b/i;
const writingNounPattern = /\b(?:note|notes|writing|writings|blog|blogs|article|articles|essay|essays|post|posts)\b/i;
const writingContextPattern = /\b(?:my|your|the|published|public)\s+(?:note|notes|writing|writings|blog|blogs|article|articles|essay|essays|post|posts)\b|\b(?:note|notes|writing|writings|blog|blogs|article|articles|essay|essays|post|posts)\s+(?:about|on|from)\b/i;
const aiCreationPattern = /\b(?:draft|write|rewrite|compose|create|generate|develop|appreciation|deep\s+dive|overview|analysis|guide|tutorial|outline|brainstorm|blog\s+post|write[- ]?up)\b/i;
// Decision and profile phrasing is often declarative rather than a question
// (for example, “pick three projects for this role”). Route it to Ask Aman
// so Gemini can compare the public project context instead of searching note
// titles for words such as “best” or “role”.
const aiDecisionPattern = /\b(?:best|top|favo(?:u)?rite|pick|choose|select|shortlist|rank|ranking|which|compare|contrast|recommend|suggest|match|matches|closest|fit|fits|suitable|hire|hiring|candidate|role|roles|job|position|client|portfolio|project(?:s)?\s+(?:for|between|that|which)|between\s+(?:these|the)|for\s+this\s+role)\b/i;
const profilePattern = /\b(?:about\s+aman|aman(?:'s)?\s+(?:age|background|experience|work|projects?|education|location)|how\s+old|where\s+is\s+aman|who\s+is\s+aman|personal(?:ly)?|bio(?:graphy)?)\b/i;
const aiIntentPattern = /(?:\?|\b(?:who|what|why|how|when|where|can\s+you|could\s+you|should\s+i|would\s+you|tell\s+me|give\s+me|show\s+me\s+how|help\s+me|explain|break\s+(?:this|it)\s+down|research|look\s+into|find\s+out|analy[sz]e|summari[sz]e|compare|contrast|recommend|suggest|draft|write|rewrite|create|generate|improve|brainstorm|plan|latest|current|web\s+search|search\s+the\s+web|look\s+up|fact\s*check|do\s+you\s+think)\b)/i;

function detectMode(value: string): SearchMode {
  const query = value.trim();
  if (!query) return "writings";

  // Search/open commands that mention portfolio writing stay in the fast
  // metadata search path. This prevents a query such as “find my notes about
  // motion” from being sent to the AI agent just because it starts with a
  // question-like verb.
  const explicitWebResearch = /\b(?:research|latest|current|web\s+search|search\s+the\s+web)\b/i.test(query);
  if (
    ((writingSearchPattern.test(query) && writingNounPattern.test(query)) || writingContextPattern.test(query))
    && !explicitWebResearch
    && !aiCreationPattern.test(query)
    && !aiDecisionPattern.test(query)
    && !profilePattern.test(query)
  ) {
    return "writings";
  }

  // Explicit questions and research verbs are routed to the public assistant
  // on both desktop and mobile. Everything else remains a lightweight writing
  // search, so a title fragment never incurs an AI request.
  return aiIntentPattern.test(query) || aiCreationPattern.test(query) || aiDecisionPattern.test(query) || profilePattern.test(query)
    ? "ask"
    : "writings";
}

// Keep the mobile surface tied to the actual layout viewport rather than a
// single media-query event. Mobile browsers can report a visual viewport
// change after hydration (and some embedded previews do not dispatch the
// matchMedia change event at all).
const isNarrowViewport = () => {
  if (typeof window === "undefined") return false;
  const documentWidth = document.documentElement?.clientWidth || Number.POSITIVE_INFINITY;
  const viewportWidth = window.innerWidth || Number.POSITIVE_INFINITY;
  return Math.min(documentWidth, viewportWidth) <= 767
    || window.matchMedia("(max-width: 767px)").matches;
};

const visitorToken = () => {
  if (typeof window === "undefined") return "anonymous";
  const key = "aman-ask-visitor";
  const current = window.localStorage.getItem(key);
  if (current) return current;
  const next = typeof crypto?.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  window.localStorage.setItem(key, next);
  return next;
};

function Orb({
  state = "shaping",
  size = 20,
}: {
  state?: OrbState;
  size?: 20 | 64;
}) {
  return (
    <span className="ask-aman-orb ask-aman-orb-accent" aria-hidden="true">
      <ThinkingOrb state={state} size={size} theme="light" speed={0.82} aria-label="Aman is thinking" />
    </span>
  );
}

function AskAmanInner() {
  const rootRef = useRef<HTMLDivElement>(null);
  const mobileSheetRef = useRef<HTMLDivElement>(null);
  const mobileInputRef = useRef<HTMLInputElement>(null);
  const mobileLayoutHeightRef = useRef<number | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const [mode, setMode] = useState<SearchMode>("writings");
  const [input, setInput] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [resultRevealQuery, setResultRevealQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [answer, setAnswer] = useState<string | null>(null);
  const [sources, setSources] = useState<Array<{ title: string; url: string }>>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const action = useAction(api.assistantActions.answerPublic);
  const results = useQuery(
    api.assistant.publicWritingSearch,
    mode === "writings" && submittedQuery.length > 1 ? { query: submittedQuery, limit: 5 } : "skip",
  ) as WritingResult[] | undefined;

  useEffect(() => {
    const media = window.matchMedia("(max-width: 767px)");
    const sync = () => setIsMobileViewport(isNarrowViewport());
    sync();
    media.addEventListener("change", sync);
    window.addEventListener("resize", sync, { passive: true });
    window.visualViewport?.addEventListener("resize", sync, { passive: true });
    return () => {
      media.removeEventListener("change", sync);
      window.removeEventListener("resize", sync);
      window.visualViewport?.removeEventListener("resize", sync);
    };
  }, []);

  useEffect(() => {
    if (mode !== "writings" || !submittedQuery || results === undefined || searching) return;
    const timer = window.setTimeout(() => setResultRevealQuery(submittedQuery), 140);
    return () => window.clearTimeout(timer);
  }, [mode, results, searching, submittedQuery]);

  useEffect(() => {
    if (!expanded || isMobileViewport || isNarrowViewport()) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
        setSearching(false);
        setExpanded(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
        setSearching(false);
        setExpanded(false);
      }
    };
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [expanded, isMobileViewport]);

  useEffect(() => {
    if (!expanded || !(isMobileViewport || isNarrowViewport())) return;
    // Vaul marks the page behind the portalled sheet inert. Clear any focus
    // left on the inline trigger before moving focus into the sheet, otherwise
    // Safari/Chrome report a focused descendant inside aria-hidden content.
    const timer = window.setTimeout(() => {
      const active = document.activeElement;
      if (active instanceof HTMLElement && active !== mobileInputRef.current) active.blur();
      const input = mobileInputRef.current;
      // Vaul portals the sheet outside the page island. Do not move focus if
      // an embedded preview has temporarily marked the input's ancestor as
      // hidden; the next animation-end callback will retry safely.
      if (input && !input.closest('[aria-hidden="true"]')) input.focus({ preventScroll: true });
    }, 620);
    return () => window.clearTimeout(timer);
  }, [expanded, isMobileViewport]);

  useEffect(() => {
    if (!expanded || !(isMobileViewport || isNarrowViewport())) return;

    const sheet = mobileSheetRef.current;
    if (!sheet) return;

    const viewport = window.visualViewport;
    // Capture the layout viewport before the input is focused. Some mobile
    // browsers temporarily report the keyboard-reduced height through
    // innerHeight as well, which makes a live delta equal zero and leaves the
    // composer under the keyboard until the first keystroke.
    const documentHeight = document.documentElement?.clientHeight ?? 0;
    const windowHeight = window.innerHeight || 0;
    mobileLayoutHeightRef.current = Math.max(documentHeight, windowHeight);
    let frame = 0;
    const settleTimers: number[] = [];

    const syncViewport = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        const layoutHeight = mobileLayoutHeightRef.current
          ?? Math.max(document.documentElement?.clientHeight ?? 0, window.innerHeight || 0);
        const visualHeight = viewport?.height ?? window.innerHeight;
        const offsetTop = viewport?.offsetTop ?? 0;
        // Keep the sheet anchored to the visible viewport when the software
        // keyboard opens, then settle back to the layout viewport after it
        // closes. This prevents the stale white/negative gap left by a
        // keyboard resize on iOS and Chromium mobile previews.
        const keyboardInset = Math.max(0, layoutHeight - visualHeight - offsetTop);
        sheet.style.setProperty("--ask-aman-visual-vh", `${visualHeight}px`);
        sheet.style.setProperty("--ask-aman-keyboard-inset", `${keyboardInset}px`);
        sheet.dataset.askAmanKeyboardOpen = keyboardInset > 80 || visualHeight < layoutHeight - 80 ? "true" : "false";
      });
    };

    const scheduleSync = () => {
      syncViewport();
      settleTimers.push(window.setTimeout(syncViewport, 120));
      settleTimers.push(window.setTimeout(syncViewport, 320));
    };

    scheduleSync();
    const input = mobileInputRef.current;
    input?.addEventListener("focusin", scheduleSync, { passive: true });
    input?.addEventListener("input", scheduleSync, { passive: true });
    viewport?.addEventListener("resize", scheduleSync, { passive: true });
    viewport?.addEventListener("scroll", scheduleSync, { passive: true });
    window.addEventListener("resize", scheduleSync, { passive: true });

    return () => {
      window.cancelAnimationFrame(frame);
      settleTimers.forEach((timer) => window.clearTimeout(timer));
      input?.removeEventListener("focusin", scheduleSync);
      input?.removeEventListener("input", scheduleSync);
      viewport?.removeEventListener("resize", scheduleSync);
      viewport?.removeEventListener("scroll", scheduleSync);
      window.removeEventListener("resize", scheduleSync);
      mobileLayoutHeightRef.current = null;
      sheet.style.removeProperty("--ask-aman-visual-vh");
      sheet.style.removeProperty("--ask-aman-keyboard-inset");
      delete sheet.dataset.askAmanKeyboardOpen;
    };
  }, [expanded, isMobileViewport]);

  const openWriting = (post: WritingResult) => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    mobileInputRef.current?.blur();
    warmWriting(post);
    // Hand the note to the reader immediately. It can paint the cached card
    // shell while the full body/media request resolves during the sheet exit.
    emitPortfolioEvent("portfolio:open-post", post);
    window.requestAnimationFrame(() => {
      setExpanded(false);
      setSearching(false);
    });
  };

  const warmWriting = (post: WritingResult) => {
    // The reader owns the cache and media warming. Dispatching the same event
    // used by the writing cards keeps desktop popovers and the mobile sheet on
    // one fast path without putting article bodies in search results.
    emitPortfolioEvent("portfolio:prefetch-post", post);
  };

  const beginFreshQuery = () => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    setInput("");
    setSubmittedQuery("");
    setResultRevealQuery("");
    setSearching(false);
    setAnswer(null);
    setSources([]);
    setError(null);
    setExpanded(true);
  };

  const closeAskAman = () => {
    // Release focus before Vaul inerts the portalled sheet/page. This avoids
    // aria-hidden warnings on mobile and keeps the next trigger keyboard-safe.
    const active = document.activeElement;
    if (active instanceof HTMLElement) active.blur();
    mobileInputRef.current?.blur();
    setExpanded(false);
  };

  const submit = async (event: SubmitLikeEvent) => {
    event.preventDefault();
    const query = input.trim();
    if (!query) return;

    const detectedMode = detectMode(query);
    setMode(detectedMode);
    setAnswer(null);
    setSources([]);
    setError(null);

    setSubmittedQuery(query);
    setResultRevealQuery("");
    setSearching(true);
    // On desktop the result surface waits for the orb to complete its sweep;
    // mobile keeps the sheet open and only changes its chat state.
    const reopenSurface = !(isMobileViewport || isNarrowViewport());
    if (reopenSurface) setExpanded(false);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      setInput("");
      setSearching(false);
      if (reopenSurface) setExpanded(true);
    }, 720);

    if (detectedMode === "writings") return;

    setBusy(true);
    setError(null);
    setAnswer(null);
    setSources([]);
    try {
      const response = await action({
        query,
        mode: "ask",
        visitorToken: visitorToken(),
      });
      setAnswer(response.answer);
      setSources((response.sources ?? []).map((source) => ({ title: source.title, url: source.url })));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Ask Aman is unavailable right now.");
    } finally {
      setBusy(false);
    }
  };

  const resultList = (surface: "desktop" | "mobile") => {
    const activeQuery = submittedQuery;
    const notesReady = mode === "writings"
      && activeQuery.length > 1
      && results !== undefined
      && resultRevealQuery === activeQuery
      && !searching;
    return (
      <div className={`ask-aman-results ask-aman-results-${surface}`} aria-live="polite">
        {mode === "writings" && activeQuery.length > 1 && !notesReady ? (
          <p className="ask-aman-thinking"><Orb state="searching" size={20} /> {searching ? "Searching published notes" : "Preparing notes"}</p>
        ) : null}
        {notesReady && results?.map((result, index) => (
          <button
            className="ask-aman-result"
            key={result.slug}
            style={{ animationDelay: `${index * 55}ms` }}
            type="button"
            onClick={(event) => { event.stopPropagation(); openWriting(result); }}
            onPointerEnter={() => warmWriting(result)}
            onFocus={() => warmWriting(result)}
            onPointerDown={(event) => { event.stopPropagation(); warmWriting(result); }}
            aria-label={`Open ${result.title}`}
            data-vaul-no-drag
          >
            <span className={`ask-aman-result-dot tone-${result.tone ?? "blue"}`} aria-hidden="true" />
            <span className="ask-aman-result-copy">
              <strong>{result.title}</strong>
              <small>{result.meta || result.summary}</small>
              <em>{result.readingTime || "Published note"}</em>
            </span>
            <span className="ask-aman-result-action" aria-hidden="true">Read</span>
          </button>
        ))}
        {notesReady && results?.length === 0 ? (
          <p className="ask-aman-muted">No published note matched that yet.</p>
        ) : null}
        {mode === "ask" && (busy || searching) ? (
          <p className="ask-aman-thinking"><Orb state="composing" size={20} /> Thinking with public context</p>
        ) : null}
        {mode === "ask" && answer && !searching ? (
          <div className="ask-aman-answer">
            <p>{answer}</p>
            {sources.length ? (
              <div className="ask-aman-sources">
                <small>Sources read</small>
                {sources.map((source) => <a key={source.url} href={source.url} target="_blank" rel="noreferrer" data-vaul-no-drag>{source.title}</a>)}
              </div>
            ) : null}
          </div>
        ) : null}
        {error ? <p className="ask-aman-error" role="alert">{error}</p> : null}
      </div>
    );
  };

  const mobileChat = (
    <Drawer.Root
      open={expanded && (isMobileViewport || isNarrowViewport())}
      direction="bottom"
      dismissible
      handleOnly={false}
      repositionInputs={false}
      scrollLockTimeout={120}
      closeThreshold={0.24}
      onAnimationEnd={(open) => {
        if (!open || !(isMobileViewport || isNarrowViewport())) return;
        const input = mobileInputRef.current;
        if (input && !input.closest('[aria-hidden="true"]')) input.focus({ preventScroll: true });
      }}
      onOpenChange={(nextOpen) => { if (!nextOpen) closeAskAman(); }}
    >
      <Drawer.Portal>
        <Drawer.Overlay className="ask-aman-mobile-overlay" />
        <Drawer.Content ref={mobileSheetRef} className="ask-aman-mobile-sheet" aria-describedby="ask-aman-mobile-description">
          <Drawer.Title className="sr-only">Ask Aman</Drawer.Title>
          <Drawer.Description className="sr-only" id="ask-aman-mobile-description">Search published notes or ask Aman about his public work.</Drawer.Description>
          <header className="ask-aman-mobile-heading">
            <span><strong>Ask Aman</strong><small>Notes, work, and public context</small></span>
          </header>
          <div className="ask-aman-mobile-chat" data-vaul-no-drag>
            <div className="ask-aman-chat-message ask-aman-chat-message-assistant">Search a published note or ask about the work and the person behind it.</div>
            {submittedQuery && mode === "ask" ? <div className="ask-aman-chat-message ask-aman-chat-message-user">{submittedQuery}</div> : null}
            {resultList("mobile")}
          </div>
          <form className="ask-aman-mobile-composer" onSubmit={submit}>
            <label className="sr-only" htmlFor="ask-aman-mobile-input">Ask Aman</label>
            <input ref={mobileInputRef} id="ask-aman-mobile-input" value={input} onChange={(event) => setInput(event.target.value)} placeholder={detectMode(input) === "writings" ? "Search notes or ask Aman" : "Ask anything about Aman"} maxLength={700} autoComplete="off" enterKeyHint={detectMode(input) === "writings" ? "search" : "send"} data-vaul-no-drag />
            <button type="submit" aria-label={detectMode(input) === "writings" ? "Search published notes" : "Ask Aman"} disabled={busy || !input.trim()} data-vaul-no-drag><span>{detectMode(input) === "writings" ? "Find" : "Ask"}</span></button>
          </form>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );

  return (
    <div ref={rootRef} className="ask-aman ask-aman-inline">
      <form className={`ask-aman-inline-form${searching ? " is-searching" : ""}`} onSubmit={submit}>
        <span className="ask-aman-inline-orb"><Orb state={searching || busy ? "searching" : "listening"} size={64} /></span>
        <label className="sr-only" htmlFor="ask-aman-input">Ask Aman</label>
        <input
          id="ask-aman-input"
          className="ask-aman-inline-input"
          readOnly={isMobileViewport}
          tabIndex={isMobileViewport ? -1 : 0}
          onPointerDown={(event) => {
            if (!isNarrowViewport()) return;
            event.preventDefault();
            event.currentTarget.blur();
            beginFreshQuery();
          }}
          onClick={(event) => {
            // Pointer events are not consistently delivered by mobile
            // WebViews. Keep a click fallback so the sheet always opens.
            if (!isNarrowViewport()) return;
            event.preventDefault();
            event.currentTarget.blur();
            beginFreshQuery();
          }}
          value={input}
          onFocus={(event) => {
            if (isNarrowViewport()) {
              // The mobile sheet owns focus. Blur this field before opening it
              // so Vaul can safely inert the page behind the sheet.
              event.currentTarget.blur();
              beginFreshQuery();
              return;
            }
            if (!searching && (submittedQuery || answer || error)) beginFreshQuery();
          }}
          onChange={(event) => {
            const value = event.target.value;
            setInput(value);
            if (isNarrowViewport()) {
              setExpanded(true);
            } else {
              // Editing starts a fresh intent; keep the previous result
              // surface from flashing while the next query is composed.
              setExpanded(false);
              setSubmittedQuery("");
              setResultRevealQuery("");
              setAnswer(null);
              setSources([]);
              setError(null);
            }
          }}
          placeholder={searching ? "Thinking…" : "Ask Aman"}
          aria-label="Ask Aman"
          aria-expanded={expanded}
          aria-controls="ask-aman-search-results"
          maxLength={700}
          autoComplete="off"
        />
        <button className="ask-aman-submit sr-only" type="submit" disabled={busy || !input.trim()} aria-label="Send question">Send</button>
      </form>

      {expanded && !isMobileViewport ? (
        <div id="ask-aman-search-results" className="ask-aman-inline-popover" role="dialog" aria-label="Ask Aman results" onPointerDown={(event) => event.stopPropagation()}>
          <div className="ask-aman-popover-heading">
            <span><strong>Ask Aman</strong><small>Published notes and public context</small></span>
          </div>
          {resultList("desktop")}
          <p className="ask-aman-note">Select a note to open its reader.</p>
        </div>
      ) : null}
      {/* Keep the Vaul root mounted. Conditional mounting races with the
          first mobile tap in Safari and embedded mobile previews. */}
      {mobileChat}
    </div>
  );
}

export default function AskAman({ convexUrl }: Props) {
  const client = useMemo(() => new ConvexReactClient(convexUrl), [convexUrl]);
  return <ConvexProvider client={client}><AskAmanInner /></ConvexProvider>;
}
