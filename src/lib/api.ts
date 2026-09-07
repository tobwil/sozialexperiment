export type PrintStatus = "pending" | "printed" | "failed";

export type Message = {
  id: string;
  text: string;
  author: string | null;
  createdAt: string;
  printedAt: string | null;
  status: PrintStatus;
  hasImage: boolean;
  imageAlt: string | null;
};

export class ApiError extends Error {
  status: number;
  code: string;

  constructor(message: string, status: number, code: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function parse<T>(res: Response): Promise<T> {
  const data = (await res.json().catch(() => ({}))) as {
    error?: string;
    code?: string;
  } & T;
  if (!res.ok) {
    throw new ApiError(data.error ?? "Unbekannter Fehler", res.status, data.code ?? "error");
  }
  return data;
}

export function messageImageUrl(id: string, cacheKey?: string): string {
  const q = cacheKey ? `?t=${encodeURIComponent(cacheKey)}` : "";
  return `/api/messages/${id}/image${q}`;
}

async function blobToBase64(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export async function fetchMessages(): Promise<Message[]> {
  const data = await parse<{ messages: Message[] }>(await fetch("/api/messages"));
  return data.messages.map((m) => ({
    ...m,
    hasImage: Boolean(m.hasImage),
    imageAlt: m.imageAlt ?? null,
  }));
}

export async function postMessage(input: {
  text: string;
  author: string;
  imageAlt: string;
  image?: Blob | null;
}): Promise<Message> {
  const payload: Record<string, unknown> = {
    text: input.text,
    author: input.author.trim() || undefined,
    imageAlt: input.imageAlt.trim() || undefined,
  };
  if (input.image) {
    payload.image = {
      mime: "image/jpeg",
      data: await blobToBase64(input.image),
    };
  }
  const data = await parse<{ message: Message }>(
    await fetch("/api/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }),
  );
  return data.message;
}

export async function deleteMessage(id: string, adminKey: string): Promise<void> {
  await parse(
    await fetch(`/api/messages/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${adminKey}` },
    }),
  );
}

export async function patchStatus(id: string, status: PrintStatus, key: string): Promise<Message> {
  const data = await parse<{ message: Message }>(
    await fetch(`/api/messages/${id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({ status }),
    }),
  );
  return data.message;
}
