import type { TargetAndTransition } from "motion/react";
import { motion, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";

interface FooterSignatureProps {
  name: string;
  sectionId: string;
}

const hiddenStroke: TargetAndTransition = {
  pathLength: 0,
  opacity: 0,
};

const visibleStroke: TargetAndTransition = {
  pathLength: 1,
  opacity: 1,
};

const capitalA =
  "M18 187C48 169 68 134 86 98C105 60 118 22 135 10C147 2 158 10 164 26C172 47 174 78 178 109C183 145 189 174 202 188";

const connectedMan =
  "M67 143C105 130 145 126 180 129C188 131 193 138 195 149C198 162 196 177 202 187C207 195 216 190 220 176C224 159 224 139 227 122C230 105 235 96 242 97C251 98 254 111 251 127C248 144 243 164 247 179C250 190 260 193 269 184C281 171 284 147 288 126C292 106 298 96 307 97C318 99 319 115 315 133C311 151 309 173 317 184C325 195 340 187 351 171C359 147 371 117 393 107C412 99 427 111 426 132C425 158 410 188 391 191C374 194 362 179 366 158C370 137 387 122 407 123C423 124 430 140 426 158C422 176 426 190 438 191C453 192 465 174 472 154C477 135 480 116 482 101C490 112 495 130 493 150C491 169 490 185 499 190C510 197 523 186 530 169C539 148 542 119 553 104C560 94 570 95 576 104C584 117 580 137 577 153C574 171 576 186 588 190C600 194 615 183 632 165";

export function FooterSignature({ name, sectionId }: FooterSignatureProps) {
  const [hasPlayed, setHasPlayed] = useState(false);
  const hasReducedMotion = useReducedMotion();
  const isVisible = hasPlayed || hasReducedMotion;

  useEffect(() => {
    if (hasReducedMotion) {
      setHasPlayed(true);
      return;
    }

    const section = document.getElementById(sectionId);
    if (!section) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.intersectionRatio >= 0.75) {
          setHasPlayed(true);
          observer.disconnect();
        }
      },
      { threshold: [0, 0.75, 1] },
    );

    observer.observe(section);
    return () => observer.disconnect();
  }, [hasReducedMotion, sectionId]);

  return (
    <div className="signature-footer-reveal">
      <span className="sr-only">{name}</span>
      <motion.svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="-12 -14 662 232"
        preserveAspectRatio="xMidYMid meet"
        fill="none"
        stroke="currentColor"
        strokeWidth="12.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        focusable="false"
      >
        <motion.path
          d={capitalA}
          initial={hiddenStroke}
          animate={isVisible ? visibleStroke : hiddenStroke}
          transition={{
            duration: hasReducedMotion ? 0 : 0.85,
            ease: "easeInOut",
            opacity: { duration: hasReducedMotion ? 0 : 0.3 },
          }}
        />
        <motion.path
          d={connectedMan}
          initial={hiddenStroke}
          animate={isVisible ? visibleStroke : hiddenStroke}
          transition={{
            duration: hasReducedMotion ? 0 : 3.1,
            ease: "easeInOut",
            delay: hasReducedMotion ? 0 : 0.65,
            opacity: {
              duration: hasReducedMotion ? 0 : 0.5,
              delay: hasReducedMotion ? 0 : 0.65,
            },
          }}
        />
      </motion.svg>
    </div>
  );
}
