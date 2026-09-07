import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { Buffer } from "node:buffer";
import path from "node:path";
import { getStore } from "@netlify/blobs";
import { blobsConfigured } from "./store.ts";

const IMAGE_DIR = path.join(process.cwd(), "data", "images");
const STORE = "pinnwand-images";

export type StoredImage = {
  data: Uint8Array;
  contentType: string;
};

function filePath(id: string): string {
  return path.join(IMAGE_DIR, `${id}.jpg`);
}

function metaPath(id: string): string {
  return path.join(IMAGE_DIR, `${id}.meta.json`);
}

function toArrayBuffer(data: Uint8Array): ArrayBuffer {
  return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
}

export function looksLikeImage(bytes: Uint8Array): boolean {
  if (bytes.byteLength < 12) return false;
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return true; // JPEG
  if (bytes[0] === 0x89 && bytes[1] === 0x50) return true; // PNG
  if (bytes[0] === 0x47 && bytes[1] === 0x49) return true; // GIF
  if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[8] === 0x57) return true; // WEBP
  return false;
}

export function sniffContentType(bytes: Uint8Array, fallback = "image/jpeg"): string {
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return "image/jpeg";
  if (bytes[0] === 0x89 && bytes[1] === 0x50) return "image/png";
  if (bytes[0] === 0x47 && bytes[1] === 0x49) return "image/gif";
  if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[8] === 0x57) return "image/webp";
  return fallback;
}

function coerceBytes(raw: unknown): Uint8Array | null {
  if (!raw) return null;
  if (raw instanceof Uint8Array) return raw;
  if (raw instanceof ArrayBuffer) return new Uint8Array(raw);
  if (typeof Buffer !== "undefined" && Buffer.isBuffer(raw)) return new Uint8Array(raw);
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (/^\d{1,3}(,\d{1,3})+$/.test(trimmed)) {
      return Uint8Array.from(trimmed.split(",").map((n) => Number.parseInt(n, 10)));
    }
    try {
      const b64 = trimmed.replace(/^data:image\/[a-zA-Z+]+;base64,/, "");
      const bin = atob(b64);
      return Uint8Array.from(bin, (c) => c.charCodeAt(0));
    } catch {
      return null;
    }
  }
  return null;
}

async function putFile(id: string, data: Uint8Array, contentType: string): Promise<void> {
  await mkdir(IMAGE_DIR, { recursive: true });
  await writeFile(filePath(id), Buffer.from(data));
  await writeFile(metaPath(id), JSON.stringify({ contentType }), "utf8");
}

async function getFile(id: string): Promise<StoredImage | null> {
  try {
    const data = new Uint8Array(await readFile(filePath(id)));
    if (!looksLikeImage(data)) return null;
    let contentType = sniffContentType(data);
    try {
      const meta = JSON.parse(await readFile(metaPath(id), "utf8")) as { contentType?: string };
      if (meta.contentType) contentType = sniffContentType(data, meta.contentType);
    } catch {
      // default from sniff
    }
    return { data, contentType };
  } catch {
    return null;
  }
}

export async function putImage(id: string, data: Uint8Array, contentType: string): Promise<void> {
  const type = sniffContentType(data, contentType || "image/jpeg");
  // Always persist to disk so local/dev and blob-misses still serve the JPEG.
  await putFile(id, data, type);

  if (!blobsConfigured()) return;
  try {
    const store = getStore({ name: STORE, consistency: "strong" });
    await store.set(id, toArrayBuffer(data), { metadata: { contentType: type } });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (!msg.includes("not been configured") && !msg.includes("MissingBlobs")) throw error;
  }
}

export async function getImage(id: string): Promise<StoredImage | null> {
  if (blobsConfigured()) {
    try {
      const store = getStore({ name: STORE, consistency: "strong" });
      const raw = await store.get(id, { type: "arrayBuffer" });
      const data = coerceBytes(raw);
      if (data && looksLikeImage(data)) {
        const meta = await store.getMetadata(id);
        const storedType =
          typeof meta?.metadata?.contentType === "string" ? meta.metadata.contentType : "image/jpeg";
        return { data, contentType: sniffContentType(data, storedType) };
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      if (!msg.includes("not been configured") && !msg.includes("MissingBlobs")) throw error;
    }
  }
  return getFile(id);
}

export async function deleteImage(id: string): Promise<void> {
  if (blobsConfigured()) {
    try {
      const store = getStore({ name: STORE, consistency: "strong" });
      await store.delete(id);
    } catch {
      // ignore missing
    }
  }
  try {
    await unlink(filePath(id));
  } catch {
    // ignore
  }
  try {
    await unlink(metaPath(id));
  } catch {
    // ignore
  }
}
