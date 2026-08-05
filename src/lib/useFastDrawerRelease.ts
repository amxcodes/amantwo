import type { PointerEventHandler } from "react";
import { useRef } from "react";

type PointerStart = {
  id: number;
  y: number;
  time: number;
};

/**
 * Keeps fast touch dismissals from feeling like they briefly pause at the
 * release point. Vaul still owns the gesture and decides whether a release
 * closes the sheet; this only marks a high-velocity downward release so CSS
 * can use a shorter hand-off animation for that one transition.
 */
export function useFastDrawerRelease() {
  const pointerStart = useRef<PointerStart | null>(null);

  const onPointerDown: PointerEventHandler<HTMLElement> = (event) => {
    if (event.pointerType === "mouse") return;
    event.currentTarget.removeAttribute("data-vaul-fast-release");
    pointerStart.current = {
      id: event.pointerId,
      y: event.pageY,
      time: performance.now(),
    };
  };

  const onPointerUp: PointerEventHandler<HTMLElement> = (event) => {
    const start = pointerStart.current;
    pointerStart.current = null;
    if (!start || start.id !== event.pointerId) return;

    const distance = event.pageY - start.y;
    const elapsed = Math.max(1, performance.now() - start.time);
    const velocity = distance / elapsed;

    // Match Vaul's downward dismissal direction, but require a meaningful
    // movement so a quick tap never changes the drawer's animation timing.
    if (distance < 28 || velocity < 0.7) return;

    const drawer = event.currentTarget;
    drawer.setAttribute("data-vaul-fast-release", "true");
    window.setTimeout(() => {
      if (drawer.isConnected) drawer.removeAttribute("data-vaul-fast-release");
    }, 520);
  };

  const onPointerCancel: PointerEventHandler<HTMLElement> = () => {
    pointerStart.current = null;
  };

  return { onPointerDown, onPointerUp, onPointerCancel };
}
