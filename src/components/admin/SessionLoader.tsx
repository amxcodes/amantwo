import "./session-loader.css";

type SessionLoaderProps = {
  message?: string;
  detail?: string;
  className?: string;
};

/**
 * A small, self-contained loading scene for auth/data gates.
 * Keeping the illustration inline means it has no network request, font,
 * image, or animation-runtime dependency while the session is resolving.
 */
export default function SessionLoader({
  message = "Checking secure session…",
  detail = "Aman Studio is getting things ready",
  className = "",
}: SessionLoaderProps) {
  return (
    <main
      className={`session-loader ${className}`.trim()}
      aria-busy="true"
      aria-live="polite"
    >
      <div className="session-loader-inner">
        <p className="session-loader-brand">AMAN STUDIO</p>
        <div className="session-loader-mark" aria-hidden="true">
          <svg
            className="session-loader-art"
            viewBox="0 0 220 140"
            role="presentation"
          >
            <g className="session-loader-tile">
              <rect x="45" y="25" width="130" height="90" rx="27" />
              <path className="session-loader-tile-edge" d="M151 26v20h21" />
              <path className="session-loader-rule" d="M66 91h35M66 100h22" />
              <path className="session-loader-ink" d="M113 78c8-18 14-27 22-27 9 0 9 18 17 18 7 0 9-11 17-11" />
              <circle className="session-loader-ink-dot" cx="170" cy="58" r="3" />
            </g>
          </svg>
        </div>
        <div className="session-loader-copy">
          <strong>{message}</strong>
          <span>{detail}</span>
        </div>
      </div>
    </main>
  );
}
