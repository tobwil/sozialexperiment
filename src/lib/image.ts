const MAX_EDGE = 1200;
const MAX_IN = 8 * 1024 * 1024;
const MAX_OUT = 900_000;

function loadHtmlImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Foto konnte nicht gelesen werden."));
    img.src = src;
  });
}

async function decodeSource(file: File): Promise<{
  source: CanvasImageSource & { width: number; height: number };
  cleanup: () => void;
}> {
  try {
    const bitmap = await createImageBitmap(file);
    return {
      source: bitmap,
      cleanup: () => bitmap.close(),
    };
  } catch {
    const url = URL.createObjectURL(file);
    try {
      const img = await loadHtmlImage(url);
      return {
        source: img,
        cleanup: () => URL.revokeObjectURL(url),
      };
    } catch (err) {
      URL.revokeObjectURL(url);
      throw err;
    }
  }
}

export async function compressImage(file: File): Promise<Blob> {
  const mime = (file.type || "").toLowerCase();
  if (mime && !mime.startsWith("image/")) {
    throw new Error("Bitte ein Foto wählen (JPEG, PNG, WebP, HEIC).");
  }
  if (file.size > MAX_IN) {
    throw new Error("Foto zu groß (max. 8 MB vor der Komprimierung).");
  }

  const { source, cleanup } = await decodeSource(file);
  try {
    const scale = Math.min(1, MAX_EDGE / Math.max(source.width, source.height));
    const width = Math.max(1, Math.round(source.width * scale));
    const height = Math.max(1, Math.round(source.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Foto konnte nicht gelesen werden.");
    ctx.fillStyle = "#fffaf0";
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(source, 0, 0, width, height);

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("Komprimierung fehlgeschlagen."))),
        "image/jpeg",
        0.82,
      );
    });
    if (blob.size > MAX_OUT) {
      throw new Error("Foto nach Komprimierung noch zu groß. Bitte ein kleineres wählen.");
    }
    return blob.type === "image/jpeg" ? blob : new Blob([blob], { type: "image/jpeg" });
  } finally {
    cleanup();
  }
}
