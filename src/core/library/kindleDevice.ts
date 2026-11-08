// Bağlı Kindle'ı bulma ve çizim dosyasını okuma (LOM-84). Tauri'ye bağlı; tarayıcıda null.
//
// Kindle kabloyla bağlanınca USB disk olarak görünür; çizimler kökteki `documents/My Clippings.txt`
// dosyasındadır. Aranan yerler (salt okuma izni `capabilities/default.json`):
//  - macOS: `/Volumes/<disk>/documents/My Clippings.txt`
//  - Linux: `/media/<kullanıcı>/<disk>/…`, `/media/<disk>/…`, `/run/media/<kullanıcı>/<disk>/…`
//  - Windows: sürücü harfleri için izin kalıbı güvenli yazılamadığından otomatik tanıma yok;
//    "Kindle'dan al" dosya seçtirir (seçilen dosya izne kendiliğinden girer).
// Hiçbir hata dışarı sızmaz: bulunamazsa null döner, "Kindle'dan al" dosya seçtirmeye geçer.

import { isTauri } from "../vault";
import { CLIPPINGS_FILE_NAME } from "./kindle";

const DOCS = "documents";

type Fs = typeof import("@tauri-apps/plugin-fs");

async function fileExists(fs: Fs, path: string): Promise<boolean> {
  try {
    return await fs.exists(path);
  } catch {
    return false;
  }
}

/** Klasördeki alt klasör adları; okunamazsa boş. */
async function subDirs(fs: Fs, dir: string): Promise<string[]> {
  try {
    const list = await fs.readDir(dir);
    return list.filter((e) => e.isDirectory || e.isSymlink).map((e) => e.name);
  } catch {
    return [];
  }
}

function isWindows(): boolean {
  return typeof navigator !== "undefined" && /Windows/i.test(navigator.userAgent);
}

function isMobileUa(): boolean {
  return typeof navigator !== "undefined" && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

/**
 * Bağlı disklerin kökünde `relPath` dosyasını ara (Kindle LOM-84, Kobo LOM-95); bulunamazsa (ya da
 * tarayıcı/mobil/Windows) null. Birden çok disk varsa ilk bulunan döner. Hata dışarı sızmaz.
 * Aranan kökler: macOS `/Volumes/<disk>`, Linux `/media/<disk>`, `/media/<kullanıcı>/<disk>`,
 * `/run/media/<kullanıcı>/<disk>`.
 * Her yol için `capabilities/default.json`'da salt okuma izni bulunmalıdır.
 */
export async function findOnMountedDisks(relPath: string): Promise<string | null> {
  if (!isTauri() || isMobileUa() || isWindows()) return null;
  try {
    const fs = await import("@tauri-apps/plugin-fs");
    const probeRoot = async (root: string): Promise<string | null> => {
      const p = `${root}/${relPath}`;
      return (await fileExists(fs, p)) ? p : null;
    };
    // macOS
    for (const name of await subDirs(fs, "/Volumes")) {
      const hit = await probeRoot(`/Volumes/${name}`);
      if (hit) return hit;
    }
    // Linux: /media/<disk>, /media/<kullanıcı>/<disk>, /run/media/<kullanıcı>/<disk>
    for (const name of await subDirs(fs, "/media")) {
      const direct = await probeRoot(`/media/${name}`);
      if (direct) return direct;
      for (const disk of await subDirs(fs, `/media/${name}`)) {
        const hit = await probeRoot(`/media/${name}/${disk}`);
        if (hit) return hit;
      }
    }
    for (const user of await subDirs(fs, "/run/media")) {
      for (const disk of await subDirs(fs, `/run/media/${user}`)) {
        const hit = await probeRoot(`/run/media/${user}/${disk}`);
        if (hit) return hit;
      }
    }
  } catch (e) {
    console.warn("[library] bağlı disk aranamadı:", e);
  }
  return null;
}

/**
 * Bağlı Kindle'ın çizim dosyasının yolu; bulunamazsa (ya da tarayıcı/mobil) null.
 * Birden çok disk varsa ilk bulunan döner.
 */
export function findKindleClippings(): Promise<string | null> {
  return findOnMountedDisks(`${DOCS}/${CLIPPINGS_FILE_NAME}`);
}

/** Çizim dosyasının metni (UTF-8; baştaki görünmez işaret ayrıştırıcıda temizlenir). */
export async function readClippingsText(path: string): Promise<string> {
  const fs = await import("@tauri-apps/plugin-fs");
  return fs.readTextFile(path);
}
