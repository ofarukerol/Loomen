// Bağlı Kobo'yu bulma ve veritabanını okuma (LOM-95). Tauri'ye bağlı; tarayıcıda null.
//
// Kobo kabloyla bağlanınca USB disk olarak görünür; çizimler kökteki gizli `.kobo/KoboReader.sqlite`
// veritabanındadır. Aranan yerler Kindle ile aynı (`findOnMountedDisks`, salt okuma izni
// `capabilities/default.json`). Windows'ta ve mobilde otomatik tanıma yok: "Kobo'dan al" dosya
// seçtirir. Hiçbir hata dışarı sızmaz: bulunamazsa null döner.

import { findOnMountedDisks } from "./kindleDevice";
import { KOBO_DB_PATH } from "./kobo";

/** Bağlı Kobo'nun veritabanı yolu; bulunamazsa (ya da tarayıcı/mobil/Windows) null. */
export function findKoboDatabase(): Promise<string | null> {
  return findOnMountedDisks(KOBO_DB_PATH);
}

/** Veritabanının baytları (salt okuma; dosyaya yazılmaz). */
export async function readKoboDatabase(path: string): Promise<Uint8Array> {
  const fs = await import("@tauri-apps/plugin-fs");
  return fs.readFile(path);
}
