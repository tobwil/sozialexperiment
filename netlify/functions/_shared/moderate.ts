const DEFAULT_BLOCKLIST = [
  "nazi",
  "nazis",
  "hitler",
  "heil hitler",
  "sieg heil",
  "nigger",
  "nigga",
  "faggot",
  "kike",
  "retard",
  "hurensohn",
  "fotze",
  "wichser",
  "schwuchtel",
  "kanake",
  "neger",
  "miststück",
  "schlampe",
  "nutte",
  "arschloch",
  "drecksau",
  "holocaustleugnung",
];

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9äöü\s]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function extraBlocklist(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((w) => w.trim().toLowerCase())
    .filter(Boolean);
}

export function findBlockedTerm(text: string, extra: string[] = []): string | null {
  const haystack = ` ${normalize(text)} `;
  const list = [...DEFAULT_BLOCKLIST, ...extra];
  for (const term of list) {
    const needle = normalize(term);
    if (!needle) continue;
    if (haystack.includes(` ${needle} `) || haystack.includes(needle)) {
      // Short tokens must match as whole words to avoid false positives
      if (needle.length < 5) {
        const re = new RegExp(`(?:^|\\s)${escapeRe(needle)}(?:\\s|$)`, "i");
        if (!re.test(haystack)) continue;
      }
      return term;
    }
  }
  return null;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
