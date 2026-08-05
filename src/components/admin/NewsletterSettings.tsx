import { useMutation, useQuery } from "convex/react";
import { useEffect, useState } from "react";
import { api } from "../../../convex/_generated/api";

type Props = { onClose: () => void };

type FormState = {
  enabled: boolean;
  title: string;
  description: string;
  placeholder: string;
  buttonLabel: string;
  successMessage: string;
};

const initialForm: FormState = {
  enabled: true,
  title: "Get occasional notes",
  description: "A small, occasional note on products, systems, and moving images.",
  placeholder: "Email address",
  buttonLabel: "Join",
  successMessage: "You're on the list.",
};

const formatDate = (value: number) =>
  new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(value);

export default function NewsletterSettings({ onClose }: Props) {
  const dashboard = useQuery(api.newsletter.adminDashboard, { limit: 100 });
  const saveSettings = useMutation(api.newsletter.updateSettings);
  const [form, setForm] = useState<FormState>(initialForm);
  const [filter, setFilter] = useState<"all" | "subscribed" | "unsubscribed">("subscribed");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (!dashboard?.settings) return;
    setForm(dashboard.settings as FormState);
  }, [dashboard?.settings]);

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
    setNotice("");
  };

  const save = async () => {
    setSaving(true);
    setNotice("");
    try {
      await saveSettings(form);
      setNotice("Newsletter settings saved.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not save settings.");
    } finally {
      setSaving(false);
    }
  };

  const items = dashboard?.items?.filter((item) => filter === "all" || item.status === filter) ?? [];
  const counts = dashboard?.counts ?? { total: 0, subscribed: 0, unsubscribed: 0 };

  return (
    <div className="manager-modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="newsletter-admin-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="newsletter-admin-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="newsletter-admin-header">
          <div>
            <p>NEWSLETTER</p>
            <h2 id="newsletter-admin-title">Footer join</h2>
            <span>Manage the public join form and see who has subscribed.</span>
          </div>
          <button type="button" className="studio-icon-button" onClick={onClose} aria-label="Close newsletter settings">x</button>
        </header>

        <div className="newsletter-admin-scroll">
          <section className="newsletter-admin-section" aria-labelledby="newsletter-copy-title">
            <div className="newsletter-admin-section-heading">
              <div>
                <p>PUBLIC FORM</p>
                <h3 id="newsletter-copy-title">Join options</h3>
              </div>
              <label className="newsletter-admin-toggle">
                <input type="checkbox" checked={form.enabled} onChange={(event) => update("enabled", event.target.checked)} />
                <span>Enabled</span>
              </label>
            </div>
            <div className="newsletter-admin-form-grid">
              <label className="manager-field">
                Heading
                <input value={form.title} onChange={(event) => update("title", event.target.value)} />
              </label>
              <label className="manager-field">
                Button label
                <input value={form.buttonLabel} onChange={(event) => update("buttonLabel", event.target.value)} />
              </label>
              <label className="manager-field newsletter-admin-wide">
                Description
                <textarea rows={2} value={form.description} onChange={(event) => update("description", event.target.value)} />
              </label>
              <label className="manager-field">
                Placeholder
                <input value={form.placeholder} onChange={(event) => update("placeholder", event.target.value)} />
              </label>
              <label className="manager-field">
                Success message
                <input value={form.successMessage} onChange={(event) => update("successMessage", event.target.value)} />
              </label>
            </div>
          </section>

          <section className="newsletter-admin-section" aria-labelledby="newsletter-audience-title">
            <div className="newsletter-admin-section-heading">
              <div>
                <p>AUDIENCE</p>
                <h3 id="newsletter-audience-title">Subscribers</h3>
              </div>
              <div className="newsletter-admin-counts" aria-label="Newsletter subscriber counts">
                <span>{counts.subscribed} active</span>
                <span>{counts.total} total</span>
              </div>
            </div>
            <div className="newsletter-admin-filters" role="tablist" aria-label="Subscriber status">
              {(["subscribed", "all", "unsubscribed"] as const).map((value) => (
                <button key={value} type="button" role="tab" aria-selected={filter === value} onClick={() => setFilter(value)}>
                  {value === "subscribed" ? "Active" : value === "unsubscribed" ? "Unsubscribed" : "All"}
                </button>
              ))}
            </div>
            {dashboard === undefined ? <p className="newsletter-admin-empty">Loading subscribers...</p> : null}
            {dashboard && !items.length ? <p className="newsletter-admin-empty">No subscribers in this view yet.</p> : null}
            <div className="newsletter-admin-list">
              {items.map((item) => (
                <div className="newsletter-admin-row" key={item._id}>
                  <div>
                    <strong>{item.email}</strong>
                    <span>{item.source || "Footer"} / {formatDate(item.subscribedAt ?? item.createdAt)}</span>
                  </div>
                  <small data-status={item.status}>{item.status === "subscribed" ? "Active" : "Unsubscribed"}</small>
                </div>
              ))}
            </div>
          </section>
        </div>

        <footer className="newsletter-admin-footer">
          <span aria-live="polite">{notice || "Changes apply to the public footer after saving."}</span>
          <div>
            <button type="button" className="studio-button studio-button-quiet" onClick={onClose}>Close</button>
            <button type="button" className="studio-button studio-button-primary" disabled={saving} onClick={() => void save()}>
              {saving ? "Saving..." : "Save options"}
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}
