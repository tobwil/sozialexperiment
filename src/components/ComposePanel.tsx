import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { Camera, ImagePlus, X } from "lucide-react";
import { ReceiptSlip } from "@/components/ReceiptSlip";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ApiError, postMessage, type Message } from "@/lib/api";
import { compressImage } from "@/lib/image";
import { slipLayout } from "@/lib/layout";
import { gsap, useGSAP, prefersReducedMotion, paperOut } from "@/lib/motion";

const MAX = 240;

type Phase = "compose" | "printing" | "preview";

type Props = {
  busy: boolean;
  error: string | null;
  onError: (msg: string | null) => void;
  onBusy: (busy: boolean) => void;
  onPinned: (message: Message, from: DOMRect | null, imageUrl: string | null) => void;
};

export function ComposePanel({ busy, error, onError, onBusy, onPinned }: Props) {
  const [text, setText] = useState("");
  const [author, setAuthor] = useState("");
  const [imageAlt, setImageAlt] = useState("");
  const [imageBlob, setImageBlob] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("compose");
  const [draftAt, setDraftAt] = useState(() => new Date().toISOString());
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const urlRef = useRef<string | null>(null);
  const paperRef = useRef<HTMLDivElement>(null);
  const equipRef = useRef<HTMLDivElement>(null);
  const formId = useId();

  useEffect(() => {
    return () => {
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    };
  }, []);

  useGSAP(
    () => {
      if (phase !== "printing") return;
      const paper = paperRef.current;
      if (!paper) return;
      if (prefersReducedMotion()) {
        setPhase("preview");
        return;
      }
      gsap.set(paper, { transformOrigin: "50% 0%" });
      gsap.fromTo(
        paper,
        { clipPath: "inset(0% 0% 100% 0%)", scaleY: 0.08, y: -12, opacity: 0.4 },
        {
          clipPath: "inset(0% 0% 0% 0%)",
          scaleY: 1,
          y: 0,
          opacity: 1,
          duration: 1.28,
          ease: paperOut,
          onComplete: () => setPhase("preview"),
        },
      );
      if (equipRef.current) {
        gsap.to(equipRef.current, {
          y: 1.1,
          rotate: 0.35,
          duration: 0.045,
          yoyo: true,
          repeat: 24,
          ease: "none",
        });
      }
    },
    { dependencies: [phase] },
  );

  async function onPickFile(file: File | undefined) {
    if (!file) return;
    onError(null);
    try {
      const blob = await compressImage(file);
      const url = URL.createObjectURL(blob);
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      setImageBlob(blob);
      setPreviewUrl(url);
      urlRef.current = url;
    } catch (err) {
      onError(err instanceof Error ? err.message : "Foto konnte nicht gelesen werden.");
    }
  }

  function clearPhoto() {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = null;
    setPreviewUrl(null);
    setImageBlob(null);
    setImageAlt("");
    if (cameraRef.current) cameraRef.current.value = "";
    if (galleryRef.current) galleryRef.current.value = "";
  }

  function resetForm(keepPhotoUrl = false) {
    setText("");
    setImageAlt("");
    if (!keepPhotoUrl) clearPhoto();
    else {
      urlRef.current = null;
      setPreviewUrl(null);
      setImageBlob(null);
      setImageAlt("");
      if (cameraRef.current) cameraRef.current.value = "";
      if (galleryRef.current) galleryRef.current.value = "";
    }
    setPhase("compose");
    setDraftAt(new Date().toISOString());
  }

  function startPrint(e: FormEvent) {
    e.preventDefault();
    if (!text.trim() || busy || phase !== "compose") return;
    onError(null);
    setDraftAt(new Date().toISOString());
    setPhase("printing");
  }

  async function confirmPin() {
    if (busy) return;
    onBusy(true);
    onError(null);
    const from = paperRef.current?.getBoundingClientRect() ?? null;
    try {
      const created = await postMessage({
        text: text.trim(),
        author,
        imageAlt,
        image: imageBlob,
      });
      const handed = previewUrl;
      urlRef.current = null;
      onPinned(created, from, handed);
      resetForm(true);
    } catch (err) {
      if (err instanceof ApiError) onError(err.message);
      else onError("Konnte nicht angeheftet werden.");
    } finally {
      onBusy(false);
    }
  }

  const remaining = MAX - text.length;
  const draft: Message = {
    id: "draft",
    text: text.trim(),
    author: author.trim() || null,
    createdAt: draftAt,
    printedAt: null,
    status: "pending",
    hasImage: Boolean(previewUrl),
    imageAlt: imageAlt.trim() || null,
  };
  const printing = phase === "printing" || phase === "preview";
  const locked = phase !== "compose" || busy;

  return (
    <div className="terminal">
      <div ref={equipRef} className={`equip${phase === "printing" ? " is-busy" : ""}`}>
        <div className="equip__lid">
          <span className="equip__window" aria-hidden="true" />
          <p className="equip__brand">Equip 351006</p>
          <p className="equip__sub">Spiegel · nur Vorschau, 58/80 mm</p>
        </div>
        <div className="equip__console">
          <span className={phase === "printing" ? "printer__led printer__led--busy" : "printer__led"} />
          <span className="equip__status">
            {phase === "compose" && "Bereit"}
            {phase === "printing" && "Spiegelt…"}
            {phase === "preview" && "Vorschau liegt"}
          </span>
          <span className="equip__feed">Feed</span>
        </div>
        <div className="equip__mouth" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
        <div className={`bond-stage${printing ? " is-out" : ""}`}>
          {printing ? (
            <div ref={paperRef} className="bond-paper">
              <ReceiptSlip
                message={draft}
                layout={slipLayout("draft", draftAt, 0, 1)}
                featured
                preview
                imageSrc={previewUrl}
                className="receipt--bond"
              />
            </div>
          ) : (
            <p className="bond-hint">Schreib unten. Hier erscheint die Vorschau — der Bondrucker druckt später.</p>
          )}
        </div>
      </div>

      {phase === "preview" ? (
        <div className="terminal__confirm">
          <p>Das ist der Spiegel. Anheften hängt den Zettel an die Wand und stellt ihn in die Warteschlange des Bondruckers.</p>
          <Button type="button" variant="thermal" className="printer__go" disabled={busy} onClick={() => void confirmPin()}>
            {busy ? "Heftet…" : "An die Pinnwand"}
          </Button>
          <Button type="button" variant="ghost" className="printer__alt" disabled={busy} onClick={() => setPhase("compose")}>
            Zettel ändern
          </Button>
        </div>
      ) : (
        <form className="terminal__form" onSubmit={startPrint} id={formId}>
          <label className="field-label" htmlFor="zettel">
            Dein Zettel
          </label>
          <Textarea
            id="zettel"
            name="text"
            maxLength={MAX}
            rows={4}
            required
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Was soll an die Wand?"
            disabled={locked}
          />
          <div className="photo-well">
            <p className="field-label">Foto</p>
            <input
              ref={cameraRef}
              className="sr-only"
              type="file"
              accept="image/*,image/heic,image/heif"
              capture="environment"
              disabled={locked}
              onChange={(e) => void onPickFile(e.target.files?.[0])}
            />
            <input
              ref={galleryRef}
              className="sr-only"
              type="file"
              accept="image/*,image/heic,image/heif"
              disabled={locked}
              onChange={(e) => void onPickFile(e.target.files?.[0])}
            />
            {previewUrl ? (
              <div className="photo-preview">
                <img src={previewUrl} alt={imageAlt || "Vorschau"} />
                <button type="button" className="photo-preview__x" onClick={clearPhoto} disabled={locked} aria-label="Foto entfernen">
                  <X className="size-4" />
                </button>
                <Input
                  name="imageAlt"
                  maxLength={80}
                  placeholder="Kurzbeschreibung, optional"
                  value={imageAlt}
                  onChange={(e) => setImageAlt(e.target.value)}
                  disabled={locked}
                />
              </div>
            ) : (
              <p className="photo-well__empty">Ein Bild, wenn der Zettel eines braucht. Erscheint auf der Vorschau und an der Wand.</p>
            )}
            <div className="photo-field__row">
              <Button type="button" size="sm" variant="ghost" disabled={locked} onClick={() => cameraRef.current?.click()}>
                <Camera className="size-4" />
                Kamera
              </Button>
              <Button type="button" size="sm" variant="ghost" disabled={locked} onClick={() => galleryRef.current?.click()}>
                <ImagePlus className="size-4" />
                Galerie
              </Button>
            </div>
          </div>
          <div className="printer__meta">
            <label className="printer__name">
              <span className="field-label">Name oder Handle</span>
              <Input
                name="author"
                maxLength={32}
                autoComplete="nickname"
                placeholder="optional"
                value={author}
                onChange={(e) => setAuthor(e.target.value)}
                disabled={locked}
              />
            </label>
            <p className={remaining < 20 ? "printer__count printer__count--low" : "printer__count"}>{remaining}</p>
          </div>
          {error ? <p className="printer__error">{error}</p> : null}
          <Button type="submit" variant="thermal" className="printer__go" disabled={locked || !text.trim()}>
            {phase === "printing" ? "Spiegelt…" : "Vorschau zeigen"}
          </Button>
          <p className="printer__hint">Nichts geht an den Bondrucker, bevor der Zettel an der Wand hängt.</p>
        </form>
      )}
    </div>
  );
}
