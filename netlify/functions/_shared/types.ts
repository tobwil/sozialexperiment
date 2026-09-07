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

export type Database = {
  messages: Message[];
  rate: Record<string, number[]>;
};

export const DEFAULT_MAX_LENGTH = 240;
export const DEFAULT_RATE_MAX = 5;
export const DEFAULT_RATE_WINDOW_MS = 10 * 60 * 1000;
export const MAX_AUTHOR_LENGTH = 32;
export const MAX_IMAGE_ALT = 80;
export const MAX_MESSAGES = 800;
export const MAX_LINES = 10;
export const MAX_IMAGE_BYTES = 900_000;
