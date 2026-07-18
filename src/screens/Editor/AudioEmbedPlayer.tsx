import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Play, Pause, Music, MoreVertical, Pencil, Trash2, Check } from "lucide-react";
import { useAppStore } from "../../store/useAppStore";
import { useWaveBarCount } from "../../hooks/useWaveBarCount";
import { downsamplePeaks, formatDuration } from "../../core/wav";
import { audioMeta, audioMime } from "../../core/audioMeta";

interface Props {
  path: string;
  /**
   * Düzenleme modunda (CM widget'ı) rename/sil sonrası editör dokümanını senkron tutmak için:
   * CM dış value değişikliklerini almadığından, store'un dosya/draft güncellemesi tek başına
   * editörde görünmez — widget bu callback ile CM'e dispatch eder. Okuma modunda gereksiz
   * (Markdown, store'daki güncel içerikten yeniden render olur).
   */
  onMutated?: (kind: "rename" | "delete", oldPath: string, newPath?: string) => void;
}

/**
 * Not içine gömülü ses notu oynatıcısı — `![[Ses Notları/xxx.flac]]` satırları için
 * (bkz Markdown.tsx + livePreview widget'ı). Üst satırda ad + ⋮ menü (yeniden adlandır / sil),
 * altta oynatıcı. Silme çöp kutusuna taşır (geri alınabilir) ve embed satırını notlardan
 * kaldırır; yeniden adlandırma dosyayı rename edip tüm referansları günceller.
 */
