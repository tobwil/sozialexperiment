import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

let fileEnv: Record<string, string> | null = null;

function loadFileEnv(): Record<string, string> {
  if (fileEnv) return fileEnv;
  fileEnv = {};
  const file = path.join(process.cwd(), ".env");
  if (!existsSync(file)) return fileEnv;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    fileEnv[key] = value;
  }
  return fileEnv;
}

export function envGet(name: string): string | undefined {
  try {
    const fromNetlify = Netlify.env.get(name);
    if (fromNetlify != null && fromNetlify !== "") return fromNetlify;
  } catch {
    // Local Vite / Node without the Netlify global
  }
  const fromProcess = process.env[name];
  if (fromProcess != null && fromProcess !== "") return fromProcess;
  const fromFile = loadFileEnv()[name];
  if (fromFile) return fromFile;
  return undefined;
}

export function envInt(name: string, fallback: number): number {
  const raw = envGet(name);
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : fallback;
}
