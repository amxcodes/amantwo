import { animate, inView, stagger } from "motion";

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const precisePointer = window.matchMedia(
  "(pointer: fine) and (min-width: 769px)",
);

function setupReveals() {
  if (reducedMotion.matches) {
    document.documentElement.dataset.motion = "reduced";
    return;
  }

  animate(
    document.querySelectorAll<HTMLElement>(
      "[data-reveal='hero'], [data-reveal='header']",
    ),
    { opacity: [0, 1], transform: ["translateY(10px)", "translateY(0px)"] },
    { duration: 0.42, delay: stagger(0.06), ease: [0.22, 1, 0.36, 1] },
  );

  inView(
    "[data-reveal='section']",
    (element) => {
      animate(
        element,
        { opacity: [0, 1], transform: ["translateY(10px)", "translateY(0px)"] },
        { duration: 0.38, ease: [0.22, 1, 0.36, 1] },
      );
    },
    { margin: "0px 0px -8% 0px" },
  );

  inView(
    ".project-scroller",
    () => {
      animate(
        document.querySelectorAll<HTMLElement>("[data-reveal='project']"),
        { opacity: [0, 1], transform: ["translateY(12px)", "translateY(0px)"] },
        { duration: 0.42, delay: stagger(0.045), ease: [0.22, 1, 0.36, 1] },
      );
    },
    { margin: "0px 0px -6% 0px" },
  );
}

function parseData<T>(value?: string): T | undefined {
  try {
    return value ? (JSON.parse(value) as T) : undefined;
  } catch {
    return undefined;
  }
}

function setupProjects() {
  const section = document.querySelector<HTMLElement>("[data-project-section]");
  const scroller = section?.querySelector<HTMLElement>(
    "[data-project-scroller]",
  );
  if (!section || !scroller) return;

  const cards = Array.from(
    section.querySelectorAll<HTMLElement>("[data-project-card]"),
  );
  const pages = Array.from(
    section.querySelectorAll<HTMLElement>("[data-project-page]"),
  );
  const filters = Array.from(
    section.querySelectorAll<HTMLButtonElement>("[data-project-filter]"),
  );
  const dots = section.querySelector<HTMLElement>(
    "[data-project-pagination-dots]",
  );
  const position = section.querySelector<HTMLElement>(
    "[data-project-position]",
  );
  let frame = 0;
  let lastPageChange = 0;

  const visiblePages = () => pages.filter((page) => !page.hidden);
  const activePageIndex = (available = visiblePages()) =>
    available.reduce(
      (closest, page, index) =>
        Math.abs(page.offsetLeft - scroller.scrollLeft) <
        Math.abs(available[closest]?.offsetLeft - scroller.scrollLeft)
          ? index
          : closest,
      0,
    );
  const scrollToPage = (page: HTMLElement) =>
    scroller.scrollTo({
      left: page.offsetLeft,
      behavior: reducedMotion.matches ? "auto" : "smooth",
    });
  const updatePagination = () => {
    frame = 0;
    const available = visiblePages();
    const active = activePageIndex(available);
    if (position)
      position.textContent = `${available.length ? active + 1 : 0} / ${available.length}`;
    dots
      ?.querySelectorAll<HTMLButtonElement>("[data-project-page-dot]")
      .forEach((dot, index) => {
        dot.setAttribute("aria-current", String(index === active));
      });
  };
  const requestPagination = () => {
    if (!frame) frame = window.requestAnimationFrame(updatePagination);
  };
  const renderDots = () => {
    if (!dots) return;
    dots.replaceChildren(
      ...visiblePages().map((page, index) => {
        const dot = document.createElement("button");
        dot.type = "button";
        dot.dataset.projectPageDot = String(index);
        dot.setAttribute("aria-label", `Go to project page ${index + 1}`);
        dot.addEventListener("click", () => scrollToPage(page));
        return dot;
      }),
    );
  };

  for (const filter of filters) {
    filter.addEventListener("click", () => {
      const value = filter.dataset.projectFilter ?? "all";
      for (const card of cards) {
        const categories = card.dataset.categories?.split(" ") ?? [];
        card.hidden =
          value !== "all" &&
          !(value === "about" && card.hasAttribute("data-project-about")) &&
          !categories.includes(value);
      }
      for (const page of pages) {
        page.hidden =
          value !== "all" &&
          !Array.from(
            page.querySelectorAll<HTMLElement>("[data-project-card]"),
          ).some((card) => !card.hidden);
      }
      for (const button of filters)
        button.setAttribute("aria-pressed", String(button === filter));
      scroller.scrollTo({
        left: 0,
        behavior: reducedMotion.matches ? "auto" : "smooth",
      });
      renderDots();
      requestPagination();
    });
  }

  section
    .querySelectorAll<HTMLButtonElement>("[data-project-open]")
    .forEach((button) => {
      button.addEventListener("click", () => {
        const card = button.closest<HTMLElement>("[data-project-card]");
        if (!card) return;
        window.dispatchEvent(
          new CustomEvent("portfolio:open-project", {
            detail: {
              eyebrow: card.dataset.projectEyebrow,
              title: card.dataset.projectTitle,
              summary: card.dataset.projectSummary,
              caseStudy: card.dataset.projectCaseStudy,
              meta: card.dataset.projectMeta,
              status: card.dataset.projectStatus,
              tags: parseData<string[]>(card.dataset.projectTags),
              links: parseData<Record<string, string>>(
                card.dataset.projectLinks,
              ),
              media: card.dataset.projectMedia
                ? {
                    type: card.dataset.projectMediaType,
                    src: card.dataset.projectMedia,
                    alt: card.dataset.projectMediaLabel,
                  }
                : undefined,
            },
          }),
        );
      });
    });

  section.addEventListener(
    "wheel",
    (event) => {
      if (
        reducedMotion.matches ||
        !precisePointer.matches ||
        Math.abs(event.deltaY) <= Math.abs(event.deltaX)
      )
        return;
      const bounds = section.getBoundingClientRect();
      if (
        bounds.top > window.innerHeight * 0.18 ||
        bounds.bottom < window.innerHeight * 0.72
      )
        return;
      const available = visiblePages();
      const next =
        available[activePageIndex(available) + Math.sign(event.deltaY)];
      if (!next) return;
      event.preventDefault();
      if (Date.now() - lastPageChange < 520) return;
      lastPageChange = Date.now();
      scrollToPage(next);
    },
    { passive: false },
  );
  scroller.addEventListener("scroll", requestPagination, { passive: true });
  new ResizeObserver(requestPagination).observe(scroller);
  renderDots();
  updatePagination();
}

