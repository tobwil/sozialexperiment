import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { deleteMessage, fetchMessages, messageImageUrl, patchStatus, type Message, type PrintStatus } from "@/lib/api";
import { formatDe, printStatusLabel } from "@/lib/format";

const STORAGE = "sozialexperiment.adminKey";

export function AdminPage() {
  const [key, setKey] = useState(() => sessionStorage.getItem(STORAGE) ?? "");
  const [messages, setMessages] = useState<Message[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    try {
      setMessages(await fetchMessages());
      setError(null);
    } catch {
      setError("Nachrichten konnten nicht geladen werden.");
    }
  }

  useEffect(() => {
    void load();
    const id = window.setInterval(() => void load(), 5000);
    return () => window.clearInterval(id);
  }, []);

  function saveKey(e: FormEvent) {
    e.preventDefault();
    sessionStorage.setItem(STORAGE, key.trim());
  }

  async function onDelete(id: string) {
    if (!key) {
      setError("Admin-Key eintragen.");
      return;
    }
    setBusyId(id);
    try {
      await deleteMessage(id, key);
      setMessages((prev) => prev.filter((m) => m.id !== id));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Löschen fehlgeschlagen.");
    } finally {
      setBusyId(null);
    }
  }

  async function onStatus(id: string, status: PrintStatus) {
    if (!key) {
      setError("Key eintragen (Admin- oder Print-Worker-Key).");
      return;
    }
    setBusyId(id);
    try {
      const updated = await patchStatus(id, status, key);
      setMessages((prev) => prev.map((m) => (m.id === id ? updated : m)));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Status unbekannt.");
    } finally {
      setBusyId(null);
    }
  }

  const pending = messages.filter((m) => m.status === "pending").length;

  return (
    <div className="admin">
      <header className="admin__head">
        <p className="admin__kicker">Moderation</p>
        <h1>Pinnwand · Admin</h1>
        <p>
          {messages.length} Zettel · {pending} in der Druckerwarteschlange
        </p>
        <Link to="/" className="admin__back">
          ← Zur Pinnwand
        </Link>
      </header>

      <form className="admin__key" onSubmit={saveKey}>
        <label htmlFor="adminkey">Admin- / Print-Key</label>
        <div className="admin__keyrow">
          <Input
            id="adminkey"
            type="password"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="ADMIN_KEY oder PRINT_WORKER_KEY"
          />
          <Button type="submit" size="sm">
            Merken
          </Button>
        </div>
        <p>Der Key bleibt nur in dieser Browsersitzung. Route: /admin</p>
      </form>

      {error ? <p className="admin__error">{error}</p> : null}

      <ul className="admin__list">
        {messages.length === 0 ? <li className="admin__empty">Keine Zettel.</li> : null}
        {[...messages].reverse().map((m) => (
          <li key={m.id} className="admin__item">
            <p className="admin__text">{m.text}</p>
            {m.hasImage ? (
              <img className="admin__thumb" src={messageImageUrl(m.id, m.createdAt)} alt={m.imageAlt || "Foto"} />
            ) : null}
            <p className="admin__meta">
              {m.author ? `${m.author} · ` : ""}
              {formatDe(m.createdAt)} · {printStatusLabel(m.status)}
              {m.printedAt ? ` · gedruckt ${formatDe(m.printedAt)}` : ""}
            </p>
            <div className="admin__actions">
              <Button size="sm" variant="ghost" disabled={busyId === m.id} onClick={() => void onStatus(m.id, "pending")}>
                Warteschlange
              </Button>
              <Button size="sm" variant="ghost" disabled={busyId === m.id} onClick={() => void onStatus(m.id, "printed")}>
                Ausgedruckt
              </Button>
              <Button size="sm" variant="ghost" disabled={busyId === m.id} onClick={() => void onStatus(m.id, "failed")}>
                Nicht gedruckt
              </Button>
              <Button size="sm" variant="danger" disabled={busyId === m.id} onClick={() => void onDelete(m.id)}>
                Löschen
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
