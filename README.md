# sozialexperiment.de

Öffentliche Pinnwand aus Thermobelegen. Besucher schreiben einen kurzen Zettel (optional mit Foto). Zuerst erscheint ein **digitaler Spiegel** (Vorschau) des Bonds. Erst beim Anheften hängt der Streifen an der Wand und geht in die Warteschlange des echten **Bondruckers** (Equip 351006).

Kein Login. Kein Feed. Papier, das knittert.

## Lokal starten

Voraussetzung: Node.js 20+.

```bash
npm install
npm run dev
```

Öffnen: [http://127.0.0.1:43173](http://127.0.0.1:43173)

Die API liegt unter `/api/messages`. Fotos unter `/api/messages/:id/image`. Ohne Netlify-Blobs speichert das Backend lokal in `data/` (JSON + `data/images/`). Mit `@netlify/vite-plugin` stehen Functions und Blobs im Dev-Server bereit.

Optional Demo-Zettel (ohne Fotos):

```bash
npm run seed
```

## Vorschau → Wand → Bondrucker

Ablauf (Desktop: rechte Spalte / Mobile: **Schreiben**):

1. Text schreiben, optional Name, optional Foto (Kamera oder Galerie — im Browser JPEG, max. 1200 px).
2. **Vorschau zeigen** — GSAP: der Bond schiebt sich aus dem Spiegel des Equip 351006. Noch nichts an der Wand, noch nichts in der Queue.
3. Prüfen. **Zettel ändern** oder **An die Pinnwand**.
4. Der Streifen fliegt an die Pinnwand. Status: **In der Warteschlange**. Der Print-Worker schickt ihn an den Bondrucker (oder Dry-Run, wenn kein Gerät hängt).

Die goldene Titelleiste sitzt in einem eigenen Band über dem Kork — Zettel spawnen nur darunter.

## Admin

Moderation unter `/admin`. `ADMIN_KEY` in der Netlify-UI oder lokal in `.env`. Extra-Blockliste: `BLOCKLIST=wort1,wort2`. Rate-Limit Standard: 5 Zettel / 10 Minuten / IP.

## Print-Worker (Bondrucker)

Hardware: ESC/POS 58/80 mm, USB/Bluetooth (Equip 351006, Amazon ASIN B0GSJG32X1). Bis der Drucker da ist: Dry-Run.

```bash
cd print-worker
npm install
cp .env.example .env
npm run dry-run
```

Der Worker pollt `/api/queue`. Fotos: Zeile `[Foto an der Pinnwand]` auf dem Bond (Rasterdruck kommt, sobald das Gerät da ist; Dry-Run speichert das Bild zusätzlich nach `print-worker/out/`). Ist der Drucker weg, bleibt die Queue auf `pending`.

### Echter USB-Drucker

```bash
ls /dev/usb/lp* /dev/ttyUSB* /dev/ttyACM* 2>/dev/null
```

Häufig `/dev/usb/lp0` oder `/dev/ttyUSB0`. In `print-worker/.env`: `DRY_RUN=0`, `PRINTER_PATH=/dev/usb/lp0`, `PRINTER_WIDTH=32` (58 mm) oder `48` (80 mm), `API_URL=https://sozialexperiment.de`.

Bluetooth (Stretch): `sudo rfcomm bind 0 AA:BB:CC:DD:EE:FF` → `PRINTER_PATH=/dev/rfcomm0`.

## Deploy auf Netlify

1. Repo verbinden, Build `npm run build`, Publish `dist`.
2. Env: `ADMIN_KEY`, `PRINT_WORKER_KEY`, optional `BLOCKLIST`.
3. DNS `sozialexperiment.de` auf Netlify (Apex ALIAS/Nameserver, `www` CNAME).
4. Print-Worker: `API_URL=https://sozialexperiment.de`.

Produktion: Netlify Blobs (`pinnwand` + `pinnwand-images`).

## API

| Methode | Pfad | Wer |
|---|---|---|
| `GET` | `/api/messages` | öffentlich |
| `POST` | `/api/messages` | öffentlich `{ text, author?, imageAlt?, image?: { mime, data } }` |
| `GET` | `/api/messages/:id/image` | öffentlich |
| `GET` | `/api/queue` | Print-Worker-Key |
| `PATCH` | `/api/messages/:id` | Worker/Admin |
| `DELETE` | `/api/messages/:id` | Admin-Key |
| `GET` | `/api/health` | öffentlich |

`image.data` ist Base64 (JPEG nach Client-Komprimierung, max. ~900 KB).

## Stack

Vite + React + TypeScript, Netlify Functions, Blobs oder lokale Dateien, Node-Print-Worker ohne native USB-Bindings.