function setupChromaticText() {
  document
    .querySelectorAll<HTMLElement>("[data-chromatic-text]")
    .forEach((root) => {
      const active = root.querySelector<HTMLElement>("[data-chromatic-active]");
      if (!active) return;
      const words = parseData<string[]>(root.dataset.words) ?? [];
      if (!words.length) return;
      let index = 0;
      const reveal = () => {
        const word = words[index % words.length] ?? "";
        active.textContent = word;
        root.setAttribute("aria-label", word);
        if (reducedMotion.matches) return;
        animate(
          active,
          {
            "--chromatic-sweep": ["-14%", "114%"],
            opacity: [0.86, 1],
            transform: ["translateY(2px)", "translateY(0px)"],
          },
          { duration: 1.1, ease: [0.22, 1, 0.36, 1] },
        );
        window.setTimeout(() => {
          if (words.length < 2) return;
          animate(
            active,
            {
              opacity: [1, 0],
              transform: ["translateY(0px)", "translateY(-3px)"],
            },
            { duration: 0.18, ease: [0.4, 0, 1, 1] },
          ).then(() => {
            index = (index + 1) % words.length;
            reveal();
          });
        }, 5200);
      };
      reveal();
    });
}

function setupPortrait() {
  const root = document.querySelector<HTMLElement>("[data-portrait-root]");
  const trigger = root?.querySelector<HTMLButtonElement>(
    "[data-portrait-trigger]",
  );
  if (!root || !trigger) return;
  trigger
    .querySelector<HTMLImageElement>("[data-avatar-image]")
    ?.addEventListener("error", (event) => {
      (event.currentTarget as HTMLImageElement).hidden = true;
    });
  if (root.dataset.hasPreview !== "true") return;
  let closeTimer = 0;
  const setOpen = (open: boolean) => {
    window.clearTimeout(closeTimer);
    root.dataset.open = String(open);
    trigger.setAttribute("aria-expanded", String(open));
  };
  const scheduleClose = () => {
    closeTimer = window.setTimeout(() => setOpen(false), 80);
  };
  root.addEventListener(
    "pointerenter",
    () => precisePointer.matches && setOpen(true),
  );
  root.addEventListener(
    "pointerleave",
    () => precisePointer.matches && scheduleClose(),
  );
  trigger.addEventListener(
    "focus",
    () => precisePointer.matches && setOpen(true),
  );
  trigger.addEventListener("blur", scheduleClose);
  trigger.addEventListener("click", () =>
    precisePointer.matches
      ? setOpen(true)
      : setOpen(root.dataset.open !== "true"),
  );
  document.addEventListener(
    "keydown",
    (event) => event.key === "Escape" && setOpen(false),
  );
  document.addEventListener(
    "pointerdown",
    (event) => !root.contains(event.target as Node) && setOpen(false),
  );
}

function setYear() {
  const year = document.querySelector<HTMLElement>("[data-year]");
  if (year) year.textContent = String(new Date().getFullYear());
}

setupReveals();
setupChromaticText();
setupPortrait();
setupProjects();
setYear();
