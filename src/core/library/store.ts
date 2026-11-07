// Kütüphanenin kalıcı hâli (LOM-83).
//
// İki yer var:
//  1) Kasa: `Kütüphane/<id>.json` (kayıt) + kitabın notu. GitHub senkronuna dahil. Emsal:
//     habit/store.ts — bozuk dosya "broken" listesine girer ve ASLA üstüne yazılmaz.
//  2) Uygulama klasörü (kasa DIŞI): `<appData>/loomen#library/<id>.<biçim>` kitap dosyası
//     ve `covers/<id>.<png|jpg>` kapak. Cihaza özeldir, eşitlenmez (K2).

import type { VaultBackend } from "../vault/types";
import { BOOK_ID_RE, decodeBook, encodeBook } from "./codec";
import { noteBookId } from "./noteSync";
import { LIBRARY_DIR, LIBRARY_FILES_DIR, type Book } from "./types";

/** Yüklenen kasa durumu; kaydetme ve silme bununla yapılır. */
export interface LibraryVault {
  /** Diskteki klasör adı (macOS'ta NFD olabilir). */
  dirName: string;
  /** id → diskte son görülen/yazılan metin. */
  raw: Record<string, string>;
  /** Okunamayan dosyaların adları. */
  broken: string[];
}

export interface LoadedLibrary extends LibraryVault {
  books: Book[];
}

const nfc = (s: string) => s.normalize("NFC");
const JSON_EXT = /\.json$/;
const pathOf = (v: LibraryVault, id: string) => `${v.dirName}/${id}.json`;

/** Kökteki Kütüphane klasörünün diskteki adı (NFC/NFD fark etmez); yoksa LIBRARY_DIR. */
export async function findLibraryDir(backend: VaultBackend): Promise<string> {
  if (!backend.listDir) return LIBRARY_DIR;
  const want = nfc(LIBRARY_DIR);
  const hit = (await backend.listDir("")).find((e) => e.isDirectory && nfc(e.name) === want);
  return hit ? hit.name : LIBRARY_DIR;
}

