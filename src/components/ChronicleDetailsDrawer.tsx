import { useEffect, useState } from "react";
import { Drawer } from "vaul";

type ChronicleDetail = {
  title: string;
  detail: string;
  meta: string;
  tone: "blue" | "orange" | "yellow" | "green";
};

export default function ChronicleDetailsDrawer() {
  const [detail, setDetail] = useState<ChronicleDetail | null>(null);

  useEffect(() => {
    const openDetail = (event: Event) => {
      setDetail((event as CustomEvent<ChronicleDetail>).detail);
    };

    window.addEventListener("portfolio:open-chronicle-detail", openDetail);
    return () =>
      window.removeEventListener("portfolio:open-chronicle-detail", openDetail);
  }, []);

  return (
    <Drawer.Root
      open={Boolean(detail)}
      closeThreshold={0.22}
      onOpenChange={(open) => {
        if (!open) setDetail(null);
      }}
    >
      <Drawer.Portal>
        <Drawer.Overlay className="chronicle-drawer-overlay" />
        <Drawer.Content
          className="chronicle-drawer"
          aria-describedby="chronicle-drawer-description"
        >
          <section
            className="chronicle-drawer-panel"
            aria-label="Entry details"
          >
            <div className="drawer-drag-handle" aria-hidden="true">
              <span className="drawer-handle" aria-hidden="true" />
            </div>
            <div className="chronicle-drawer-content">
              <p className="chronicle-drawer-meta">{detail?.meta}</p>
              <Drawer.Title>{detail?.title}</Drawer.Title>
              <Drawer.Description id="chronicle-drawer-description">
                {detail?.detail}
              </Drawer.Description>
            </div>
          </section>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
