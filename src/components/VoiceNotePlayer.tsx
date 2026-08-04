import { useEffect, useRef, useState, type CSSProperties } from "react";
import { motion, useReducedMotion } from "motion/react";

type Props = {
  src?: string;
  label?: string;
  transcript?: string;
  links?: Array<{ label: string; href: string }>;
};

const formatTime = (value: number) => {
  if (!Number.isFinite(value) || value <= 0) return "0:00";
  const minutes = Math.floor(value / 60);
  const seconds = Math.floor(value % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
};

const readableLabel = (value?: string) => {
  const candidate = value?.trim();
  if (!candidate || /\.[a-z0-9]{2,5}$/i.test(candidate) || /\d{6,}/.test(candidate)) {
    return "Voice note";
  }
  return candidate;
};

// Deliberately small and irregular: it reads as a waveform without turning an
// inline voice note into a full audio player. The bars are animated by Motion
// only while playback is active, so idle pages do not spend animation budget.
const waveHeights = [34, 58, 46, 74, 40, 66, 52, 82, 44, 70, 38, 60, 48, 76, 42];

export default function VoiceNotePlayer({ src, label, transcript, links }: Props) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const reducedMotion = useReducedMotion();
  const progress = duration > 0 ? (current / duration) * 100 : 0;
  const remaining = duration > 0 ? `−${formatTime(Math.max(0, duration - current))}` : "—:—";

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const syncDuration = () => setDuration(Number.isFinite(audio.duration) ? audio.duration : 0);
    const syncTime = () => setCurrent(audio.currentTime);
    const reset = () => {
      setPlaying(false);
      setCurrent(0);
    };

    audio.addEventListener("loadedmetadata", syncDuration);
    audio.addEventListener("durationchange", syncDuration);
    audio.addEventListener("timeupdate", syncTime);
    audio.addEventListener("ended", reset);
    return () => {
      audio.removeEventListener("loadedmetadata", syncDuration);
      audio.removeEventListener("durationchange", syncDuration);
      audio.removeEventListener("timeupdate", syncTime);
      audio.removeEventListener("ended", reset);
    };
  }, [src]);

  const togglePlayback = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      void audio.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
    } else {
      audio.pause();
      setPlaying(false);
    }
  };

  const seek = (value: number) => {
    const audio = audioRef.current;
    if (!audio || !Number.isFinite(value)) return;
    audio.currentTime = value;
    setCurrent(value);
  };

  return (
    <div
      className="article-audio-attachment-row"
      data-vaul-no-drag
      onPointerDown={(event) => event.stopPropagation()}
    >
      <figure
        className={`article-audio-control${playing ? " is-playing" : ""}`}
        style={{ "--audio-progress": `${progress}%` } as CSSProperties}
      >
      {/* The native element remains in the DOM for reliable media semantics; the
          visible controls are deliberately custom so they stay compact across browsers. */}
      {/* biome-ignore lint/a11y/useMediaCaption: voice notes may provide an optional transcript below. */}
      <audio ref={audioRef} src={src} preload="metadata" />
      <button
        className="article-audio-control-play"
        type="button"
        data-vaul-no-drag
        onClick={togglePlayback}
        aria-label={`${playing ? "Pause" : "Play"} ${readableLabel(label)}`}
      >
        <span aria-hidden="true">{playing ? "Ⅱ" : "▶"}</span>
      </button>
      <div className="article-audio-control-main">
        <figcaption className="article-audio-control-copy">
          <span>NARRATION</span>
          <strong>{readableLabel(label)}</strong>
        </figcaption>
        <div className="article-audio-control-track">
          <div className="article-audio-control-wave" aria-hidden="true">
            {waveHeights.map((height, index) => {
              const barProgress = (index / (waveHeights.length - 1)) * 100;
              const played = progress >= barProgress;
              return (
                <motion.i
                  key={`${height}-${index}`}
                  className={played ? "is-played" : undefined}
                  style={{ height: `${height}%` }}
                  animate={playing && !reducedMotion ? { scaleY: [0.72, 1, 0.82] } : { scaleY: 1 }}
                  transition={
                    playing && !reducedMotion
                      ? {
                          duration: 1.05,
                          delay: index * 0.035,
                          repeat: Infinity,
                          repeatType: "mirror",
                          ease: "easeInOut",
                        }
                      : { duration: 0.16, ease: "easeOut" }
                  }
                />
              );
            })}
          </div>
          <input
            className="article-audio-control-range"
            type="range"
            data-vaul-no-drag
            min="0"
            max={duration || 0}
            step="0.01"
            value={Math.min(current, duration || current)}
            onChange={(event) => seek(Number(event.currentTarget.value))}
            aria-label="Seek through voice note"
            disabled={!duration}
          />
          <time className="article-audio-control-time" dateTime={`PT${Math.round(Math.max(0, duration - current))}S`}>
            {remaining}
          </time>
        </div>
      </div>
      {transcript ? (
        <details
          className="article-audio-control-transcript"
          data-vaul-no-drag
        >
          <summary data-vaul-no-drag>Transcript</summary>
          <p>{transcript}</p>
        </details>
      ) : null}
      </figure>
      {links?.length ? (
        <nav
          className="article-audio-attachment-links"
          aria-label="Attached links"
          data-vaul-no-drag
        >
          {links.slice(0, 3).map((link) => (
            <a
              key={link.href}
              href={link.href}
              target="_blank"
              rel="noreferrer"
              data-vaul-no-drag
            >
              <span aria-hidden="true">↗</span>{link.label}
            </a>
          ))}
        </nav>
      ) : null}
    </div>
  );
}
