export type StoryCardTone = "blue" | "orange" | "green" | "yellow";

export type StoryCardInput = {
  title: string;
  summary?: string;
  meta?: string;
  readingTime?: string;
  publishedLabel?: string;
  url: string;
  tone?: StoryCardTone;
  coverSrc?: string;
};

const tones: Record<
  StoryCardTone,
  { background: string; accent: string; ink: string }
> = {
  blue: { background: "#c8dced", accent: "#7899ba", ink: "#172235" },
  orange: { background: "#e86f3c", accent: "#f2b35e", ink: "#261b16" },
  green: { background: "#b8d28d", accent: "#6b8d64", ink: "#203126" },
  yellow: { background: "#f1d87f", accent: "#b98b36", ink: "#3d3218" },
};

const roundedRect = (
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) => {
  const r = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + r, y);
  context.arcTo(x + width, y, x + width, y + height, r);
  context.arcTo(x + width, y + height, x, y + height, r);
  context.arcTo(x, y + height, x, y, r);
  context.arcTo(x, y, x + width, y, r);
  context.closePath();
};

const wrapLines = (
  context: CanvasRenderingContext2D,
  value: string,
  maxWidth: number,
  maxLines: number,
) => {
  const words = value.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (line && context.measureText(next).width > maxWidth) {
      lines.push(line);
      line = word;
      if (lines.length === maxLines - 1) break;
    } else {
      line = next;
    }
  }
  if (line && lines.length < maxLines) lines.push(line);
  if (lines.length === maxLines && words.length > 0) {
    const last = lines[maxLines - 1] ?? "";
    lines[maxLines - 1] = `${last.replace(/[.,;:!?]+$/, "")}…`;
  }
  return lines;
};

const loadCover = async (source?: string) => {
  if (!source) return null;
  return new Promise<HTMLImageElement | null>((resolve) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = source;
  });
};

export async function createStoryCard(input: StoryCardInput): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = 1080;
  canvas.height = 1920;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Story card canvas is unavailable");

  const tone = tones[input.tone ?? "blue"];
  const cover = await loadCover(input.coverSrc);
  const padding = 64;

  context.fillStyle = "#f7f4ec";
  context.fillRect(0, 0, canvas.width, canvas.height);
  roundedRect(
    context,
    padding,
    padding,
    canvas.width - padding * 2,
    canvas.height - padding * 2,
    42,
  );
  context.fillStyle = tone.background;
  context.fill();

  if (cover) {
    context.save();
    roundedRect(
      context,
      padding + 28,
      padding + 28,
      canvas.width - (padding + 28) * 2,
      660,
      30,
    );
    context.clip();
    const scale = Math.max(
      (canvas.width - (padding + 28) * 2) / cover.width,
      660 / cover.height,
    );
    const width = cover.width * scale;
    const height = cover.height * scale;
    context.drawImage(
      cover,
      padding + 28 + (canvas.width - (padding + 28) * 2 - width) / 2,
      padding + 28 + (660 - height) / 2,
      width,
      height,
    );
    context.fillStyle = "rgb(23 34 53 / 14%)";
    context.fillRect(
      padding + 28,
      padding + 28,
      canvas.width - (padding + 28) * 2,
      660,
    );
    context.restore();
  } else {
    context.save();
    context.globalAlpha = 0.16;
    context.fillStyle = tone.accent;
    context.beginPath();
    context.arc(810, 300, 260, 0, Math.PI * 2);
    context.fill();
    context.restore();
  }

  const left = padding + 88;
  const textWidth = canvas.width - left - padding - 56;
  context.fillStyle = tone.ink;
  context.textBaseline = "top";
  context.font = "500 25px 'DM Mono', monospace";
  context.fillText(
    (input.meta || "A NOTE IN PROGRESS").toUpperCase().slice(0, 46),
    left,
    820,
  );

  context.font = "500 76px Inter, Arial, sans-serif";
  const titleLines = wrapLines(context, input.title, textWidth, 3);
  titleLines.forEach((line, index) =>
    context.fillText(line, left, 900 + index * 86),
  );

  context.font = "400 31px Inter, Arial, sans-serif";
  const summaryLines = wrapLines(
    context,
    input.summary || "A small note on products, systems, and moving images.",
    textWidth,
    5,
  );
  const summaryTop = 900 + titleLines.length * 86 + 44;
  summaryLines.forEach((line, index) =>
    context.fillText(line, left, summaryTop + index * 46),
  );

  const footerTop = 1660;
  context.fillStyle = tone.ink;
  context.globalAlpha = 0.78;
  context.font = "500 24px 'DM Mono', monospace";
  context.fillText(
    [input.readingTime, input.publishedLabel].filter(Boolean).join("  ·  "),
    left,
    footerTop,
  );
  context.globalAlpha = 0.65;
  context.font = "500 21px 'DM Mono', monospace";
  let shareLabel = "AMANANU.ME";
  try {
    const parsedUrl = new URL(input.url);
    shareLabel = `${parsedUrl.host}${parsedUrl.pathname}`
      .replace(/\/$/, "")
      .slice(0, 52);
  } catch {
    // Keep the branded fallback when a caller passes a non-URL value.
  }
  context.fillText(shareLabel.toUpperCase(), left, footerTop + 56);
  context.globalAlpha = 1;

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) =>
        blob ? resolve(blob) : reject(new Error("Story card export failed")),
      "image/png",
    );
  });
}