export function AudioEmbedPlayer({ path, onMutated }: Props) {
  const { t } = useTranslation();
  const readAudioFile = useAppStore((s) => s.readAudioFile);
  const renameAudioNote = useAppStore((s) => s.renameAudioNote);
  const deleteAudioNote = useAppStore((s) => s.deleteAudioNote);

  const [url, setUrl] = useState<string | null>(null);
  const [hiResPeaks, setHiResPeaks] = useState<number[]>([]);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [missing, setMissing] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [renameVal, setRenameVal] = useState("");
  const [busy, setBusy] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const waveRef = useRef<HTMLDivElement>(null);
  const barCount = useWaveBarCount(waveRef);

  const name = (path.split("/").pop() ?? path).replace(/\.[^.]+$/, "");

  useEffect(() => {
    let revoke: string | null = null;
    let alive = true;
    readAudioFile(path)
      .then(async (bytes) => {
        if (!alive) return;
        if (!bytes.length) {
          setMissing(true);
          return;
        }
        const blobUrl = URL.createObjectURL(new Blob([bytes], { type: audioMime(path) }));
        revoke = blobUrl;
        setUrl(blobUrl);
        try {
          const meta = await audioMeta(path, bytes);
          if (!alive) return;
          setHiResPeaks(meta.peaks);
          setDuration(meta.duration);
        } catch {
          /* meta çözülemedi — süreyi <audio> metadata'sından al, dalga düz kalır */
        }
      })
      .catch(() => setMissing(true));
    return () => {
      alive = false;
      if (revoke) URL.revokeObjectURL(revoke);
    };
  }, [path, readAudioFile]);

  // Menü dış tıklamada kapansın.
  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("pointerdown", onDoc);
    return () => document.removeEventListener("pointerdown", onDoc);
  }, [menuOpen]);

  const peaks = downsamplePeaks(hiResPeaks, barCount);

  const togglePlay = () => {
    const el = audioRef.current;
    if (!el) return;
    if (isPlaying) el.pause();
    else void el.play();
  };

  const scrub = (clientX: number, el: HTMLElement) => {
    const rect = el.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const tSec = pct * duration;
    setCurrentTime(tSec);
    if (audioRef.current) audioRef.current.currentTime = tSec;
  };

  const onWaveDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!url) return;
    e.preventDefault();
    const el = e.currentTarget;
    scrub(e.clientX, el);
    let captured = false;
    try {
      el.setPointerCapture(e.pointerId);
      captured = true;
    } catch {
      /* pointer capture desteklenmeyebilir */
    }
    const target: EventTarget = captured ? el : window;
    const move = (ev: PointerEvent) => scrub(ev.clientX, el);
    const up = () => {
      target.removeEventListener("pointermove", move as EventListener);
      target.removeEventListener("pointerup", up);
      target.removeEventListener("pointercancel", up);
    };
    target.addEventListener("pointermove", move as EventListener);
    target.addEventListener("pointerup", up);
    target.addEventListener("pointercancel", up);
  };

  const confirmRename = async () => {
    const next = renameVal.trim();
    setRenaming(false);
    if (!next || next === name || busy) return;
    setBusy(true);
    try {
      const newPath = await renameAudioNote(path, next);
      // Embed satırı değişir → Markdown yeni path ile bu bileşeni yeniden kurar;
      // düzenleme modunda CM dokümanı callback ile güncellenir.
      if (newPath && newPath !== path) onMutated?.("rename", path, newPath);
    } finally {
      setBusy(false);
    }
  };

  if (missing) {
    return (
      <div className="lo-audioembed lo-audioembed--missing">
        <Music size={15} strokeWidth={1.8} />
        <span className="lo-audioembed__name">{path.split("/").pop()}</span>
      </div>
    );
  }

  const playedPct = duration > 0 ? currentTime / duration : 0;

  return (
    <div className="lo-audioembed">
      <div className="lo-audioembed__head">
        {renaming ? (
          <>
            <input
              className="lo-audioembed__rename"
              autoFocus
              value={renameVal}
              onChange={(e) => setRenameVal(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void confirmRename();
                if (e.key === "Escape") setRenaming(false);
              }}
            />
            <button className="lo-audioembed__menubtn" onClick={() => void confirmRename()} title={t("audio.rename")}>
              <Check size={15} strokeWidth={2} />
            </button>
          </>
        ) : (
          <>
            <span className="lo-audioembed__title">{name}</span>
            <div className="lo-audioembed__menu" ref={menuRef}>
              <button
                className={"lo-audioembed__menubtn" + (menuOpen ? " is-active" : "")}
                onClick={() => setMenuOpen((o) => !o)}
                title={t("mobile.more")}
              >
                <MoreVertical size={15} strokeWidth={1.9} />
              </button>
              {menuOpen && (
                <div className="lo-audioembed__dropdown" role="menu">
                  <button
                    className="lo-audioembed__item"
                    onClick={() => {
                      setMenuOpen(false);
                      setRenameVal(name);
                      setRenaming(true);
                    }}
                  >
                    <Pencil size={14} strokeWidth={1.9} />
                    {t("audio.rename")}
                  </button>
                  <button
                    className="lo-audioembed__item lo-audioembed__item--danger"
                    disabled={busy}
                    onClick={() => {
                      setMenuOpen(false);
                      setBusy(true);
                      void deleteAudioNote(path)
                        .then(() => onMutated?.("delete", path))
                        .finally(() => setBusy(false));
                    }}
                  >
                    <Trash2 size={14} strokeWidth={1.9} />
                    {t("audio.delete")}
                  </button>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      <div className="lo-audioembed__player">
        <button className="lo-audioembed__play" onClick={togglePlay} disabled={!url}>
          {isPlaying ? <Pause size={15} strokeWidth={2} /> : <Play size={15} strokeWidth={2} />}
        </button>
        <div ref={waveRef} className="lo-audioembed__wave" onPointerDown={onWaveDown}>
          {peaks.map((v, i) => (
            <span key={i} className={i / peaks.length < playedPct ? "is-played" : ""} style={{ height: `${4 + v * 22}px` }} />
          ))}
          <div className="lo-audioembed__playhead" style={{ left: `${playedPct * 100}%` }} />
        </div>
        <span className="lo-audioembed__time">
          {formatDuration(currentTime)} / {formatDuration(duration)}
        </span>
      </div>

      {url && (
        <audio
          ref={audioRef}
          src={url}
          preload="auto"
          onLoadedMetadata={(e) => {
            // Meta çözümü başarısız olduysa süreyi elementten al.
            if (duration === 0 && Number.isFinite(e.currentTarget.duration)) setDuration(e.currentTarget.duration);
          }}
          onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          onEnded={() => setIsPlaying(false)}
          style={{ display: "none" }}
        />
      )}
    </div>
  );
}
