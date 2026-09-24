import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { TaskGroup, Task } from "../data/sampleVault";
import type { ParsedTask, VaultBackend, VaultNote } from "../core/vault/types";
import { isExpired, type TrashEntry } from "../core/vault/trash";
import {
  createSampleBackend,
  createTauriBackend,
  isTauri,
  pickVaultFolder,
  loadVaultData,
  todayISO,
  todayDailyPath,
  dailyPathFor,
  watchVaultRoot,
  ensureDailyNote,
  ensureTemplates,
  renderDailyTemplate,
  migrateDailyContent,
  templatePathFor,
  TEMPLATES_DIR,
  DRAW_DIR,
  AUDIO_DIR,
  DAILY_DIR,
  TODO_HEADING,
} from "../core/vault";
import { rewriteWikiLinks } from "../core/markdown/links";
import { reconcileDraft, conflictCopyPath, conflictStamp } from "../core/vault/draftSync";
import { groupTasks, focusCounts, taskSortVal, taskOrderKey } from "../core/vault/grouping";
import { parseTasks } from "../core/markdown/taskParser";
import { playChime } from "../core/sound";
import { createBookmark, resolveBookmark, releaseBookmark, appIsSandboxed, allowVaultPath } from "../core/bookmark";
import { gh, appIsMobile, appPlatform, type DeviceStart, type GhUser, type GhRepo } from "../core/github";
import {
  gcal,
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  mobileClientId,
  localTimeZone,
  taskToEventPayload,
  type GoogleTokens,
  type GUser,
  type GCalendar,
  type GEvent,
} from "../core/google";
import { chatStream, cancelChat, testProvider, aiKeys } from "../core/ai/llm";
import { newProviderId, DEFAULT_MODEL, type AiProvider, type AiMessage, type ProviderKind } from "../core/ai/types";
import { retrieve, resetIndex } from "../core/ai/retrieve";
import { buildContext, buildSystemPrompt } from "../core/ai/context";
import { transcribe } from "../core/ai/stt";
import { splitProposals, appendText, uniquePath, type ProposalState } from "../core/ai/proposal";
import { toggleTaskInContent, buildTaskLine, insertTaskUnderHeading, applyTaskPatch, taskLineMatches, setTaskChildren, getSubtasks, getTaskNotes, type TaskPatch } from "../core/markdown/taskParser";
import {
  DEFAULT_SETTINGS as SRS_DEFAULTS,
  PRESETS as SRS_PRESETS,
  appendLog,
  apply as srsApply,
  avgSeconds,
  balanceDays,
  buildQueue,
  collectCards,
  futureLoad,
  isoDay,
  loadLog,
  loadSettings,
  loadStates,
  matchStates,
  migratePath,
  saveSettings,
  saveStates,
  schedule as srsSchedule,
  spreadBacklog,
  type DayCount,
  type Grade,
  type QueueItem,
  type SrsCard,
  type SrsLog,
  type SrsSettings,
  type SrsState,
} from "../core/srs";

export type Theme = "light" | "dark";
export type Screen = "planner" | "editor" | "graph" | "reports" | "settings" | "draw" | "newtab" | "help" | "assistant" | "review";
export type PlannerLayout = "timeline" | "board";
export type Lang = "tr" | "en" | "ar";
export type EditorTab = "daily" | "proje" | "fikirler";

/** Ayarlardan seçilebilen vurgu renkleri (bkz docs 08 §2). */
export const ACCENTS = ["#C2603A", "#2E8B7F", "#6C5CE0", "#A4261F"] as const;

export interface EditorSettings {
  livePreview: boolean;
  lineNumbers: boolean;
  spellCheck: boolean;
}

/** Kaynak not adını editör sekmesine eşler (statik editör — vault entegrasyonu sonraki adım). */
export function noteToTab(source: string): EditorTab {
  if (source === "Proje X") return "proje";
  if (source === "Fikirler") return "fikirler";
  return "daily";
}

export interface PomodoroSettings {
  focusMin: number;
  shortBreak: number;
  longBreak: number;
  rounds: number;
}

/** Bir kasa: yerel klasör + özel ad + (opsiyonel) bağlı git reposu. Çoklu kasa için. */
export interface VaultEntry {
  path: string;
  /** Kullanıcının verdiği görünen ad (yoksa klasör adı kullanılır). */
  name?: string;
  repo: GhRepo | null;
  /**
   * macOS security-scoped bookmark (base64). Sandbox'ta (Mac App Store) kullanıcının
   * seçtiği klasöre erişim yalnızca o oturum için verilir; kalıcı erişim bu anahtarla
   * geri alınır. Sandbox dışı derlemelerde ve diğer platformlarda kullanılmaz.
   */
  bookmark?: string;
}

/** Bir kasanın açık sekme durumu (kasa değişince geri yüklenir). */
export interface VaultTabs {
  openTabs: string[];
  pinnedTabs: string[];
  activeNote: string | null;
  activeDraw: string | null;
}

export type PomoPhase = "work" | "short" | "long";

export interface FocusCounts {
  yapilacak: number;
  geciken: number;
  planlanmamis: number;
}

interface AppState {
  theme: Theme;
  screen: Screen;
  layout: PlannerLayout;
  lang: Lang;
  editorTab: EditorTab;
  accent: string;
  editorSettings: EditorSettings;
  /** Günlük not için seçili şablonun adı (Şablonlar/<ad>.md). */
  dailyTemplate: string;
  quickText: string;
  selectedDay: number;

  // Panel görünürlüğü + odak genişletme
  leftCollapsed: boolean;
  rightCollapsed: boolean;
  focusExpanded: boolean;

  // Vault
  vaultPath: string | null; // null = tarayıcı/sample modu
  notes: VaultNote[];
  trash: TrashEntry[];
  groups: TaskGroup[];
  /** Planlanmamış (tarihsiz, açık) görevler — Bugüne Odaklan panelinde gösterilir. */
  unplannedTasks: Task[];
  counts: FocusCounts;
  parsedTasks: ParsedTask[];
  noteContents: Record<string, string>;
  /** Manuel görev sırası: "dosya::açıklama" → sıra değeri (sürükle-bırak, kalıcı). */
  taskOrder: Record<string, number>;

  // Editör
  openTabs: string[]; // açık not/çizim yolları (sekmeler)
  pinnedTabs: string[]; // sabitlenmiş sekme yolları
  activeNote: string | null; // aktif not yolu
  editing: boolean;
  draft: string;
  /** Taslağın AİT OLDUĞU not yolu. saveNote yalnızca draftPath === activeNote ise yazar —
   *  böylece bir notun taslağı asla başka bir dosyaya yazılamaz (veri bütünlüğü güvencesi). */
  draftPath: string | null;
  /**
   * Taslak DIŞARIDAN tazelendiğinde artar (dış dosya değişikliği, görev işaretleme).
   * CodeMirror dış `value` değişikliklerini almaz — yalnız `key` değişince yeniden kurulur;
   * bu sayaç key'e katılır, yoksa tazelenen içerik editörde görünmez ve sonraki tuş vuruşu
   * CM'in eski metnini geri yazıp dış değişikliği siler.
   */
  draftEpoch: number;
  /**
   * Açık not dışarıda değişti ama taslakta yazılmamış değişiklik var (LOM-5).
   * Bu sürerken otomatik kayıt YAZMAZ; iki sürüm de korunur, kullanıcı seçer.
   * Yalnız `path === draftPath` iken geçerlidir.
   */
  draftConflict: { path: string; disk: string } | null;
  backlinksCollapsed: boolean;

  // Görev detay paneli (seçili görev id'si "file:line")
  selectedTask: string | null;

  // Aktif Excalidraw çizimi (yol)
  activeDraw: string | null;

  // Favoriler (sabitlenmiş not/çizim yolları)
  favorites: string[];

  // GitHub senkronizasyonu
  ghToken: string | null;
  ghUser: GhUser | null;
  ghRepo: GhRepo | null;
  ghDevice: DeviceStart | null; // aktif device-flow (bağlan modalı)
  ghSyncing: boolean;
  ghLastSync: string | null; // ISO
  ghStatus: string | null; // son durum/hata mesajı
  ghAutoSync: boolean;
  ghBaseSha: string | null; // mobil API senkronunda son senkron commit'i (3-yönlü birleştirme temeli)

  // Platform: mobil mi (Rust cfg(mobile))? Bootstrap'te belirlenir. Mobilde kasa = app-data + GitHub API senkron.
  platformMobile: boolean;
  platformOs: string; // "ios" | "android" | "macos" | "windows" | "linux" — Google mobil client seçimi
  /** macOS sandbox (Mac App Store sürümü) — kasa oluşturma seçeneklerini belirler. */
  platformSandboxed: boolean;

  // Google Takvim entegrasyonu (OAuth Loopback+PKCE, çift yönlü)
  gcalTokens: GoogleTokens | null;
  gcalExpiresAt: number | null; // epoch ms — access token son geçerlilik
  gcalUser: GUser | null;
  gcalCalendarId: string | null; // seçili takvim (varsayılan "primary")
  gcalCalendarName: string | null;
  gcalConnecting: boolean; // tarayıcı onayı sürüyor
  gcalSyncing: boolean;
  gcalLastSync: string | null; // ISO
  gcalStatus: string | null; // son durum/hata mesajı
  gcalAutoSync: boolean;
  gcalEvents: GEvent[]; // pull edilen etkinlikler (kalıcı değil)
  /** vaultPath → { taskKey → Google event id } — push eşlemesi (cihaz-yerel). */
  gcalMap: Record<string, Record<string, string>>;

  // AI asistanı — opsiyonel modül, varsayılan KAPALI.
  // Kapalıyken hiçbir AI kodu ağa çıkmaz. API anahtarları burada TUTULMAZ; yalnızca
  // Rust tarafındaki anahtar zincirinde durur (bkz. src-tauri/src/ai/keys.rs).
  aiEnabled: boolean;
  aiProviders: AiProvider[];
  aiActiveProviderId: string | null;
  /** AI'ın hiç okumayacağı klasörler (kasa köküne göre). */
  aiExcluded: string[];
  /** Modele gönderilen ham bağlam cevapla birlikte saklansın mı (şeffaflık). */
  aiShowContext: boolean;
  /** Asistan not önerisi yapabilsin mi? Öneri tek başına hiçbir şey yazmaz — onay şarttır. */
  aiCanWrite: boolean;
  /** Ses metne çevrilince soru kendiliğinden gönderilsin mi (kapalıyken kutuda bekler). */
  aiVoiceAutoSend: boolean;
  /** Ses çevrilirken true — mikrofon düğmesi bekleme gösterir. */
  aiTranscribing: boolean;
  /** Sohbet oturumluktur — kalıcı değil; kullanıcı isterse cevabı nota kaydeder. */
  aiMessages: AiMessage[];
  aiBusy: boolean;
  /** Süren akışın kimliği — iptal için. */
  aiRequestId: string | null;

  // Tekrar (aralıklı tekrar) — tüm kalıcı veri kasadaki Tekrar/ klasöründe durur,
  // localStorage'da DEĞİL: cihazlar arası senkron olsun diye.
  srsLoaded: boolean;
  srsSettings: SrsSettings;
  /** Kart kimliği → kalıcı durum. */
  srsStates: Record<string, SrsState>;
  /** ISO gün → o gün yapılan iş (tavanlar buradan hesaplanır). */
  srsDaily: Record<string, DayCount>;
  /** Notlardan çıkarılmış kartlar — her yüklemede yeniden üretilir. */
  srsCards: SrsCard[];
  /** Ölçülen ortalama cevap süresi (saniye) — süre bütçesi bundan hesaplanır. */
  srsSecPerCard: number;
  /** Süren oturumun kuyruğu. */
  srsQueue: QueueItem[];
  srsIndex: number;
  /** Cevap açıldı mı. */
  srsShow: boolean;
  /** Bu oturumda cevaplanan kart sayısı. */
  srsAnswered: number;
  /** Kart ne zaman gösterildi (süre ölçümü için, epoch ms). */
  srsShownAt: number;
  /** Seçili deste (null = tüm kasa). */
  srsDeck: string | null;

  // Pomodoro
  pomo: PomodoroSettings;
  /** Pomodoro başlayınca/bitince ses çal. */
  pomoSound: boolean;
  pomoRemaining: number;
  pomoRunning: boolean;
  /**
   * Çalışan odak seansının BİTİŞ anı (epoch ms) — sayaç buradan hesaplanır, tick sayarak
   * değil. setInterval arka planda/uyku sonrasında kısılır ya da hiç ateşlemez; saniye
   * sayan bir sayaç 25 dakikayı 40 dakikada bitirirdi. Duraklatılmışken null.
   */
  pomoEndsAt: number | null;
  pomoPhase: PomoPhase;
  pomoCompleted: number; // mevcut turda tamamlanan odak seansı (0..rounds)
  pomoHistory: Record<string, number>; // ISO tarih → tamamlanan odak seansı (rapor için, kalıcı)
  // Mola — odak bitince teklif edilen ayrı (ufak) sayaç. Otomatik başlamaz; es geçilebilir.
  pomoBreakActive: boolean; // mola gösteriliyor mu (odak bitti, yeni odak başlamadı)
  pomoBreakRunning: boolean; // mola sayacı çalışıyor mu
  pomoBreakRemaining: number; // mola kalan saniye
  pomoBreakEndsAt: number | null; // mola bitiş anı (epoch ms) — odakla aynı mantık
  pomoBreakLong: boolean; // uzun mola mı (tur seti bitti)

  // UI aksiyonları
  toggleTheme: () => void;
  setTheme: (t: Theme) => void;
  setScreen: (s: Screen) => void;
  setLayout: (l: PlannerLayout) => void;
  setLang: (l: Lang) => void;
  setEditorTab: (t: EditorTab) => void;
  openNote: (nameOrPath: string, edit?: boolean) => void; // edit varsayılan true (canlı düzenleme)
  setActiveTab: (path: string) => void;
  togglePin: (path: string) => void;
  closeTab: (path: string) => void;
  newTab: () => void;
  setDraft: (text: string) => void;
  toggleEditing: () => void;
  toggleBacklinks: () => void;
  saveNote: () => Promise<void>;
  /** Bekleyen taslağı hemen diske yaz (editör kapanırken / not değişirken çağrılır). */
  /** Bekleyen taslağı yazar. `false` = yazılamadı (çağıran devam etmemeli). */
  flushDraft: () => Promise<boolean>;
  /** Dış değişiklik çakışmasını çöz: "mine" taslağı yazar, "disk" dıştakini açar,
   *  "both" dıştakini açar ve taslağı ayrı bir kopya not olarak saklar. */
  resolveDraftConflict: (choice: "mine" | "disk" | "both") => Promise<void>;
  setAccent: (hex: string) => void;
  toggleEditorSetting: (key: keyof EditorSettings) => void;
  toggleArabic: () => void;
  toggleLeft: () => void;
  toggleRight: () => void;
  setFocusExpanded: (v: boolean) => void;
  goToDayNote: () => Promise<void>;
  goToDate: (date: Date) => Promise<void>;
  createTodayNote: () => Promise<void>;
  todayNotePath: () => string;
  setQuick: (v: string) => void;
  selectDay: (n: number) => void;
  togglePomo: () => void;
  resetPomo: () => void;
  tickPomo: () => void;
  tickBreak: () => void;
  toggleBreak: () => void;
  skipBreak: () => void;
  setPomo: (patch: Partial<PomodoroSettings>) => void;
  setPomoSound: (on: boolean) => void;

  // Çoklu kasa
  vaults: VaultEntry[];
  /** Kasa yolu → o kasanın açık sekmeleri. Kasa değişince sekmeler buradan değişir. */
  tabsByVault: Record<string, VaultTabs>;
  addVault: () => Promise<void>;
  /** Mobil: klasör seçici yok — app-data altında adla yeni kasa oluştur ve geç. */
  addMobileVault: (name: string) => Promise<void>;
  switchVault: (path: string) => Promise<void>;
  removeVault: (path: string) => Promise<void>;
  setVaultRepo: (path: string, repo: GhRepo | null) => void;
  renameVault: (path: string, name: string) => void;
  changeVaultPath: (path: string) => Promise<void>;
  createRepoForVault: (path: string, name: string, priv_: boolean) => Promise<GhRepo | null>;

