#!/usr/bin/env node
/**
 * Print-Worker für sozialexperiment.de
 *
 * Holt pending-Zettel von der API und druckt sie als ESC/POS auf einen
 * typischen 58/80mm Thermodrucker (USB oft /dev/usb/lp0 oder /dev/ttyUSB0).
 *
 * Ohne Drucker: DRY_RUN=1 schreibt Belege als Textdateien nach print-worker/out/
 */

import { Buffer } from "node:buffer";
import { mkdir, writeFile, appendFile } from "node:fs/promises";
import { createWriteStream, readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import iconv from "iconv-lite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadDotEnv(file) {
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (process.env[key] == null || process.env[key] === "") process.env[key] = value;
  }
}

loadDotEnv(path.join(__dirname, ".env"));
loadDotEnv(path.join(process.cwd(), ".env"));

const API_URL = (process.env.API_URL || "http://127.0.0.1:43173").replace(/\/$/, "");
const PRINT_WORKER_KEY = process.env.PRINT_WORKER_KEY || "";
const DRY_RUN = process.env.DRY_RUN === "1" || process.env.DRY_RUN === "true";
const PRINTER_PATH = process.env.PRINTER_PATH || "/dev/usb/lp0";
const PRINTER_WIDTH = Number.parseInt(process.env.PRINTER_WIDTH || "32", 10) || 32;
const POLL_MS = Number.parseInt(process.env.POLL_INTERVAL_MS || "4000", 10) || 4000;
const PAPER_CUT = process.env.PAPER_CUT !== "0";
const ENCODING = process.env.ENCODING || "cp858";
const LIMIT = Number.parseInt(process.env.QUEUE_LIMIT || "5", 10) || 5;
const OUT_DIR = path.join(__dirname, "out");

const ESC = 0x1b;
const GS = 0x1d;

function headers() {
  const h = { Accept: "application/json" };
  if (PRINT_WORKER_KEY) h.Authorization = `Bearer ${PRINT_WORKER_KEY}`;
  return h;
}