/** Bütün kayıtları oku. Bozuk dosyalar atlanır, adları `broken`a yazılır. */
export async function loadBooks(backend: VaultBackend): Promise<LoadedLibrary> {
  const dirName = await findLibraryDir(backend);
  const out: LoadedLibrary = { dirName, raw: {}, broken: [], books: [] };
  if (!backend.listDir) return out;
  const entries = await backend.listDir(dirName);
  for (const e of entries) {
    if (e.isDirectory || !JSON_EXT.test(e.name)) continue;
    const fileId = e.name.replace(JSON_EXT, "");
    let text: string;
    try {
      text = await backend.readNote(`${dirName}/${e.name}`);
    } catch {
      out.broken.push(e.name);
      continue;
    }
    const book = decodeBook(text);
    if (!book || book.id !== fileId) {
      out.broken.push(e.name);
      continue;
    }
    out.raw[book.id] = text;
    out.books.push(book);
  }
  out.books.sort((a, b) => a.addedAt - b.addedAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  out.broken.sort();
  return out;
}

const isBroken = (v: LibraryVault, id: string) => v.broken.some((f) => f.replace(JSON_EXT, "") === id);

/**
 * Kaydı yaz. İçerik değişmediyse diske dokunmaz (false). Bozuk dosyanın ya da yüklemede
 * görülmemiş ama diskte duran dosyanın üstüne yazmaz.
 */
export async function saveBook(backend: VaultBackend, book: Book, v: LibraryVault): Promise<boolean> {
  if (!BOOK_ID_RE.test(book.id)) throw new Error(`Geçersiz kitap kimliği: ${book.id}`);
  if (isBroken(v, book.id)) throw new Error(`Okunamayan kitap kaydının üstüne yazılmaz: ${book.id}.json`);
  const text = encodeBook(book);
  const known = v.raw[book.id];
  if (known === text) return false;
  const path = pathOf(v, book.id);
  if (known === undefined && (await backend.exists(path))) {
    throw new Error(`Yüklenmemiş kitap kaydının üstüne yazılmaz: ${book.id}.json`);
  }
  await backend.ensureDir(v.dirName);
  await backend.writeNote(path, text);
  v.raw[book.id] = text;
  return true;
}

/** Kaydı çöp kutusuna taşı (kalıcı silmez). Not ve kitap dosyası ayrıca ele alınır. */
export async function removeBook(backend: VaultBackend, id: string, v: LibraryVault): Promise<void> {
  if (!BOOK_ID_RE.test(id)) throw new Error(`Geçersiz kitap kimliği: ${id}`);
  await backend.trashNote(pathOf(v, id));
  delete v.raw[id];
  v.broken = v.broken.filter((f) => f.replace(JSON_EXT, "") !== id);
}

/**
 * Kitabın notunu bul. Önce kayıttaki yol (içinde başka kitabın kimliği yoksa); taşınmışsa
 * ön maddedeki `loomen-book` kimliğiyle aranır. Bulunamazsa null.
 */
export function locateBookNote(contents: Record<string, string>, book: Pick<Book, "id" | "notePath">): string | null {
  const own = contents[book.notePath];
  if (own !== undefined) {
    const id = noteBookId(own);
    if (id === null || id === book.id) return book.notePath;
  }
  const hits = Object.keys(contents)
    .filter((p) => p.endsWith(".md") && noteBookId(contents[p]) === book.id)
    .sort();
  return hits[0] ?? null;
}

// ─── Uygulama klasöründeki dosyalar ───────────────────────────────────────────────

/** Kitap dosyası ve kapak deposu (gerçeği Tauri, testte bellek). Adlar klasöre göredir. */
export interface BookFileStore {
  read(name: string): Promise<Uint8Array>;
  write(name: string, data: Uint8Array): Promise<void>;
  exists(name: string): Promise<boolean>;
  remove(name: string): Promise<void>;
}

const SAFE_NAME_RE = /^(covers\/)?[A-Za-z0-9_-]{1,64}\.(pdf|epub|png|jpg)$/;

function assertName(name: string): void {
  if (!SAFE_NAME_RE.test(name)) throw new Error(`Geçersiz kütüphane dosya adı: ${name}`);
}

export function coverFileName(bookId: string, mime: string): string {
  return `covers/${bookId}.${/jpe?g/i.test(mime) ? "jpg" : "png"}`;
}

/**
 * Tauri: `<appData>/loomen#library`. Kasa klasörünün dışındadır — mobilde kasalar da
 * appData altında durur; adın neden böyle olduğu `LIBRARY_FILES_DIR` açıklamasında.
 */
export function createTauriBookFiles(): BookFileStore {
  let rootP: Promise<string> | null = null;
  const root = () =>
    (rootP ??= (async () => {
      const { appDataDir, join } = await import("@tauri-apps/api/path");
      return join(await appDataDir(), LIBRARY_FILES_DIR);
    })());
  const full = async (name: string) => {
    assertName(name);
    const { join } = await import("@tauri-apps/api/path");
    return join(await root(), ...name.split("/"));
  };
  return {
    async read(name) {
      const fs = await import("@tauri-apps/plugin-fs");
      return fs.readFile(await full(name));
    },
    async write(name, data) {
      const fs = await import("@tauri-apps/plugin-fs");
      const { join } = await import("@tauri-apps/api/path");
      const parts = name.split("/");
      const dir = parts.length > 1 ? await join(await root(), parts[0]) : await root();
      if (!(await fs.exists(dir))) await fs.mkdir(dir, { recursive: true });
      const target = await full(name);
      // Yarım dosya kalmasın: önce yan dosyaya yaz, sonra yerine taşı.
      const tmp = `${target}.tmp`;
      await fs.writeFile(tmp, data);
      await fs.rename(tmp, target);
    },
    async exists(name) {
      const fs = await import("@tauri-apps/plugin-fs");
      return fs.exists(await full(name));
    },
    async remove(name) {
      const fs = await import("@tauri-apps/plugin-fs");
      const p = await full(name);
      if (await fs.exists(p)) await fs.remove(p);
    },
  };
}

/** Bellek içi depo (testler ve tarayıcı önizlemesi). */
export function createMemoryBookFiles(): BookFileStore & { files: Map<string, Uint8Array> } {
  const files = new Map<string, Uint8Array>();
  return {
    files,
    async read(name) {
      assertName(name);
      const f = files.get(name);
      if (!f) throw new Error(`Dosya yok: ${name}`);
      return f;
    },
    async write(name, data) {
      assertName(name);
      files.set(name, data);
    },
    async exists(name) {
      assertName(name);
      return files.has(name);
    },
    async remove(name) {
      assertName(name);
      files.delete(name);
    },
  };
}
