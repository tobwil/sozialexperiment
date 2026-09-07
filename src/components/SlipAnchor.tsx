import { useRef, type ReactNode } from "react";
import { gsap, useGSAP, canHover, prefersReducedMotion } from "@/lib/motion";
import type { SlipLayout } from "@/lib/layout";

type Props = {
  id: string;
  layout: SlipLayout;
  zIndex: number;
  hidden?: boolean;
  children: ReactNode;
};

export function SlipAnchor({ id, layout, zIndex, hidden = false, children }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const el = ref.current;
      if (!el) return;
      gsap.set(el, { rotate: layout.rotate, y: 0, scale: 1, transformOrigin: "50% 12px" });
    },
    { dependencies: [layout.rotate] },
  );

  const { contextSafe } = useGSAP({ scope: ref });

  const lift = contextSafe(() => {
    const el = ref.current;
    if (!el || hidden || prefersReducedMotion() || !canHover()) return;
    el.style.zIndex = "50";
    gsap.to(el, {
      y: -14,
      scale: 1.1,
      rotate: layout.rotate * 0.12,
      duration: 0.38,
      ease: "power3.out",
      overwrite: "auto",
    });
  });

  const drop = contextSafe(() => {
    const el = ref.current;
    if (!el || prefersReducedMotion()) return;
    el.style.zIndex = String(zIndex);
    gsap.to(el, {
      y: 0,
      scale: 1,
      rotate: layout.rotate,
      duration: 0.48,
      ease: "power3.out",
      overwrite: "auto",
    });
  });

  return (
    <div
      ref={ref}
      data-slip-id={id}
      className="slip-anchor"
      style={{
        left: `${layout.left}%`,
        top: `${layout.top}%`,
        zIndex,
        opacity: hidden ? 0 : 1,
        pointerEvents: hidden ? "none" : undefined,
      }}
      onMouseEnter={lift}
      onMouseLeave={drop}
      onFocus={lift}
      onBlur={drop}
    >
      {children}
    </div>
  );
}
