import gsap from "gsap";
import { useGSAP } from "@gsap/react";

gsap.registerPlugin(useGSAP);

export { gsap, useGSAP };

export function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function canHover(): boolean {
  return window.matchMedia("(hover: hover) and (pointer: fine)").matches;
}

export const paperOut = "expo.out";
export const peelOff = "power2.out";
export const flyToWall = "expo.inOut";
export const pinSettle = "back.out(2.2)";
