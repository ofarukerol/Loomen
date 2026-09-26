/**
 * Atomik yazmanın yan dosya adı ve artık yan dosyaların tanınması (LOM-8, LOM-18).
 *
 * Kalıp: `<hedef dosya>.<zaman36><sıra36>.tmp` — zaman `Date.now()`'ın 36 tabanlı hali
 * (1972–2059 arası tam 8 hane), sıra oturum içi sayacın 36 tabanlı hali (başında sıfır
 * olmaz). Ör. `Not.md.mfz3k2a80.tmp`. Yazma bitince yan dosya rename ile yerine konur;
 * çökme/güç kesintisinde geride kalır.
 *
 * Açılışta yalnız BU kalıba birebir uyan, hedefi Loomen'in yazdığı bir dosya türü olan
 * (.md, .excalidraw, .json, .jsonl) ve belli yaştan eski dosyalar silinir. Kullanıcının
 * kendi `.tmp` dosyalarına (ör. `belge.mayis2025.tmp`, `foto.jpg.m1a2b3c4d.tmp`) dokunulmaz.
 */

/** Zaman damgasının 36 tabanlı hane sayısı (Date.now() 2059'a kadar 8 hane). */
const TIME_DIGITS = 8;

/** Bundan eski yan dosyalar artık sayılır: tek yazma milisaniyeler sürer. */
export const STALE_TMP_AGE_MS = 60 * 60 * 1000;

/** Makul zaman aralığı alt sınırı (2024-01-01): rastgele eşleşmeleri eler. */
const MIN_TIME = Date.UTC(2024, 0, 1);

/**
 * Loomen'in `writeNote` ile (dolayısıyla yan dosyayla) yazdığı dosya türleri: notlar ve
 * şablonlar (.md), çizimler (.excalidraw), tekrar ayarı/durumu (.json) ve geçmişi (.jsonl).
 */
export const TMP_TARGET_EXTS = ["md", "excalidraw", "json", "jsonl"] as const;

/** `<hedef>.<8 hane zaman><sıra: 0 ya da başında sıfır olmayan 1–6 hane>.tmp` */
const TMP_RE = /^(.+)\.([0-9a-z]{8})(0|[1-9a-z][0-9a-z]{0,5})\.tmp$/;

/** Temizlik taramasının en fazla ineceği klasör derinliği (kök = 0). */
export const TMP_SCAN_MAX_DEPTH = 8;
/** Temizlik taramasında bakılacak en fazla kayıt: kasa diye ev klasörü seçilse de dev tarama olmaz. */
export const TMP_SCAN_MAX_ENTRIES = 50_000;

/** Bir yazmaya özel yan dosya adı. */
export function tmpNameFor(target: string, now: number, seq: number): string {
  return `${target}.${now.toString(36)}${seq.toString(36)}.tmp`;
}

/** Dosya adı yan dosya kalıbına uyuyorsa üretildiği an (ms), yoksa null. */
export function tmpCreatedAt(name: string): number | null {
  const m = TMP_RE.exec(name);
  if (!m) return null;
  const target = m[1];
  const dot = target.lastIndexOf(".");
  if (dot <= 0) return null; // hedefin adı ve uzantısı olmalı
  const ext = target.slice(dot + 1).toLowerCase();
  if (!(TMP_TARGET_EXTS as readonly string[]).includes(ext)) return null;
  const t = parseInt(m[2], 36);
  return Number.isFinite(t) && t >= MIN_TIME && t.toString(36).length === TIME_DIGITS ? t : null;
}

/** Kalıba uyan ve `maxAgeMs`'den eski (artık) yan dosya mı? */
export function isStaleTmpName(name: string, now: number, maxAgeMs = STALE_TMP_AGE_MS): boolean {
  const t = tmpCreatedAt(name);
  return t !== null && t <= now - maxAgeMs;
}

export interface TmpScanEntry {
  name: string;
  isDirectory: boolean;
  isFile: boolean;
}

export interface TmpScanDeps {
  readDir: (dir: string) => Promise<TmpScanEntry[]>;
  remove: (file: string) => Promise<void>;
  maxDepth?: number;
  maxEntries?: number;
}

/**
 * Kasadaki artık yan dosyaları bulup siler; silinen sayısını döner. `.git` ve
 * `node_modules` gezilmez; gizli klasörler (ör. tekrar verisi) gezilir, oraya da
 * yazılıyor. Derinlik ve kayıt sayısı sınırlı: yanlışlıkla ev klasörü kasa seçilse bile
 * açılış dev bir disk taramasına dönmez. Okunamayan klasör ya da silinemeyen dosya
 * taramayı durdurmaz (bir sonraki açılışta yeniden denenir).
 */
export async function removeStaleTmpFiles(root: string, now: number, deps: TmpScanDeps): Promise<number> {
  const maxDepth = deps.maxDepth ?? TMP_SCAN_MAX_DEPTH;
  let budget = deps.maxEntries ?? TMP_SCAN_MAX_ENTRIES;
  let removed = 0;
  const visit = async (dir: string, depth: number): Promise<void> => {
    let entries: TmpScanEntry[];
    try {
      entries = await deps.readDir(dir);
    } catch {
      return;
    }
    for (const e of entries) {
      if (--budget < 0) return;
      if (e.isDirectory) {
        if (e.name === ".git" || e.name === "node_modules") continue;
        if (depth < maxDepth) await visit(`${dir}/${e.name}`, depth + 1);
      } else if (e.isFile && isStaleTmpName(e.name, now)) {
        try {
          await deps.remove(`${dir}/${e.name}`);
          removed++;
        } catch {
          /* silinemeyen artık bir sonraki açılışta yeniden denenir */
        }
      }
    }
  };
  await visit(root, 0);
  return removed;
}