async function api(pathname, options = {}) {
  const res = await fetch(`${API_URL}${pathname}`, {
    ...options,
    headers: { ...headers(), ...(options.headers || {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data.error || res.statusText;
    throw new Error(`${res.status} ${msg}`);
  }
  return data;
}

function wrap(text, width) {
  const lines = [];
  for (const raw of text.replace(/\r\n/g, "\n").split("\n")) {
    const paragraph = raw.trimEnd();
    if (paragraph.length === 0) {
      lines.push("");
      continue;
    }
    let rest = paragraph;
    while (rest.length > width) {
      let cut = rest.lastIndexOf(" ", width);
      if (cut < width * 0.5) cut = width;
      lines.push(rest.slice(0, cut).trimEnd());
      rest = rest.slice(cut).trimStart();
    }
    if (rest.length) lines.push(rest);
  }
  return lines;
}

function center(text, width) {
  if (text.length >= width) return text.slice(0, width);
  const pad = Math.floor((width - text.length) / 2);
  return " ".repeat(pad) + text;
}

function rule(width) {
  return "-".repeat(width);
}

function formatBerlin(iso) {
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

function receiptText(message, width) {
  const lines = [
    center("*** SOZIALEXPERIMENT.DE ***", width),
    rule(width),
    ...wrap(message.text, width),
    rule(width),
  ];
  if (message.hasImage) {
    lines.push(wrap("[Foto an der Pinnwand]", width).join("\n"));
    if (message.imageAlt) lines.push(...wrap(message.imageAlt, width));
  }
  if (message.author) lines.push(...wrap(message.author, width));
  lines.push(formatBerlin(message.createdAt));
  lines.push("");
  return lines.join("\n") + "\n";
}

function encodeEscPos(message, width) {
  const chunks = [];
  const push = (buf) => chunks.push(Buffer.isBuffer(buf) ? buf : Buffer.from(buf));

  // Initialize, select code page (19 ≈ PC858 on many ESC/POS printers)
  push(Buffer.from([ESC, 0x40]));
  push(Buffer.from([ESC, 0x74, 19]));
  push(Buffer.from([ESC, 0x61, 1])); // center
  push(iconv.encode(`${center("*** SOZIALEXPERIMENT.DE ***", width)}\n`, ENCODING));
  push(Buffer.from([ESC, 0x61, 0])); // left
  push(iconv.encode(`${rule(width)}\n`, ENCODING));
  push(iconv.encode(`${wrap(message.text, width).join("\n")}\n`, ENCODING));
  push(iconv.encode(`${rule(width)}\n`, ENCODING));
  if (message.hasImage) {
    push(iconv.encode(`${wrap("[Foto an der Pinnwand]", width).join("\n")}\n`, ENCODING));
    if (message.imageAlt) {
      push(iconv.encode(`${wrap(message.imageAlt, width).join("\n")}\n`, ENCODING));
    }
  }
  if (message.author) {
    push(iconv.encode(`${wrap(message.author, width).join("\n")}\n`, ENCODING));
  }
  push(iconv.encode(`${formatBerlin(message.createdAt)}\n\n\n`, ENCODING));

  if (PAPER_CUT) {
    // GS V 65 n — feed and partial cut
    push(Buffer.from([GS, 0x56, 0x41, 0x03]));
  } else {
    push(Buffer.from([ESC, 0x64, 4]));
  }

  return Buffer.concat(chunks);
}

async function sendToPrinter(bytes) {
  await new Promise((resolve, reject) => {
    const stream = createWriteStream(PRINTER_PATH, { flags: "a" });
    stream.on("error", reject);
    stream.on("finish", resolve);
    stream.write(bytes, (err) => {
      if (err) reject(err);
      else stream.end();
    });
  });
}

async function printOne(message) {
  const text = receiptText(message, PRINTER_WIDTH);
  if (DRY_RUN) {
    await mkdir(OUT_DIR, { recursive: true });
    const file = path.join(OUT_DIR, `${message.createdAt.replace(/[:.]/g, "-")}_${message.id.slice(0, 8)}.txt`);
    await writeFile(file, text, "utf8");
    await appendFile(path.join(OUT_DIR, "print-log.txt"), `\n===== ${message.id} =====\n${text}`, "utf8");
    if (message.hasImage) {
      try {
        const imgRes = await fetch(`${API_URL}/api/messages/${message.id}/image`, { headers: headers() });
        if (imgRes.ok) {
          const buf = Buffer.from(await imgRes.arrayBuffer());
          const ext = (imgRes.headers.get("content-type") || "").includes("png") ? "png" : "jpg";
          await writeFile(path.join(OUT_DIR, `${message.id.slice(0, 8)}.${ext}`), buf);
        }
      } catch {
        // Foto ist optional für den Dry-Run
      }
    }
    console.log(`[dry-run] ${file}`);
    return;
  }

  const bytes = encodeEscPos(message, PRINTER_WIDTH);
  await sendToPrinter(bytes);
  console.log(`[printed] ${message.id} → ${PRINTER_PATH}`);
}

async function tick() {
  const data = await api(`/api/queue?limit=${LIMIT}`);
  const pending = data.messages || [];
  if (pending.length === 0) return;

  console.log(`${pending.length} pending`);
  for (const message of pending) {
    try {
      await printOne(message);
      await api(`/api/messages/${message.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "printed" }),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[skip] ${message.id}: ${msg}`);
      // Drucker nicht da → Queue bleibt pending, UI unberührt.
      if (/ENOENT|EACCES|ENXIO|EIO|EPERM|EHOSTDOWN/i.test(msg)) {
        console.error("Drucker nicht erreichbar. Nächster Versuch im nächsten Poll.");
        break;
      }
    }
  }
}

async function main() {
  console.log("sozialexperiment print-worker");
  console.log(`API     ${API_URL}`);
  console.log(`Mode    ${DRY_RUN ? "DRY_RUN (Textdateien)" : `ESC/POS → ${PRINTER_PATH}`}`);
  console.log(`Width   ${PRINTER_WIDTH} Zeichen`);
  console.log(`Poll    ${POLL_MS} ms`);
  for (;;) {
    try {
      await tick();
    } catch (err) {
      console.error("Poll fehlgeschlagen:", err instanceof Error ? err.message : err);
    }
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
}

main();
