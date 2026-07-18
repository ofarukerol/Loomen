// WAV kodlama/çözme yardımcıları — ses notu kaydı için (dış bağımlılık yok, saf Web Audio + DataView).
// WAV seçildi: MediaRecorder'ın ürettiği webm/mp4 konteynerleri rastgele bir noktadan "kesip
// üzerine kayıt" için uygun değil (demux gerekir); WAV ham PCM olduğundan örnek düzeyinde
// kesme/birleştirme kolay ve her yerde (native <audio>) sorunsuz çalar.

/** AudioBuffer'ın kanallarını bağımsız Float32Array'lere kopyala. */
export function channelsFromAudioBuffer(buf: AudioBuffer): Float32Array[] {
  const out: Float32Array[] = [];
  for (let ch = 0; ch < buf.numberOfChannels; ch++) out.push(buf.getChannelData(ch).slice());
  return out;
}

/** Her kanalı `endSample`'a kadar kes (Apple Ses Notları tarzı "buradan devam" için). */
export function sliceChannels(channels: Float32Array[], endSample: number): Float32Array[] {
  const end = Math.max(0, endSample);
  return channels.map((c) => c.slice(0, Math.min(end, c.length)));
}

/** İki kanal setini ardışık birleştir (a'nın sonuna b eklenir). */
export function concatChannels(a: Float32Array[], b: Float32Array[]): Float32Array[] {
  const n = Math.max(a.length, b.length, 1);
  const out: Float32Array[] = [];
  for (let i = 0; i < n; i++) {
    const ca = a[i] ?? new Float32Array(0);
    const cb = b[i] ?? new Float32Array(0);
    const merged = new Float32Array(ca.length + cb.length);
    merged.set(ca, 0);
    merged.set(cb, ca.length);
    out.push(merged);
  }
  return out;
}

/** Kanal örnek sayısı → saniye. */
export function channelsDurationSec(channels: Float32Array[], sampleRate: number): number {
  return (channels[0]?.length ?? 0) / sampleRate;
}

/** Float32 PCM kanalları → 16-bit PCM WAV (Uint8Array). */
export function encodeWav(channels: Float32Array[], sampleRate: number): Uint8Array {
  const numChannels = Math.max(1, channels.length);
  const numFrames = channels[0]?.length ?? 0;
  const bytesPerSample = 2;
  const blockAlign = numChannels * bytesPerSample;
  const dataSize = numFrames * blockAlign;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  const writeStr = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
  };

  writeStr(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  writeStr(36, "data");
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < numFrames; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      const s = Math.max(-1, Math.min(1, channels[ch]?.[i] ?? 0));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      offset += 2;
    }
  }
  return new Uint8Array(buffer);
}

interface WavInfo {
  numChannels: number;
  sampleRate: number;
  bitsPerSample: number;
  dataOffset: number;
  dataLength: number;
}

/** Bizim encodeWav ile ürettiğimiz standart 44 byte'lık başlığı çöz. */
function readWavInfo(bytes: Uint8Array): WavInfo {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return {
    numChannels: view.getUint16(22, true),
    sampleRate: view.getUint32(24, true),
    bitsPerSample: view.getUint16(34, true),
    dataOffset: 44,
    dataLength: view.getUint32(40, true),
  };
}

/** WAV süresini (saniye) başlıktan hesapla — decode gerekmez. */
export function wavDurationSec(bytes: Uint8Array): number {
  const info = readWavInfo(bytes);
  const frameSize = (info.bitsPerSample / 8) * info.numChannels;
  if (frameSize === 0 || info.sampleRate === 0) return 0;
  return info.dataLength / frameSize / info.sampleRate;
}

/** Statik dalga formu için `numBars` çubukluk genlik (0..1) dizisi — başlıktan doğrudan okur. */
export function computeWavPeaks(bytes: Uint8Array, numBars: number): number[] {
  const info = readWavInfo(bytes);
  const bytesPerSample = info.bitsPerSample / 8;
  const frameSize = bytesPerSample * info.numChannels;
  if (frameSize === 0) return new Array(numBars).fill(0);
  const numFrames = Math.floor(info.dataLength / frameSize);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const peaks: number[] = new Array(numBars).fill(0);
  const framesPerBar = Math.max(1, Math.floor(numFrames / numBars));
  for (let bar = 0; bar < numBars; bar++) {
    let maxAmp = 0;
    const start = bar * framesPerBar;
    const end = Math.min(numFrames, start + framesPerBar);
    for (let f = start; f < end; f++) {
      const base = info.dataOffset + f * frameSize;
      for (let ch = 0; ch < info.numChannels; ch++) {
        const s = view.getInt16(base + ch * bytesPerSample, true);
        const amp = Math.abs(s) / 0x8000;
        if (amp > maxAmp) maxAmp = amp;
      }
    }
    peaks[bar] = maxAmp;
  }
  return peaks;
}

/** Ham Float32 örneklerden `numBars` çubukluk genlik (0..1) dizisi (FLAC vb. decode sonrası). */
export function computePeaksFromSamples(samples: Float32Array, numBars: number): number[] {
  const peaks: number[] = new Array(numBars).fill(0);
  const n = samples.length;
  if (n === 0) return peaks;
  const per = Math.max(1, Math.floor(n / numBars));
  for (let b = 0; b < numBars; b++) {
    let m = 0;
    const start = b * per;
    const end = Math.min(n, start + per);
    for (let i = start; i < end; i++) {
      const v = Math.abs(samples[i]);
      if (v > m) m = v;
    }
    peaks[b] = m;
  }
  return peaks;
}

/** Yüksek çözünürlüklü peak dizisini `numBars`'a indir (max-pool) — kap ölçüsü değişince
 *  sesi yeniden çözmeden dalga formunu yeniden boyutlandırmak için. */
export function downsamplePeaks(peaks: number[], numBars: number): number[] {
  const out: number[] = new Array(numBars).fill(0);
  const n = peaks.length;
  if (n === 0) return out;
  for (let b = 0; b < numBars; b++) {
    const start = Math.floor((b * n) / numBars);
    const end = Math.max(start + 1, Math.floor(((b + 1) * n) / numBars));
    let m = 0;
    for (let i = start; i < end && i < n; i++) if (peaks[i] > m) m = peaks[i];
    out[b] = m;
  }
  return out;
}

/** mm:ss biçimi. */
export function formatDuration(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}
