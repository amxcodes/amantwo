import { ConvexProvider, ConvexReactClient, useMutation, useQuery } from "convex/react";
import { useMemo, useState, type SyntheticEvent } from "react";
import { api } from "../../convex/_generated/api";

type Props = {
  convexUrl?: string;
  fallbackEmail: string;
};

function NewsletterFormInner({ fallbackEmail }: Pick<Props, "fallbackEmail">) {
  const settings = useQuery(api.newsletter.getPublicSettings);
  const subscribe = useMutation(api.newsletter.subscribe);
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "saving" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  if (settings?.enabled === false) return null;

  const submit = async (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    setState("saving");
    setMessage("");
    try {
      const result = await subscribe({ email, source: "footer" });
      setEmail("");
      setState("success");
      setMessage(
        result.status === "alreadySubscribed"
          ? "You're already on the list."
          : settings?.successMessage ?? "You're on the list.",
      );
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : "Could not join the list.");
    }
  };

  return (
    <div className="signature-footer-subscribe-wrap" aria-label={settings?.title ?? "Newsletter"}>
      <p className="signature-footer-message">
        {settings?.description ?? "A small, occasional note on products, systems, and moving images."}
      </p>
      <form className="signature-footer-subscribe" onSubmit={submit}>
        <label className="sr-only" htmlFor="footer-email">Email address</label>
        <input
          id="footer-email"
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          placeholder={settings?.placeholder ?? "Email address"}
          value={email}
          onChange={(event) => {
            setEmail(event.target.value);
            if (state !== "idle") {
              setState("idle");
              setMessage("");
            }
          }}
          required
        />
        <button type="submit" disabled={state === "saving"}>
          {state === "saving" ? "Joining..." : settings?.buttonLabel ?? "Join"}
          <span aria-hidden="true"> ↗</span>
        </button>
      </form>
      {message ? (
        <p className={`signature-footer-subscribe-status is-${state}`} role={state === "error" ? "alert" : "status"}>
          {message}
        </p>
      ) : null}
      <span className="sr-only">Fallback contact: {fallbackEmail}</span>
    </div>
  );
}

export default function NewsletterForm({ convexUrl, fallbackEmail }: Props) {
  const client = useMemo(
    () => (convexUrl ? new ConvexReactClient(convexUrl) : null),
    [convexUrl],
  );

  // Preserve the old mail contact path if a deployment URL is unavailable.
  if (!client) {
    return (
      <div className="signature-footer-subscribe-wrap" aria-label="Newsletter">
        <p className="signature-footer-message">A small, occasional note on products, systems, and moving images.</p>
        <form className="signature-footer-subscribe" action={`mailto:${fallbackEmail}?subject=Newsletter%20subscription`} method="post" encType="text/plain">
          <label className="sr-only" htmlFor="footer-email">Email address</label>
          <input id="footer-email" name="email" type="email" autoComplete="email" inputMode="email" placeholder="Email address" required />
          <button type="submit">Join <span aria-hidden="true"> ↗</span></button>
        </form>
      </div>
    );
  }

  return (
    <ConvexProvider client={client}>
      <NewsletterFormInner fallbackEmail={fallbackEmail} />
    </ConvexProvider>
  );
}
