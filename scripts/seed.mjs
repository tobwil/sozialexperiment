const API = process.env.API_URL || "http://127.0.0.1:43173";
const ADMIN_KEY = process.env.ADMIN_KEY || "dev-admin";

const samples = [
  ["Die Stadt ist zu laut. Trotzdem schön.", "mira"],
  ["Wer das liest, soll einem Fremden nicken.", null],
  ["Heute keine Meinung. Nur Kaffee.", "jan"],
  ["Pinnwand > Timeline.", "k."],
  ["Ich war hier, kurz, und wieder weg.", null],
  ["Bitte mehr Bänke, weniger Werbung.", "Lea"],
  ["Thermopapier hält länger als Tweets. Behaupte ich.", "tobias"],
  ["Jemand hat meinen Schirm im Café.", "n."],
  ["Gegen 18 Uhr Licht auf dem Hof. Kommt raus.", null],
  ["Das hier ist kein Feed. Es knittert.", "anon"],
  ["Erste Mal analog online. Fühlt sich richtig an.", "Sven"],
  ["Wer tanzt, darf den Zettel schief aufhängen.", "rio"],
  ["Guten Morgen, unbekanntes Gegenüber.", null],
  ["Die Tram war pünktlich. Notiert, 2026.", "U-Bahn-Fee"],
  ["Kleine Geste: Tür aufhalten. Große Wirkung.", "eva"],
  ["Wenn du das liest: trink Wasser.", "nona"],
  ["Gefunden: eine Stimme, die nicht schreit.", null],
  ["Kiosk um die Ecke hat noch Kirschsaft.", "Ben"],
  ["Ich hänge das extra schief auf.", "schief"],
  ["Sozialexperiment, Tag 1. Niemand wurde verletzt.", "protokoll"],
  ["Die Wand hört besser zu als mein Chat.", null],
  ["Nimm den Zettel nicht mit. Er gehört allen.", "regel"],
];

async function main() {
  for (const [text, author] of samples) {
    const res = await fetch(`${API}/api/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ADMIN_KEY}`,
      },
      body: JSON.stringify({ text, author }),
    });
    const data = await res.json();
    if (!res.ok) {
      console.error("fail", data);
      continue;
    }
    console.log("ok", data.message.id, text.slice(0, 40));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
