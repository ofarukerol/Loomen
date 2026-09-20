// Asistan için kısa mikrofon kaydı — "sesle sor" düğmesinin motoru.
//
// Ses notu kaydedicisiyle (screens/Editor/VoiceRecorder) aynı yolu izler: MediaRecorder
// KULLANILMAZ, ham PCM doğrudan Web Audio ile yakalanır. Sebebi orada uzun uzun yazılı —
// kısacası MediaRecorder'ın konteyner çıktısı platformdan platforma değişiyor, ham PCM ise
// her yerde aynı davranıyor.
//
// Buradaki kayıt konuşma tanımaya gider, nota gömülmez: 16 kHz mono yeterli (konuşma tanıma
// modellerinin tamamı zaten bu hıza indiriyor) ve dosya küçüldükçe yükleme hızlanıyor.
import { useCallback, useEffect, useRef, useState } from "react";
import { encodeWav } from "../core/wav";

/** Konuşma tanımaya gönderilen örnekleme hızı. Daha yükseği dosyayı büyütür, faydası yok. */
const STT_SAMPLE_RATE = 16000;
/** Seviye göstergesinin güncellenme aralığı (ms). */
const LEVEL_TICK_MS = 100;
/**
 * Kaydın üst sınırı (saniye). Kullanıcı durdurmayı unutursa sağlayıcıya devasa bir dosya
 * gitmesin — sorular kısa olur, 2 dakika fazlasıyla yeter.
 */
const MAX_SECONDS = 120;

export interface MicRecorder {
  recording: boolean;
  /** Geçen süre (saniye, tam sayı). */
  seconds: number;
  /** Anlık ses seviyesi 0..1 — düğmenin canlı görünmesi için. */
  level: number;
  /** Mikrofon açılamadıysa sebebi (kullanıcıya gösterilir). */
  error: string | null;
  start: () => Promise<void>;
  /** Kaydı bitir ve WAV baytlarını ver. Hiç ses yakalanmadıysa null. */
  stop: () => Promise<Uint8Array | null>;
  /** Kaydı bitir ve at. */
  cancel: () => void;
}

export function useMicRecorder(): MicRecorder {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [level, setLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const ctxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const procRef = useRef<ScriptProcessorNode | null>(null);
  const nodesRef = useRef<AudioNode[]>([]);
  const chunksRef = useRef<Float32Array[]>([]);
  const totalRef = useRef(0);
  const peakRef = useRef(0);
  const activeRef = useRef(false);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // stop() içinde okunur: state güncellemesi asenkron olduğu için ref şart.
  const rateRef = useRef(STT_SAMPLE_RATE);

  /** Ses grafiğini ve akışı kapat. Örnekler ELDE KALIR (stop bunları kodlayacak). */
  const teardown = useCallback(() => {
    activeRef.current = false;
    if (tickRef.current != null) clearInterval(tickRef.current);
    tickRef.current = null;
    if (procRef.current) procRef.current.onaudioprocess = null;
    for (const n of nodesRef.current) {
      try {
        n.disconnect();
      } catch {
        /* zaten kopmuş */
      }
    }
    nodesRef.current = [];
    procRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    void ctxRef.current?.close().catch(() => {});
    ctxRef.current = null;
  }, []);

  // Bileşen giderse mikrofon açık kalmasın (kayıt ışığı yanar kalırdı).
  useEffect(() => () => teardown(), [teardown]);

  const reset = () => {
    chunksRef.current = [];
    totalRef.current = 0;
    peakRef.current = 0;
    setSeconds(0);
    setLevel(0);
  };

  const start = useCallback(async () => {
    if (activeRef.current) return;
    setError(null);
    reset();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
      });
      streamRef.current = stream;
      const ctx = new AudioContext();
      ctxRef.current = ctx;
      rateRef.current = ctx.sampleRate;

      const src = ctx.createMediaStreamSource(stream);
      const proc = ctx.createScriptProcessor(4096, 1, 1);
      procRef.current = proc;
      nodesRef.current = [src, proc];

      proc.onaudioprocess = (e) => {
        if (!activeRef.current) return;
        const input = e.inputBuffer.getChannelData(0);
        chunksRef.current.push(new Float32Array(input));
        totalRef.current += input.length;
        let p = 0;
        for (let i = 0; i < input.length; i++) {
          const a = Math.abs(input[i]);
          if (a > p) p = a;
        }
        peakRef.current = p;
      };

      src.connect(proc);
      // ScriptProcessor bir çıkışa bağlı değilse bazı tarayıcılarda hiç ateşlemez;
      // sessiz bir kazanç düğümü üzerinden hoparlöre bağlanır (duyulan bir şey olmaz).
      const mute = ctx.createGain();
      mute.gain.value = 0;
      proc.connect(mute);
      mute.connect(ctx.destination);
      nodesRef.current.push(mute);

      activeRef.current = true;
      setRecording(true);
      tickRef.current = setInterval(() => {
        const sec = totalRef.current / rateRef.current;
        setSeconds(Math.floor(sec));
        setLevel(peakRef.current);
        if (sec >= MAX_SECONDS) {
          // Üst sınır: kaydı kes ama örnekleri koru — kullanıcı durdurmuş gibi davran.
          activeRef.current = false;
          if (tickRef.current != null) clearInterval(tickRef.current);
          tickRef.current = null;
        }
      }, LEVEL_TICK_MS);
    } catch (e) {
      teardown();
      setRecording(false);
      setError(e instanceof Error ? e.message : String(e));
      throw e;
    }
  }, [teardown]);

  const stop = useCallback(async (): Promise<Uint8Array | null> => {
    if (!ctxRef.current && !activeRef.current && totalRef.current === 0) return null;
    activeRef.current = false;
    const rate = rateRef.current;
    const chunks = chunksRef.current;
    const total = totalRef.current;
    teardown();
    setRecording(false);
    setLevel(0);
    if (total === 0) return null;

    let samples = new Float32Array(total);
    let off = 0;
    for (const c of chunks) {
      samples.set(c, off);
      off += c.length;
    }
    chunksRef.current = [];
    totalRef.current = 0;

    // 16 kHz'e indir — OfflineAudioContext sistem kalitesinde yeniden örnekler.
    // Başarısız olursa özgün hızda gönderilir; ses kaybolmaz, dosya biraz büyür.
    let outRate = rate;
    if (rate > STT_SAMPLE_RATE) {
      try {
        const src = new AudioBuffer({ length: samples.length, numberOfChannels: 1, sampleRate: rate });
        src.copyToChannel(samples, 0);
        const oac = new OfflineAudioContext(
          1,
          Math.ceil((samples.length * STT_SAMPLE_RATE) / rate),
          STT_SAMPLE_RATE,
        );
        const node = oac.createBufferSource();
        node.buffer = src;
        node.connect(oac.destination);
        node.start();
        const rendered = await oac.startRendering();
        samples = rendered.getChannelData(0).slice();
        outRate = STT_SAMPLE_RATE;
      } catch {
        /* özgün hızda devam */
      }
    }
    return encodeWav([samples], outRate);
  }, [teardown]);

  const cancel = useCallback(() => {
    teardown();
    reset();
    setRecording(false);
  }, [teardown]);

  return { recording, seconds, level, error, start, stop, cancel };
}
