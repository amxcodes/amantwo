/**
 * Keep the public page paint-first. Motion is intentionally loaded after the
 * browser has an idle slot; the motion module still owns the exact same
 * reveal and interaction setup once it arrives.
 */
const loadMotion = () => {
  void import("./motion");
};

const idle = (
  window as Window & {
    requestIdleCallback?: (
      callback: () => void,
      options?: { timeout: number },
    ) => number;
  }
).requestIdleCallback;
if (idle) {
  idle(loadMotion, { timeout: 900 });
} else {
  window.setTimeout(loadMotion, 160);
}
