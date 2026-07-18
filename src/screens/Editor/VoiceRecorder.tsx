import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Mic, Pause, Play, Check, Trash2, AlertTriangle } from "lucide-react";
import { useAppStore } from "../../store/useAppStore";
import { useWaveBarCount } from "../../hooks/useWaveBarCount";
import { encodeWav, formatDuration } from "../../core/wav";

type Phase = "idle" | "active";
type RecState = "recording" | "paused";

interface Props {
  /** Kayıt tamamlanınca embed satırını nota ekler (EditorScreen, CM view'a dispatch eder —
   *  CodeMirror dış value değişikliklerini almadığı için setDraft tek başına YETMEZ). */
  onInsert: (embedLine: string) => void;
}

/** Peak önbelleği bloğu (örnek) — ~43ms @48kHz. Dalga formu bu bloklardan hesaplanır. */
const PEAK_BLOCK = 2048;
/**
 * Kayıt dosyası örnekleme hızı. Donanım 48kHz yakalar; kaydederken 24kHz mono'ya yeniden
 * örneklenir → dosya boyutu YARIYA iner (≈2.9MB/dk). 24kHz = "süper-geniş bant" konuşma
 * standardı (Nyquist 12kHz; insan sesinin tüm formant/sibilant içeriğini kapsar) — HD telefon
 * sesinin (16kHz) üzerinde, konuşma için algısal olarak şeffaftır. Yeniden örnekleme
 * OfflineAudioContext ile yapılır (sistem kalitesinde, alias'sız).
 */
const SAVE_SAMPLE_RATE = 24000;
/** Dalga formu/süre güncelleme aralığı (ms) — kayıt sürerken. */
const UI_TICK_MS = 150;

/**
 * Not editörüne ses notu kaydı — TEK, birleşik bar:
 *   çöp · duraklat(kayıt)/oynat(önizleme) · dalga formu + sürüklenebilir imleç · süre · buradan-kaydet · onayla
 *
 * MİMARİ: MediaRecorder KULLANILMAZ. iOS'un MediaRecorder'ı MP4/AAC üretir ve MP4 metadata'sını
 * (moov atom) ancak kayıt bitince yazar — ara parçalar decodeAudioData ile ÇÖZÜLEMEZ (canlı dalga
 * imkânsız) ve bazı WebKit sürümlerinde parçaların birleşimi final'de bile bozuk olabilir.
 * Bunun yerine ham PCM, Web Audio ScriptProcessorNode ile doğrudan yakalanır:
 *   - canlı dalga formu: her ses bloğunda peak → gerçek zamanlı, decode yok
 *   - duraklat/devam: örnek eklemeyi durdur/başlat — anlık, kayıpsız
 *   - "buradan kaydet": örnek dizisini imleç noktasında kes, üzerine ekle — örnek hassasiyetinde
 *   - kaydet: örneklerden doğrudan WAV kodla (bkz core/wav.ts) — her platformda aynı davranış
 */
