// Loomen testi için sahte sağlayıcı — OpenAI uyumlu iki uç.
//
// Amaç: gerçek bir API anahtarı olmadan, uygulamanın ses ve not önerisi akışını uçtan uca
// denemek. Loomen'da sağlayıcı türü "Kendi sunucum" seçilip adres olarak bu sunucu verilir;
// böylece Rust tarafındaki HTTP kurulumu, SSE ayrıştırma ve multipart ses yükleme gerçekten
// çalışır — yalnız cevabı veren model sahtedir.
//
//   node sahte-saglayici.mjs        → http://127.0.0.1:8799/v1
import http from "node:http";

const PORT = 8799;

const CEVAP = [
  "Tamam, ",
  "bunu yeni bir nota yazabilirim. ",
  "Onaylarsan ekliyorum.\n\n",
  "```loomen-note\n",
  '{ "action": "create", "path": "Asistan Denemesi.md", "text": "- Süt al\\n- Ekmek al" }',
  "\n```",
];

const sse = (res, parcalar) => {
  res.writeHead(200, {
    "content-type": "text/event-stream",
    "cache-control": "no-cache",
    connection: "keep-alive",
  });
  let i = 0;
  const tick = setInterval(() => {
    if (i >= parcalar.length) {
      res.write("data: [DONE]\n\n");
      res.end();
      clearInterval(tick);
      return;
    }
    res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: parcalar[i++] } }] })}\n\n`);
  }, 120);
};

http
  .createServer((req, res) => {
    const parcalar = [];
    let boyut = 0;
    req.on("data", (c) => {
      boyut += c.length;
      // Ses yüklemesi ikili ve büyük; onu biriktirmiyoruz, yalnız sayıyoruz.
      if (boyut < 200_000) parcalar.push(c);
    });
    req.on("end", () => {
      const yol = (req.url || "").split("?")[0];
      const govde = Buffer.concat(parcalar).toString("utf8");
      console.log(`${req.method} ${yol} — ${boyut} bayt`);

      if (yol.endsWith("/audio/transcriptions")) {
        // Gerçek ses geldi mi? Boyutu cevaba koyuyoruz ki testte görülebilsin.
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ text: `ses alindi ${boyut} bayt` }));
        return;
      }

      if (yol.endsWith("/chat/completions")) {
        let akis = false;
        try {
          akis = !!JSON.parse(govde).stream;
        } catch {
          /* gövde okunamadıysa akışsız varsay */
        }
        if (akis) return sse(res, CEVAP);
        // Ayarlardaki "Test et" akışsız çağırır ve düz JSON bekler.
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ choices: [{ message: { content: "pong" } }] }));
        return;
      }

      res.writeHead(404).end("yok");
    });
  })
  .listen(PORT, "127.0.0.1", () => console.log(`sahte sağlayıcı hazır: http://127.0.0.1:${PORT}/v1`));
