// Vault çekirdek tipleri — platformdan bağımsız (bkz docs 03 §2).
import type { TrashEntry } from "./trash";

/** Bir .md dosyasından parse edilmiş görev (Obsidian Tasks uyumlu). */
export interface ParsedTask {
  /** Vault'a göre dosya yolu, ör. "Daily/2026-06-17-Salı.md" */
  file: string;
  /** 0-tabanlı satır indeksi (dosyaya geri yazmak için). */
  line: number;
  /** Orijinal satır (round-trip için). */
  raw: string;
  /** Satır başı girinti uzunluğu (0 = üst görev, >0 = alt görev). */
  indent?: number;
  done: boolean;
  description: string;
  due?: string; // ISO yyyy-mm-dd
  scheduled?: string;
  start?: string;
  doneDate?: string;
  tags: string[];
  pomos: number;
  priority?: string;
  /** Tekrarlama kuralı (🔁 sonrası metin), ör. "every week". */
  recurrence?: string;
  /** İsteğe bağlı saat (⏰ HH:MM). */
  time?: string;
}

/** Vault içindeki bir not dosyası (dosya ağacı için). */
export interface VaultNote {
  /** Vault'a göre yol, ör. "Notlar/Proje X.md" */
  path: string;
  /** Uzantısız ad, ör. "Proje X" */
  name: string;
  /** Üst klasör, ör. "Notlar" (kök için ""). */
  folder: string;
  /** Dosya türü: markdown not mu, Excalidraw çizimi mi. */
  kind: "note" | "draw";
}

/** Vault'tan yüklenen ham veri. */
export interface VaultData {
  notes: VaultNote[];
  tasks: ParsedTask[];
  /** path → ham içerik (editör + backlink için). */
  contents: Record<string, string>;
}

/** Dosya sistemi portu — gerçek (Tauri) ve sahte (test/sample) adapter'lar gerçekler. */
export interface VaultBackend {
  /** Vault'taki tüm .md dosyalarını listele. */
  listNotes(): Promise<VaultNote[]>;
  /** Bir dosyanın içeriğini oku. */
  readNote(path: string): Promise<string>;
  /** Bir dosyaya yaz (atomik olması adapter'ın sorumluluğu). */
  writeNote(path: string, content: string): Promise<void>;
  /** Dosya var mı? */
  exists(path: string): Promise<boolean>;
  /** Bir klasörün var olduğundan emin ol (yoksa oluştur). */
  ensureDir(dir: string): Promise<void>;
  /** Bir dosyayı yeni yola taşı/yeniden adlandır (hedef klasör garanti edilir). */
  rename(from: string, to: string): Promise<void>;

  // — Çöp kutusu (kalıcı silmeden önce 30 gün saklama) —
  /** Bir notu `.trash`'e taşı (kalıcı silmez). */
  trashNote(path: string): Promise<void>;
  /** Çöp kutusundaki kayıtları listele (yeni silinen önce). */
  listTrash(): Promise<TrashEntry[]>;
  /** Bir kaydı orijinal konumuna geri yükle; çakışırsa yeni ad türetir. Geri yüklenen yolu döner. */
  restoreFromTrash(trashName: string): Promise<string>;
  /** Bir çöp kaydını kalıcı sil. */
  purgeTrashItem(trashName: string): Promise<void>;
}
