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
    "[data-reveal='section']:not([data-github-activity])",
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

  const slots = ["lead", "stack", "feature", "wide"];
  const cards = Array.from(
    section.querySelectorAll<HTMLElement>("[data-project-card]"),
  );
  const pages = Array.from(
    section.querySelectorAll<HTMLElement>("[data-project-page]"),
  );
  const filters = Array.from(
    section.querySelectorAll<HTMLButtonElement>("[data-project-filter]"),
  );
  const sortCycle = section.querySelector<HTMLButtonElement>(
    "[data-project-sort-cycle]",
  );
  const sortLabel = section.querySelector<HTMLElement>(
    "[data-project-sort-label]",
  );
  const previousPage = section.querySelector<HTMLButtonElement>(
    "[data-project-page-previous]",
  );
  const nextPage = section.querySelector<HTMLButtonElement>(
    "[data-project-page-next]",
  );
  const dots = section.querySelector<HTMLElement>(
    "[data-project-pagination-dots]",
  );
  const position = section.querySelector<HTMLElement>(
    "[data-project-position]",
  );
  let frame = 0;
  let activeFilter = "all";
  const sortModes = [
    { value: "featured", label: "Featured" },
    { value: "title", label: "A–Z" },
    { value: "category", label: "Type" },
  ] as const;
  let sortMode: (typeof sortModes)[number]["value"] = "featured";

  const visibleCards = () => {
    const filtered = cards.filter((card) => {
      const categories = card.dataset.categories?.split(" ") ?? [];
      return activeFilter === "all" || categories.includes(activeFilter);
    });

    return filtered.toSorted((a, b) => {
      if (sortMode === "title") {
        return (a.dataset.projectTitle ?? "").localeCompare(
          b.dataset.projectTitle ?? "",
        );
      }
      if (sortMode === "category") {
        return (a.dataset.projectPrimaryCategory ?? "").localeCompare(
          b.dataset.projectPrimaryCategory ?? "",
        );
      }
      return Number(a.dataset.projectIndex) - Number(b.dataset.projectIndex);
    });
  };

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
    const active = available.length ? activePageIndex(available) : 0;
    if (position) position.textContent = `${active + 1} / ${available.length}`;
    if (previousPage) previousPage.disabled = active <= 0;
    if (nextPage) nextPage.disabled = active >= available.length - 1;
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

  const changePage = (direction: -1 | 1) => {
    const available = visiblePages();
    if (!available.length) return;
    const nextIndex = Math.min(
      available.length - 1,
      Math.max(0, activePageIndex(available) + direction),
    );
    scrollToPage(available[nextIndex]);
  };

  const arrangeProjects = () => {
    const arranged = visibleCards();
    cards.forEach((card) => {
      card.hidden = true;
    });
    pages.forEach((page) => {
      page.replaceChildren();
      page.hidden = true;
      page.dataset.projectCount = "0";
    });
    arranged.forEach((card, index) => {
      const page = pages[Math.floor(index / slots.length)];
      if (!page) return;
      const slot = slots[index % slots.length] ?? "wide";
      card.hidden = false;
      card.classList.remove(
        "bento-slot-lead",
        "bento-slot-stack",
        "bento-slot-feature",
        "bento-slot-wide",
      );
      card.classList.add(`bento-slot-${slot}`);
      page.hidden = false;
      page.dataset.projectCount = String(page.children.length + 1);
      page.append(card);
    });
    filters.forEach((button) => {
      button.setAttribute(
        "aria-pressed",
        String((button.dataset.projectFilter ?? "all") === activeFilter),
      );
    });
    scroller.scrollTo({
      left: 0,
      behavior: reducedMotion.matches ? "auto" : "smooth",
    });
    renderDots();
    requestPagination();
  };

  for (const filter of filters) {
    filter.addEventListener("click", () => {
      activeFilter = filter.dataset.projectFilter ?? "all";
      arrangeProjects();
    });
  }

  sortCycle?.addEventListener("click", () => {
    const currentIndex = sortModes.findIndex((mode) => mode.value === sortMode);
    const nextMode = sortModes[(currentIndex + 1) % sortModes.length];
    sortMode = nextMode.value;
    if (sortLabel) sortLabel.textContent = nextMode.label;
    sortCycle.setAttribute(
      "aria-label",
      `Change project order. Currently ${nextMode.label}.`,
    );
    arrangeProjects();
  });
  previousPage?.addEventListener("click", () => changePage(-1));
  nextPage?.addEventListener("click", () => changePage(1));

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

  scroller.addEventListener("scroll", requestPagination, { passive: true });
  new ResizeObserver(requestPagination).observe(scroller);
  arrangeProjects();
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

