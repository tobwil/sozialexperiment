import { useState } from "react";
import type { Message } from "@/lib/api";
import { messageImageUrl } from "@/lib/api";
import { formatDe, formatDeShort, printStatusLabel } from "@/lib/format";
import type { SlipLayout } from "@/lib/layout";
import { cn } from "@/lib/utils";

type Props = {
  message: Message;
  layout: SlipLayout;
  featured?: boolean;
  landing?: boolean;
  preview?: boolean;
  imageSrc?: string | null;
  className?: string;
  onActivate?: () => void;
};

export function ReceiptSlip({
  message,
  layout,
  featured = false,
  landing = false,
  preview = false,
  imageSrc,
  className,
  onActivate,
}: Props) {
  const pin = layout.pin;
  const remote =
    message.hasImage && message.id !== "draft" ? messageImageUrl(message.id, message.createdAt) : null;
  const [failed, setFailed] = useState<Set<string>>(() => new Set());
  const src = [imageSrc, remote].find(
    (candidate): candidate is string => typeof candidate === "string" && candidate.length > 0 && !failed.has(candidate),
  );
  const expectPhoto = Boolean(imageSrc || message.hasImage);
  const showMissing = expectPhoto && !src;

  return (
    <article
      className={cn("receipt", featured && "receipt--featured", expectPhoto && "receipt--photo", className)}
      style={{ width: featured ? undefined : layout.width }}
    >
      <span className="receipt__jag" aria-hidden="true" />
      {pin === "tape" ? (
        <span className="receipt__tape" aria-hidden="true" />
      ) : (
        <span className={cn("receipt__pin", pin === "brass" && "receipt__pin--brass")} aria-hidden="true" />
      )}
      <header className="receipt__head">
        <p>*** SOZIALEXPERIMENT.DE ***</p>
        <p className="receipt__rule">----------------------------</p>
      </header>
      {src ? (
        <img
          className="receipt__photo"
          src={src}
          alt={message.imageAlt || "Foto zum Zettel"}
          onError={() => setFailed((prev) => new Set(prev).add(src))}
        />
      ) : null}
      {showMissing ? (
        <p className="receipt__photo-missing" role="img" aria-label="Foto fehlt">
          Foto fehlt
        </p>
      ) : null}
      <p className="receipt__body">{message.text}</p>
      <p className="receipt__rule">----------------------------</p>
      {message.author ? <p className="receipt__author">~ {message.author}</p> : null}
      <footer className="receipt__foot">
        <time dateTime={message.createdAt}>
          {featured ? formatDe(message.createdAt) : formatDeShort(message.createdAt)}
        </time>
        <span className="receipt__status">{printStatusLabel(message.status, preview)}</span>
      </footer>
      {onActivate ? (
        <button
          type="button"
          className="receipt__hit"
          onClick={onActivate}
          aria-label={`Zettel lesen: ${message.text.slice(0, 80)}`}
        />
      ) : null}
      {landing ? <span className="receipt__land" aria-hidden="true" /> : null}
    </article>
  );
}
