export function formatDe(iso: string): string {
  return new Intl.DateTimeFormat("de-DE", {
    timeZone: "Europe/Berlin",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(iso));
}

export function formatDeShort(iso: string): string {
  return new Intl.DateTimeFormat("de-DE", {
    timeZone: "Europe/Berlin",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

export function zettelLabel(count: number): string {
  if (count === 0) return "Noch keine Zettel an der Wand";
  if (count === 1) return "1 Zettel an der Wand";
  return `${count} Zettel an der Wand`;
}

export function printStatusLabel(
  status: "pending" | "printed" | "failed",
  preview = false,
): string {
  if (preview) return "Vorschau";
  if (status === "printed") return "Ausgedruckt";
  if (status === "failed") return "Nicht gedruckt";
  return "In der Warteschlange";
}

export function queueLabel(pending: number, printed: number, failed: number): string {
  if (pending === 1) return "1 wartet auf den Bondrucker";
  if (pending > 1) return `${pending} warten auf den Bondrucker`;
  if (failed > 0 && printed === 0) return "Bondrucker: nichts in der Warteschlange";
  if (printed > 0) return "Bondrucker hat gedruckt";
  return "Bondrucker · Equip 351006";
}