function setupChronicleDetails() {
  const roots = document.querySelectorAll<HTMLElement>(
    "[data-chronicle-detail]",
  );
  roots.forEach((root) => {
    const triggers = root.querySelectorAll<HTMLButtonElement>(
      "[data-chronicle-trigger]",
    );
    const preview = root.querySelector<HTMLElement>("[data-chronicle-preview]");
    if (!triggers.length || !preview) return;

    const previewMeta = preview.querySelector<HTMLElement>(
      "[data-chronicle-preview-meta]",
    );
    const previewTitle = preview.querySelector<HTMLElement>(
      "[data-chronicle-preview-title]",
    );
    const previewDetail = preview.querySelector<HTMLElement>(
      "[data-chronicle-preview-detail]",
    );

    let closeTimer = 0;
    let activeTrigger: HTMLButtonElement | undefined;
    const positionPreview = (trigger?: HTMLButtonElement) => {
      if (!trigger || !precisePointer.matches) {
        preview.style.removeProperty("left");
        preview.style.removeProperty("top");
        return;
      }

      const triggerBounds = trigger.getBoundingClientRect();
      const previewBounds = preview.getBoundingClientRect();
      const gutter = 12;
      const spaceAbove = triggerBounds.top - gutter;
      const spaceBelow = window.innerHeight - triggerBounds.bottom - gutter;
      const showBelow =
        spaceAbove < previewBounds.height + 12 &&
        spaceBelow > previewBounds.height + 12;
      const left = Math.min(
        Math.max(gutter, triggerBounds.left),
        window.innerWidth - previewBounds.width - gutter,
      );
      const top = showBelow
        ? Math.min(
            window.innerHeight - previewBounds.height - gutter,
            triggerBounds.bottom + 10,
          )
        : Math.max(gutter, triggerBounds.top - previewBounds.height - 10);

      preview.style.left = `${left}px`;
      preview.style.top = `${top}px`;
      preview.dataset.placement = showBelow ? "below" : "above";
    };
    const setOpen = (open: boolean, trigger?: HTMLButtonElement) => {
      window.clearTimeout(closeTimer);
      if (open && trigger) {
        activeTrigger = trigger;
        if (previewMeta) {
          previewMeta.textContent = trigger.dataset.chroniclePreviewMeta ?? "";
        }
        if (previewTitle) {
          previewTitle.textContent =
            trigger.dataset.chroniclePreviewTitle ?? "";
        }
        if (previewDetail) {
          previewDetail.textContent =
            trigger.dataset.chroniclePreviewDetail ?? "";
        }
        positionPreview(trigger);
      }
      if (!open) activeTrigger = undefined;
      root.dataset.open = String(open);
      preview.setAttribute("aria-hidden", String(!open));
      triggers.forEach((trigger) => {
        trigger.setAttribute(
          "aria-expanded",
          String(open && trigger === activeTrigger),
        );
      });
    };
    const scheduleClose = () => {
      closeTimer = window.setTimeout(() => setOpen(false), 90);
    };

    root.addEventListener("pointerleave", () => {
      if (precisePointer.matches) scheduleClose();
    });
    triggers.forEach((trigger) => {
      trigger.addEventListener("pointerenter", () => {
        if (precisePointer.matches) setOpen(true, trigger);
      });
      trigger.addEventListener("focus", () => setOpen(true, trigger));
      trigger.addEventListener("blur", scheduleClose);
      trigger.addEventListener("click", () => {
        if (precisePointer.matches) return;

        window.dispatchEvent(
          new CustomEvent("portfolio:open-chronicle-detail", {
            detail: {
              title: trigger.dataset.chroniclePreviewTitle ?? "More detail",
              detail: trigger.dataset.chroniclePreviewDetail ?? "",
              meta: trigger.dataset.chroniclePreviewMeta ?? "",
              tone: trigger.classList.contains("tone-orange")
                ? "orange"
                : trigger.classList.contains("tone-yellow")
                  ? "yellow"
                  : trigger.classList.contains("tone-green")
                    ? "green"
                    : "blue",
            },
          }),
        );
      });
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") setOpen(false);
    });
    document.addEventListener("pointerdown", (event) => {
      if (!root.contains(event.target as Node)) setOpen(false);
    });
  });
}

