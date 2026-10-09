import { useAction, useQuery } from "convex/react";
import { useEffect, useRef, useState } from "react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import {
  GEMINI_MODEL_OPTIONS,
  GEMINI_RESEARCH_OPTIONS,
  GEMINI_THINKING_OPTIONS,
} from "../../lib/geminiModels";

type FormState = {
  label: string;
  model: string;
  researchModel: string;
  apiKey: string;
  thinkingLevel: "low" | "medium" | "high";
  priority: string;
  dailyLimit: string;
  active: boolean;
};

const initialForm: FormState = {
  label: "Gemini primary",
  model: "gemini-3.8-flash",
  researchModel: "gemini-3.1-pro-preview",
  apiKey: "",
  thinkingLevel: "low",
  priority: "1",
  dailyLimit: "100",
  active: true,
};

export default function AiProviderSettings({
  onClose,
}: {
  onClose: () => void;
}) {
  const panelRef = useRef<HTMLElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const providerQuery = useQuery(api.ai.providerCatalog);
  const providers = providerQuery ?? [];
  const saveProvider = useAction(api.aiActions.saveProvider);
  const testProvider = useAction(api.aiActions.testProvider);
  const [message, setMessage] = useState("");
  const [form, setForm] = useState<FormState>(initialForm);
  const [selectedProviderId, setSelectedProviderId] =
    useState<Id<"aiProviders"> | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [operation, setOperation] = useState<"saving" | "testing" | null>(null);
  const settingsBusy = providerQuery === undefined || operation !== null;

  useEffect(() => {
    const previousActiveElement = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const previousBodyOverflow = document.body.style.overflow;
    const previousRootOverflow = document.documentElement.style.overflow;
    const panel = panelRef.current;

    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    panel?.querySelector<HTMLElement>(".ai-provider-form input:not([type=checkbox]), .ai-provider-form select")
      ?.focus({ preventScroll: true });

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeRef.current();
        return;
      }

      if (event.key !== "Tab" || !panel) return;
      const focusable = Array.from(panel.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
      ));
      if (!focusable.length) {
        event.preventDefault();
        panel.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || !panel.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || !panel.contains(active))) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousRootOverflow;
      previousActiveElement?.focus({ preventScroll: true });
    };
  }, []);
  const update = <Key extends keyof FormState>(
    key: Key,
    value: FormState[Key],
  ) => setForm((current) => ({ ...current, [key]: value }));

  const selectProvider = (provider: (typeof providers)[number]) => {
    setSelectedProviderId(provider._id);
    setIsCreating(false);
    setMessage("");
    setForm({
      label: provider.label,
      model: provider.model,
      researchModel: provider.researchModel || "gemini-3.1-pro-preview",
      apiKey: "",
      thinkingLevel: provider.thinkingLevel || "low",
      priority: String(provider.priority),
      dailyLimit: String(provider.dailyLimit),
      active: provider.active,
    });
  };

  const startNew = () => {
    setSelectedProviderId(null);
    setIsCreating(true);
    setMessage("");
    setForm(initialForm);
  };

  useEffect(() => {
    if (providerQuery === undefined || isCreating || selectedProviderId || !providers[0]) return;
    const provider = providers[0];
    setSelectedProviderId(provider._id);
    setForm({
      label: provider.label,
      model: provider.model,
      researchModel: provider.researchModel || "gemini-3.1-pro-preview",
      apiKey: "",
      thinkingLevel: provider.thinkingLevel || "low",
      priority: String(provider.priority),
      dailyLimit: String(provider.dailyLimit),
      active: provider.active,
    });
  }, [isCreating, providerQuery, providers, selectedProviderId]);

  const submit = async () => {
    if (settingsBusy) return;
    const priority = Number(form.priority);
    const dailyLimit = Number(form.dailyLimit);
    if (!Number.isFinite(priority) || priority < 1 || !Number.isFinite(dailyLimit) || dailyLimit < 1) {
      setMessage("Priority and daily limit must be numbers greater than zero.");
      return;
    }
    setOperation("saving");
    setMessage("Saving securely…");
    try {
      const providerId = await saveProvider({
        providerId: selectedProviderId ?? undefined,
        label: form.label,
        model: form.model,
        researchModel: form.researchModel,
        thinkingLevel: form.thinkingLevel,
        apiKey: form.apiKey.trim() || undefined,
        priority,
        dailyLimit,
        active: form.active,
      });
      setSelectedProviderId(providerId);
      setIsCreating(false);
      setForm((current) => ({ ...current, apiKey: "" }));
      setMessage("Provider saved. Keys are encrypted before they are stored.");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Could not save provider.",
      );
    } finally {
      setOperation(null);
    }
  };

  const testConnection = async () => {
    if (settingsBusy) return;
    setOperation("testing");
    setMessage("Checking the Gemini connection…");
    try {
      const result = await testProvider({
        providerId: selectedProviderId ?? undefined,
        model: form.model,
        apiKey: form.apiKey.trim() || undefined,
      });
      setMessage(`Connected to ${result.displayName}.`);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not verify this provider.",
      );
    } finally {
      setOperation(null);
    }
  };

  return (
    <div className="studio-control-backdrop">
      <button
        className="studio-control-dismiss"
        type="button"
        onClick={onClose}
        aria-label="Close AI settings"
        aria-hidden="true"
        tabIndex={-1}
      />
      <section
        ref={panelRef}
        className="studio-control-panel ai-settings-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ai-settings-title"
        aria-busy={settingsBusy}
        tabIndex={-1}
      >
        <header className="studio-control-header">
          <div>
            <p>AI WORKSPACE</p>
            <h2 id="ai-settings-title">Provider settings</h2>
            <span>
              Choose models, test access, and rotate keys without leaving the
              studio.
            </span>
          </div>
          <button
            className="studio-icon-button"
            type="button"
            onClick={onClose}
            aria-label="Close AI settings"
          >
            ×
          </button>
        </header>

        <div className="ai-settings-body">
          <div className="ai-provider-list">
            <p className="ai-settings-label">CONFIGURED PROVIDERS</p>
            {providerQuery === undefined ? (
              <div className="ai-settings-empty" role="status">Loading configured providers…</div>
            ) : providers.length ? (
              providers.map((provider) => (
                <button
                  className={`ai-provider-card${selectedProviderId === provider._id ? " is-selected" : ""}`}
                  key={provider._id}
                  type="button"
                  disabled={settingsBusy}
                  onClick={() => selectProvider(provider)}
                  aria-pressed={selectedProviderId === provider._id}
                >
                  <strong>{provider.label}</strong>
                  <span>
                    {provider.model} · {provider.active ? "Active" : "Paused"}
                  </span>
                  <small>
                    {provider.secretConfigured ? "Key ready" : "Missing key"} ·{" "}
                    {provider.usedToday}/{provider.dailyLimit} today
                  </small>
                </button>
              ))
            ) : (
              <div className="ai-settings-empty">
                No Gemini provider configured yet.
              </div>
            )}
            <button
              className="studio-button studio-button-quiet ai-provider-new"
              type="button"
              disabled={settingsBusy}
              onClick={startNew}
            >
              + New provider
            </button>
            <div className="ai-settings-note">
              <span className="ai-settings-note-mark" aria-hidden="true">
                ✦
              </span>
              <p>
                Research mode can use Google’s Deep Research agent. It runs
                asynchronously and may have separate preview quotas.
              </p>
            </div>
          </div>

          <div className="ai-provider-form">
            <p className="ai-settings-label">
              {selectedProviderId
                ? "EDIT GEMINI PROVIDER"
                : "ADD GEMINI PROVIDER"}
            </p>
            <label>
              Label
              <input
                disabled={settingsBusy}
                value={form.label}
                onChange={(event) => update("label", event.target.value)}
              />
            </label>
            <label>
              Chat & writing model
              <select
                disabled={settingsBusy}
                value={form.model}
                onChange={(event) => update("model", event.target.value)}
              >
                {GEMINI_MODEL_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label} — {option.note}
                  </option>
                ))}
              </select>
              <small className="ai-field-help">
                Used for chat, writing, and schema-aware canvas proposals.
              </small>
            </label>
            <label>
              Research model
              <select
                disabled={settingsBusy}
                value={form.researchModel}
                onChange={(event) =>
                  update("researchModel", event.target.value)
                }
              >
                {GEMINI_RESEARCH_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label} — {option.note}
                  </option>
                ))}
              </select>
              <small className="ai-field-help">
                Research requests automatically use this model; ordinary prompts
                stay on the model above.
              </small>
            </label>
            <label>
              Thinking depth
              <select
                disabled={settingsBusy}
                value={form.thinkingLevel}
                onChange={(event) =>
                  update(
                    "thinkingLevel",
                    event.target.value as FormState["thinkingLevel"],
                  )
                }
              >
                {GEMINI_THINKING_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label} — {option.note}
                  </option>
                ))}
              </select>
              <small className="ai-field-help">
                Higher reasoning can improve complex writing plans but takes
                longer.
              </small>
            </label>
            <label>
              {selectedProviderId ? "New API key (optional)" : "Gemini API key"}
              <input
                disabled={settingsBusy}
                type="password"
                value={form.apiKey}
                onChange={(event) => update("apiKey", event.target.value)}
                placeholder={
                  selectedProviderId
                    ? "Leave blank to keep the current key"
                    : "Paste a Gemini key"
                }
                autoComplete="off"
              />
              <small className="ai-field-help">
                The key travels over your authenticated session and is encrypted
                before storage. It is never displayed again.
              </small>
            </label>
            <div className="ai-settings-grid">
              <label>
                Priority
                <input
                  disabled={settingsBusy}
                  type="number"
                  min="1"
                  value={form.priority}
                  onChange={(event) => update("priority", event.target.value)}
                />
              </label>
              <label>
                Daily limit
                <input
                  disabled={settingsBusy}
                  type="number"
                  min="1"
                  value={form.dailyLimit}
                  onChange={(event) => update("dailyLimit", event.target.value)}
                />
              </label>
            </div>
            <label className="ai-settings-toggle">
              <input
                disabled={settingsBusy}
                type="checkbox"
                checked={form.active}
                onChange={(event) => update("active", event.target.checked)}
              />
              <span>Use this provider for new jobs</span>
            </label>
            <div className="ai-provider-actions">
              <button
                className="studio-button studio-button-primary"
                type="button"
                disabled={settingsBusy}
                onClick={() => void submit()}
              >
                {operation === "saving" ? "Saving…" : selectedProviderId ? "Save changes" : "Save provider"}
              </button>
              <button
                className="studio-button studio-button-quiet"
                type="button"
                disabled={settingsBusy}
                onClick={() => void testConnection()}
              >
                {operation === "testing" ? "Testing…" : "Test connection"}
              </button>
            </div>
            {message ? <small role="status">{message}</small> : null}
            <small className="ai-model-source">
              Model list follows Google’s Gemini API catalog · checked October
              9, 2026.
            </small>
          </div>
        </div>
      </section>
    </div>
  );
}
