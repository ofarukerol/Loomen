// FLAC kodlama — libflacjs (asm.js varyantı: ayrı .wasm dosyası yok; npm bağımlılığı olarak
// derlemede uygulama paketine GÖMÜLÜR — son kullanıcı hiçbir şey kurmaz; masaüstü + iOS +
// Android'de aynı kod çalışır).
//
// Neden FLAC: KAYIPSIZ (16-bit PCM bit-bit korunur — "kalite kesinlikle bozulmasın" şartını
// matematiksel olarak sağlar) ve konuşmada boyutu kabaca yarıya indirir. Oynatma için kod
// çözücü GEREKMEZ: WebKit (iOS/macOS) ve Android <audio>/decodeAudioData FLAC'i yerel çalar.
import * as FlacModuleNS from "libflacjs/dist/libflac.min.js";
import { Encoder } from "libflacjs/lib/encoder.js";

// UMD/CJS interop: modülün kendisi Flac nesnesi (bazı bundler'larda .default altında).
const mod = FlacModuleNS as unknown as { default?: unknown };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const Flac: any = (mod.default ?? FlacModuleNS) as any;

const ready = new Promise<void>((resolve) => {
  if (Flac.isReady()) resolve();
  // onready bir setter: kütüphane, atama anında hazırsa da tetiklemeyi garanti eder.
  else Flac.onready = () => resolve();
});

/** Float32 [-1,1] mono örnekleri 16-bit FLAC olarak kodla (compression level 5). */
export async function encodeFlac(samples: Float32Array, sampleRate: number): Promise<Uint8Array> {
  await ready;
  const enc = new Encoder(Flac, {
    sampleRate,
    channels: 1,
    bitsPerSample: 16,
    compression: 5,
    // Stream modunda başlık sonradan güncellenemez — örnek sayısı baştan bildirilir ki
    // STREAMINFO'da süre bilgisi doğru yazılsın (oynatıcılar süreyi buradan okur).
    totalSamples: samples.length,
    verify: false,
  });
  try {
    const CHUNK = 65536;
    for (let off = 0; off < samples.length; off += CHUNK) {
      const len = Math.min(CHUNK, samples.length - off);
      const view = new Int32Array(len);
      for (let i = 0; i < len; i++) {
        const s = Math.max(-1, Math.min(1, samples[off + i]));
        view[i] = s < 0 ? Math.round(s * 0x8000) : Math.round(s * 0x7fff);
      }
      if (!enc.encode(view)) throw new Error("FLAC kodlama hatası");
    }
    if (!enc.encode()) throw new Error("FLAC sonlandırma hatası"); // finalize
    return enc.getSamples();
  } finally {
    enc.destroy();
  }
}
