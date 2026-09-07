import { useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { ReceiptSlip } from "@/components/ReceiptSlip";
import type { Message } from "@/lib/api";
import { slipLayout } from "@/lib/layout";
import { gsap, prefersReducedMotion, peelOff, flyToWall, pinSettle } from "@/lib/motion";

type Props = {
  message: Message;
  from: { left: number; top: number; width: number; height: number };
  index: number;
  total: number;
  imageSrc?: string | null;
  onDone: () => void;
};

export function FlightSlip({ message, from, index, total, imageSrc = null, onDone }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;
  const layout = slipLayout(message.id, message.createdAt, index, total);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      onDoneRef.current();
    };

    if (prefersReducedMotion()) {
      finish();
      return;
    }

    const target = document.querySelector<HTMLElement>(`[data-slip-id="${message.id}"]`);
    const to = target?.getBoundingClientRect();
    if (!to) {
      finish();
      return;
    }

    gsap.set(el, {
      left: from.left,
      top: from.top,
      width: from.width,
      rotate: 0,
      y: 0,
      scale: 1,
      opacity: 1,
      transformOrigin: "50% 0%",
    });

    const tl = gsap.timeline({ onComplete: finish });
    tl.to(el, {
      duration: 0.28,
      y: -28,
      rotate: -10,
      scale: 1.06,
      ease: peelOff,
    })
      .to(el, {
        left: to.left,
        top: to.top,
        width: to.width,
        rotate: layout.rotate,
        y: 0,
        scale: 1,
        duration: 0.86,
        ease: flyToWall,
      })
      .to(el, {
        y: 6,
        duration: 0.1,
        ease: "power2.in",
      })
      .to(el, {
        y: 0,
        duration: 0.22,
        ease: pinSettle,
      });

    return () => {
      tl.kill();
    };
  }, [from, layout.rotate, message.id]);

  return createPortal(
    <div ref={ref} className="flight-slip" aria-hidden="true">
      <ReceiptSlip message={message} layout={layout} imageSrc={imageSrc} className="receipt--bond" />
    </div>,
    document.body,
  );
}