function setupEdgeScrollRail() {
  const rail = document.querySelector<HTMLElement>("[data-edge-scroll-rail]");
  if (!rail || !precisePointer.matches) return;

  const sections = Array.from(
    document.querySelectorAll<HTMLElement>("[data-scroll-label][id]"),
  );
  if (sections.length < 2) return;

  const buttons = sections.map((section, index) => {
    const button = document.createElement("button");
    const marker = document.createElement("span");
    const label = document.createElement("span");
    const title = section.dataset.scrollLabel ?? `Section ${index + 1}`;
    button.type = "button";
    button.className = "edge-scroll-rail-item";
    button.dataset.edgeScrollItem = section.id;
    button.style.setProperty("--rail-scale", index === 0 ? "1" : "0.25");
    button.setAttribute("aria-label", `Scroll to ${title}`);
    button.setAttribute("aria-current", String(index === 0));
    marker.className = "edge-scroll-rail-marker";
    label.className = "edge-scroll-rail-label";
    label.textContent = title;
    button.append(marker, label);
    button.addEventListener("click", () => {
      section.scrollIntoView({
        block: "start",
        behavior: reducedMotion.matches ? "auto" : "smooth",
      });
    });
    button.addEventListener("pointerenter", () => updateRail(index));
    button.addEventListener("focus", () => updateRail(index));
    return button;
  });

  let activeIndex = 0;
  let hoverIndex = -1;
  let frame = 0;

  const applyRailState = (displayedIndex = hoverIndex) => {
    buttons.forEach((button, index) => {
      const selected = index === activeIndex;
      const highlighted =
        index === displayedIndex || (displayedIndex < 0 && selected);
      const distance =
        displayedIndex < 0
          ? Math.abs(index - activeIndex)
          : Math.abs(index - displayedIndex);
      const scale = highlighted
        ? 1
        : distance === 1
          ? 0.68
          : distance === 2
            ? 0.44
            : 0.25;
      button.style.setProperty("--rail-scale", scale.toFixed(2));
      button.setAttribute("aria-current", String(selected));
    });
  };

  const updateRail = (index: number) => {
    hoverIndex = index;
    applyRailState(index);
  };

  const updateActiveSection = () => {
    frame = 0;
    const viewportPoint = window.innerHeight * 0.45;
    activeIndex = sections.reduce((closest, section, index) => {
      const currentDistance = Math.abs(
        section.getBoundingClientRect().top - viewportPoint,
      );
      const closestDistance = Math.abs(
        sections[closest].getBoundingClientRect().top - viewportPoint,
      );
      return currentDistance < closestDistance ? index : closest;
    }, 0);
    applyRailState();
  };

  const requestActiveSection = () => {
    if (!frame) frame = window.requestAnimationFrame(updateActiveSection);
  };

  rail.addEventListener("pointerleave", () => {
    hoverIndex = -1;
    applyRailState();
  });
  rail.addEventListener("blur", (event) => {
    if (!rail.contains(event.relatedTarget as Node)) {
      hoverIndex = -1;
      applyRailState();
    }
  });

  rail.replaceChildren(...buttons);
  rail.dataset.ready = "true";
  window.addEventListener("scroll", requestActiveSection, { passive: true });
  window.addEventListener("resize", requestActiveSection, { passive: true });
  updateActiveSection();
}

function setYear() {
  const year = document.querySelector<HTMLElement>("[data-year]");
  if (year) year.textContent = String(new Date().getFullYear());
}

setupReveals();
setupChromaticText();
setupPortrait();
setupChronicleDetails();
setupProjects();
setupEdgeScrollRail();
setYear();
