import { Buffer } from "node:buffer";
import type { Context, Config } from "@netlify/functions";
import { envGet, envInt } from "./_shared/env.ts";
import { extraBlocklist, findBlockedTerm } from "./_shared/moderate.ts";
import { deleteImage, getImage, looksLikeImage, putImage, sniffContentType } from "./_shared/images.ts";
import { getMessage, listMessages, loadDb, mutateDb } from "./_shared/store.ts";
import {
  DEFAULT_MAX_LENGTH,
  DEFAULT_RATE_MAX,
  DEFAULT_RATE_WINDOW_MS,
  MAX_AUTHOR_LENGTH,
  MAX_IMAGE_ALT,
  MAX_IMAGE_BYTES,
  MAX_LINES,
  MAX_MESSAGES,
  type Message,
  type PrintStatus,
} from "./_shared/types.ts";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Admin-Key, X-Print-Key",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...corsHeaders },
  });
}

function error(message: string, status: number, code: string): Response {
  return json({ error: message, code }, status);
}

function bearer(req: Request): string | undefined {
  const auth = req.headers.get("authorization");
  if (auth?.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim();
  return (
    req.headers.get("x-admin-key")?.trim() ||
    req.headers.get("x-print-key")?.trim() ||
    undefined
  );
}

function isAdmin(req: Request): boolean {
  const key = envGet("ADMIN_KEY");
  if (!key) return false;
  return bearer(req) === key;
}

function isPrinter(req: Request): boolean {
  const key = envGet("PRINT_WORKER_KEY");
  if (!key) return true;
  return bearer(req) === key || isAdmin(req);
}

async function hashIp(ip: string): Promise<string> {
  const salt = envGet("ADMIN_KEY") ?? envGet("PRINT_WORKER_KEY") ?? "sozialexperiment";
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${salt}:${ip}`));
  return Array.from(new Uint8Array(buf))
    .slice(0, 10)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function sanitizeText(input: string, max: number): string {
  return input.replace(/\r\n/g, "\n").replace(/\r/g, "\n").replace(/\u0000/g, "").trim().slice(0, max);
}

function countLines(text: string): number {
  return text.split("\n").length;
}

function decodeImage(raw: unknown): { bytes: Uint8Array; contentType: string } | null | "invalid" {
  if (raw == null) return null;
  if (typeof raw !== "object") return "invalid";
  const img = raw as { data?: unknown; mime?: unknown };
  if (typeof img.data !== "string" || img.data.length === 0) return null;
  const mime = typeof img.mime === "string" ? img.mime : "image/jpeg";
  if (!/^image\/(jpeg|jpg|webp|png)$/i.test(mime)) return "invalid";
  const b64 = img.data.replace(/^data:image\/[a-zA-Z+]+;base64,/, "");
  let bytes: Uint8Array;
  try {
    const bin = atob(b64);
    bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  } catch {
    return "invalid";
  }
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_IMAGE_BYTES) return "invalid";
  if (!looksLikeImage(bytes)) return "invalid";
  return { bytes, contentType: sniffContentType(bytes, mime.toLowerCase() === "image/jpg" ? "image/jpeg" : mime.toLowerCase()) };
}

export default async (req: Request, context: Context) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const url = new URL(req.url);
  const pathname = url.pathname.replace(/\/$/, "") || "/";
  const imageMatch = pathname.match(/^\/api\/messages\/([^/]+)\/image$/);
  const id = context.params.id || imageMatch?.[1];
  const wantsImage = Boolean(imageMatch || (id && pathname.endsWith("/image")));

  try {
    if (pathname === "/api/health" && req.method === "GET") {
      return json({ ok: true, service: "sozialexperiment", time: new Date().toISOString() });
    }

    if ((pathname === "/api/messages" || pathname === "/api/messages/") && req.method === "GET") {
      const db = await loadDb();
      const status = url.searchParams.get("status") as PrintStatus | null;
      const messages = listMessages(db, status || undefined);
      return json({ messages, count: messages.length });
    }

    if (wantsImage && req.method === "GET" && id) {
      const db = await loadDb();
      const message = getMessage(db, id);
      if (!message?.hasImage) return error("Kein Foto zu diesem Zettel.", 404, "not_found");
      const stored = await getImage(id);
      if (!stored) return error("Foto nicht gefunden.", 404, "not_found");
      const body = Buffer.from(stored.data);
      return new Response(body, {
        status: 200,
        headers: {
          "Content-Type": sniffContentType(stored.data, stored.contentType),
          "Cache-Control": "public, max-age=86400, immutable",
          "Content-Length": String(body.byteLength),
          ...corsHeaders,
        },
      });
    }

    if ((pathname === "/api/messages" || pathname === "/api/messages/") && req.method === "POST") {
      const maxLen = envInt("MAX_MESSAGE_LENGTH", DEFAULT_MAX_LENGTH);
      let body: { text?: unknown; author?: unknown; imageAlt?: unknown; image?: unknown };
      try {
        body = (await req.json()) as { text?: unknown; author?: unknown; imageAlt?: unknown; image?: unknown };
      } catch {
        return error("Ungültiges JSON.", 400, "invalid_json");
      }

      const text = typeof body.text === "string" ? sanitizeText(body.text, maxLen) : "";
      const authorRaw = typeof body.author === "string" ? sanitizeText(body.author, MAX_AUTHOR_LENGTH) : "";
      const author = authorRaw.length > 0 ? authorRaw : null;
      const imageAltRaw = typeof body.author === "string" ? sanitizeText(body.imageAlt, MAX_IMAGE_ALT) : "";
      const imageAlt = imageAltRaw.length > 0 ? imageAltRaw : null;
      const image = decodeImage(body.image);

      if (image === "invalid") {
        return error("Foto ungültig oder zu groß (nach Komprimierung max. 900 KB, JPEG/WebP/PNG).", 400, "bad_image");
      }
      if (!text) {
        return error("Schreib erst etwas auf den Zettel.", 400, "empty");
      }
      if (text.length > maxLen) {
        return error(`Maximal ${maxLen} Zeichen.`, 400, "too_long");
      }
      if (countLines(text) > MAX_LINES) {
        return error("Zu viele Zeilen für einen Beleg.", 400, "too_many_lines");
      }

      const blocked = findBlockedTerm(
        `${text} ${author ?? ""} ${imageAlt ?? ""}`,
        extraBlocklist(envGet("BLOCKLIST")),
      );
      if (blocked) {
        return error("Der Zettel geht so nicht an die Wand.", 400, "blocked");
      }

      const ip = context.ip || req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
      const ipKey = await hashIp(ip);
      const now = Date.now();
      const windowMs = envInt("RATE_LIMIT_WINDOW_MS", DEFAULT_RATE_WINDOW_MS);
      const rateMax = envInt("RATE_LIMIT_MAX", DEFAULT_RATE_MAX);
      const skipRate = isAdmin(req);

      const created = await mutateDb((db) => {
        if (!skipRate) {
          const recent = (db.rate[ipKey] ?? []).filter((t) => now - t < windowMs);
          if (recent.length >= rateMax) {
            throw new Error("rate_limited");
          }
          recent.push(now);
          db.rate[ipKey] = recent;
        }

        const message: Message = {
          id: crypto.randomUUID(),
          text,
          author,
          createdAt: new Date().toISOString(),
          printedAt: null,
          status: "pending",
          hasImage: Boolean(image),
          imageAlt,
        };
        db.messages.push(message);
        if (db.messages.length > MAX_MESSAGES) {
          db.messages = db.messages.slice(-MAX_MESSAGES);
        }
        return message;
      }).catch((err: unknown) => {
        if (err instanceof Error && err.message === "rate_limited") return "rate_limited" as const;
        throw err;
      });

      if (created === "rate_limited") {
        return error("Zu viele Zettel hintereinander. Kurz warten, dann nochmal.", 429, "rate_limited");
      }

      if (image && created && typeof created !== "string") {
        await putImage(created.id, image.bytes, image.contentType);
      }

      return json({ message: created }, 201);
    }

    if (pathname === "/api/queue" && req.method === "GET") {
      if (!isPrinter(req)) {
        return error("Print-Worker-Key fehlt oder ist falsch.", 401, "unauthorized");
      }
      const db = await loadDb();
      const pending = listMessages(db, "pending");
      const limit = Math.max(1, Number.parseInt(url.searchParams.get("limit") ?? "10", 10) || 10);
      return json({ messages: pending.slice(0, limit), count: pending.length });
    }

    if (id && !wantsImage && req.method === "PATCH") {
      if (!isPrinter(req)) {
        return error("Print-Worker-Key fehlt oder ist falsch.", 401, "unauthorized");
      }
      let body: { status?: unknown };
      try {
        body = (await req.json()) as { status?: unknown };
      } catch {
        return error("Ungültiges JSON.", 400, "invalid_json");
      }
      const status = body.status;
      if (status !== "printed" && status !== "failed" && status !== "pending") {
        return error("Status muss pending, printed oder failed sein.", 400, "invalid_status");
      }

      const updated = await mutateDb((db) => {
        const message = getMessage(db, id);
        if (!message) return null;
        message.status = status;
        message.printedAt = status === "printed" ? new Date().toISOString() : message.printedAt;
        if (status === "pending") message.printedAt = null;
        return message;
      });

      if (!updated) return error("Zettel nicht gefunden.", 404, "not_found");
      return json({ message: updated });
    }

    if (id && !wantsImage && req.method === "DELETE") {
      if (!isAdmin(req)) {
        return error("Admin-Key fehlt oder ist falsch.", 401, "unauthorized");
      }
      const removed = await mutateDb((db) => {
        const idx = db.messages.findIndex((m) => m.id === id);
        if (idx === -1) return null;
        const [message] = db.messages.splice(idx, 1);
        return message ?? null;
      });
      if (!removed) return error("Zettel nicht gefunden.", 404, "not_found");
      if (removed.hasImage) await deleteImage(removed.id);
      return json({ ok: true, id });
    }

    return error("Nicht gefunden.", 404, "not_found");
  } catch (err) {
    console.error(err);
    return error("Serverfehler. Die Pinnwand hängt schief — gleich nochmal versuchen.", 500, "server");
  }
};

export const config: Config = {
  path: ["/api/health", "/api/messages", "/api/messages/:id", "/api/messages/:id/image", "/api/queue"],
  method: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
};
