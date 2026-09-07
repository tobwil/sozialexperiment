import { useMemo, useState } from "react";
import { ReceiptSlip } from "@/components/ReceiptSlip";
import { SlipAnchor } from "@/components/SlipAnchor";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import type { Message } from "@/lib/api";
import { slipLayout } from "@/lib/layout";
import { zettelLabel } from "@/lib/format";

type Props = {
  messages: Message[];
  totalCount: number;
  landingId: string | null;
  flyingId: string | null;
  loading: boolean;
  error: string | null;
  imageById?: Record<string, string>;
};

export function Pinboard({
  messages,
  totalCount,
  landingId,
  flyingId,
  loading,
  error,
  imageById = {},
}: Props) {
  const [openId, setOpenId] = useState<string | null>(null);
  const total = messages.length;
  const openMessage = messages.find((m) => m.id === openId) ?? null;

  const layouts = useMemo(() => {
    return messages.map((m, i) => slipLayout(m.id, m.createdAt, i, total));
  }, [messages, total]);

  return (
    <div className="board-wrap">
      <div className="frame" aria-hidden="true" />
      <section className="board" aria-label="Pinnwand">
        <header className="board__mast">
          <div className="plaque">
            <p className="plaque__kicker">Öffentlich, ohne Konto</p>
            <h1 className="plaque__title">sozialexperiment.de</h1>
            <p className="plaque__count">
              {loading && totalCount === 0 ? "Die Wand wird aufgehängt…" : zettelLabel(totalCount)}
            </p>
          </div>
        </header>

        <div className="board__cork">
          <div className="board__grain" aria-hidden="true" />
          <div className="board__lamp" aria-hidden="true" />

          {totalCount === 0 && !loading && !flyingId ? (
            <div className="empty">
              <div className="empty__ghost">
                <span className="receipt__jag" />
                <p>*** SOZIALEXPERIMENT.DE ***</p>
                <p className="receipt__rule">----------------------------</p>
                <p>Die Pinnwand ist noch leer.</p>
                <p>Erst die Vorschau, dann hängt der Bond schief an der Wand.</p>
              </div>
            </div>
          ) : null}

          {error && totalCount === 0 ? <p className="board__error">{error}</p> : null}

          <div className="board__slips">
            {messages.map((message, index) => {
              const layout = layouts[index]!;
              return (
                <SlipAnchor
                  key={message.id}
                  id={message.id}
                  layout={layout}
                  hidden={flyingId === message.id}
                  zIndex={message.id === openId ? 80 : Math.max(1, layout.z + 4)}
                >
                  <ReceiptSlip
                    message={message}
                    layout={layout}
                    landing={landingId === message.id}
                    imageSrc={imageById[message.id] ?? null}
                    onActivate={() => setOpenId(message.id)}
                  />
                </SlipAnchor>
              );
            })}
          </div>
        </div>
      </section>

      <Dialog open={Boolean(openMessage)} onOpenChange={(o) => !o && setOpenId(null)}>
        <DialogContent>
          <DialogTitle>Zettel</DialogTitle>
          {openMessage ? (
            <div className="receipt-zoom">
              <ReceiptSlip
                message={openMessage}
                layout={slipLayout(openMessage.id, openMessage.createdAt, 0, 1)}
                featured
                imageSrc={imageById[openMessage.id] ?? null}
              />
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
