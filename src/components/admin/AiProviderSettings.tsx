import { useAction, useQuery } from "convex/react";
import { useState } from "react";
import { api } from "../../../convex/_generated/api";
import { GEMINI_MODEL_OPTIONS, GEMINI_RESEARCH_OPTIONS } from "../../lib/geminiModels";

type FormState = {
  label: string;
  model: string;
  researchModel: string;
  apiKey: string;
  priority: string;
  dailyLimit: string;
  active: boolean;
};

const initialForm: FormState = {
  label: "Gemini primary",
  model: "gemini-3.6-flash",
  researchModel: "gemini-3.1-pro-preview",
  apiKey: "",
  priority: "1",
  dailyLimit: "100",
  active: true,
};

export default function AiProviderSettings({ onClose }: { onClose: () => void }) {
  const providers = useQuery(api.ai.providerCatalog) ?? [];
  const saveProvider = useAction(api.aiActions.saveProvider);
  const [message, setMessage] = useState("");
  const [form, setForm] = useState<FormState>(initialForm);
  const update = <Key extends keyof FormState>(key: Key, value: FormState[Key]) => setForm((current) => ({ ...current, [key]: value }));

  const submit = async () => {
    if (!form.apiKey.trim()) {
      setMessage("Add a Gemini API key first.");
      return;
    }
    setMessage("Saving securely…");
    try {
      await saveProvider({
        label: form.label,
        model: form.model,
        researchModel: form.researchModel,
        apiKey: form.apiKey,
        priority: Number(form.priority),
        dailyLimit: Number(form.dailyLimit),
        active: form.active,
      });
      setForm((current) => ({ ...current, apiKey: "" }));
      setMessage("Provider saved. The key is encrypted server-side.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save provider.");
    }
  };

  return (
    <div className="studio-control-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="studio-control-panel ai-settings-panel" role="dialog" aria-modal="true" aria-labelledby="ai-settings-title" onMouseDown={(event) => event.stopPropagation()}>
        <header className="studio-control-header">
          <div>
            <p>AI WORKSPACE</p>
            <h2 id="ai-settings-title">Provider settings</h2>
            <span>Keys stay inside Convex and are never sent to the browser.</span>
          </div>
          <button className="studio-icon-button" type="button" onClick={onClose} aria-label="Close AI settings">×</button>
        </header>

        <div className="ai-settings-body">
          <div className="ai-provider-list">
            <p className="ai-settings-label">CONFIGURED PROVIDERS</p>
            {providers.length ? providers.map((provider) => (
              <article key={provider._id}>
                <strong>{provider.label}</strong>
                <span>{provider.model} · {provider.secretConfigured ? "Key ready" : "Missing key"}</span>
                <small>Research: {provider.researchModel || "Gemini 3.1 Pro"}</small>
              </article>
            )) : <div className="ai-settings-empty">No Gemini provider configured yet.</div>}
            <div className="ai-settings-note">
              <span className="ai-settings-note-mark" aria-hidden="true">✦</span>
              <p>Research mode can use Google’s Deep Research agent. It runs asynchronously and may have separate preview quotas.</p>
            </div>
          </div>

          <div className="ai-provider-form">
            <p className="ai-settings-label">ADD GEMINI PROVIDER</p>
            <label>Label<input value={form.label} onChange={(event) => update("label", event.target.value)} /></label>
            <label>
              Chat & writing model
              <select value={form.model} onChange={(event) => update("model", event.target.value)}>
                {GEMINI_MODEL_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label} — {option.note}</option>)}
              </select>
              <small className="ai-field-help">Used for chat, writing, and schema-aware canvas proposals.</small>
            </label>
            <label>
              Research model
              <select value={form.researchModel} onChange={(event) => update("researchModel", event.target.value)}>
                {GEMINI_RESEARCH_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label} — {option.note}</option>)}
              </select>
              <small className="ai-field-help">Research requests automatically use this model; ordinary prompts stay on the model above.</small>
            </label>
            <label>API key<input type="password" value={form.apiKey} onChange={(event) => update("apiKey", event.target.value)} placeholder="Paste a Gemini key" autoComplete="off" /></label>
            <div className="ai-settings-grid">
              <label>Priority<input type="number" min="1" value={form.priority} onChange={(event) => update("priority", event.target.value)} /></label>
              <label>Daily limit<input type="number" min="1" value={form.dailyLimit} onChange={(event) => update("dailyLimit", event.target.value)} /></label>
            </div>
            <label className="ai-settings-toggle"><input type="checkbox" checked={form.active} onChange={(event) => update("active", event.target.checked)} /><span>Use this provider for new jobs</span></label>
            <button className="studio-button studio-button-primary" type="button" onClick={() => void submit()}>Save provider</button>
            {message ? <small role="status">{message}</small> : null}
            <small className="ai-model-source">Model list verified against Google’s Gemini API catalog · July 30, 2026.</small>
          </div>
        </div>
      </section>
    </div>
  );
}
