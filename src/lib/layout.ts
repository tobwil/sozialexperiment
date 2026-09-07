export type PinKind = "red" | "brass" | "tape";

export type SlipLayout = {
  left: number;
  top: number;
  rotate: number;
  z: number;
  pin: PinKind;
  width: number;
};

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function unit(h: number, shift: number): number {
  return ((h >>> shift) & 0xffff) / 0xffff;
}

/**
 * Deterministic messy pinboard layout. Same id → same place across polls.
 * Coordinates are percent of the cork area *below* the title mast — never the plaque band.
 */
export function slipLayout(id: string, createdAt: string, index: number, total: number): SlipLayout {
  const h = hash(id);
  const h2 = hash(`${id}:${createdAt}`);
  const u = (shift: number) => unit(h, shift);
  const u2 = (shift: number) => unit(h2, shift);

  const pinN = h % 3;
  const pin: PinKind = pinN === 0 ? "red" : pinN === 1 ? "brass" : "tape";
  const width = 142 + (h % 36);
  const rotate = u(0) * 18 - 9 + (u2(4) - 0.5) * 3;
  const z = index + Math.floor(u(8) * 5) - 2;

  if (total <= 4) {
    const slots = [
      { left: 14, top: 8 },
      { left: 52, top: 10 },
      { left: 22, top: 42 },
      { left: 56, top: 46 },
    ];
    const slot = slots[index] ?? slots[0];
    return {
      left: clamp(slot.left + (u(12) - 0.5) * 8, 2, 74),
      top: clamp(slot.top + (u2(8) - 0.5) * 6, 4, 58),
      rotate,
      z,
      pin,
      width: width + 12,
    };
  }

  const cols = total > 24 ? 6 : 5;
  const col = index % cols;
  const row = Math.floor(index / cols);
  const cellW = 80 / cols;
  const cellH = 12 + Math.min(16, 180 / Math.max(total, 8));

  const left = 4 + col * cellW + (u(4) - 0.45) * cellW * 1.35;
  const top = 5 + ((row * cellH) % 54) + (u2(0) - 0.5) * cellH * 1.05;

  return {
    left: clamp(left, 2, 74),
    top: clamp(top, 4, 58),
    rotate,
    z,
    pin,
    width,
  };
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}
