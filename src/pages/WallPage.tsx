import { useCallback, useEffect, useRef, useState } from "react";
import { PenLine, X } from "lucide-react";
import { ComposePanel } from "@/components/ComposePanel";
import { FlightSlip } from "@/components/FlightSlip";
import { Pinboard } from "@/components/Pinboard";
import { fetchMessages, type Message } from "@/lib/api";
import { queueLabel } from "@/lib/format";

const POLL_MS = 4000;

type Flight = {
  message: Message;
  from: { left: number; top: number; width: number; height: number };
  imageSrc: string | null;
};

export function WallPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [boardError, setBoardError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [landingId, setLandingId] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [flight, setFlight] = useState<Flight | null>(null);
  const [imageById, setImageById] = useState<Record<string, string>>({});
  const imageByIdRef = useRef(imageById);
  imageByIdRef.current = imageById;

  const refresh = useCallback(async () => {
    try {
      const next = await fetchMessages();
      setMessages((prev) => {
        const byId = new Map(next.map((m) => [m.id, m]));
        const now = Date.now();
        for (const m of prev) {
          if (!byId.has(m.id) && now - Date.parse(m.createdAt) < 10_000) byId.set(m.id, m);
        }
        return [...byId.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      });
      setBoardError(null);
    } catch {
      setBoardError("Die Pinnwand ist gerade nicht erreichbar. Neu laden hilft oft.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const id = window.setInterval(() => void refresh(), POLL_MS);
    return () => window.clearInterval(id);
  }, [refresh]);

  useEffect(() => {
    return () => {
      for (const url of Object.values(imageByIdRef.current)) URL.revokeObjectURL(url);
    };
  }, []);

  function handlePinned(created: Message, from: DOMRect | null, imageUrl: string | null) {
    setMessages((prev) => (prev.some((m) => m.id === created.id) ? prev : [...prev, created]));
    if (imageUrl) {
      setImageById((prev) => ({ ...prev, [created.id]: imageUrl }));
    }
    const box = from
      ? { left: from.left, top: from.top, width: from.width, height: from.height }
      : null;
    setSheetOpen(false);
    if (box) setFlight({ message: created, from: box, imageSrc: imageUrl });
    else {
      setLandingId(created.id);
      window.setTimeout(() => setLandingId((id) => (id === created.id ? null : id)), 900);
    }
  }

  const endFlight = useCallback(() => {
    setFlight((current) => {
      if (current) {
        const id = current.message.id;
        setLandingId(id);
        window.setTimeout(() => setLandingId((open) => (open === id ? null : open)), 400);
      }
      return null;
    });
  }, []);

  const visible = messages.slice(-120);
  const pending = messages.filter((m) => m.status === "pending").length;
  const printed = messages.filter((m) => m.status === "printed").length;
  const failed = messages.filter((m) => m.status === "failed").length;

  return (
    <div className="room">
      <div className="room__grain" aria-hidden="true" />
      <Pinboard
        messages={visible}
        totalCount={messages.length}
        landingId={landingId}
        flyingId={flight?.message.id ?? null}
        loading={loading}
        error={boardError}
        imageById={imageById}
      />

      {sheetOpen ? (
        <button type="button" className="sheet-scrim" aria-label="Formular schließen" onClick={() => setSheetOpen(false)} />
      ) : null}

      <aside className={`compose-pane${sheetOpen ? " is-open" : ""}`} aria-label="Vorschau und Bondrucker">
        <div className="compose-pane__bar">
          <div>
            <p className="compose-pane__kicker">sozialexperiment.de</p>
            <h2>Vorschau</h2>
            <p className="compose-pane__lede">
              Digitaler Spiegel des Bonds. Der echte Druck läuft über den Bondrucker.
            </p>
            <p className="compose-pane__queue">{queueLabel(pending, printed, failed)}</p>
          </div>
          <button type="button" className="compose-pane__close" onClick={() => setSheetOpen(false)}>
            <X className="size-4" />
            <span>Schließen</span>
          </button>
        </div>
        <ComposePanel
          busy={busy}
          error={formError}
          onError={setFormError}
          onBusy={setBusy}
          onPinned={handlePinned}
        />
      </aside>

      <button type="button" className="fab" onClick={() => setSheetOpen(true)}>
        <PenLine className="size-5" />
        Schreiben
      </button>

      {flight ? (
        <FlightSlip
          message={flight.message}
          from={flight.from}
          imageSrc={flight.imageSrc}
          index={Math.max(0, visible.length - 1)}
          total={visible.length}
          onDone={endFlight}
        />
      ) : null}
    </div>
  );
}
