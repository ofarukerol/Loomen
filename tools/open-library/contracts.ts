/** LOM-101 scripts/open-library/prepare.mjs version 1 dosya sözleşmesi. */
export type SourceId = 'openiti' | 'standard-ebooks' | 'gutenberg' | 'wikisource' | 'hindawi' | 'shamela';
export type Visibility = 'public' | 'private';
export interface PreparedFile {
  file: string;
  source: SourceId;
  visibility: Visibility;
  size: number;
  sha256: string;
}
export interface RightsEvidence {
  license: string;
  evidenceUrl: string;
  verifiedBy: string;
  verifiedAt: string;
  /** Kitap/baskı kimliği; kaynak genelindeki izin tek başına yeterli değildir. */
  editionId: string;
  territories: string[];
  redistribution: boolean;
}
export interface IntakeBook {
  source: SourceId;
  id: string;
  editionId: string;
  format: 'epub' | 'text';
  url: string;
  /** Kaynağın özgün dosyasının beklenen özeti. */
  sha256: string;
  rights?: RightsEvidence;
}
export interface BulkPermission {
  source: SourceId;
  kind: 'official-bulk' | 'permitted-mirror';
  baseUrl: string;
  evidenceUrl: string;
  approvedBy: string;
  /** Kaynak kuralını kontrol eden kişinin belirlediği en az bekleme. */
  minDelayMs: number;
}
export interface ReleasePolicy {
  approvedBy: string;
  licenses: string[];
  territories: string[];
}
export type IntakeStatus = 'prepared' | 'held' | 'rejected' | 'private';
export interface IntakeResult {
  key: string;
  book: IntakeBook;
  status: IntakeStatus;
  reason: string;
  file?: PreparedFile;
}
export interface IntakeCheckpoint {
  version: 1;
  planHash: string;
  nextRequestAt: number;
  duplicates: Partial<Record<SourceId, number>>;
  results: IntakeResult[];
}
export interface IntakeStorage {
  load(): Promise<IntakeCheckpoint | undefined>;
  /** Atomik ve kalıcı kaydet; tek çalışma aynı kaydı kullanmalı. */
  save(checkpoint: IntakeCheckpoint): Promise<void>;
}
export interface IntakeIO {
  /** Yerel çıktı klasörünü yalnız bu çekimin planına bağlar. */
  bindPlan?(planHash: string): Promise<void>;
  /**
   * Aynı key yeniden gelirse sağlam dosyayı doğrula ve tekrar kullan.
   * Geçici dosyayı doğrulamadan hedefe koyma; eski dosyayı asla ezme.
   * Yönlendirmeleri izleme: yalnız izinli URL'den al. SHA-256'yı akışla hesapla.
   * Çıktı LOM-101 girdi köküne göre kaynak/public|private/dosya olmalı.
   */
  acquire(book: IntakeBook, visibility: Visibility, key: string): Promise<PreparedFile>;
  /** Devamda mevcut dosyanın boyut ve özetini diskte doğrula. */
  verify(file: PreparedFile): Promise<void>;
  now(): number;
  sleep(ms: number): Promise<void>;
}