  // Vault aksiyonları (dosyaya yazar)
  bootstrap: () => Promise<void>;
  openVault: () => Promise<void>;
  reopenVault: (path: string) => Promise<void>;
  reloadVault: () => Promise<void>;
  newNote: (folder?: string) => Promise<void>;
  newFolder: () => Promise<void>;
  newDraw: () => Promise<void>;
  newTemplate: () => Promise<void>;
  setDailyTemplate: (name: string) => void;
  /** Çizimi diske yaz. `path` verilmezse aktif çizime yazar (bkz. DrawScreen — gecikmeli
   *  kayıt ateşlerken aktif çizim DEĞİŞMİŞ olabilir; çağıran hedefi açıkça verir). */
  saveDraw: (json: string, path?: string) => Promise<void>;
  /** Çizim kaydını 700 ms gecikmeyle sıraya al; hedef yol ŞİMDİ sabitlenir (LOM-6). */
  queueDrawSave: (path: string, json: string) => void;
  /** Bekleyen çizim kaydını hemen yaz. `false` = yazılamadı. */
  flushDraw: () => Promise<boolean>;
  /** Ses notu kaydını kasaya yaz (uzantı + isteğe bağlı ad ile), vault'a göre yolunu döner. */
  saveAudioNote: (bytes: Uint8Array, ext: string, baseName?: string) => Promise<string>;
  /** Bir ses notu dosyasını oku (AudioEmbedPlayer için). */
  readAudioFile: (path: string) => Promise<Uint8Array>;
  /** Ses kaydını yeniden adlandır (dosya rename + tüm notlardaki embed referansları). */
  renameAudioNote: (path: string, newBase: string) => Promise<string | null>;
  /** Ses kaydını sil (çöp kutusuna taşır) + embed satırlarını notlardan kaldır. */
  deleteAudioNote: (path: string) => Promise<void>;
  toggleFavorite: (path: string) => void;
  renameNote: (path: string, newName: string) => Promise<void>;
  renameFolder: (folderPath: string, newName: string) => Promise<void>;
  // — Çöp kutusu —
  deleteNote: (path: string) => Promise<void>;
  loadTrash: () => Promise<void>;
  restoreNote: (trashName: string) => Promise<void>;
  purgeNote: (trashName: string) => Promise<void>;
  emptyTrash: () => Promise<void>;
  addTask: () => Promise<void>;
  toggleTask: (id: string) => Promise<void>;
  selectTask: (id: string | null) => void;
  updateTask: (id: string, patch: TaskPatch) => Promise<void>;
  saveTask: (id: string, patch: TaskPatch, notes?: string, subtasks?: { text: string; done: boolean }[]) => Promise<void>;
  reorderTask: (fromId: string, toId: string, position: "before" | "after") => Promise<void>;

  // GitHub aksiyonları
  ghBeginAuth: () => Promise<void>;
  ghCopyCodeAndOpen: () => Promise<void>;
  ghCancelAuth: () => void;
  ghPoll: () => Promise<string>;
  ghDisconnect: () => void;
  ghLoadRepos: () => Promise<GhRepo[]>;
  ghCreateRepo: (name: string, priv_: boolean) => Promise<void>;
  ghSelectRepo: (repo: GhRepo) => void;
  ghSync: () => Promise<void>;
  ghSetAutoSync: (v: boolean) => void;

  // Google Takvim aksiyonları
  gcalConnect: () => Promise<void>;
  gcalDisconnect: () => void;
  gcalLoadCalendars: () => Promise<GCalendar[]>;
  gcalSelectCalendar: (id: string, name: string) => void;
  gcalSync: () => Promise<void>;
  gcalSetAutoSync: (v: boolean) => void;

  // AI asistanı aksiyonları
  aiSetEnabled: (v: boolean) => void;
  aiSetExcluded: (dirs: string[]) => void;
  aiSetShowContext: (v: boolean) => void;
  aiSetCanWrite: (v: boolean) => void;
  aiSetVoiceAutoSend: (v: boolean) => void;
  /** WAV kaydını metne çevir (aktif sağlayıcıyla). Boş dönerse konuşma anlaşılmamıştır. */
  aiTranscribe: (wav: Uint8Array) => Promise<string>;
  /** Bir cevaptaki not önerisini uygula (kullanıcı onayı). */
  aiApplyProposal: (messageId: string, index: number) => Promise<void>;
  aiAddProvider: (kind: ProviderKind) => string;
  aiUpdateProvider: (id: string, patch: Partial<AiProvider>) => void;
  aiRemoveProvider: (id: string) => Promise<void>;
  aiSetActiveProvider: (id: string) => void;
  aiSaveKey: (id: string, key: string) => Promise<void>;
  aiClearKey: (id: string) => Promise<void>;
  aiTestProvider: (id: string) => Promise<string>;
  aiSend: (text: string) => Promise<void>;
  aiCancel: () => void;
  aiClearChat: () => void;

  // Tekrar aksiyonları
  srsLoad: () => Promise<void>;
  srsSetSettings: (patch: Partial<SrsSettings>) => Promise<void>;
  srsApplyPreset: (name: keyof typeof SRS_PRESETS) => Promise<void>;
  srsStart: (deck?: string | null) => void;
  srsReveal: () => void;
  srsAnswer: (g: Grade) => Promise<void>;
  /** Kartı dondur — bir daha çıkmaz, durumu korunur. */
  srsFreeze: (id: string) => Promise<void>;
  /** Kartı bugünlük ertele. */
  srsPostpone: (id: string) => Promise<void>;
  /** Birikeni N güne yay. */
  srsSpread: (days: number) => Promise<void>;
  /** Bir kartın geçmişini sıfırla (yeniden öğren). */
  srsResetCard: (id: string) => Promise<void>;
  srsEndSession: () => void;
}

/** Boş Excalidraw sahnesi (yeni çizim oluştururken). */
const EMPTY_EXCALIDRAW = JSON.stringify({
  type: "excalidraw",
  version: 2,
  source: "loomen",
  elements: [],
  appState: {},
  files: {},
});

// Kullanıcıya hata bildir (Tauri'de native dialog, web fallback'te alert/console).
async function notifyError(msg: string): Promise<void> {
  try {
    if (isTauri()) {
      const { message } = await import("@tauri-apps/plugin-dialog");
      await message(msg, { title: "Loomen", kind: "error" });
      return;
    }
  } catch {
    /* dialog yoksa aşağı düş */
  }
  if (typeof alert === "function") alert(msg);
  else console.error(msg);
}

const FOCUS_MIN = 25;

/** Bitiş anına göre kalan saniye (duvar saati). endsAt yoksa dondurulmuş değer geçerlidir. */
function remainingFrom(endsAt: number | null, frozen: number): number {
  if (endsAt == null) return frozen;
  return Math.max(0, Math.round((endsAt - Date.now()) / 1000));
}

