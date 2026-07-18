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
  TODO_HEADING,
} from "../core/vault";
import { groupTasks, focusCounts, taskSortVal, taskOrderKey } from "../core/vault/grouping";
import { parseTasks } from "../core/markdown/taskParser";
import { playChime } from "../core/sound";
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
import { toggleTaskInContent, buildTaskLine, insertTaskUnderHeading, applyTaskPatch, setTaskChildren, getSubtasks, getTaskNotes, type TaskPatch } from "../core/markdown/taskParser";

export type Theme = "light" | "dark";
export type Screen = "planner" | "editor" | "graph" | "reports" | "settings" | "draw" | "newtab" | "help";
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

  // Pomodoro
  pomo: PomodoroSettings;
  /** Pomodoro başlayınca/bitince ses çal. */
  pomoSound: boolean;
  pomoRemaining: number;
  pomoRunning: boolean;
  pomoPhase: PomoPhase;
  pomoCompleted: number; // mevcut turda tamamlanan odak seansı (0..rounds)
  pomoHistory: Record<string, number>; // ISO tarih → tamamlanan odak seansı (rapor için, kalıcı)
  // Mola — odak bitince teklif edilen ayrı (ufak) sayaç. Otomatik başlamaz; es geçilebilir.
  pomoBreakActive: boolean; // mola gösteriliyor mu (odak bitti, yeni odak başlamadı)
  pomoBreakRunning: boolean; // mola sayacı çalışıyor mu
  pomoBreakRemaining: number; // mola kalan saniye
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
  saveDraw: (json: string) => Promise<void>;
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
const VAULT_KEY = "loomen.vaultPath";
const TASKS_FILE = "Yapılacaklar.md"; // görevler günlük nottan ayrı, kendi sayfasında