export function VoiceRecorder({ onInsert }: Props) {
  const { t } = useTranslation();

  const [phase, setPhase] = useState<Phase>("idle");
  const [recState, setRecState] = useState<RecState>("recording");
  const [error, setError] = useState<string | null>(null);
  const [peaks, setPeaks] = useState<number[]>([]);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [wavUrl, setWavUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // ✓'ya ilk basışta kayıt duraklar ve ad girişi açılır (boş bırakılırsa zaman damgası).
  const [naming, setNaming] = useState(false);
  const [nameValue, setNameValue] = useState("");

  // — Ses grafiği —
  const ctxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const nodesRef = useRef<AudioNode[]>([]);
  const procRef = useRef<ScriptProcessorNode | null>(null);
  // — PCM verisi —
  const pcmChunksRef = useRef<Float32Array[]>([]);
  const totalSamplesRef = useRef(0);
  const peakBlocksRef = useRef<number[]>([]);
  const blockPeakRef = useRef(0);
  const blockFillRef = useRef(0);
  const recordingRef = useRef(false); // onaudioprocess kapısı
  // — UI —
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const wavUrlRef = useRef<string | null>(null);
  // Çubuk sayısı kabın gerçek genişliğinden — sabit sayı dar ekranda taşıyordu (imleç/süre
  // üstüne binme). Tick closure'ı güncel değeri ref'ten okur.
  const waveRef = useRef<HTMLDivElement>(null);
  const barCount = useWaveBarCount(waveRef);
  const barCountRef = useRef(barCount);

  const sampleRate = () => ctxRef.current?.sampleRate ?? 48000;

  // ---------- PCM yardımcıları ----------

  const mergeSamples = (): Float32Array => {
    const out = new Float32Array(totalSamplesRef.current);
    let off = 0;
    for (const c of pcmChunksRef.current) {
      out.set(c, off);
      off += c.length;
    }
    return out;
  };

  /** peakBlocks + kısmi blok → `n` çubukluk 0..1 genlik dizisi (tüm kayıt sıkıştırılır). */
  const computeBars = (n: number): number[] => {
    const blocks = peakBlocksRef.current;
    const nBlocks = blocks.length + (blockFillRef.current > 0 ? 1 : 0);
    const bars: number[] = new Array(n).fill(0.04);
    if (nBlocks === 0) return bars;
    const at = (i: number) => (i < blocks.length ? blocks[i] : blockPeakRef.current);
    for (let b = 0; b < n; b++) {
      const start = Math.floor((b * nBlocks) / n);
      const end = Math.max(start + 1, Math.floor(((b + 1) * nBlocks) / n));
      let m = 0;
      for (let i = start; i < end && i < nBlocks; i++) if (at(i) > m) m = at(i);
      bars[b] = Math.max(0.04, m);
    }
    return bars;
  };

  // Kap ölçüsü değişince: ref'i tazele; duraklatılmış görünümde çubukları hemen yeniden çiz
  // (kayıt sürerken zaten tick her turda güncel sayıyla çizer).
  useEffect(() => {
    barCountRef.current = barCount;
    if (phase === "active" && !recordingRef.current) setPeaks(computeBars(barCount));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [barCount, phase]);

  /** Örnek dizisini `sampleIdx`'te kes; peak önbelleğini kesilen veriden yeniden kur. */
  const truncateAt = (sampleIdx: number) => {
    const idx = Math.max(0, Math.min(totalSamplesRef.current, Math.round(sampleIdx)));
    const kept = mergeSamples().slice(0, idx);
    pcmChunksRef.current = kept.length ? [kept] : [];
    totalSamplesRef.current = kept.length;
    const blocks: number[] = [];
    let peak = 0;
    let fill = 0;
    for (let i = 0; i < kept.length; i++) {
      const v = Math.abs(kept[i]);
      if (v > peak) peak = v;
      if (++fill >= PEAK_BLOCK) {
        blocks.push(peak);
        peak = 0;
        fill = 0;
      }
    }
    peakBlocksRef.current = blocks;
    blockPeakRef.current = peak;
    blockFillRef.current = fill;
  };

  // ---------- Yaşam döngüsü ----------

  const stopGraph = () => {
    if (tickRef.current != null) clearInterval(tickRef.current);
    tickRef.current = null;
    if (procRef.current) procRef.current.onaudioprocess = null;
    procRef.current = null;
    nodesRef.current.forEach((n) => n.disconnect());
    nodesRef.current = [];
    streamRef.current?.getTracks().forEach((tr) => tr.stop());
    streamRef.current = null;
  };

  useEffect(
    () => () => {
      // Unmount: mikrofon açık kalmasın, context/URL sızmasın.
      stopGraph();
      ctxRef.current?.close().catch(() => {});
      if (wavUrlRef.current) URL.revokeObjectURL(wavUrlRef.current);
    },
    []
  );

  const setPreviewUrl = (url: string | null) => {
    if (wavUrlRef.current) URL.revokeObjectURL(wavUrlRef.current);
    wavUrlRef.current = url;
    setWavUrl(url);
  };

  const startUiTick = () => {
    if (tickRef.current != null) clearInterval(tickRef.current);
    tickRef.current = setInterval(() => {
      const dur = totalSamplesRef.current / sampleRate();
      setDuration(dur);
      setCurrentTime(dur); // kayıt sürerken imleç canlı uçta
      setPeaks(computeBars(barCountRef.current));
    }, UI_TICK_MS);
  };

  // ---------- Aksiyonlar ----------

  const startRecording = async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const ctx = (ctxRef.current ??= new AudioContext());
      if (ctx.state === "suspended") await ctx.resume();

      const src = ctx.createMediaStreamSource(stream);
      const proc = ctx.createScriptProcessor(4096, 1, 1);
      proc.onaudioprocess = (e) => {
        if (!recordingRef.current) return;
        const input = e.inputBuffer.getChannelData(0);
        pcmChunksRef.current.push(new Float32Array(input)); // buffer yeniden kullanılır → kopya şart
        totalSamplesRef.current += input.length;
        let peak = blockPeakRef.current;
        let fill = blockFillRef.current;
        for (let i = 0; i < input.length; i++) {
          const v = Math.abs(input[i]);
          if (v > peak) peak = v;
          if (++fill >= PEAK_BLOCK) {
            peakBlocksRef.current.push(peak);
            peak = 0;
            fill = 0;
          }
        }
        blockPeakRef.current = peak;
        blockFillRef.current = fill;
      };
      // ScriptProcessor yalnızca destination'a giden aktif bir yol varsa çalışır (WebKit);
      // sessiz (gain=0) köprü — mikrofon hoparlörden duyulmaz.
      const zero = ctx.createGain();
      zero.gain.value = 0;
      src.connect(proc);
      proc.connect(zero);
      zero.connect(ctx.destination);
      nodesRef.current = [src, proc, zero];
      procRef.current = proc;

      recordingRef.current = true;
      setRecState("recording");
      setPhase("active");
      setPreviewUrl(null);
      setIsPlaying(false);
      startUiTick();
    } catch {
      setError(t("audio.permissionDenied"));
    }
  };

  /** Kaydı duraklat: örnek eklemeyi durdur, önizleme WAV'ını hazırla. Mikrofon açık kalır. */
  const pauseRecording = () => {
    recordingRef.current = false;
    if (tickRef.current != null) clearInterval(tickRef.current);
    tickRef.current = null;
    const dur = totalSamplesRef.current / sampleRate();
    setDuration(dur);
    setCurrentTime(dur);
    setPeaks(computeBars(barCountRef.current));
    // Önizleme için WAV kodla (senkron — kısa kayıtlarda milisaniyeler sürer).
    if (totalSamplesRef.current > 0) {
      const bytes = encodeWav([mergeSamples()], sampleRate());
      setPreviewUrl(URL.createObjectURL(new Blob([bytes], { type: "audio/wav" })));
    }
    setRecState("paused");
  };

  /** Duraklatmışken: imlecin olduğu andan sonrasını at, kayda oradan devam et. */
  const recordFromHere = () => {
    audioElRef.current?.pause();
    setIsPlaying(false);
    truncateAt(currentTime * sampleRate());
    setPreviewUrl(null);
    recordingRef.current = true;
    setRecState("recording");
    startUiTick();
  };

  const togglePlay = () => {
    const el = audioElRef.current;
    if (!el || !wavUrl) return;
    if (isPlaying) {
      el.pause();
    } else {
      // İmleç en sondaysa baştan çal (sondan oynatmak anında biter).
      if (currentTime >= duration - 0.05) {
        el.currentTime = 0;
        setCurrentTime(0);
      }
      void el.play();
    }
  };

  const discardAll = () => {
    recordingRef.current = false;
    audioElRef.current?.pause(); // ayrık <audio> bazı tarayıcılarda çalmaya devam edebilir
    stopGraph();
    pcmChunksRef.current = [];
    totalSamplesRef.current = 0;
    peakBlocksRef.current = [];
    blockPeakRef.current = 0;
    blockFillRef.current = 0;
    setPreviewUrl(null);
    setPeaks([]);
    setDuration(0);
    setCurrentTime(0);
    setIsPlaying(false);
    setSaving(false);
    setNaming(false);
    setNameValue("");
    setError(null);
    setPhase("idle");
  };

  const saveToNote = async () => {
    if (saving) return;
    recordingRef.current = false;
    if (tickRef.current != null) clearInterval(tickRef.current);
    tickRef.current = null;
    if (totalSamplesRef.current === 0) {
      discardAll();
      return;
    }
    setSaving(true);
    try {
      let samples = mergeSamples();
      let rate = sampleRate();
      // Boyut için 24kHz'e yeniden örnekle (bkz SAVE_SAMPLE_RATE) — başarısızlıkta özgün
      // hızda kaydet, veri asla kaybolmaz.
      if (rate > SAVE_SAMPLE_RATE) {
        try {
          const src = new AudioBuffer({ length: samples.length, numberOfChannels: 1, sampleRate: rate });
          src.copyToChannel(samples, 0);
          const off = new OfflineAudioContext(
            1,
            Math.ceil((samples.length * SAVE_SAMPLE_RATE) / rate),
            SAVE_SAMPLE_RATE
          );
          const node = off.createBufferSource();
          node.buffer = src;
          node.connect(off.destination);
          node.start();
          const rendered = await off.startRendering();
          samples = rendered.getChannelData(0).slice();
          rate = SAVE_SAMPLE_RATE;
        } catch {
          /* OfflineAudioContext yoksa özgün hızda devam */
        }
      }
      // FLAC (kayıpsız, ~%50 daha küçük, gömülü libflacjs) — başarısızsa WAV'a düş
      // (yine kayıpsız; veri asla riske girmez).
      let bytes: Uint8Array;
      let ext = "flac";
      try {
        const { encodeFlac } = await import("../../core/flac");
        bytes = await encodeFlac(samples, rate);
      } catch {
        bytes = encodeWav([samples], rate);
        ext = "wav";
      }
      const path = await useAppStore.getState().saveAudioNote(bytes, ext, nameValue.trim() || undefined);
      onInsert(`![[${path}]]`);
      discardAll();
    } catch (e) {
      // Sessiz kaybolma YOK — hata görünür kalsın, kayıt elde dursun.
      setSaving(false);
      setRecState("paused");
      setError(String(e));
    }
  };

  /** ✓ butonu: ilk basışta kaydı duraklatıp ad girişini açar; ad ekranında kaydeder. */
  const onCheck = () => {
    if (naming) {
      void saveToNote();
      return;
    }
    if (recordingRef.current) pauseRecording();
    if (totalSamplesRef.current === 0) {
      discardAll();
      return;
    }
    setNaming(true);
  };

  // ---------- Sürükleme (yalnız duraklatmışken — kayıt sürerken imleç canlı uçtadır) ----------

  const scrubTo = (clientX: number, el: HTMLElement) => {
    const rect = el.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const t2 = pct * duration;
    setCurrentTime(t2);
    if (audioElRef.current) audioElRef.current.currentTime = t2;
  };

  const onWaveDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (recState !== "paused") return;
    e.preventDefault();
    const el = e.currentTarget;
    scrubTo(e.clientX, el);
    let captured = false;
    try {
      el.setPointerCapture(e.pointerId);
      captured = true;
    } catch {
      /* pointer capture desteklenmeyebilir — window fallback */
    }
    const target: EventTarget = captured ? el : window;
    const move = (ev: PointerEvent) => scrubTo(ev.clientX, el);
    const up = () => {
      target.removeEventListener("pointermove", move as EventListener);
      target.removeEventListener("pointerup", up);
      target.removeEventListener("pointercancel", up);
    };
    target.addEventListener("pointermove", move as EventListener);
    target.addEventListener("pointerup", up);
    target.addEventListener("pointercancel", up);
  };

  // ---------- Render ----------

  if (phase === "idle") {
    return (
      <>
        <button className="lo-voicerec__trigger" onClick={() => void startRecording()} title={t("audio.record")}>
          <Mic size={15} strokeWidth={1.9} />
        </button>
        {error && (
          <div className="lo-voicerec__err">
            <AlertTriangle size={13} strokeWidth={2} />
            {error}
          </div>
        )}
      </>
    );
  }

  const recording = recState === "recording";
  const playedPct = duration > 0 ? currentTime / duration : 0;

  return (
    <div className="lo-voicerec__bar">
      <button className="lo-voicerec__iconbtn lo-voicerec__cancel" onClick={discardAll} title={t("audio.discard")}>
        <Trash2 size={15} strokeWidth={1.9} />
      </button>

      {naming ? (
        /* Ad girişi: ✓'ya ilk basıştan sonra — boş bırakılırsa zaman damgası kullanılır. */
        <input
          className="lo-voicerec__name"
          autoFocus
          placeholder={t("audio.namePlaceholder")}
          value={nameValue}
          onChange={(e) => setNameValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void saveToNote();
          }}
        />
      ) : (
        <>
          {/* Kayıt sürerken: DURAKLAT (kaydı). Duraklatmışken: önizleme OYNAT/duraklat. */}
          {recording ? (
            <button className="lo-voicerec__iconbtn" onClick={pauseRecording} title={t("audio.pause")}>
              <Pause size={15} strokeWidth={2} />
            </button>
          ) : (
            <button
              className="lo-voicerec__iconbtn"
              onClick={togglePlay}
              disabled={!wavUrl}
              title={isPlaying ? t("audio.pause") : t("audio.play")}
            >
              {isPlaying ? <Pause size={15} strokeWidth={2} /> : <Play size={15} strokeWidth={2} />}
            </button>
          )}

          <div ref={waveRef} className="lo-voicerec__wave lo-voicerec__wave--review" onPointerDown={onWaveDown}>
            {peaks.map((v, i) => (
              <span
                key={i}
                className={i / peaks.length < playedPct ? "is-played" : ""}
                style={{ height: `${4 + v * 24}px` }}
              />
            ))}
            <div className="lo-voicerec__playhead" style={{ left: `${playedPct * 100}%` }} />
          </div>

          {/* Kayıt sürerken an==toplam — tek değer yeter (dar ekranda yer kazandırır). */}
          <span className="lo-voicerec__time">
            {recording ? formatDuration(duration) : `${formatDuration(currentTime)} / ${formatDuration(duration)}`}
          </span>

          <button
            className="lo-voicerec__iconbtn lo-voicerec__redo"
            onClick={recordFromHere}
            disabled={recording}
            title={t("audio.recordFromHere")}
          >
            <Mic size={14} strokeWidth={2} />
          </button>
        </>
      )}
      <button
        className="lo-voicerec__iconbtn lo-voicerec__finish"
        onClick={onCheck}
        disabled={saving}
        title={t("audio.insert")}
      >
        <Check size={15} strokeWidth={2.2} />
      </button>

      {error && (
        <div className="lo-voicerec__err">
          <AlertTriangle size={13} strokeWidth={2} />
          {error}
        </div>
      )}

      <audio
        ref={audioElRef}
        src={wavUrl ?? undefined}
        preload="auto"
        onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={() => setIsPlaying(false)}
        style={{ display: "none" }}
      />
    </div>
  );
}
