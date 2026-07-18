// Ses embed dosyaları için MIME + dalga formu meta'sı (format-bağımsız).
// WAV: başlıktan okunur (hızlı, decode yok). FLAC vb: WebAudio decodeAudioData ile —
// WebKit (iOS/macOS) ve Android FLAC'i yerel çözer, ek kod çözücü gerekmez.
import { computeWavPeaks, wavDurationSec, computePeaksFromSamples } from "./wav";

/** Yüksek çözünürlüklü peak sayısı — UI, downsamplePeaks ile kap ölçüsüne indirger. */
export const META_PEAK_RES = 96;

export function audioMime(path: string): string {
  const ext = path.slice(path.lastIndexOf(".") + 1).toLowerCase();
  switch (ext) {
    case "flac":
      return "audio/flac";
    case "wav":
      return "audio/wav";
    case "m4a":
      return "audio/mp4";
    case "aac":
      return "audio/aac";
    case "mp3":
      return "audio/mpeg";
    default:
      return "audio/webm";
  }
}

let sharedCtx: AudioContext | null = null;

/** Dalga formu (META_PEAK_RES çubuk) + süre. decodeAudioData suspend context'te de çalışır. */
export async function audioMeta(
  path: string,
  bytes: Uint8Array
): Promise<{ peaks: number[]; duration: number }> {
  if (path.toLowerCase().endsWith(".wav")) {
    return { peaks: computeWavPeaks(bytes, META_PEAK_RES), duration: wavDurationSec(bytes) };
  }
  sharedCtx ??= new AudioContext();
  const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const buf = await sharedCtx.decodeAudioData(ab);
  return { peaks: computePeaksFromSamples(buf.getChannelData(0), META_PEAK_RES), duration: buf.duration };
}
