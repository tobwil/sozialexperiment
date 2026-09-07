import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { getStore } from "@netlify/blobs";
import type { Database, Message, PrintStatus } from "./types.ts";

const FILE_PATH = path.join(process.cwd(), "data", "messages.json");
const BLOB_KEY = "db";

const emptyDb = (): Database => ({ messages: [], rate: {} });

let writeChain: Promise<void> = Promise.resolve();

function enqueue<T>(fn: () => Promise<T>): Promise<T> {
  const run = writeChain.then(fn, fn);
  writeChain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

export function blobsConfigured(): boolean {
  return Boolean(
    process.env.NETLIFY_BLOBS_CONTEXT ||
      process.env.BLOBS_TOKEN ||
      process.env.NETLIFY === "true",
  );
}

async function readFromFile(): Promise<Database> {
  try {
    const raw = await readFile(FILE_PATH, "utf8");
    const parsed = JSON.parse(raw) as Database;
    return {
      messages: Array.isArray(parsed.messages) ? parsed.messages : [],
      rate: parsed.rate && typeof parsed.rate === "object" ? parsed.rate : {},
    };
  } catch {
    return emptyDb();
  }
}

async function writeToFile(db: Database): Promise<void> {
  await mkdir(path.dirname(FILE_PATH), { recursive: true });
  await writeFile(FILE_PATH, JSON.stringify(db, null, 2), "utf8");
}

async function readFromBlobs(): Promise<Database | null> {
  try {
    const store = getStore({ name: "pinnwand", consistency: "strong" });
    const db = await store.get(BLOB_KEY, { type: "json" });
    if (!db || typeof db !== "object") return emptyDb();
    const parsed = db as Database;
    return {
      messages: Array.isArray(parsed.messages) ? parsed.messages : [],
      rate: parsed.rate && typeof parsed.rate === "object" ? parsed.rate : {},
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes("not been configured") || msg.includes("MissingBlobs")) {
      return null;
    }
    throw error;
  }
}

async function writeToBlobs(db: Database): Promise<boolean> {
  try {
    const store = getStore({ name: "pinnwand", consistency: "strong" });
    await store.setJSON(BLOB_KEY, db);
    return true;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes("not been configured") || msg.includes("MissingBlobs")) {
      return false;
    }
    throw error;
  }
}

export async function loadDb(): Promise<Database> {
  if (blobsConfigured()) {
    const fromBlobs = await readFromBlobs();
    if (fromBlobs) return fromBlobs;
  }
  return readFromFile();
}

export async function saveDb(db: Database): Promise<void> {
  if (blobsConfigured()) {
    const ok = await writeToBlobs(db);
    if (ok) return;
  }
  await writeToFile(db);
}

export async function mutateDb<T>(fn: (db: Database) => T | Promise<T>): Promise<T> {
  return enqueue(async () => {
    const db = await loadDb();
    const result = await fn(db);
    await saveDb(db);
    return result;
  });
}

export function listMessages(db: Database, status?: PrintStatus): Message[] {
  const items = status ? db.messages.filter((m) => m.status === status) : db.messages;
  return [...items]
    .map(normalizeMessage)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export function getMessage(db: Database, id: string): Message | undefined {
  const found = db.messages.find((m) => m.id === id);
  return found ? normalizeMessage(found) : undefined;
}

function normalizeMessage(m: Message): Message {
  return {
    ...m,
    hasImage: Boolean(m.hasImage),
    imageAlt: m.imageAlt ?? null,
  };
}
