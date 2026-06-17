// Vault çekirdek tipleri — platformdan bağımsız (bkz docs 03 §2).

/** Bir .md dosyasından parse edilmiş görev (Obsidian Tasks uyumlu). */
export interface ParsedTask {
  /** Vault'a göre dosya yolu, ör. "Daily/2026-06-17-Salı.md" */
  file: string;
  /** 0-tabanlı satır indeksi (dosyaya geri yazmak için). */
  line: number;
  /** Orijinal satır (round-trip için). */
  raw: string;
  done: boolean;
  description: string;
  due?: string; // ISO yyyy-mm-dd
  scheduled?: string;
  start?: string;
  doneDate?: string;
  tags: string[];
  pomos: number;
  priority?: string;
}

/** Vault içindeki bir not dosyası (dosya ağacı için). */
export interface VaultNote {
  /** Vault'a göre yol, ör. "Notlar/Proje X.md" */
  path: string;
  /** Uzantısız ad, ör. "Proje X" */
  name: string;
  /** Üst klasör, ör. "Notlar" (kök için ""). */
  folder: string;
}

/** Vault'tan yüklenen ham veri. */
export interface VaultData {
  notes: VaultNote[];
  tasks: ParsedTask[];
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
}
