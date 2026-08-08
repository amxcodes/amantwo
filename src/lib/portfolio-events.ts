/**
 * Event handoff for deferred drawer islands.
 *
 * Cards can be interactive before BlogReader/ProjectDrawer finish their idle
 * hydration. Keep only the latest intent per event name so a first click is
 * never lost, without keeping a second data subscription alive.
 */
export type PortfolioEventName =
  | "portfolio:open-post"
  | "portfolio:prefetch-post"
  | "portfolio:open-project"
  | "portfolio:prefetch-project";

type PortfolioWindow = Window & {
  __portfolioEventReady?: Partial<Record<PortfolioEventName, boolean>>;
  __portfolioPendingEvents?: Partial<Record<PortfolioEventName, unknown>>;
};

const getWindow = () =>
  typeof window === "undefined" ? null : (window as PortfolioWindow);

export function emitPortfolioEvent<T>(name: PortfolioEventName, detail: T) {
  const target = getWindow();
  if (!target) return;

  target.dispatchEvent(new CustomEvent(name, { detail }));
  if (!target.__portfolioEventReady?.[name]) {
    const pending = target.__portfolioPendingEvents ?? {};
    pending[name] = detail;
    target.__portfolioPendingEvents = pending;
  }
}

export function listenPortfolioEvent<T>(
  name: PortfolioEventName,
  handler: (event: CustomEvent<T>) => void,
) {
  const target = getWindow();
  if (!target) return () => undefined;

  const wrapped = (event: Event) => handler(event as CustomEvent<T>);
  target.addEventListener(name, wrapped);
  const ready = target.__portfolioEventReady ?? {};
  ready[name] = true;
  target.__portfolioEventReady = ready;

  const pending = target.__portfolioPendingEvents?.[name];
  if (pending !== undefined) {
    delete target.__portfolioPendingEvents?.[name];
    queueMicrotask(() => handler(new CustomEvent(name, { detail: pending as T })));
  }

  return () => {
    target.removeEventListener(name, wrapped);
    if (target.__portfolioEventReady) target.__portfolioEventReady[name] = false;
  };
}