// Modül seviyesi: serileştirilemeyen backend + watcher (store dışında tutulur).
let backend: VaultBackend = createSampleBackend();
let unwatch: (() => void) | null = null;

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => {
  /** Backend'den yükle, gruplandır, state'e yaz. */
  async function loadFromBackend() {
    const { tasks, notes, contents } = await loadVaultData(backend);
    const today = todayISO();
    const { groups, unplannedTasks } = groupTasks(tasks, today, get().taskOrder);
    const c = focusCounts(tasks, today);
    set({
      parsedTasks: tasks,
      notes,
      noteContents: contents,
      groups,
      unplannedTasks,
      counts: { yapilacak: c.yapilacak, geciken: c.geciken, planlanmamis: c.planlanmamis },
    });
    void refreshTrash();
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

    pomo: { focusMin: FOCUS_MIN, shortBreak: 5, longBreak: 15, rounds: 4 },
    pomoSound: true,
    pomoRemaining: FOCUS_MIN * 60,
    pomoRunning: false,
    pomoPhase: "work",
    pomoCompleted: 0,
    pomoHistory: {},
    pomoBreakActive: false,
    pomoBreakRunning: false,
    pomoBreakRemaining: 0,
    pomoBreakLong: false,

    toggleTheme: () => set((s) => ({ theme: s.theme === "light" ? "dark" : "light" })),
    setTheme: (theme) => set({ theme }),
    setScreen: (screen) => set({ screen }),
    setLayout: (layout) => set({ layout }),
    setLang: (lang) => set({ lang }),
    setEditorTab: (editorTab) => set({ editorTab }),
    openNote: async (nameOrPath, edit = true) => {
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
      if (/^\d{4}-\d{2}-\d{2}/.test(note.name)) {
        const cur = s.noteContents[note.path] ?? (await backend.readNote(note.path));
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
    closeTab: (path) =>
      set((s) => {
        const openTabs = s.openTabs.filter((p) => p !== path);
        const pinnedTabs = s.pinnedTabs.filter((p) => p !== path);
        const wasActive = s.activeNote === path || s.activeDraw === path;
        if (!wasActive) return { openTabs, pinnedTabs };
        const next = openTabs[openTabs.length - 1] ?? null;
        const clearNote = s.activeNote === path ? null : s.activeNote;
        const clearDraw = s.activeDraw === path ? null : s.activeDraw;
        if (!next)
          return { openTabs, pinnedTabs, activeNote: clearNote, activeDraw: clearDraw, draft: "", draftPath: null };
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
      }),
    setDraft: (draft) => set({ draft }),
    toggleEditing: () => set((s) => ({ editing: !s.editing })),
    toggleBacklinks: () => set((s) => ({ backlinksCollapsed: !s.backlinksCollapsed })),
    saveNote: async () => {
      const s = get();
      if (!s.activeNote) return;
      // GÜVENLİK: taslak başka bir nota aitse ASLA yazma (yanlış içeriğin yanlış dosyaya
      // yazılıp notu bozmasını engeller — bkz NOTE_SAFETY_RULES.md).
      if (s.draftPath !== s.activeNote) return;
      // Gereksiz yazma yok: içerik değişmediyse dosyaya dokunma (NOTE_SAFETY_RULES kural 5).
      if (s.draft === s.noteContents[s.activeNote]) return;
      await backend.writeNote(s.activeNote, s.draft);
      // Hafif kayıt: tüm dosyaları yeniden okumadan bellekte güncelle + görevleri yeniden hesapla.
      const noteContents = { ...s.noteContents, [s.activeNote]: s.draft };
      const tasks = s.notes.flatMap((n) =>
        n.kind === "draw" ? [] : parseTasks(n.path, noteContents[n.path] ?? "")
      );
      const today = todayISO();
      const { groups, unplannedTasks } = groupTasks(tasks, today, s.taskOrder);
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
        const patch: Partial<AppState> = { pomoRunning: running };
        if (running) {
          // Yeni 25 dk başladı → varsa mola kaybolur.
          if (s.pomoBreakActive) {
            patch.pomoBreakActive = false;
            patch.pomoBreakRunning = false;
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
        pomoPhase: "work",
        pomoRemaining: s.pomo.focusMin * 60,
        pomoBreakActive: false,
        pomoBreakRunning: false,
        pomoBreakRemaining: 0,
      })),
    tickPomo: () => {
      const s = get();
      if (s.pomoRemaining > 1) {
        set({ pomoRemaining: s.pomoRemaining - 1 });
        return;
      }
      // Odak seansı bitti → seriyi işaretle ve molayı TEKLİF et (otomatik başlamaz).
      if (s.pomoSound) playChime("end");
      const completed = s.pomoCompleted + 1;
      const isLong = completed % s.pomo.rounds === 0;
      // Tamamlanan odak seansını rapor geçmişine işle (bugünün ISO tarihi).
      const day = todayISO();
      const pomoHistory = { ...s.pomoHistory, [day]: (s.pomoHistory[day] ?? 0) + 1 };
      set({
        pomoCompleted: completed,
        pomoRunning: false,
        pomoRemaining: s.pomo.focusMin * 60, // ana sayaç sıradaki odak için hazır
        pomoHistory,
        pomoBreakActive: true,
        pomoBreakRunning: false,
        pomoBreakLong: isLong,
        pomoBreakRemaining: (isLong ? s.pomo.longBreak : s.pomo.shortBreak) * 60,
      });
    },
    tickBreak: () => {
      const s = get();
      if (!s.pomoBreakActive) return;
      if (s.pomoBreakRemaining > 1) {
        set({ pomoBreakRemaining: s.pomoBreakRemaining - 1 });
        return;
      }
      // Mola bitti → kaybolur. Uzun moladan sonra tur sayacını sıfırla.
      if (s.pomoSound) playChime("break-end");
      set({
        pomoBreakActive: false,
        pomoBreakRunning: false,
        pomoCompleted: s.pomoBreakLong ? 0 : s.pomoCompleted,
      });
    },
    toggleBreak: () =>
      set((s) => {
        if (!s.pomoBreakActive) return {};
        const running = !s.pomoBreakRunning;
        if (running && s.pomoSound) playChime("break-start");
        return { pomoBreakRunning: running };
      }),
    skipBreak: () =>
      set((s) => ({
        pomoBreakActive: false,
        pomoBreakRunning: false,
        pomoCompleted: s.pomoBreakLong ? 0 : s.pomoCompleted,
      })),
    setPomo: (patch) =>
      set((s) => {
        const pomo = { ...s.pomo, ...patch };
        // Çalışmıyorken odak süresi değişirse kalan süreyi senkronla.
        const sync = !s.pomoRunning && s.pomoPhase === "work" && patch.focusMin != null;
        return { pomo, ...(sync ? { pomoRemaining: pomo.focusMin * 60 } : {}) };
      }),

    // İlk yükleme: önce sample, sonra (Tauri'de) kayıtlı kasa varsa onu yükle.
    bootstrap: async () => {
      // Sample seed (şablonlar) — hata olsa bile akışı durdurma.
      ensureTemplates(backend).catch(() => {});
      await loadFromBackend();
      if (isTauri()) {
        const [mobile, os] = await Promise.all([appIsMobile(), appPlatform()]);
        set({ platformMobile: mobile, platformOs: os });
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
      await get().switchVault(path);
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
          draftPath: null,
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
      set({ vaults: s.vaults.map((v) => (v.path === oldPath ? { ...v, path: newPath } : v)) });
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
    reopenVault: async (path) => {
      if (!isTauri()) return;
      try {
        const prev = get();
        const prevPath = prev.vaultPath;
        const isSwitch = prevPath !== path;
        // Mevcut kasanın açık sekmelerini sakla (geri dönülünce geri yüklenir).
        const tabsByVault: Record<string, VaultTabs> = prevPath
          ? {
              ...prev.tabsByVault,
              [prevPath]: {
                openTabs: prev.openTabs,
                pinnedTabs: prev.pinnedTabs,
                activeNote: prev.activeNote,
                activeDraw: prev.activeDraw,
              },
            }
          : prev.tabsByVault;

        const next = createTauriBackend(path);
        // Erişimi doğrula (kapsam/taşınma) — başarısızsa catch.
        await next.listNotes();
        backend = next;
        localStorage.setItem(VAULT_KEY, path);
        // Şablon klasörünü loadFromBackend'den ÖNCE oluştur ki Şablonlar hemen görünsün.
        try {
          await ensureTemplates(backend);
        } catch {
          /* şablon seed ölümcül değil */
        }
        await loadFromBackend();

        // Kasayı listeye ekle (yoksa); ilk (migrasyon) kasa eski ghRepo'yu devralır.
        const cur = get();
        const exists = cur.vaults.some((v) => v.path === path);
        const firstEver = cur.vaults.length === 0;
        const vaults = exists
          ? cur.vaults
          : [...cur.vaults, { path, repo: firstEver ? cur.ghRepo ?? null : null }];
        const entry = vaults.find((v) => v.path === path)!;

        const patch: Partial<AppState> = { vaultPath: path, vaults, ghRepo: entry.repo, tabsByVault };
        // Kasa değiştiyse (ya da global sekmeler boşsa) hedef kasanın sekmelerini geri yükle.
        if (isSwitch || prev.openTabs.length === 0) {
          const saved = tabsByVault[path] ?? { openTabs: [], pinnedTabs: [], activeNote: null, activeDraw: null };
          const has = (p: string) => cur.notes.some((n) => n.path === p);
          const openTabs = saved.openTabs.filter(has);
          const pinnedTabs = saved.pinnedTabs.filter(has);
          const activeNote = saved.activeNote && has(saved.activeNote) ? saved.activeNote : null;
          const activeDraw = saved.activeDraw && has(saved.activeDraw) ? saved.activeDraw : null;
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

        unwatch?.();
        unwatch = await watchVaultRoot(path, () => get().reloadVault());
      } catch {
        // Açılamadı (taşınmış/silinmiş/izin yok): mevcut durumu koru.
      }
    },

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
    saveDraw: async (json) => {
      const path = get().activeDraw;
      if (!path) return;
      await backend.writeNote(path, json);
      set((s) => ({ noteContents: { ...s.noteContents, [path]: json } }));
    },
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
      const clean = newName.trim().replace(/[/\\]/g, "").replace(/\.md$/i, "");
      if (!clean) return;
      const to = note.folder ? `${note.folder}/${clean}.md` : `${clean}.md`;
      if (to === path || s.notes.some((n) => n.path === to)) return; // çakışma / değişmedi
      await backend.rename(path, to);
      set({
        openTabs: s.openTabs.map((p) => (p === path ? to : p)),
        activeNote: s.activeNote === path ? to : s.activeNote,
        draftPath: s.draftPath === path ? to : s.draftPath, // taslak ↔ dosya bağı korunur
      });
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
      const map = new Map<string, string>();
      for (const n of affected) {
        const np = to + n.path.slice(folderPath.length);
        map.set(n.path, np);
        await backend.rename(n.path, np);
      }
      set({
        openTabs: s.openTabs.map((p) => map.get(p) ?? p),
        activeNote: s.activeNote ? map.get(s.activeNote) ?? s.activeNote : null,
        draftPath: s.draftPath ? map.get(s.draftPath) ?? s.draftPath : null,
      });
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
          : { draft: "", draftPath: null }
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
      // Görevler günlük nottan ayrı: ayrı "Yapılacaklar.md" dosyasına eklenir.
      if (!(await backend.exists(TASKS_FILE))) await backend.writeNote(TASKS_FILE, "# Yapılacaklar\n");
      const content = await backend.readNote(TASKS_FILE);
      const next = insertTaskUnderHeading(content, TODO_HEADING, buildTaskLine(text, todayISO()));
      await backend.writeNote(TASKS_FILE, next);
      set({ quickText: "" });
      await loadFromBackend();
    },

    toggleTask: async (id) => {
      const sep = id.lastIndexOf(":");
      const file = id.slice(0, sep);
      const line = Number(id.slice(sep + 1));
      const content = await backend.readNote(file);
      await backend.writeNote(file, toggleTaskInContent(content, line, todayISO()));
      await loadFromBackend();
    },

    selectTask: (selectedTask) => set({ selectedTask }),

    // Görev detayını (açıklama/tarih/öncelik) dosyaya yaz.
    updateTask: async (id, patch) => {
      const s = get();
      const sep = id.lastIndexOf(":");
      const file = id.slice(0, sep);
      const line = Number(id.slice(sep + 1));
      const task = s.parsedTasks.find((p) => p.file === file && p.line === line);
      if (!task) return;
      const content = await backend.readNote(file);
      await backend.writeNote(file, applyTaskPatch(content, line, task, patch));
      await loadFromBackend();
    },

    // Görevi tek yazımda kaydet: satır yaması + (varsa) girintili çocuk bloğu (alt görevler + notlar).
    saveTask: async (id, patch, notes, subtasks) => {
      const s = get();
      const sep = id.lastIndexOf(":");
      const file = id.slice(0, sep);
      const line = Number(id.slice(sep + 1));
      const task = s.parsedTasks.find((p) => p.file === file && p.line === line);
      if (!task) return;
      const content = await backend.readNote(file);
      let next = applyTaskPatch(content, line, task, patch);
      // Alt görevler ve notlar aynı çocuk bloğunu paylaşır — tek seferde birlikte yazılır.
      if (notes !== undefined || subtasks !== undefined) {
        const subs = subtasks ?? getSubtasks(next, line).map((x) => ({ text: x.text, done: x.done }));
        const nts = notes ?? getTaskNotes(next, line);
        next = setTaskChildren(next, line, subs, nts);
      }
      await backend.writeNote(file, next);
      await loadFromBackend();
    },

    // Görev sırasını değiştir (sürükle-bırak): sürüklenen görevi hedefin ÖNÜNE/ARKASINA tam yerleştir.
    // Uygulama düzeyi manuel sıra (dosyadan bağımsız, dosyalar arası çalışır, kalıcı).
    // Farklı bir gün grubuna bırakılırsa görev o güne yeniden planlanır (tarih dosyaya yazılır).
    reorderTask: async (fromId, toId, position) => {
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
    },

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
      };
    },
    {
      name: "loomen.settings",
      // Rehydrate sonrası: kayıtlı kasayı backend olarak yeniden aç (HMR/yeniden başlatmada
      // vaultPath kaybolup "Kasa seç"e düşmesin).
      onRehydrateStorage: () => (state) => {
        if (state?.vaultPath && isTauri()) {
          queueMicrotask(() => void useAppStore.getState().reopenVault(state.vaultPath!));
        }
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
      }),
    }
  )
);

/** "Bugüne Odaklan" sayaçları — gerçek vault verisinden. */
export function useFocusCounts(): FocusCounts {
  return useAppStore((s) => s.counts);
}