/** Verilen anın yerel günü (yyyy-MM-dd) — todayISO() ile aynı biçim. */
function localDay(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
const VAULT_KEY = "loomen.vaultPath";
const TASKS_FILE = "Yapılacaklar.md"; // görevler günlük nottan ayrı, kendi sayfasında

// Modül seviyesi: serileştirilemeyen backend + watcher (store dışında tutulur).
let backend: VaultBackend = createSampleBackend();
let unwatch: (() => void) | null = null;
/** Tekrar verisi hangi kasa için yüklendi (kasa değişince baştan okunur). */
let srsVault: string | null = null;

/**
 * Kasa açma/değiştirme işlemleri SIRAYLA çalışır. bootstrap() ile persist rehydrate'i
 * (onRehydrateStorage) aynı anda reopenVault çağırabilir; sırasız çalışırlarsa biri
 * diğerinin backend'ini ezer ve state yanlış kasayı gösterir.
 */
let vaultOp: Promise<unknown> = Promise.resolve();
function queueVaultOp<T>(fn: () => Promise<T>): Promise<T> {
  const next = vaultOp.then(fn, fn);
  vaultOp = next.catch(() => {});
  return next;
}

/**
 * Görev dosyası işlemleri (oku → değiştir → yaz) da SIRAYLA çalışır. İki çağrı üst üste
 * gelirse (hızlı Enter, arka arkaya kutu işaretleme) ikisi de AYNI içeriği okur ve
 * sonuncusu diğerini ezer — bir görev/işaret sessizce kaybolur.
 */
let fileOp: Promise<unknown> = Promise.resolve();
function queueFileOp<T>(fn: () => Promise<T>): Promise<T> {
  const next = fileOp.then(fn, fn);
  fileOp = next.catch(() => {});
  return next;
}

/** Nesnenin anahtarlarını yeni yollara taşır (`to` undefined dönerse anahtar aynı kalır). */
function moveKeys<T>(obj: Record<string, T>, to: (p: string) => string | undefined): Record<string, T> {
  const out: Record<string, T> = {};
  for (const [k, v] of Object.entries(obj)) out[to(k) ?? k] = v;
  return out;
}

/**
 * Taslak diske her yazıldığında (başında ve sonunda) artar. Okuma sürerken sayaç
 * değiştiyse o okumanın açık not için getirdiği içerik yazmadan önceki hali olabilir;
 * dış değişiklik sanılıp çakışma çıkmasın diye o tur açık nota dokunulmaz (LOM-5).
 */
let draftWriteGen = 0;

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => {
  /**
   * Backend'den yükle, gruplandır, state'e yaz.
   *
   * ESKİ-KASA KORUMASI: okuma sürerken kasa değişmiş olabilir (kullanıcı kasa değiştirdi,
   * watcher tetikledi). O durumda okunan veri artık BAŞKA bir kasaya ait — state'e yazılırsa
   * yeni kasanın notları eski kasanınkilerle karışır (ve autosave yanlış dosyaya yazar).
   * Bu yüzden okumaya başladığımız backend hâlâ aktif değilse sonuç atılır.
   *
   * TEMİZ TASLAK TAZELEME: görev işaretleme / dış değişiklik aktif notun içeriğini değiştirdiyse
   * ve kullanıcının yazılmamış değişikliği YOKSA (draft === eski içerik) taslak yeni içerikle
   * güncellenir. Yoksa bekleyen autosave bayat taslağı geri yazıp değişikliği geri alırdı.
   */
  /**
   * Okuma sırası sayacı: hangi okumanın EN GÜNCEL okuma olduğunu söyler.
   *
   * loadFromBackend'i izleyici (400 ms), git senkronu, görev işaretleme ve
   * dakikalık tarih kontrolü aynı anda çağırabiliyor. "Backend değişti mi"
   * kontrolü aynı kasa içindeki yarışı yakalamıyordu: erken başlayan bir okuma
   * geç bitip yeni içeriğin üstüne düşerse, taslak "temiz" göründüğü için
   * editöre ESKİ metin konuyor ve sonraki autosave onu diske geri yazıyordu.
   */
  let loadSeq = 0;

  async function loadFromBackend() {
    const src = backend;
    const bu = ++loadSeq;
    const gen = draftWriteGen;
    const { tasks, notes, contents } = await loadVaultData(src);
    if (backend !== src) return; // arada kasa değişti → eski kasanın verisini yazma
    if (bu !== loadSeq) return; // daha yeni bir okuma başladı → bu sonuç bayat
    const today = todayISO();
    const s = get();
    const { groups, unplannedTasks } = groupTasks(tasks, today, s.taskOrder);
    const c = focusCounts(tasks, today);
    const patch: Partial<AppState> = {
      parsedTasks: tasks,
      notes,
      noteContents: contents,
      groups,
      unplannedTasks,
      counts: { yapilacak: c.yapilacak, geciken: c.geciken, planlanmamis: c.planlanmamis },
    };
    if (s.draftPath) {
      const p = s.draftPath;
      // Okuma sürerken taslak diske yazıldı: bu okuma dosyanın yazmadan önceki halini
      // getirmiş olabilir. Bellekteki güncel içerik esas alınır, dış değişiklik sayılmaz.
      if (gen !== draftWriteGen && s.noteContents[p] !== undefined) contents[p] = s.noteContents[p];
      const prev = s.noteContents[p];
      const next = contents[p];
      switch (reconcileDraft(prev, next, s.draft)) {
        case "refresh":
          // Taslak "temiz" (kullanıcı yazmamış) → yeni içerikle tazele.
          patch.draft = next;
          patch.draftEpoch = s.draftEpoch + 1; // CodeMirror yeniden kurulsun (bkz. draftEpoch)
          patch.draftConflict = null;
          break;
        case "converged":
          patch.draftConflict = null;
          break;
        case "conflict":
          // Dışarıda değişti VE yazılmamış değişiklik var: otomatik kayıt dış değişikliği
          // ezmesin; iki sürüm de korunur, kullanıcı seçer (LOM-5).
          patch.draftConflict = { path: p, disk: next as string };
          break;
      }
    }
    set(patch);
    void refreshTrash();
    void refreshSrs();
  }

  /**
   * Kartları notlardan yeniden çıkar ve kayıtlı durumlarla eşleştir.
   * Diske YALNIZCA modül açıkken yazar — kapalıyken kasada Tekrar/ klasörü oluşmaz.
   */
  async function refreshSrs(): Promise<void> {
    try {
      const vault = get().vaultPath;
      if (!get().srsLoaded || srsVault !== vault) {
        srsVault = vault;
        await get().srsLoad();
        return;
      }
      const cfg = get().srsSettings;
      const cards = collectCards(get().noteContents, cfg.syntax, cfg.excluded);
      const m = matchStates(cards, get().srsStates);
      set({ srsCards: cards, srsStates: m.states });
      if (cfg.enabled && m.changed && cards.length > 0) await saveStates(backend, m.states, get().srsDaily);
    } catch (err) {
      console.error("[srs] kartlar tazelenemedi:", err);
    }
  }

  /**
   * Bekleyen taslağı (debounce'lu autosave henüz yazmadıysa) MEVCUT backend'e yaz.
   * Kasa değişmeden ve dosya taşınmadan önce çağrılır: aksi halde bekleyen autosave
   * ya yeni kasaya ya da artık var olmayan eski yola yazardı (veri kaybı).
   */
  /**
   * Bekleyen çizim kaydı (LOM-6). Ekranın içinde değil store'da tutulur: ekran kapanırken,
   * pencere kapanırken, uygulama arka plana alınırken ve çizim yeniden adlandırılmadan önce
   * flushDraft bunu da boşaltır. Yol kayıt SIRAYA ALINIRKEN sabitlenir; gecikme dolduğunda
   * aktif çizim değişmiş olsa bile sahne yalnız kendi dosyasına yazılır.
   */
  let pendingDraw: { path: string; json: string } | null = null;
  let drawTimer: ReturnType<typeof setTimeout> | null = null;

  async function writeDraw(target: string, json: string): Promise<boolean> {
    // Yalnız GERÇEK bir çizim dosyasına yaz: hedef arada silinmiş/yeniden adlandırılmışsa
    // sahnesi eski yola yeniden yazılıp hayalet dosya doğardı.
    if (!get().notes.some((n) => n.path === target && n.kind === "draw")) return true;
    // Aynı içerik yeniden yazılmaz (NOTE_SAFETY kural 5): Excalidraw açılışta da onChange verir.
    if (get().noteContents[target] === json) return true;
    try {
      await backend.writeNote(target, json);
    } catch (e) {
      await notifyError(`Çizim kaydedilemedi: ${e instanceof Error ? e.message : String(e)}`);
      return false;
    }
    set((s) => ({ noteContents: { ...s.noteContents, [target]: json } }));
    return true;
  }

  async function flushDraw(): Promise<boolean> {
    if (drawTimer) clearTimeout(drawTimer);
    drawTimer = null;
    const p = pendingDraw;
    pendingDraw = null;
    return p ? writeDraw(p.path, p.json) : true;
  }

  function queueDrawSave(path: string, json: string): void {
    // Başka bir çizimin kaydı bekliyorsa önce o kendi dosyasına yazılır.
    if (pendingDraw && pendingDraw.path !== path) void flushDraw();
    pendingDraw = { path, json };
    if (drawTimer) clearTimeout(drawTimer);
    drawTimer = setTimeout(() => void flushDraw(), 700);
  }

  async function flushDraft(): Promise<boolean> {
    // Değerler ŞİMDİ yakalanır: çağıran hemen ardından aktif notu değiştirebilir
    // (openNote/closeTab) — yazma o zaman bile DOĞRU dosyaya, doğru metinle gider.
    const s = get();
    // Bekleyen çizim kaydı da boşaltılır (kasa değişimi, kapanış, yeniden adlandırma).
    // flushDraw bekleyen kaydı da eşzamanlı olarak alır; sıra bozulmaz.
    const drawDone = flushDraw();
    const noteOk = await flushNoteDraft(s);
    return (await drawDone) && noteOk;
  }

  async function flushNoteDraft(s: AppState): Promise<boolean> {
    const p = s.draftPath;
    const text = s.draft;
    if (!p || p !== s.activeNote) return true; // sahipsiz taslak asla yazılmaz (NOTE_SAFETY)
    if (text === s.noteContents[p]) return true;
    if (!s.notes.some((n) => n.path === p && n.kind === "note")) return true;
    if (s.draftConflict?.path === p) {
      // Dış değişiklik çakışması sürüyor: taslak asıl dosyaya YAZILMAZ (dıştakini ezerdi).
      // Kullanıcı notu terk ediyor (sekme, kasa, kapanış) — taslak ayrı kopya not olur.
      try {
        await saveDraftCopy(p, text);
        return true;
      } catch (e) {
        await notifyError(`Not kaydedilemedi: ${e instanceof Error ? e.message : String(e)}`);
        return false;
      }
    }
    try {
      draftWriteGen++;
      await backend.writeNote(p, text);
      draftWriteGen++;
      set((st) => ({ noteContents: { ...st.noteContents, [p]: text } }));
      return true;
    } catch (e) {
      await notifyError(`Not kaydedilemedi: ${e instanceof Error ? e.message : String(e)}`);
      // Sonuç DÖNDÜRÜLÜR: çağıran bunu bilmeden devam edip taslağı temizlerse
      // kullanıcı önce "kaydedilemedi" uyarısını görüyor, hemen ardından
      // yazdığı metni de kaybediyordu.
      return false;
    }
  }

  /**
   * Çakışmadaki taslağı asıl dosyanın yanına benzersiz adlı bir kopya olarak yazar ve
   * editörü diskteki (dış) sürüme çevirir. Var olan hiçbir dosyanın üzerine yazılmaz.
   */
  async function saveDraftCopy(p: string, text: string): Promise<string> {
    const copy = await conflictCopyPath(
      p,
      conflictStamp(),
      async (c) => get().notes.some((n) => n.path === c) || (await backend.exists(c))
    );
    await backend.writeNote(copy, text);
    const st = get();
    if (st.draftPath === p) {
      const disk = st.draftConflict?.path === p ? st.draftConflict.disk : st.noteContents[p] ?? "";
      set({
        draft: disk,
        draftEpoch: st.draftEpoch + 1,
        draftConflict: null,
        noteContents: { ...st.noteContents, [p]: disk },
      });
    }
    await loadFromBackend();
    return copy;
  }

  /**
   * Ses dosyası yolu değişince/silinince embed referanslarını TÜM notlarda dönüştür.
   * NOTE_SAFETY: her not yalnız KENDİ dönüştürülmüş içeriğiyle yazılır (çapraz sızıntı yok);
   * draft'ın sahibi dosya (draftPath) değiştiyse draft da AYNI dönüşümle güncellenir — böylece
   * bekleyen autosave, dönüşümü geri almaz.
   */
  async function rewriteAudioRefs(transform: (content: string) => string): Promise<void> {
    const s = get();
    const changed: string[] = [];
    for (const [p, c] of Object.entries(s.noteContents)) {
      const next = transform(c);
      if (next !== c) {
        await backend.writeNote(p, next);
        changed.push(p);
      }
    }
    const st = get();
    if (st.draftPath && changed.includes(st.draftPath)) set({ draft: transform(st.draft) });
    if (changed.length) await loadFromBackend();
  }

  /** Dosya adı için güvenli taban ad (yol ayraçları/markdown köşelileri temizlenir). */
  function sanitizeAudioName(name: string): string {
    return name.replace(/[\\/:*?"<>|[\]#^]/g, "-").trim();
  }

  /** Çöp kutusunu yükle; saklama süresi (30 gün) dolmuş kayıtları kalıcı sil. */
  async function refreshTrash() {
    try {
      let entries = await backend.listTrash();
      const now = Date.now();
      const expired = entries.filter((e) => isExpired(e.deletedAt, now));
      if (expired.length > 0) {
        await Promise.all(expired.map((e) => backend.purgeTrashItem(e.trashName).catch(() => {})));
        entries = entries.filter((e) => !isExpired(e.deletedAt, now));
      }
      set({ trash: entries });
    } catch {
      set({ trash: [] });
    }
  }

  /** Geçerli Google access token döndür; süresi dolduysa refresh et. Bağlantı yoksa null. */
  async function ensureGcalAccess(): Promise<string | null> {
    const s = get();
    const tok = s.gcalTokens;
    if (!tok) return null;
    const fresh = s.gcalExpiresAt != null && Date.now() < s.gcalExpiresAt - 60_000;
    if (fresh) return tok.access_token;
    if (!tok.refresh_token) return tok.access_token; // refresh yoksa eldekiyle dene
    try {
      // Mobil: secret'sız PKCE refresh (platform client id ile); masaüstü: secret'lı.
      const next = get().platformMobile
        ? await gcal.refreshPkce(mobileClientId(get().platformOs), tok.refresh_token)
        : await gcal.refresh(tok.refresh_token);
      set({ gcalTokens: next, gcalExpiresAt: Date.now() + next.expires_in * 1000 });
      return next.access_token;
    } catch {
      return tok.access_token; // refresh başarısız → eldekiyle dene (401 ise sync hatayı yüzeye taşır)
    }
  }

  return {
    theme: "light",
    screen: "planner",
    layout: "timeline",
    lang: "tr",
    editorTab: "daily",
    accent: ACCENTS[0],
    editorSettings: { livePreview: true, lineNumbers: false, spellCheck: true },
    dailyTemplate: "Günlük",
    quickText: "",
    selectedDay: Number(todayISO().slice(8, 10)),

    leftCollapsed: false,
    rightCollapsed: false,
    focusExpanded: false,

    vaultPath: null,
    vaults: [],
    tabsByVault: {},
    notes: [],
    trash: [],
    groups: [],
    unplannedTasks: [],
    counts: { yapilacak: 0, geciken: 0, planlanmamis: 0 },
    parsedTasks: [],
    noteContents: {},
    taskOrder: {},

    openTabs: [],
    pinnedTabs: [],
    activeNote: null,
    editing: false,
    draft: "",
    draftPath: null,
    draftEpoch: 0,
    draftConflict: null,
    backlinksCollapsed: false,
    selectedTask: null,
    activeDraw: null,
    favorites: [],

    ghToken: null,
    ghUser: null,
    ghRepo: null,
    ghDevice: null,
    ghSyncing: false,
    ghLastSync: null,
    ghStatus: null,
    ghAutoSync: false,
    ghBaseSha: null,
    platformMobile: false,
    platformOs: "desktop",
    platformSandboxed: false,

    gcalTokens: null,
    gcalExpiresAt: null,
    gcalUser: null,
    gcalCalendarId: null,
    gcalCalendarName: null,
    gcalConnecting: false,
    gcalSyncing: false,
    gcalLastSync: null,
    gcalStatus: null,
    gcalAutoSync: false,
    gcalEvents: [],
    gcalMap: {},

    aiEnabled: false,
    aiProviders: [],
    aiActiveProviderId: null,
    aiExcluded: [],
    aiShowContext: false,
    aiCanWrite: true,
    aiVoiceAutoSend: false,
    aiTranscribing: false,
    aiMessages: [],
    aiBusy: false,
    aiRequestId: null,

    srsLoaded: false,
    srsSettings: { ...SRS_DEFAULTS },
    srsStates: {},
    srsDaily: {},
    srsCards: [],
    srsSecPerCard: 15,
    srsQueue: [],
    srsIndex: 0,
    srsShow: false,
    srsAnswered: 0,
    srsShownAt: 0,
    srsDeck: null,

    pomo: { focusMin: FOCUS_MIN, shortBreak: 5, longBreak: 15, rounds: 4 },
    pomoSound: true,
    pomoRemaining: FOCUS_MIN * 60,
    pomoRunning: false,
    pomoEndsAt: null,
    pomoPhase: "work",
    pomoCompleted: 0,
    pomoHistory: {},
    pomoBreakActive: false,
    pomoBreakRunning: false,
    pomoBreakRemaining: 0,
    pomoBreakEndsAt: null,
    pomoBreakLong: false,

    toggleTheme: () => set((s) => ({ theme: s.theme === "light" ? "dark" : "light" })),
    setTheme: (theme) => set({ theme }),
    setScreen: (screen) => set({ screen }),
    setLayout: (layout) => set({ layout }),
    // Grup başlıkları ve göreli tarihler VERİ ÜRETİM ANINDA çevriliyor; yalnız
    // `lang`'i değiştirmek ekranı eski dilde bırakıyordu (kasa yeniden
    // yüklenene kadar). Dil değişince gruplar yeniden türetilir.
    setLang: (lang) => {
      set({ lang });
      void loadFromBackend();
    },
    setEditorTab: (editorTab) => set({ editorTab }),
    openNote: async (nameOrPath, edit = true) => {
      // Ayrılan notun bekleyen taslağını yaz: autosave 700 ms gecikmeli, o pencerede not
      // değiştirilirse son yazılanlar hiç diske gitmeden kaybolurdu.
      await flushDraft();
      const s = get();
      // Yol mu yoksa ad mı? Önce yol, sonra ada göre çöz.
      const byPath = s.notes.find((n) => n.path === nameOrPath);
      const byName = s.notes.find((n) => n.name === nameOrPath);
      const note = byPath ?? byName;
      if (!note) return; // eksik/kırık link
      // Çizim dosyaları editör yerine çizim ekranında açılır (ama yine sekme olur).
      if (note.kind === "draw") {
        const tabs = s.openTabs.includes(note.path) ? s.openTabs : [...s.openTabs, note.path];
        set({ screen: "draw", activeDraw: note.path, openTabs: tabs });
        return;
      }
      // Günlük not ise: eski H1/verbose metadata'yı bir kez temizle (banner üstte gösterir).
      // YALNIZ "Günlük/" altındakiler: kullanıcının kendi "2025-01-01 Toplantı.md" notu da
      // tarihle başlar; onun başlığını silmek kullanıcı içeriğini yok etmek olurdu.
      // İçerik DİSKTEN okunur — bellekteki kopya bayatsa migrasyon dış değişikliği ezerdi.
      // (günlük notlar "Günlük/<yıl>/<ay>/..." altında yaşar — önek kontrolü.)
      if (note.path.startsWith(`${DAILY_DIR}/`) && /^\d{4}-\d{2}-\d{2}/.test(note.name)) {
        const cur = await backend.readNote(note.path);
        const migrated = migrateDailyContent(cur);
        if (migrated != null) {
          await backend.writeNote(note.path, migrated);
          await loadFromBackend();
        }
      }
      const st = get();
      const openTabs = st.openTabs.includes(note.path) ? st.openTabs : [...st.openTabs, note.path];
      set({
        screen: "editor",
        activeNote: note.path,
        openTabs,
        editing: edit, // edit=true → doğrudan düzenleme modunda aç
        draft: st.noteContents[note.path] ?? "",
        draftPath: note.path,
      });
    },
    setActiveTab: (path) => {
      void flushDraft(); // ayrılan notun bekleyen taslağı (değerler şimdi yakalanır)
      const s = get();
      const note = s.notes.find((n) => n.path === path);
      if (note?.kind === "draw") {
        set({ screen: "draw", activeDraw: path });
        return;
      }
      set({ screen: "editor", activeNote: path, editing: true, draft: s.noteContents[path] ?? "", draftPath: path });
    },
    togglePin: (path) =>
      set((s) => ({
        pinnedTabs: s.pinnedTabs.includes(path)
          ? s.pinnedTabs.filter((p) => p !== path)
          : [...s.pinnedTabs, path],
      })),
    // Boş "Yeni sekme" — dosya oluştur / dosyaya git seçenekleri.
    newTab: () => set({ screen: "newtab" }),
    closeTab: (path) => {
      void flushDraft(); // kapanan/ayrılan notun bekleyen taslağı kaybolmasın
      set((s) => {
        const openTabs = s.openTabs.filter((p) => p !== path);
        const pinnedTabs = s.pinnedTabs.filter((p) => p !== path);
        const wasActive = s.activeNote === path || s.activeDraw === path;
        if (!wasActive) return { openTabs, pinnedTabs };
        const next = openTabs[openTabs.length - 1] ?? null;
        const clearNote = s.activeNote === path ? null : s.activeNote;
        const clearDraw = s.activeDraw === path ? null : s.activeDraw;
        if (!next)
          return { openTabs, pinnedTabs, activeNote: clearNote, activeDraw: clearDraw, draft: "", draftPath: null, draftConflict: null };
        const nextNote = s.notes.find((n) => n.path === next);
        if (nextNote?.kind === "draw") {
          return { openTabs, pinnedTabs, screen: "draw", activeDraw: next, activeNote: clearNote };
        }
        return {
          openTabs,
          pinnedTabs,
          screen: "editor",
          activeNote: next,
          activeDraw: clearDraw,
          editing: true,
          draft: s.noteContents[next] ?? "",
          draftPath: next,
        };
      });
    },
    setDraft: (draft) => set({ draft }),
    flushDraft,
    resolveDraftConflict: async (choice) => {
      const s = get();
      const c = s.draftConflict;
      const p = s.draftPath;
      if (!c || !p || c.path !== p) {
        if (c) set({ draftConflict: null });
        return;
      }
      if (choice === "mine") {
        const text = s.draft;
        try {
          draftWriteGen++;
          await backend.writeNote(p, text);
          draftWriteGen++;
        } catch (e) {
          await notifyError(`Not kaydedilemedi: ${e instanceof Error ? e.message : String(e)}`);
          return;
        }
        set((st) => ({
          draftConflict: st.draftConflict?.path === p ? null : st.draftConflict,
          noteContents: { ...st.noteContents, [p]: text },
        }));
        return;
      }
      if (choice === "both") {
        try {
          await saveDraftCopy(p, s.draft);
        } catch (e) {
          await notifyError(`Kopya kaydedilemedi: ${e instanceof Error ? e.message : String(e)}`);
        }
        return;
      }
      // "disk": dıştaki sürüm açılır, taslaktaki değişiklik bırakılır.
      set({
        draft: c.disk,
        draftEpoch: s.draftEpoch + 1,
        draftConflict: null,
        noteContents: { ...s.noteContents, [p]: c.disk },
      });
    },
    toggleEditing: () => set((s) => ({ editing: !s.editing })),
    toggleBacklinks: () => set((s) => ({ backlinksCollapsed: !s.backlinksCollapsed })),
    saveNote: async () => {
      const s = get();
      if (!s.activeNote) return;
      // GÜVENLİK: taslak başka bir nota aitse ASLA yazma (yanlış içeriğin yanlış dosyaya
      // yazılıp notu bozmasını engeller — bkz NOTE_SAFETY_RULES.md).
      if (s.draftPath !== s.activeNote) return;
      // Dışarıda değişmiş ve kullanıcı henüz seçmemiş: yazarsak dış değişiklik kaybolur (LOM-5).
      if (s.draftConflict?.path === s.activeNote) return;
      // Gereksiz yazma yok: içerik değişmediyse dosyaya dokunma (NOTE_SAFETY_RULES kural 5).
      if (s.draft === s.noteContents[s.activeNote]) return;
      try {
        draftWriteGen++;
        await backend.writeNote(s.activeNote, s.draft);
        draftWriteGen++;
      } catch (e) {
        // Sessiz kalma: kullanıcı yazmaya devam edip kaydedildiğini sanmamalı (disk dolu,
        // izin düştü, kasa taşındı...). Bellek güncellenmez → sonraki denemede tekrar yazılır.
        await notifyError(`Not kaydedilemedi: ${e instanceof Error ? e.message : String(e)}`);
        return;
      }
      // Hafif kayıt: tüm dosyaları yeniden okumadan bellekte güncelle + görevleri yeniden hesapla.
      // Yazma sırasında state değişmiş olabilir (kasa değişimi, watcher yüklemesi) — GÜNCEL
      // state üstüne uygula, yoksa bayat kopya araya giren yüklemeyi ezer.
      const now = get();
      if (now.draftPath !== s.draftPath) return; // taslak başka nota geçti → bu kayıt geçersiz
      const noteContents = { ...now.noteContents, [s.activeNote]: s.draft };
      const tasks = now.notes.flatMap((n) =>
        n.kind === "draw" ? [] : parseTasks(n.path, noteContents[n.path] ?? "")
      );
      const today = todayISO();
      const { groups, unplannedTasks } = groupTasks(tasks, today, now.taskOrder);
      const c = focusCounts(tasks, today);
      set({
        noteContents,
        parsedTasks: tasks,
        groups,
        unplannedTasks,
        counts: { yapilacak: c.yapilacak, geciken: c.geciken, planlanmamis: c.planlanmamis },
      });
    },
    setAccent: (accent) => set({ accent }),
    toggleEditorSetting: (key) =>
      set((s) => ({ editorSettings: { ...s.editorSettings, [key]: !s.editorSettings[key] } })),
    toggleArabic: () => set((s) => ({ lang: s.lang === "ar" ? "tr" : "ar" })),
    toggleLeft: () => set((s) => ({ leftCollapsed: !s.leftCollapsed })),
    toggleRight: () => set((s) => ({ rightCollapsed: !s.rightCollapsed })),
    setFocusExpanded: (focusExpanded) => set({ focusExpanded }),
    todayNotePath: () => todayDailyPath(),
    // "Günün Notu" — bugünün notunu (yoksa şablonla oluşturup) sekmede aç.
    goToDayNote: async () => {
      await ensureDailyNote(backend, todayDailyPath(), templatePathFor(get().dailyTemplate));
      await loadFromBackend();
      get().openNote(todayDailyPath());
    },
    createTodayNote: async () => {
      await ensureDailyNote(backend, todayDailyPath(), templatePathFor(get().dailyTemplate));
      await loadFromBackend();
    },
    // Takvimden bir güne tıklama — o günün notunu (yoksa seçili şablonla oluşturup) aç.
    goToDate: async (date) => {
      const path = dailyPathFor(date);
      if (!(await backend.exists(path))) {
        const folder = path.split("/").slice(0, -1).join("/");
        if (folder) await backend.ensureDir(folder);
        await backend.writeNote(path, await renderDailyTemplate(backend, date, templatePathFor(get().dailyTemplate)));
      }
      await loadFromBackend();
      get().openNote(path);
    },
    setQuick: (quickText) => set({ quickText }),
    selectDay: (selectedDay) => set({ selectedDay }),

    togglePomo: () =>
      set((s) => {
        const running = !s.pomoRunning;
        if (running && s.pomoSound) playChime("start"); // başlatırken zil
        // Başlarken bitiş anını sabitle; duraklatırken o ana kadarki kalanı dondur.
        const patch: Partial<AppState> = running
          ? { pomoRunning: true, pomoEndsAt: Date.now() + s.pomoRemaining * 1000 }
          : { pomoRunning: false, pomoEndsAt: null, pomoRemaining: remainingFrom(s.pomoEndsAt, s.pomoRemaining) };
        if (running) {
          // Yeni 25 dk başladı → varsa mola kaybolur.
          if (s.pomoBreakActive) {
            patch.pomoBreakActive = false;
            patch.pomoBreakRunning = false;
            patch.pomoBreakEndsAt = null;
            // Uzun mola turunu tamamlamıştık → seri sıfırlanır.
            if (s.pomoBreakLong) patch.pomoCompleted = 0;
          } else if (s.pomoCompleted >= s.pomo.rounds) {
            // Tur seti dolmuş ama mola yok (atlanmış) → yeni seriye başlarken sıfırla.
            patch.pomoCompleted = 0;
          }
        }
        return patch;
      }),
    setPomoSound: (pomoSound) => set({ pomoSound }),
    resetPomo: () =>
      set((s) => ({
        pomoRunning: false,
        pomoEndsAt: null,
        pomoPhase: "work",
        pomoRemaining: s.pomo.focusMin * 60,
        pomoBreakActive: false,
        pomoBreakRunning: false,
        pomoBreakRemaining: 0,
        pomoBreakEndsAt: null,
      })),
    // Kalan süre duvar saatinden okunur: sekme arka plandayken/uykudan sonra kaçan tick'ler
    // sayacı geciktirmez, seans tam 25 dakikada biter.
    tickPomo: () => {
      const s = get();
      const left = remainingFrom(s.pomoEndsAt, s.pomoRemaining);
      if (left > 0) {
        if (left !== s.pomoRemaining) set({ pomoRemaining: left });
        return;
      }
      // Odak seansı bitti → seriyi işaretle ve molayı TEKLİF et (otomatik başlamaz).
      if (s.pomoSound) playChime("end");
      const completed = s.pomoCompleted + 1;
      const isLong = completed % s.pomo.rounds === 0;
      // Tamamlanan odak seansını rapor geçmişine işle — seansın BİTTİĞİ günün ISO tarihine
      // (gece yarısını aşan seans, başladığı değil bittiği güne yazılır).
      const day = s.pomoEndsAt != null ? localDay(new Date(s.pomoEndsAt)) : todayISO();
      const pomoHistory = { ...s.pomoHistory, [day]: (s.pomoHistory[day] ?? 0) + 1 };
      set({
        pomoCompleted: completed,
        pomoRunning: false,
        pomoEndsAt: null,
        pomoRemaining: s.pomo.focusMin * 60, // ana sayaç sıradaki odak için hazır
        pomoHistory,
        pomoBreakActive: true,
        pomoBreakRunning: false,
        pomoBreakLong: isLong,
        pomoBreakRemaining: (isLong ? s.pomo.longBreak : s.pomo.shortBreak) * 60,
        pomoBreakEndsAt: null,
      });
    },
    tickBreak: () => {
      const s = get();
      if (!s.pomoBreakActive) return;
      const left = remainingFrom(s.pomoBreakEndsAt, s.pomoBreakRemaining);
      if (left > 0) {
        if (left !== s.pomoBreakRemaining) set({ pomoBreakRemaining: left });
        return;
      }
      // Mola bitti → kaybolur. Uzun moladan sonra tur sayacını sıfırla.
      if (s.pomoSound) playChime("break-end");
      set({
        pomoBreakActive: false,
        pomoBreakRunning: false,
        pomoBreakEndsAt: null,
        pomoCompleted: s.pomoBreakLong ? 0 : s.pomoCompleted,
      });
    },
    toggleBreak: () =>
      set((s) => {
        if (!s.pomoBreakActive) return {};
        const running = !s.pomoBreakRunning;
        if (running && s.pomoSound) playChime("break-start");
        return running
          ? { pomoBreakRunning: true, pomoBreakEndsAt: Date.now() + s.pomoBreakRemaining * 1000 }
          : {
              pomoBreakRunning: false,
              pomoBreakEndsAt: null,
              pomoBreakRemaining: remainingFrom(s.pomoBreakEndsAt, s.pomoBreakRemaining),
            };
      }),
    skipBreak: () =>
      set((s) => ({
        pomoBreakActive: false,
        pomoBreakRunning: false,
        pomoBreakEndsAt: null,
        pomoCompleted: s.pomoBreakLong ? 0 : s.pomoCompleted,
      })),
    setPomo: (patch) =>
      set((s) => {
        const pomo = { ...s.pomo, ...patch };
        // Çalışmıyorken odak süresi değişirse kalan süreyi senkronla.
        const sync = !s.pomoRunning && s.pomoPhase === "work" && patch.focusMin != null;
        return { pomo, ...(sync ? { pomoRemaining: pomo.focusMin * 60, pomoEndsAt: null } : {}) };
      }),

    // İlk yükleme: önce sample, sonra (Tauri'de) kayıtlı kasa varsa onu yükle.
    bootstrap: async () => {
      // Sample seed (şablonlar) — hata olsa bile akışı durdurma.
      ensureTemplates(backend).catch(() => {});
      await loadFromBackend();
      if (isTauri()) {
        const [mobile, os, sandboxed] = await Promise.all([appIsMobile(), appPlatform(), appIsSandboxed()]);
        set({ platformMobile: mobile, platformOs: os, platformSandboxed: sandboxed });
        if (mobile) {
          // Mobil: kasa app-data altında (klasör seçici yok). İçerik GitHub API ile senkronlanır.
          try {
            const { appDataDir, join } = await import("@tauri-apps/api/path");
            const { exists, mkdir } = await import("@tauri-apps/plugin-fs");
            const vault = await join(await appDataDir(), "vault");
            if (!(await exists(vault))) await mkdir(vault, { recursive: true });
            await get().reopenVault(vault);
          } catch (e) {
            console.error("Mobil kasa açılamadı:", e);
          }
        } else {
          // Masaüstü: kalıcı vaultPath'i (rehydrate) ya da eski localStorage anahtarını kullan.
          const saved = get().vaultPath ?? localStorage.getItem(VAULT_KEY);
          if (saved) await get().reopenVault(saved);
        }
      }
    },

    // Yeni kasa ekle (klasör seç) ve ona geç. (Explorer/ayarlardaki "Kasa seç/ekle".)
    openVault: async () => get().addVault(),
    addVault: async () => {
      if (!isTauri()) return; // tarayıcıda klasör seçici yok
      const path = await pickVaultFolder();
      if (!path) return;
      // Sandbox'ta erişim yalnız seçim anında verilir — bookmark'ı HEMEN üret.
      const bookmark = await createBookmark(path);
      if (bookmark) {
        set((st) => ({
          vaults: st.vaults.some((v) => v.path === path)
            ? st.vaults.map((v) => (v.path === path ? { ...v, bookmark } : v))
            : [...st.vaults, { path, repo: null, bookmark }],
        }));
      }
      await get().switchVault(path);
    },

    // Uygulama verisi altında adla kasa oluştur (klasör seçici kullanmadan).
    // Mobilde tek yol budur; masaüstünde ise Mac App Store (sandbox) sürümü için
    // "izin gerektirmeyen kasa" seçeneğidir — uygulamanın kendi konteynerine yazar.
    addMobileVault: async (name) => {
      if (!isTauri()) return;
      const safe = sanitizeAudioName(name); // aynı dosya-adı kuralları
      if (!safe) return;
      try {
        const { appDataDir, join } = await import("@tauri-apps/api/path");
        const { exists, mkdir } = await import("@tauri-apps/plugin-fs");
        const root = await appDataDir();
        let dir = await join(root, safe);
        for (let n = 2; await exists(dir); n++) dir = await join(root, `${safe} (${n})`);
        await mkdir(dir, { recursive: true });
        await get().reopenVault(dir); // listeye ekler + geçer + şablonları seed'ler
      } catch (e) {
        void notifyError(`Kasa oluşturulamadı: ${e}`);
      }
    },

    // Listedeki bir kasaya geç (backend'i yeniden aç; entry'deki repo aktif olur).
    switchVault: async (path) => {
      await get().reopenVault(path);
    },

    // Bir kasayı listeden kaldır. Aktifse kalan ilk kasaya, yoksa örnek kasaya döner.
    removeVault: async (path) => {
      const s = get();
      const vaults = s.vaults.filter((v) => v.path !== path);
      if (s.vaultPath !== path) {
        set({ vaults });
        return;
      }
      set({ vaults });
      if (vaults.length > 0) {
        await get().switchVault(vaults[0].path);
      } else {
        backend = createSampleBackend();
        unwatch?.();
        unwatch = null;
        localStorage.removeItem(VAULT_KEY);
        await loadFromBackend();
        set({
          vaultPath: null,
          ghRepo: null,
          openTabs: [],
          pinnedTabs: [],
          activeNote: null,
          activeDraw: null,
          draft: "",
          draftPath: null, draftConflict: null,
          screen: "planner",
        });
      }
    },

    // Bir kasaya git reposu ata; aktif kasaysa ghRepo'yu da güncelle.
    setVaultRepo: (path, repo) =>
      set((s) => ({
        vaults: s.vaults.map((v) => (v.path === path ? { ...v, repo } : v)),
        ghRepo: s.vaultPath === path ? repo : s.ghRepo,
      })),

    // Kasaya özel ad ver (boş → klasör adına döner).
    renameVault: (path, name) =>
      set((s) => ({
        vaults: s.vaults.map((v) => (v.path === path ? { ...v, name: name.trim() || undefined } : v)),
      })),

    // Kasanın yerel klasörünü değiştir (yeni klasör seç). Aktifse yeniden açar.
    changeVaultPath: async (oldPath) => {
      if (!isTauri()) return;
      const newPath = await pickVaultFolder();
      if (!newPath || newPath === oldPath) return;
      const s = get();
      if (s.vaults.some((v) => v.path === newPath)) return; // bu klasör zaten bir kasa
      // Sandbox'ta erişim yalnız seçim anında verilir: YENİ klasör için bookmark'ı HEMEN üret.
      // Eski yolun bookmark'ı yeni klasörü açmaz; taşınmazsa kasa bir sonraki açılışta ölür.
      const bookmark = await createBookmark(newPath);
      set({
        vaults: s.vaults.map((v) =>
          v.path === oldPath ? { ...v, path: newPath, bookmark: bookmark ?? undefined } : v,
        ),
      });
      // Eski klasörün security-scoped erişimini bırak (artık bu kasaya ait değil).
      void releaseBookmark(oldPath);
      if (s.vaultPath === oldPath) await get().reopenVault(newPath);
    },

    // Yeni repo oluştur ve döndür — OTOMATİK ATANMAZ; kullanıcı listeden manuel seçer.
    createRepoForVault: async (_path, name, priv_) => {
      const token = get().ghToken;
      if (!token) return null;
      return gh.createRepo(token, name, priv_);
    },

    // Kayıtlı/seçili kasayı backend olarak (yeniden) aç. HMR/yeniden yük sonrası da çağrılır.
    // Kasayı listeye ekler (yoksa), entry'sindeki repoyu ghRepo'ya yansıtır. Şablon seed
    // hatası kasayı düşürmez; açılamazsa mevcut durum korunur (sessizce).
    // Çağrılar SIRAYA alınır: bootstrap() ile persist rehydrate aynı anda tetikleyebilir.
    reopenVault: (path) =>
      queueVaultOp(async () => {
        if (!isTauri()) return;
        try {
          const prev = get();
          const prevPath = prev.vaultPath;
          const isSwitch = prevPath !== path;

          // Kasa değişmeden ÖNCE bekleyen taslağı eski kasaya yaz; aksi halde debounce'lu
          // autosave backend değiştikten sonra ateşler ve notu YENİ kasaya yazardı.
          // Yazma BAŞARISIZSA kasa değişimi iptal edilir: aşağıda taslak zaten
          // temizleniyor ve kullanıcı "kaydedilemedi" uyarısının hemen ardından
          // yazdığı metni de kaybediyordu.
          if (isSwitch && !(await flushDraft())) {
            await notifyError("Not kaydedilemediği için kasa değiştirilmedi; metniniz duruyor.");
            return;
          }

          // Mevcut kasanın açık sekmelerini sakla (geri dönülünce geri yüklenir).
          const curTabs = get();
          const tabsByVault: Record<string, VaultTabs> = prevPath
            ? {
                ...curTabs.tabsByVault,
                [prevPath]: {
                  openTabs: curTabs.openTabs,
                  pinnedTabs: curTabs.pinnedTabs,
                  activeNote: curTabs.activeNote,
                  activeDraw: curTabs.activeDraw,
                },
              }
            : curTabs.tabsByVault;

          // Taslağı/aktif notu HEMEN bırak: bundan sonraki her yazma denemesi (autosave dahil)
          // sahipsiz taslak kuralına takılıp sessizce düşer, yanlış kasaya içerik sızmaz.
          if (isSwitch) set({ draft: "", draftPath: null, draftConflict: null, activeNote: null, activeDraw: null });

          // Sandbox (Mac App Store): klasöre erişimi bookmark ile geri al. Sandbox dışında
          // bu çağrı zararsızdır (erişim zaten açıktır).
          let target = path;
          const saved = prev.vaults.find((v) => v.path === path)?.bookmark;
          if (saved) {
            const r = await resolveBookmark(saved);
            // Klasör taşınmış olabilir: bookmark'ın çözdüğü GÜNCEL yolu kullan, yoksa
            // artık var olmayan eski yola backend kurar ve kasa "açılamadı"ya düşerdi.
            if (r?.path) target = r.path;
            // Bookmark eskimişse (klasör taşındı/yeniden adlandırıldı) yenisini üret ve sakla.
            if (r?.stale) {
              const fresh = await createBookmark(r.path);
              if (fresh) {
                set((st) => ({
                  vaults: st.vaults.map((v) => (v.path === path ? { ...v, bookmark: fresh } : v)),
                }));
              }
            }
          }

          // Kasa klasörünü fs kapsamına al. macOS'ta bookmark çözümü zaten erişim veriyor;
          // Windows/Linux'ta bookmark yok, bu çağrı olmadan ev klasörü dışındaki kasa her
          // açılışta "forbidden path" ile reddedilirdi.
          await allowVaultPath(target);

          const next = createTauriBackend(target);
          // Erişimi doğrula (kapsam/taşınma) — başarısızsa catch.
          await next.listNotes();

          // Kasa değiştiyse öncekinin security-scoped erişimini bırak (kaynak sızıntısı önlemi).
          if (isSwitch && prevPath) void releaseBookmark(prevPath);
          // AI arama önbelleği kasaya özeldir — başka kasanın parçaları taşınmasın.
          if (isSwitch) resetIndex();
          backend = next;
          localStorage.setItem(VAULT_KEY, target);
          // Şablon klasörünü loadFromBackend'den ÖNCE oluştur ki Şablonlar hemen görünsün.
          try {
            await ensureTemplates(backend);
          } catch {
            /* şablon seed ölümcül değil */
          }
          await loadFromBackend();
          if (backend !== next) return; // araya başka bir kasa açma girdi → bu sonucu yazma

          // Kasayı listeye ekle (yoksa); ilk (migrasyon) kasa eski ghRepo'yu devralır.
          // Taşınma çözüldüyse (target !== path) kaydın yolunu güncelle, ikinci kayıt açma.
          const cur = get();
          const known = cur.vaults.some((v) => v.path === target);
          const stale = target !== path && cur.vaults.some((v) => v.path === path);
          const firstEver = cur.vaults.length === 0;
          const vaults = stale
            ? cur.vaults.map((v) => (v.path === path ? { ...v, path: target } : v))
            : known
              ? cur.vaults
              : [...cur.vaults, { path: target, repo: firstEver ? cur.ghRepo ?? null : null }];
          const entry = vaults.find((v) => v.path === target)!;

          const patch: Partial<AppState> = { vaultPath: target, vaults, ghRepo: entry.repo, tabsByVault };
          // Kasa değiştiyse (ya da global sekmeler boşsa) hedef kasanın sekmelerini geri yükle.
          if (isSwitch || cur.openTabs.length === 0) {
            const keep = tabsByVault[target] ??
              tabsByVault[path] ?? { openTabs: [], pinnedTabs: [], activeNote: null, activeDraw: null };
            const has = (p: string) => cur.notes.some((n) => n.path === p);
            const openTabs = keep.openTabs.filter(has);
            const pinnedTabs = keep.pinnedTabs.filter(has);
            const activeNote = keep.activeNote && has(keep.activeNote) ? keep.activeNote : null;
            const activeDraw = keep.activeDraw && has(keep.activeDraw) ? keep.activeDraw : null;
            patch.openTabs = openTabs;
            patch.pinnedTabs = pinnedTabs;
            patch.activeNote = activeNote;
            patch.activeDraw = activeDraw;
            patch.draft = activeNote ? cur.noteContents[activeNote] ?? "" : "";
            patch.draftPath = activeNote;
            patch.editing = true;
            // Geçerli ekranı koru ama içerik yoksa anlamlı bir yere düş.
            if (prev.screen === "editor" && !activeNote) patch.screen = "planner";
            if (prev.screen === "draw" && !activeDraw) patch.screen = "planner";
          }
          set(patch);

          // İzleyici kasanın AÇILMASININ parçası değil: burada patlarsa notlar zaten
          // yüklenmiştir, sadece dış değişiklikler otomatik yansımaz. "Kasa açılamadı"
          // demek yanlış olur — sessizce not düş, kullanıcıyı yanıltma.
          try {
            unwatch?.();
            unwatch = await watchVaultRoot(target, () => get().reloadVault());
          } catch (e) {
            console.error("[kasa] klasör izleyici kurulamadı (kasa açık, otomatik yenileme yok):", e);
          }
        } catch (e) {
          // Açılamadı: taşınmış/silinmiş olabilir ya da (sandbox'ta) erişim izni düşmüştür.
          // Sessiz kalma — kullanıcı kasasını yeniden seçebilmeli. Sebebi de göster:
          // yutulan hata teşhisi imkânsız kılıyordu.
          console.error("[kasa] açılamadı:", path, e);
          const reason = e instanceof Error ? e.message : String(e);
          void notifyError(
            "Kasa açılamadı. Klasör taşınmış veya erişim izni düşmüş olabilir; " +
              `Ayarlar → Kasa bölümünden yeniden seçin. (Sebep: ${reason})`,
          );
        }
      }),

    reloadVault: async () => {
      await loadFromBackend();
    },

    // Yeni boş not oluştur (çakışmayan ad bul), düzenleme modunda aç.
    newNote: async (folder) => {
      const s = get();
      const dir = folder ? `${folder}/` : "";
      const base = "Adsız";
      let name = base;
      let i = 2;
      const taken = (n: string) => s.notes.some((x) => x.path === `${dir}${n}.md`);
      while (taken(name)) name = `${base} ${i++}`;
      if (folder) await backend.ensureDir(folder);
      await backend.writeNote(`${dir}${name}.md`, `# ${name}\n\n`);
      await loadFromBackend();
      get().openNote(`${dir}${name}.md`, true);
    },

    // Yeni Excalidraw çizimi — her zaman "Çizimler" klasöründe, zaman damgalı isimle.
    newDraw: async () => {
      const now = new Date();
      const pad = (n: number) => String(n).padStart(2, "0");
      const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(
        now.getHours()
      )}.${pad(now.getMinutes())}.${pad(now.getSeconds())}`;
      const path = `${DRAW_DIR}/Çizim ${stamp}.excalidraw`;
      await backend.ensureDir(DRAW_DIR);
      await backend.writeNote(path, EMPTY_EXCALIDRAW);
      await loadFromBackend();
      set({ screen: "draw", activeDraw: path });
    },

    // Yeni şablon dosyası — her zaman "Şablonlar" klasöründe; düzenleme modunda aç.
    newTemplate: async () => {
      const s = get();
      const base = "Şablon";
      let name = base;
      let i = 2;
      const taken = (n: string) => s.notes.some((x) => x.path === `${TEMPLATES_DIR}/${n}.md`);
      while (taken(name)) name = `${base} ${i++}`;
      await backend.ensureDir(TEMPLATES_DIR);
      await backend.writeNote(`${TEMPLATES_DIR}/${name}.md`, `# ${name}\n\n`);
      await loadFromBackend();
      get().openNote(`${TEMPLATES_DIR}/${name}.md`, true);
    },

    // Günlük not için hangi şablonun kullanılacağını seç (ad → Şablonlar/<ad>.md).
    setDailyTemplate: (name) => set({ dailyTemplate: name }),

    toggleFavorite: (path) =>
      set((s) => ({
        favorites: s.favorites.includes(path)
          ? s.favorites.filter((p) => p !== path)
          : [...s.favorites, path],
      })),

    // Aktif çizimi dosyaya yaz (vault'u yeniden yükleme — canvas resetlenmesin).
    saveDraw: async (json, path) => {
      const target = path ?? get().activeDraw;
      if (!target) return;
      await writeDraw(target, json);
    },
    queueDrawSave,
    flushDraw,
    saveAudioNote: async (bytes, ext, baseName) => {
      await backend.ensureDir(AUDIO_DIR);
      const stamp = new Date()
        .toISOString()
        .replace(/[:.]/g, "-")
        .replace("T", "_")
        .slice(0, 19);
      const base = sanitizeAudioName(baseName ?? "") || stamp;
      let path = `${AUDIO_DIR}/${base}.${ext}`;
      for (let n = 2; await backend.exists(path); n++) path = `${AUDIO_DIR}/${base} (${n}).${ext}`;
      await backend.writeBinary(path, bytes);
      return path;
    },
    readAudioFile: (path) => backend.readBinary(path),
    renameAudioNote: async (path, newBase) => {
      const base = sanitizeAudioName(newBase);
      if (!base) return null;
      const ext = path.slice(path.lastIndexOf(".") + 1);
      let target = `${AUDIO_DIR}/${base}.${ext}`;
      if (target === path) return path;
      for (let n = 2; await backend.exists(target); n++) target = `${AUDIO_DIR}/${base} (${n}).${ext}`;
      try {
        await backend.rename(path, target); // taşıma yalnız rename (NOTE_SAFETY §2.3)
        await rewriteAudioRefs((c) => c.split(`![[${path}]]`).join(`![[${target}]]`));
        return target;
      } catch (e) {
        void notifyError(`Ses kaydı yeniden adlandırılamadı: ${e}`);
        return null;
      }
    },
    deleteAudioNote: async (path) => {
      try {
        await backend.trashNote(path); // çöp kutusuna taşı — kalıcı silme değil (NOTE_SAFETY §2.4)
        await rewriteAudioRefs((c) =>
          c
            .split("\n")
            .filter((l) => l.trim() !== `![[${path}]]`)
            .join("\n")
        );
      } catch (e) {
        void notifyError(`Ses kaydı silinemedi: ${e}`);
      }
    },

    // Yeni klasör oluştur; ağaçta görünmesi için içine başlangıç notu koyar (boş klasör türetilen ağaçta görünmez).
    newFolder: async () => {
      const s = get();
      const base = "Yeni Klasör";
      let name = base;
      let i = 2;
      const folders = new Set(s.notes.map((n) => n.folder).filter(Boolean));
      while (folders.has(name)) name = `${base} ${i++}`;
      await backend.ensureDir(name);
      await backend.writeNote(`${name}/Adsız.md`, `# Adsız\n\n`);
      await loadFromBackend();
      get().openNote(`${name}/Adsız.md`, true);
    },

    // Bir notu yeniden adlandır (aynı klasörde). Açık sekme/aktif not referansları güncellenir.
    renameNote: async (path, newName) => {
      const s = get();
      const note = s.notes.find((n) => n.path === path);
      if (!note) return;
      // Uzantı dosya türüne göre korunur: çizim ".md" olarak yeniden adlandırılırsa
      // sahnesi nota dönüşür, çizim ekranı onu artık açamaz (LOM-6).
      const ext = note.kind === "draw" ? ".excalidraw" : ".md";
      const clean = newName.trim().replace(/[/\\]/g, "").replace(/\.(md|excalidraw)$/i, "");
      if (!clean) return;
      const to = note.folder ? `${note.folder}/${clean}${ext}` : `${clean}${ext}`;
      if (to === path) return; // değişmedi
      // Yalnız büyük/küçük harf değişimi (toplanti → Toplanti): macOS/Windows dosya adları
      // harf duyarsız olduğu için hedef "zaten var" görünür — bulunan şey notun KENDİSİdir.
      // Bu durumda çakışma kontrolü atlanır, aksi halde kullanıcı notun harfini düzeltemez.
      const caseOnly = to.toLocaleLowerCase("tr") === path.toLocaleLowerCase("tr");
      // Çakışma kontrolü DİSKTE de yapılır: bellekteki liste bayat olabilir (dış değişiklik,
      // GitHub senkronu). rename üzerine yazsaydı hedef notun içeriği sessizce yok olurdu.
      // (Harf duyarlı sistemlerde gerçekten ayrı bir not "Toplanti.md" olarak durabilir;
      // tam yol eşleşmesi her hâlükârda çakışmadır, yalnız disk kontrolü atlanır.)
      if (s.notes.some((n) => n.path === to) || (!caseOnly && (await backend.exists(to)))) {
        await notifyError(`Bu adda bir not zaten var: ${clean}`);
        return;
      }
      // Bekleyen taslağı önce ESKİ yola yaz; yoksa autosave rename'den sonra ateşleyip
      // silinmiş yolu yeniden yaratır (aynı notun iki kopyası) ya da yazma hata verir.
      await flushDraft();
      try {
        await backend.rename(path, to);
      } catch (e) {
        await notifyError(`Not yeniden adlandırılamadı: ${e instanceof Error ? e.message : String(e)}`);
        return;
      }
      // [[bağlantı]]ları güncelle: eski ada işaret eden her not yeni ada çevrilir, yoksa
      // yeniden adlandırma tüm gelen bağlantıları kırardı.
      const cur = get();
      // Yalnız markdown notları: noteContents .excalidraw sahnelerini de tutar, onların
      // JSON'unu bağlantı yeniden yazımıyla ellemek çizimi bozardı.
      const isMd = (p: string) => cur.notes.some((n) => n.path === p && n.kind === "note");
      // Yazılamayan notlar sayılır: `.catch(() => {})` izin/disk/kilit hatasını
      // tamamen gizliyordu — dosya yeniden adlandırılmış, bağlantıların bir
      // kısmı güncellenmiş, kalanı kırık kalmış oluyor ve kullanıcı
      // hangilerinin bozulduğunu asla öğrenmiyordu.
      const bozuklar: string[] = [];
      for (const [p, c] of Object.entries(cur.noteContents)) {
        if (p === path || !isMd(p)) continue; // taşındı; içeriği yeni yolda okunacak
        const nextC = rewriteWikiLinks(c, note.name, clean);
        if (nextC === c) continue;
        try {
          await backend.writeNote(p, nextC);
        } catch {
          bozuklar.push(p);
        }
      }
      // Notun kendi gövdesindeki kendine-bağlantılar da güncellenir. İçerik
      // DİSKTEN okunur: bellekteki kopya bayatsa dış değişikliği ezerdi
      // (openNote'ta aynı özen gösteriliyor, burada gösterilmemişti).
      // Çizimin JSON'una dokunulmaz: metin kutusundaki "[[...]]" yazısı değişip sahne bozulurdu.
      if (note.kind === "note") {
        try {
          const diskten = await backend.readNote(to);
          const own = rewriteWikiLinks(diskten, note.name, clean);
          if (own !== diskten) await backend.writeNote(to, own);
        } catch {
          bozuklar.push(to);
        }
      }
      if (bozuklar.length) {
        await notifyError(
          `Yeniden adlandırma bitti ama ${bozuklar.length} notta bağlantılar güncellenemedi: ` +
            `${bozuklar.slice(0, 5).join(", ")}${bozuklar.length > 5 ? "…" : ""}`,
        );
      }
      // Yola göre anahtarlanan her şey taşınır — aksi halde sabitlenen sekme, favori ve
      // manuel görev sırası yeniden adlandırmada sessizce düşerdi.
      const moveOrderKey = (key: string) =>
        key.startsWith(`${path}::`) ? `${to}::${key.slice(path.length + 2)}` : key;
      set((st) => ({
        openTabs: st.openTabs.map((p) => (p === path ? to : p)),
        pinnedTabs: st.pinnedTabs.map((p) => (p === path ? to : p)),
        favorites: st.favorites.map((p) => (p === path ? to : p)),
        taskOrder: Object.fromEntries(
          Object.entries(st.taskOrder).map(([k, v]) => [moveOrderKey(k), v]),
        ),
        activeNote: st.activeNote === path ? to : st.activeNote,
        draftPath: st.draftPath === path ? to : st.draftPath, // taslak ↔ dosya bağı korunur
        // Açık çizim yeni yola geçer. İçerik de AYNI anda taşınır: çizim ekranı yeni yolda
        // boş içerik görürse boş tuval açar ve ilk kayıt çizimi boş sahneyle ezer (LOM-6).
        activeDraw: st.activeDraw === path ? to : st.activeDraw,
        noteContents: moveKeys(st.noteContents, (p) => (p === path ? to : undefined)),
        // Tekrar kartlarının geçmişi yeni yola taşınır (kimlik yolu içerdiği için yeniden hesaplanır).
        srsStates: migratePath(st.srsStates, path, to),
      }));
      const srsAfter = get();
      if (srsAfter.srsSettings.enabled && srsAfter.srsStates !== cur.srsStates) {
        await saveStates(backend, srsAfter.srsStates, srsAfter.srsDaily);
      }
      await loadFromBackend();
    },

    // Bir klasörü (ve altındaki tüm notları) yeniden adlandır.
    renameFolder: async (folderPath, newName) => {
      const s = get();
      const clean = newName.trim().replace(/[/\\]/g, "");
      if (!clean) return;
      const parent = folderPath.includes("/") ? folderPath.slice(0, folderPath.lastIndexOf("/")) : "";
      const to = parent ? `${parent}/${clean}` : clean;
      if (to === folderPath) return;
      const prefix = folderPath + "/";
      const affected = s.notes.filter((n) => n.path.startsWith(prefix));
      if (affected.length === 0) return;
      // Yalnız büyük/küçük harf değişimi ("projeler" → "Projeler"): harf duyarsız dosya
      // sistemlerinde hedef klasörün kendisi bulunur, çakışma sayılmamalı.
      const caseOnly = to.toLocaleLowerCase("tr") === folderPath.toLocaleLowerCase("tr");
      // Çakışma kontrolü: hedef klasör zaten varsa rename dosyaları TEK TEK taşır ve aynı
      // adlı notların üzerine sessizce yazar — kullanıcının notu çöpe bile gitmeden kaybolur.
      // Hem bellekteki ağaca hem diske bakılır (bellek bayat olabilir: dış değişiklik, senkron).
      const taken =
        s.notes.some((n) => n.path === to || n.path.startsWith(to + "/")) ||
        (!caseOnly && (await backend.exists(to)));
      if (taken) {
        await notifyError(`Bu adda bir klasör zaten var: ${clean}`);
        return;
      }
      // Bekleyen taslağı önce eski yola yaz (rename sonrası yazılamaz/yanlış yere yazılır).
      await flushDraft();
      const map = new Map<string, string>();
      for (const n of affected) {
        const np = to + n.path.slice(folderPath.length);
        try {
          await backend.rename(n.path, np);
        } catch (e) {
          // Ortada kalan hata: klasörün bir kısmı taşınmış olur. Geri sarmak yerine durup
          // durumu bildiriyoruz — taşınanlar yeni yolda, kalanlar eskisinde duruyor;
          // loadFromBackend ikisini de gösterir, hiçbir not kaybolmaz.
          await notifyError(
            `Klasör yeniden adlandırılamadı (${n.path}): ${e instanceof Error ? e.message : String(e)}`,
          );
          await loadFromBackend();
          return;
        }
        map.set(n.path, np);
      }
      // Not adları değişmedi → [[bağlantı]]lar hâlâ çözülür; yalnız yola göre anahtarlanan
      // durum taşınır (sabitlenen sekme, favori, manuel görev sırası).
      const moved = (key: string) => {
        const sep = key.indexOf("::");
        if (sep < 0) return key;
        const f = key.slice(0, sep);
        const np = map.get(f);
        return np ? `${np}${key.slice(sep)}` : key;
      };
      set((st) => ({
        openTabs: st.openTabs.map((p) => map.get(p) ?? p),
        pinnedTabs: st.pinnedTabs.map((p) => map.get(p) ?? p),
        favorites: st.favorites.map((p) => map.get(p) ?? p),
        taskOrder: Object.fromEntries(Object.entries(st.taskOrder).map(([k, v]) => [moved(k), v])),
        activeNote: st.activeNote ? map.get(st.activeNote) ?? st.activeNote : null,
        draftPath: st.draftPath ? map.get(st.draftPath) ?? st.draftPath : null,
        activeDraw: st.activeDraw ? map.get(st.activeDraw) ?? st.activeDraw : null, // (LOM-6)
        noteContents: moveKeys(st.noteContents, (p) => map.get(p)),
        // Tekrar geçmişi de klasörle birlikte taşınır (kart kimliği not yolunu içerir).
        srsStates: migratePath(st.srsStates, folderPath, to),
      }));
      const srsAfter = get();
      if (srsAfter.srsSettings.enabled && srsAfter.srsStates !== s.srsStates) {
        await saveStates(backend, srsAfter.srsStates, srsAfter.srsDaily);
      }
      await loadFromBackend();
    },

    // Bir notu çöp kutusuna taşı (kalıcı silmez; 30 gün saklanır). Açık sekme/aktif not kapatılır.
    deleteNote: async (path) => {
      const s = get();
      if (!s.notes.some((n) => n.path === path)) return;
      try {
        await backend.trashNote(path);
      } catch (err) {
        console.error("[deleteNote] trashNote başarısız:", err);
        await notifyError(`Not silinemedi: ${err instanceof Error ? err.message : String(err)}`);
        return;
      }
      const openTabs = s.openTabs.filter((p) => p !== path);
      const pinnedTabs = s.pinnedTabs.filter((p) => p !== path);
      const activeChanged = s.activeNote === path;
      const activeNote = activeChanged ? openTabs[openTabs.length - 1] ?? null : s.activeNote;
      // Aktif not silindiyse: taslağı YENİ aktif nota göre sıfırla. Aksi halde silinen notun
      // taslağı autosave ile yeni nota yazılıp onu bozardı (kök neden). draftPath sadece
      // gerçek bir markdown notuna işaret eder; çizim/boş ise null → autosave yazmaz.
      const nextNote = activeChanged && activeNote ? s.notes.find((n) => n.path === activeNote) : null;
      const draftPatch = activeChanged
        ? nextNote?.kind === "note"
          ? { draft: s.noteContents[activeNote!] ?? "", draftPath: activeNote }
          : { draft: "", draftPath: null, draftConflict: null }
        : {};
      set({
        openTabs,
        pinnedTabs,
        activeNote,
        favorites: s.favorites.filter((p) => p !== path),
        ...draftPatch,
      });
      await loadFromBackend(); // trash'i de tazeler
    },

    loadTrash: refreshTrash,

    restoreNote: async (trashName) => {
      await backend.restoreFromTrash(trashName);
      await loadFromBackend();
    },

    purgeNote: async (trashName) => {
      await backend.purgeTrashItem(trashName);
      await refreshTrash();
    },

    emptyTrash: async () => {
      const entries = get().trash;
      await Promise.all(entries.map((e) => backend.purgeTrashItem(e.trashName).catch(() => {})));
      await refreshTrash();
    },

    addTask: async () => {
      const text = get().quickText.trim();
      if (!text) return;
      // Kutuyu HEMEN boşalt: temizlik yazma bittikten sonra yapılsaydı, hızlı ikinci Enter
      // aynı metni okuyup görevi iki kez eklerdi.
      set({ quickText: "" });
      await queueFileOp(async () => {
        // Açık notun yazılmamış hali önce diske: yoksa görev yazması "dış değişiklik"
        // sayılıp çakışma sorulur ya da taslak görev değişikliğini ezer (LOM-5).
        await flushDraft();
        try {
          // Görevler günlük nottan ayrı: ayrı "Yapılacaklar.md" dosyasına eklenir.
          // Dosya yoksa başlık bellekte kurulur — iki ayrı yazma (oluştur + ekle) yapılmaz.
          const content = (await backend.exists(TASKS_FILE))
            ? await backend.readNote(TASKS_FILE)
            : "# Yapılacaklar\n";
          const next = insertTaskUnderHeading(content, TODO_HEADING, buildTaskLine(text, todayISO()));
          await backend.writeNote(TASKS_FILE, next);
        } catch (e) {
          // Yazılamadıysa metni geri ver — kullanıcı yazdığını kaybetmesin.
          set((st) => ({ quickText: st.quickText || text }));
          await notifyError(`Görev eklenemedi: ${e instanceof Error ? e.message : String(e)}`);
          return;
        }
        await loadFromBackend();
      });
    },

    toggleTask: async (id) =>
      queueFileOp(async () => {
        // Açık notun yazılmamış hali önce diske: yoksa görev yazması "dış değişiklik"
        // sayılıp çakışma sorulur ya da taslak görev değişikliğini ezer (LOM-5).
        await flushDraft();
        const s = get(); // sırada bekleyen önceki yazmadan SONRAKİ satır numaraları
        const sep = id.lastIndexOf(":");
        const file = id.slice(0, sep);
        const line = Number(id.slice(sep + 1));
        // Beklenen satır metni: dosya arada dışarıdan değiştiyse (senkron, başka pencere)
        // satır numarası kaymış olur ve kullanıcı A'yı işaretlerken B işaretlenirdi.
        const task = s.parsedTasks.find((p) => p.file === file && p.line === line);
        try {
          const content = await backend.readNote(file);
          const next = toggleTaskInContent(content, line, todayISO(), task?.raw);
          if (next === content) {
            // Satır kaymış (ya da zaten aynı): yazma, listeyi tazele ki kullanıcı güncel
            // hâli görsün ve tekrar deneyebilsin.
            await loadFromBackend();
            if (task) await notifyError("Görev dosyası değişmiş; liste yenilendi, tekrar deneyin.");
            return;
          }
          await backend.writeNote(file, next);
        } catch (e) {
          await notifyError(`Görev güncellenemedi: ${e instanceof Error ? e.message : String(e)}`);
          return;
        }
        await loadFromBackend();
      }),

    selectTask: (selectedTask) => set({ selectedTask }),

    // Görev detayını (açıklama/tarih/öncelik) dosyaya yaz.
    updateTask: async (id, patch) =>
      queueFileOp(async () => {
        // Açık notun yazılmamış hali önce diske: yoksa görev yazması "dış değişiklik"
        // sayılıp çakışma sorulur ya da taslak görev değişikliğini ezer (LOM-5).
        await flushDraft();
        const s = get(); // sırada bekleyen önceki yazmadan SONRAKİ satır numaraları
        const sep = id.lastIndexOf(":");
        const file = id.slice(0, sep);
        const line = Number(id.slice(sep + 1));
        const task = s.parsedTasks.find((p) => p.file === file && p.line === line);
        if (!task) return;
        try {
          const content = await backend.readNote(file);
          // Satır kaymışsa applyTaskPatch içeriği DEĞİŞTİRMEDEN döndürür ve
          // eskiden aynı içerik sessizce geri yazılıyordu: kullanıcı kaydettim
          // sanıyor, değişiklik bir an görünüp kayboluyordu. toggleTask bu
          // durumda düzgünce uyarıyor; burada da aynısı yapılır.
          if (!taskLineMatches(content, line, task.raw)) {
            await loadFromBackend();
            await notifyError("Görev dosyası değişmiş; liste yenilendi, tekrar deneyin.");
            return;
          }
          await backend.writeNote(file, applyTaskPatch(content, line, task, patch));
        } catch (e) {
          await notifyError(`Görev güncellenemedi: ${e instanceof Error ? e.message : String(e)}`);
          return;
        }
        await loadFromBackend();
      }),

    // Görevi tek yazımda kaydet: satır yaması + (varsa) girintili çocuk bloğu (alt görevler + notlar).
    saveTask: async (id, patch, notes, subtasks) =>
      queueFileOp(async () => {
        // Açık notun yazılmamış hali önce diske: yoksa görev yazması "dış değişiklik"
        // sayılıp çakışma sorulur ya da taslak görev değişikliğini ezer (LOM-5).
        await flushDraft();
        const s = get();
        const sep = id.lastIndexOf(":");
        const file = id.slice(0, sep);
        const line = Number(id.slice(sep + 1));
        const task = s.parsedTasks.find((p) => p.file === file && p.line === line);
        if (!task) return;
        try {
          const content = await backend.readNote(file);
          // KRİTİK: satır kaymışsa applyTaskPatch reddediyor ama setTaskChildren
          // bundan habersiz çalışıyordu. O satırda artık BAŞKA bir görev
          // duruyorsa kullanıcının alt görev/not bloğu onun altına yazılıyor ve
          // onun mevcut alt satırları siliniyordu — geri alınamaz veri kaybı.
          if (!taskLineMatches(content, line, task.raw)) {
            await loadFromBackend();
            await notifyError("Görev dosyası değişmiş; liste yenilendi, tekrar deneyin.");
            return;
          }
          let next = applyTaskPatch(content, line, task, patch);
          // Alt görevler ve notlar aynı çocuk bloğunu paylaşır — tek seferde birlikte yazılır.
          if (notes !== undefined || subtasks !== undefined) {
            const subs = subtasks ?? getSubtasks(next, line).map((x) => ({ text: x.text, done: x.done }));
            const nts = notes ?? getTaskNotes(next, line);
            next = setTaskChildren(next, line, subs, nts);
          }
          await backend.writeNote(file, next);
        } catch (e) {
          await notifyError(`Görev kaydedilemedi: ${e instanceof Error ? e.message : String(e)}`);
          return;
        }
        await loadFromBackend();
      }),

    // Görev sırasını değiştir (sürükle-bırak): sürüklenen görevi hedefin ÖNÜNE/ARKASINA tam yerleştir.
    // Uygulama düzeyi manuel sıra (dosyadan bağımsız, dosyalar arası çalışır, kalıcı).
    // Farklı bir gün grubuna bırakılırsa görev o güne yeniden planlanır (tarih dosyaya yazılır).
    reorderTask: async (fromId, toId, position) =>
      queueFileOp(async () => {
        // Açık notun yazılmamış hali önce diske: yoksa görev yazması "dış değişiklik"
        // sayılıp çakışma sorulur ya da taslak görev değişikliğini ezer (LOM-5).
        await flushDraft();
        const s = get();
        const parse = (id: string) => {
          const sep = id.lastIndexOf(":");
          return { file: id.slice(0, sep), line: Number(id.slice(sep + 1)) };
        };
        const d = parse(fromId);
        const tg = parse(toId);
        const dTask = s.parsedTasks.find((p) => p.file === d.file && p.line === d.line);
        const tTask = s.parsedTasks.find((p) => p.file === tg.file && p.line === tg.line);
        if (!dTask || !tTask) return;
        if (dTask.file === tTask.file && dTask.line === tTask.line) return;

        const today = todayISO();
        const tDate = tTask.due ?? tTask.scheduled;
        const dDate = dTask.due ?? dTask.scheduled;

        // 1) Farklı güne sürüklendiyse görevi hedefin gününe taşı (kullandığı tarih alanını koru).
        let parsedTasks = s.parsedTasks;
        let rescheduled = false;
        if (tDate && dDate !== tDate) {
          const field: "scheduled" | "due" = dTask.scheduled && !dTask.due ? "scheduled" : "due";
          const content = await backend.readNote(dTask.file);
          // Satır kaymışsa yazma hiç olmuyor ama aşağıda `rescheduled` true
          // yapılıp yerel liste güncelleniyordu: ekranda taşınmış görünen görev
          // diskte eski gününde kalıyordu.
          if (!taskLineMatches(content, dTask.line, dTask.raw)) {
            await loadFromBackend();
            await notifyError("Görev dosyası değişmiş; liste yenilendi, tekrar deneyin.");
            return;
          }
          await backend.writeNote(dTask.file, applyTaskPatch(content, dTask.line, dTask, { [field]: tDate }));
          // Yerel kopyayı güncelle ki gruplama yeni günü hemen yansıtsın.
          parsedTasks = s.parsedTasks.map((p) =>
            p.file === dTask.file && p.line === dTask.line ? { ...p, [field]: tDate } : p
          );
          rescheduled = true;
        }

        // 2) Hedef grubun (aynı gün; tarihsizse aynı kaynak not) sıralı, açık kardeşleri —
        //    sürüklenen hariç. Komşuların değerleri arasından midpoint ile kesin yerleştir.
        const inTargetGroup = (p: (typeof parsedTasks)[number]) => {
          const pd = p.due ?? p.scheduled;
          return tDate ? pd === tDate : !pd && p.file === tTask.file;
        };
        const sibs = parsedTasks
          .filter(
            (p) =>
              !p.done &&
              inTargetGroup(p) &&
              !(p.file === dTask.file && p.line === dTask.line)
          )
          .sort((x, y) => taskSortVal(x, s.taskOrder) - taskSortVal(y, s.taskOrder));

        const tIdx = sibs.findIndex((p) => p.file === tTask.file && p.line === tTask.line);
        const insertIdx = position === "after" ? tIdx + 1 : tIdx;
        const prev = sibs[insertIdx - 1];
        const next = sibs[insertIdx];
        const prevVal = prev ? taskSortVal(prev, s.taskOrder) : undefined;
        const nextVal = next ? taskSortVal(next, s.taskOrder) : undefined;
        let newVal: number;
        if (prevVal != null && nextVal != null) newVal = (prevVal + nextVal) / 2;
        else if (nextVal != null) newVal = nextVal - 1;
        else if (prevVal != null) newVal = prevVal + 1;
        else newVal = 0;

        const taskOrder = { ...s.taskOrder, [taskOrderKey(dTask.file, dTask.description)]: newVal };
        if (rescheduled) {
          set({ taskOrder });
          await loadFromBackend();
        } else {
          const { groups, unplannedTasks } = groupTasks(parsedTasks, today, taskOrder);
          set({ taskOrder, parsedTasks, groups, unplannedTasks });
        }
      }),

    // — GitHub —
    ghBeginAuth: async () => {
      // Kodu göster; GitHub'a yönlendirme yalnız kullanıcı "kodu kopyala" butonuna
      // basınca olur (bkz GitHubDeviceModal) — kopyalamadan sayfaya atlamasın.
      set({ ghStatus: null });
      const d = await gh.deviceStart();
      set({ ghDevice: d });
    },
    /** Kodu panoya kopyala, ardından GitHub onay sayfasını aç (bkz ghBeginAuth notu). */
    ghCopyCodeAndOpen: async () => {
      const d = get().ghDevice;
      if (!d) return;
      try {
        await navigator.clipboard.writeText(d.user_code);
      } catch {
        /* pano izinsiz olabilir — yine de GitHub'a yönlendir */
      }
      gh.openUrl(d.verification_uri).catch(() => {});
    },
    ghCancelAuth: () => set({ ghDevice: null }),
    ghPoll: async () => {
      const d = get().ghDevice;
      if (!d) return "no_device";
      const res = await gh.devicePoll(d.device_code);
      if (res.status === "ok" && res.access_token) {
        const token = res.access_token;
        const user = await gh.user(token);
        set({ ghToken: token, ghUser: user, ghDevice: null, ghStatus: null });
        return "ok";
      }
      return res.status;
    },
    ghDisconnect: () =>
      set({ ghToken: null, ghUser: null, ghRepo: null, ghDevice: null, ghStatus: null, ghBaseSha: null }),
    ghLoadRepos: async () => {
      const token = get().ghToken;
      if (!token) return [];
      return gh.listRepos(token);
    },
    ghCreateRepo: async (name, priv_) => {
      const token = get().ghToken;
      if (!token) return;
      const repo = await gh.createRepo(token, name, priv_);
      const s = get();
      if (s.vaultPath) get().setVaultRepo(s.vaultPath, repo);
      else set({ ghRepo: repo });
    },
    // Aktif kasaya repo ata (kasaya bağlı saklanır); kasa yoksa global ghRepo.
    ghSelectRepo: (repo) => {
      const s = get();
      if (s.vaultPath) get().setVaultRepo(s.vaultPath, repo);
      else set({ ghRepo: repo });
      set({ ghBaseSha: null }); // yeni repo → senkron temeli sıfırlanır (tam 3-yönlü ilk senkron)
    },
    ghSync: async () => {
      const s = get();
      if (!s.ghToken || !s.ghRepo) {
        set({ ghStatus: "Bağlantı ve depo gerekli" });
        return;
      }
      if (!s.vaultPath) {
        set({ ghStatus: "needVault" });
        return;
      }
      set({ ghSyncing: true, ghStatus: null });
      try {
        if (s.platformMobile) {
          // Mobil: git2 yok → GitHub REST (Git Data API) ile senkron.
          const [owner, repo] = s.ghRepo.full_name.split("/");
          const branch = s.ghRepo.default_branch || "main";
          const res = await gh.apiSync(s.vaultPath, owner, repo, branch, s.ghToken, s.ghBaseSha);
          set({
            ghSyncing: false,
            ghLastSync: new Date().toISOString(),
            ghBaseSha: res.base_sha,
            ghStatus: res.conflicts.length
              ? `${res.conflicts.length} çakışma (kopya oluşturuldu)`
              : res.pulled
                ? "pulledPushed"
                : "pushed",
          });
          await get().reloadVault();
        } else {
          // Masaüstü: git2 tabanlı senkron.
          const login = s.ghUser?.login ?? "loomen";
          const res = await gh.sync(
            s.vaultPath,
            s.ghRepo.clone_url,
            s.ghToken,
            login,
            `${login}@users.noreply.github.com`
          );
          set({
            ghSyncing: false,
            ghLastSync: new Date().toISOString(),
            ghStatus: res.pulled ? "pulledPushed" : "pushed",
          });
          await get().reloadVault();
        }
      } catch (e) {
        set({ ghSyncing: false, ghStatus: String(e) });
      }
    },
    ghSetAutoSync: (ghAutoSync) => set({ ghAutoSync }),

    // ---------- Google Takvim ----------
    gcalConnect: async () => {
      const mobile = get().platformMobile;
      const clientId = mobileClientId(get().platformOs); // iOS/Android'e göre
      // Mobil: platform client id yeter (secret yok). Masaüstü: client id + secret.
      if (mobile ? !clientId : !GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
        set({ gcalStatus: "noClientId" });
        return;
      }
      set({ gcalConnecting: true, gcalStatus: null });
      try {
        const tokens = mobile ? await gcal.mobileLogin(clientId) : await gcal.login();
        set({ gcalTokens: tokens, gcalExpiresAt: Date.now() + tokens.expires_in * 1000 });
        const user = await gcal.userinfo(tokens.access_token);
        set((s) => ({
          gcalUser: user,
          gcalConnecting: false,
          gcalCalendarId: s.gcalCalendarId ?? "primary",
          gcalCalendarName: s.gcalCalendarName ?? "primary",
        }));
        // Bağlanınca ilk senkron: etkinlikler görsel takvimde + ajandada hemen görünsün.
        void get().gcalSync();
      } catch (e) {
        set({ gcalConnecting: false, gcalStatus: String(e) });
      }
    },
    gcalDisconnect: () =>
      set({
        gcalTokens: null,
        gcalExpiresAt: null,
        gcalUser: null,
        gcalCalendarId: null,
        gcalCalendarName: null,
        gcalEvents: [],
        gcalStatus: null,
      }),
    gcalLoadCalendars: async () => {
      const token = await ensureGcalAccess();
      if (!token) return [];
      return gcal.listCalendars(token);
    },
    gcalSelectCalendar: (id, name) => set({ gcalCalendarId: id, gcalCalendarName: name }),
    gcalSync: async () => {
      const token = await ensureGcalAccess();
      if (!token) {
        set({ gcalStatus: "needAuth" });
        return;
      }
      const s0 = get();
      const vault = s0.vaultPath;
      if (!vault) {
        set({ gcalStatus: "needVault" });
        return;
      }
      const calId = s0.gcalCalendarId ?? "primary";
      set({ gcalSyncing: true, gcalStatus: null });
      try {
        const tz = localTimeZone();
        // PUSH: tarihli + tamamlanmamış görevler → etkinlik (oluştur/güncelle).
        const desired = s0.parsedTasks.filter((t) => t.due && !t.done && t.description.trim());
        const prevMap = s0.gcalMap[vault] ?? {};
        const nextMap: Record<string, string> = {};
        const desiredKeys = new Set<string>(); // istenen tüm anahtarlar (başarısız upsert dahil)
        for (const t of desired) {
          const key = `${t.file}::${t.description}`;
          if (desiredKeys.has(key)) continue; // aynı dosyada birebir aynı görev → tek etkinlik
          desiredKeys.add(key);
          const payload = taskToEventPayload({
            summary: t.description,
            due: t.due!,
            time: t.time,
            loomenKey: key,
            timeZone: tz,
          });
          try {
            const res = await gcal.upsertEvent(token, calId, prevMap[key] ?? null, payload);
            nextMap[key] = res.id;
          } catch {
            // Güncellenecek etkinlik silinmişse (404/410) → yeniden oluştur.
            try {
              const res = await gcal.upsertEvent(token, calId, null, payload);
              nextMap[key] = res.id;
            } catch {
              // Geçici hata → eski eşlemeyi koru ki yetim-silme bu etkinliği silmesin / kopya açılmasın.
              if (prevMap[key]) nextMap[key] = prevMap[key];
            }
          }
        }
        // Yetim etkinlikleri sil: yalnızca artık İSTENMEYEN anahtarlar (başarısız upsert'ler değil).
        for (const [key, id] of Object.entries(prevMap)) {
          if (!desiredKeys.has(key)) {
            try {
              await gcal.deleteEvent(token, calId, id);
            } catch {
              /* yoksay */
            }
          }
        }
        // PULL: bugünden +30 gün etkinlikleri çek (kendi görevlerimizi hariç tut).
        const now = new Date();
        const timeMin = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
        const timeMax = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 30).toISOString();
        let events: GEvent[] = [];
        try {
          events = (await gcal.listEvents(token, calId, timeMin, timeMax)).filter((e) => !e.loomen);
        } catch {
          /* pull başarısız → push sonucu yine de kaydedilir */
        }
        set((s) => ({
          gcalSyncing: false,
          gcalLastSync: new Date().toISOString(),
          gcalStatus: "synced",
          gcalEvents: events,
          gcalMap: { ...s.gcalMap, [vault]: nextMap },
        }));
      } catch (e) {
        set({ gcalSyncing: false, gcalStatus: String(e) });
      }
    },
    gcalSetAutoSync: (gcalAutoSync) => set({ gcalAutoSync }),

    // ---------------------------------------------------------------- AI asistanı

    // Asistan ilk kez açıldığında hazır bir Gemini sağlayıcısı kurulur: Google'ın ücretsiz
    // kotası bu iş için yeterli, kullanıcıya yalnızca anahtarı yapıştırmak kalır.
    aiSetEnabled: (aiEnabled) => {
      set({ aiEnabled });
      if (aiEnabled && get().aiProviders.length === 0) get().aiAddProvider("gemini");
    },

    aiSetExcluded: (aiExcluded) => set({ aiExcluded }),

    aiSetShowContext: (aiShowContext) => set({ aiShowContext }),

    aiSetCanWrite: (aiCanWrite) => set({ aiCanWrite }),

    aiSetVoiceAutoSend: (aiVoiceAutoSend) => set({ aiVoiceAutoSend }),

    aiAddProvider: (kind) => {
      const s = get();
      const id = newProviderId(kind, s.aiProviders);
      // Ad boş bırakılır: arayüz boşsa sağlayıcı türünü gösterir, böylece aynı ad iki kez yazılmaz.
      const provider: AiProvider = { id, kind, label: "", model: DEFAULT_MODEL[kind] };
      set({
        aiProviders: [...s.aiProviders, provider],
        aiActiveProviderId: s.aiActiveProviderId ?? id,
      });
      return id;
    },

    aiUpdateProvider: (id, patch) =>
      set((s) => ({ aiProviders: s.aiProviders.map((p) => (p.id === id ? { ...p, ...patch } : p)) })),

    aiRemoveProvider: async (id) => {
      // Sağlayıcı silinince anahtarı da işletim sistemi deposundan sil — artık sahipsiz kalmasın.
      await aiKeys.remove(id).catch(() => {});
      set((s) => {
        const aiProviders = s.aiProviders.filter((p) => p.id !== id);
        const active = s.aiActiveProviderId === id ? (aiProviders[0]?.id ?? null) : s.aiActiveProviderId;
        return { aiProviders, aiActiveProviderId: active };
      });
    },

    aiSetActiveProvider: (aiActiveProviderId) => set({ aiActiveProviderId }),

    aiSaveKey: async (id, key) => {
      await aiKeys.set(id, key);
    },

    aiClearKey: async (id) => {
      await aiKeys.remove(id);
    },

    aiTestProvider: async (id) => {
      const p = get().aiProviders.find((x) => x.id === id);
      if (!p) throw new Error("Sağlayıcı bulunamadı");
      return testProvider(p);
    },

    aiSend: async (text) => {
      const body = text.trim();
      if (!body) return;
      const s = get();
      if (s.aiBusy) return;
      const provider = s.aiProviders.find((p) => p.id === s.aiActiveProviderId);
      if (!provider) {
        set({
          aiMessages: [
            ...s.aiMessages,
            { id: `err-${Date.now()}`, role: "assistant", content: "", error: "Önce ayarlardan bir sağlayıcı ekleyin." },
          ],
        });
        return;
      }

      // Bağlam: kasadaki notlarda arama (RAG). Yalnızca okuma yapılır, diske dokunulmaz.
      // Editördeki kaydedilmemiş taslak da hesaba katılır ki kullanıcının EKRANDA GÖRDÜĞÜ
      // metin sorulabilsin — aksi hâlde yeni yazdığı satır asistana görünmezdi.
      const contents: Record<string, string> = { ...s.noteContents };
      if (s.draftPath && s.draftPath === s.activeNote) contents[s.draftPath] = s.draft;

      const hits = retrieve(contents, body, { k: 6, excluded: s.aiExcluded });
      const context = buildContext(hits);
      const system = buildSystemPrompt({ activeNote: s.activeNote, context, canWrite: s.aiCanWrite });

      const stamp = Date.now();
      const userMsg: AiMessage = { id: `u-${stamp}`, role: "user", content: body };
      const replyId = `a-${stamp}`;
      const history = [...s.aiMessages, userMsg];
      set({
        aiMessages: [
          ...history,
          {
            id: replyId,
            role: "assistant",
            content: "",
            streaming: true,
            citations: context.citations,
            contextText: s.aiShowContext ? context.text : undefined,
          },
        ],
        aiBusy: true,
      });

      const patchReply = (patch: Partial<AiMessage>) =>
        set((st) => ({
          aiMessages: st.aiMessages.map((m) => (m.id === replyId ? { ...m, ...patch } : m)),
        }));

      try {
        const res = await chatStream(
          provider,
          history.filter((m) => !m.error).map((m) => ({ role: m.role, content: m.content })),
          {
            system,
            onStart: (aiRequestId) => set({ aiRequestId }),
            onDelta: (delta) =>
              set((st) => ({
                aiMessages: st.aiMessages.map((m) =>
                  m.id === replyId ? { ...m, content: m.content + delta } : m
                ),
              })),
          }
        );
        // Öneri blokları cevaptan ayrılır: kullanıcı ham JSON değil, önizlemeli bir kart
        // görür. Blok yalnız bir NİYET beyanıdır; onaylanana kadar diske hiçbir şey gitmez.
        const parsed = splitProposals(res.text);
        patchReply({
          content: res.text,
          streaming: false,
          cancelled: res.cancelled || undefined,
          proposals: parsed.proposals.length ? parsed.proposals.map((pr) => ({ ...pr })) : undefined,
        });
      } catch (e) {
        patchReply({ streaming: false, error: String(e instanceof Error ? e.message : e) });
      } finally {
        set({ aiBusy: false, aiRequestId: null });
      }
    },

    aiCancel: () => {
      const id = get().aiRequestId;
      if (id) cancelChat(id);
    },

    aiTranscribe: async (wav) => {
      const s = get();
      const provider = s.aiProviders.find((p) => p.id === s.aiActiveProviderId);
      if (!provider) throw new Error("Önce ayarlardan bir sağlayıcı ekleyin.");
      set({ aiTranscribing: true });
      try {
        return await transcribe(provider, wav, s.lang);
      } finally {
        set({ aiTranscribing: false });
      }
    },

    // Asistanın not önerisini UYGULA. NOTE_SAFETY:
    //  - yalnız EKLEME ve YENİ NOT var; üzerine yazma/silme hiç yok, veri kaybı mümkün değil,
    //  - yazmadan önce bekleyen taslak diske geçer (autosave sonradan ateşleyip eklemeyi silmesin),
    //  - hedef açık notsa taslak da aynı içerikle güncellenir (draft ⇔ draftPath bağı korunur),
    //  - içerik DİSKTEN okunur; bellekteki kopya bayat olabilir (dış değişiklik/senkron).
    aiApplyProposal: async (messageId, index) => {
      const patch = (p: Partial<ProposalState>) =>
        set((st) => ({
          aiMessages: st.aiMessages.map((m) =>
            m.id === messageId
              ? {
                  ...m,
                  proposals: (m.proposals ?? []).map((pr, i) => (i === index ? { ...pr, ...p } : pr)),
                }
              : m,
          ),
        }));

      const msg = get().aiMessages.find((m) => m.id === messageId);
      const prop = msg?.proposals?.[index];
      if (!prop || prop.appliedPath) return; // iki kez uygulanmaz

      // Sıraya alınır: iki öneri aynı nota arka arkaya uygulanırsa ikisi de AYNI içeriği
      // okuyup birbirini ezerdi, ilk ekleme sessizce kaybolurdu.
      await queueFileOp(async () => {
        try {
          if (!(await flushDraft())) throw new Error("Açık not kaydedilemedi");
          const dir = prop.path.includes("/") ? prop.path.slice(0, prop.path.lastIndexOf("/")) : "";

          let target = prop.path;
          if (prop.action === "create") {
            // Çakışan ad ÜZERİNE YAZILMAZ: sıradaki boş ada geçilir.
            target = await uniquePath(target, (x) => backend.exists(x));
            if (dir) await backend.ensureDir(dir);
            await backend.writeNote(target, appendText("", prop.text));
          } else {
            if (!(await backend.exists(target))) {
              // Model olmayan bir nota eklemek isteyebilir; sessizce oluşturmak yerine
              // kullanıcıya söylenir — yanlış yola yazmanın tek çaresi budur.
              throw new Error(`Not bulunamadı: ${target}`);
            }
            const current = await backend.readNote(target);
            await backend.writeNote(target, appendText(current, prop.text));
            // Bellekteki kopya BİLEREK güncellenmiyor: aşağıdaki loadFromBackend, taslak
            // temizken (flushDraft sayesinde öyle) hem taslağı hem editörü yeni içerikle
            // tazeliyor (draftEpoch). Burada elle set edilseydi o tazeleme atlanır,
            // CodeMirror eski metinde kalır ve ilk tuşta autosave eklemeyi geri silerdi.
          }
          await loadFromBackend();
          patch({ appliedPath: target, error: undefined });
        } catch (e) {
          patch({ error: e instanceof Error ? e.message : String(e) });
        }
      });
    },

    aiClearChat: () => set({ aiMessages: [] }),

    // ——— Tekrar (aralıklı tekrar) ———
    // NOTE_SAFETY: buradaki hiçbir kod not dosyasına yazmaz. Yalnız Tekrar/ altındaki
    // üç dosya yazılır: durum.json, gecmis.jsonl, ayarlar.json.

    srsLoad: async () => {
      const cfg = await loadSettings(backend);
      const { states: saved, daily } = await loadStates(backend);
      const log = await loadLog(backend);
      const sec = avgSeconds(log.slice(-200).map((l) => l.ms));

      const cards = collectCards(get().noteContents, cfg.syntax, cfg.excluded);
      const m = matchStates(cards, saved);
      // Oturum sürerken diskten gelen eski kayıt bellektekini ezmesin: daha yeni olan kazanır.
      const mem = get().srsStates;
      const merged: Record<string, SrsState> = { ...m.states };
      for (const [id, st] of Object.entries(mem)) {
        const disk = merged[id];
        if (!disk) continue;
        const a = st.last ? Date.parse(st.last) : 0;
        const b = disk.last ? Date.parse(disk.last) : 0;
        if (a > b || (a === b && st.reps > disk.reps)) merged[id] = st;
      }
      set({ srsLoaded: true, srsSettings: cfg, srsStates: merged, srsDaily: daily, srsCards: cards, srsSecPerCard: sec });
      if (cfg.enabled && m.changed && cards.length > 0) await saveStates(backend, merged, daily);
    },

    srsSetSettings: async (patch) => {
      const next = { ...get().srsSettings, ...patch };
      set({ srsSettings: next });
      await saveSettings(backend, next);
      // İşaretleme biçimleri değiştiyse kart listesi yeniden çıkarılmalı.
      if (patch.syntax || patch.excluded || patch.enabled) {
        const cards = collectCards(get().noteContents, next.syntax, next.excluded);
        const m = matchStates(cards, get().srsStates);
        set({ srsCards: cards, srsStates: m.states });
        if (next.enabled && cards.length > 0) await saveStates(backend, m.states, get().srsDaily);
      }
    },

    srsApplyPreset: async (name) => {
      await get().srsSetSettings(SRS_PRESETS[name]);
    },

    srsStart: (deck) => {
      const s = get();
      const cfg = s.srsSettings;
      const deckId = deck === undefined ? s.srsDeck : deck;
      const d = deckId ? cfg.desteler.find((x) => x.id === deckId) : null;
      let cards = s.srsCards;
      if (d) {
        cards = cards.filter(
          (c) =>
            (!d.folder || c.file === d.folder || c.file.startsWith(d.folder + "/")) &&
            (!d.tag || (s.noteContents[c.file] ?? "").includes("#" + d.tag)),
        );
      }
      const cfg2: SrsSettings = d
        ? { ...cfg, newPerDay: d.newPerDay ?? cfg.newPerDay, maxPerDay: d.maxPerDay ?? cfg.maxPerDay }
        : cfg;
      const q = buildQueue(cards, s.srsStates, s.srsDaily, cfg2, new Date(), s.srsSecPerCard);
      set({
        srsQueue: q.items,
        srsIndex: 0,
        srsShow: false,
        srsAnswered: 0,
        srsDeck: deckId ?? null,
        srsShownAt: Date.now(),
        screen: "review",
      });
    },

    srsReveal: () => set({ srsShow: true }),

    srsEndSession: () => set({ srsQueue: [], srsIndex: 0, srsShow: false }),

    srsAnswer: async (g) => {
      const s = get();
      const item = s.srsQueue[s.srsIndex];
      if (!item) return;
      const now = new Date();
      const cfg = s.srsSettings;
      const prev = s.srsStates[item.card.id] ?? item.state;

      const next = srsSchedule(prev, g, cfg, now);
      // Aynı güne yığmama: yalnız gün ölçeğindeki aralıklar kaydırılır.
      if (next.days >= 1 && cfg.balance) {
        const d = balanceDays(next.days, cfg, futureLoad(s.srsStates, now), now);
        next.days = d;
        next.minutes = d * 1440;
      }
      let st = srsApply(prev, g, next, now);

      // Çok unutulan kartı işaretle.
      if (st.lapses >= cfg.leechAt && !st.leech) {
        st = { ...st, leech: true, frozen: cfg.leechAction === "freeze" ? true : st.frozen };
      }

      const ms = Math.min(120000, Math.max(0, Date.now() - s.srsShownAt));
      const states = { ...s.srsStates, [item.card.id]: st };

      // Aynı notun diğer kartlarını bugünlük ertele (arka arkaya aynı konuyu sormasın).
      if (cfg.burySiblings) {
        const today = isoDay(now);
        for (const c of s.srsCards) {
          if (c.file !== item.card.file || c.id === item.card.id) continue;
          const o = states[c.id];
          if (o && o.phase !== "learning" && o.phase !== "relearning") states[c.id] = { ...o, postponed: today };
        }
      }

      const day = isoDay(now);
      const dc = s.srsDaily[day] ?? { n: 0, r: 0, ms: 0 };
      const daily = {
        ...s.srsDaily,
        [day]: { n: dc.n + (item.bucket === "new" ? 1 : 0), r: dc.r + 1, ms: dc.ms + ms },
      };

      const log: SrsLog = {
        id: item.card.id,
        t: now.getTime(),
        g,
        p: prev.phase,
        s: st.stability,
        d: st.difficulty,
        i: next.days,
        pi: prev.stability,
        ms,
      };

      // "Bilemedim" dendiyse kart aynı oturumda tekrar sorulur (öğrenme adımı).
      const queue = [...s.srsQueue];
      if (g === 1 && next.minutes < 1440) queue.push({ ...item, state: st });

      set({
        srsStates: states,
        srsDaily: daily,
        srsQueue: queue,
        srsIndex: s.srsIndex + 1,
        srsShow: false,
        srsAnswered: s.srsAnswered + 1,
        srsShownAt: Date.now(),
      });

      await saveStates(backend, states, daily);
      await appendLog(backend, [log]);
    },

    srsFreeze: async (id) => {
      const s = get();
      const st = s.srsStates[id];
      if (!st) return;
      const states = { ...s.srsStates, [id]: { ...st, frozen: !st.frozen } };
      set({ srsStates: states, srsQueue: s.srsQueue.filter((q) => q.card.id !== id) });
      await saveStates(backend, states, s.srsDaily);
    },

    srsPostpone: async (id) => {
      const s = get();
      const st = s.srsStates[id];
      if (!st) return;
      const states = { ...s.srsStates, [id]: { ...st, postponed: isoDay(new Date()) } };
      set({ srsStates: states, srsQueue: s.srsQueue.filter((q) => q.card.id !== id) });
      await saveStates(backend, states, s.srsDaily);
    },

    srsSpread: async (days) => {
      const s = get();
      const states = spreadBacklog(s.srsStates, Math.max(1, days));
      set({ srsStates: states });
      await saveStates(backend, states, s.srsDaily);
    },

    srsResetCard: async (id) => {
      const s = get();
      const st = s.srsStates[id];
      if (!st) return;
      const states = {
        ...s.srsStates,
        [id]: { ...st, phase: "new" as const, due: new Date().toISOString(), stability: 0, difficulty: 0, reps: 0, lapses: 0, step: 0, last: null, leech: false, frozen: false },
      };
      set({ srsStates: states });
      await saveStates(backend, states, s.srsDaily);
    },
      };
    },
    {
      name: "loomen.settings",
      /**
       * Kayıtlı ayarları varsayılanların ÜSTÜNE güvenle bindir.
       * Varsayılan (sığ) birleştirme iç içe nesneleri bütün olarak değiştirir: eski sürümden
       * ya da yarım yazılmış bir kayıttan gelen `pomo: { focusMin: 25 }` diğer alanları
       * undefined bırakır → `rounds` undefined → sayaç NaN'a düşer ve uygulama açılmaz.
       * Bu yüzden nesneler alan alan, diziler tür kontrolüyle birleştirilir.
       */
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<AppState>;
        const min = (v: unknown, fb: number) =>
          typeof v === "number" && Number.isFinite(v) && v > 0 ? v : fb;
        const strArr = (v: unknown, fb: string[]) =>
          Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : fb;
        // Yalnız VERİ alanları geri yüklenir. Bozuk/elle düzenlenmiş bir kayıt bir aksiyonun
        // üstüne yazarsa (ör. saveNote: "x") uygulama ilk kullanımda çökerdi.
        const data = Object.fromEntries(
          Object.entries(p).filter(
            ([k]) => typeof (current as unknown as Record<string, unknown>)[k] !== "function",
          ),
        ) as Partial<AppState>;
        return {
          ...current,
          ...data,
          pomo: {
            focusMin: min(p.pomo?.focusMin, current.pomo.focusMin),
            shortBreak: min(p.pomo?.shortBreak, current.pomo.shortBreak),
            longBreak: min(p.pomo?.longBreak, current.pomo.longBreak),
            rounds: min(p.pomo?.rounds, current.pomo.rounds),
          },
          editorSettings: { ...current.editorSettings, ...(p.editorSettings ?? {}) },
          favorites: strArr(p.favorites, current.favorites),
          vaults: Array.isArray(p.vaults)
            ? p.vaults.filter((v): v is VaultEntry => !!v && typeof v.path === "string")
            : current.vaults,
          tabsByVault: p.tabsByVault ?? current.tabsByVault,
          taskOrder: p.taskOrder ?? current.taskOrder,
          pomoHistory: p.pomoHistory ?? current.pomoHistory,
          gcalMap: p.gcalMap ?? current.gcalMap,
        };
      },
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        // TÜM iş mikrogörevde: localStorage senkron olduğu için bu geri çağrı
        // doğrudan create() çağrısının içinde çalışıyor ve o anda `useAppStore`
        // sabiti HENÜZ TANIMLI DEĞİL. Buradan doğrudan `useAppStore.setState`
        // çağırmak ReferenceError atıyordu; zustand hatayı yutup geri çağrıyı
        // state=undefined ile tekrar çalıştırıyor, o da ilk satırda çıkıyordu.
        // Sonuç: süresi dolmuş sayaç temizlenmiyor VE altındaki kasa geri
        // yükleme adımına hiç sıra gelmiyordu — kullanıcı "Kasa seç" ekranına
        // düşüyordu. Kasa satırı zaten mikrogörevdeydi, sayaç satırları değildi.
        queueMicrotask(() => {
          // Uygulama kapalıyken süresi dolmuş sayaç: kullanıcı masa başında mıydı
          // bilinmiyor, hayalet bir "tamamlandı" kaydı yazma — temiz başlangıca dön.
          if (state.pomoRunning && (state.pomoEndsAt ?? 0) <= Date.now()) {
            useAppStore.setState({
              pomoRunning: false,
              pomoEndsAt: null,
              pomoRemaining: state.pomo.focusMin * 60,
            });
          }
          if (state.pomoBreakRunning && (state.pomoBreakEndsAt ?? 0) <= Date.now()) {
            useAppStore.setState({ pomoBreakRunning: false, pomoBreakEndsAt: null, pomoBreakActive: false });
          }
          // Kayıtlı kasayı backend olarak yeniden aç (HMR/yeniden başlatmada
          // vaultPath kaybolup "Kasa seç"e düşmesin).
          if (state.vaultPath && isTauri()) {
            void useAppStore.getState().reopenVault(state.vaultPath);
          }
        });
      },
      // Yalnızca kullanıcı tercihlerini + seçili kasa yolunu kalıcı yap (vault verisi türetilir).
      partialize: (s) => ({
        theme: s.theme,
        lang: s.lang,
        accent: s.accent,
        editorSettings: s.editorSettings,
        dailyTemplate: s.dailyTemplate,
        vaultPath: s.vaultPath,
        vaults: s.vaults,
        tabsByVault: s.tabsByVault,
        leftCollapsed: s.leftCollapsed,
        rightCollapsed: s.rightCollapsed,
        backlinksCollapsed: s.backlinksCollapsed,
        pomo: s.pomo,
        pomoSound: s.pomoSound,
        pomoHistory: s.pomoHistory,
        // Sayaç durumu da kalıcı: uygulama kapanıp açılınca süren seans kaldığı yerden
        // devam eder (bitiş anı saklandığı için kapalı geçen süre de sayılır).
        pomoRunning: s.pomoRunning,
        pomoRemaining: s.pomoRemaining,
        pomoEndsAt: s.pomoEndsAt,
        pomoPhase: s.pomoPhase,
        pomoCompleted: s.pomoCompleted,
        pomoBreakActive: s.pomoBreakActive,
        pomoBreakRunning: s.pomoBreakRunning,
        pomoBreakRemaining: s.pomoBreakRemaining,
        pomoBreakEndsAt: s.pomoBreakEndsAt,
        pomoBreakLong: s.pomoBreakLong,
        taskOrder: s.taskOrder,
        favorites: s.favorites,
        ghToken: s.ghToken,
        ghUser: s.ghUser,
        ghRepo: s.ghRepo,
        ghLastSync: s.ghLastSync,
        ghAutoSync: s.ghAutoSync,
        ghBaseSha: s.ghBaseSha,
        gcalTokens: s.gcalTokens,
        gcalExpiresAt: s.gcalExpiresAt,
        gcalUser: s.gcalUser,
        gcalCalendarId: s.gcalCalendarId,
        gcalCalendarName: s.gcalCalendarName,
        gcalLastSync: s.gcalLastSync,
        gcalAutoSync: s.gcalAutoSync,
        gcalMap: s.gcalMap,
        // AI: yalnızca yapılandırma kalıcı. API anahtarları BURAYA ASLA EKLENMEZ —
        // onlar işletim sistemi anahtar zincirinde durur. Sohbet oturumluktur.
        aiEnabled: s.aiEnabled,
        aiProviders: s.aiProviders,
        aiActiveProviderId: s.aiActiveProviderId,
        aiExcluded: s.aiExcluded,
        aiShowContext: s.aiShowContext,
        aiCanWrite: s.aiCanWrite,
        aiVoiceAutoSend: s.aiVoiceAutoSend,
      }),
    }
  )
);

/** "Bugüne Odaklan" sayaçları — gerçek vault verisinden. */
export function useFocusCounts(): FocusCounts {
  return useAppStore((s) => s.counts);
}
