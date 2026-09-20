import {
  readDir,
  readTextFile,
  writeTextFile,
  readFile,
  writeFile,
  exists,
  mkdir,
  rename,
  remove,
} from "@tauri-apps/plugin-fs";
import type { VaultBackend, VaultNote } from "./types";
import { TRASH_DIR, encodeTrashName, toTrashEntry, type TrashEntry } from "./trash";

/**
 * Vault içi göreli yolu doğrula.
 *
 * `abs()` yolu kökün sonuna yapıştırdığı için doğrulanmamış bir yol vault'un dışına
 * çıkabilir: "../../.ssh/id_rsa" ya da "/etc/passwd" kök dışına yazar. Yol bir not
 * adından, bir bağlantıdan ya da senkron edilmiş bir dosyadan gelebilir — hiçbiri
 * güvenilir değil. Kural: göreli, boş olmayan, ".." parçası taşımayan yol.
 */
function safeRel(rel: string): string {
  const p = rel.replace(/\\/g, "/"); // Windows ayırıcısı da aynı kuralı görsün
  const bad =
    !p ||
    p.startsWith("/") || // mutlak (POSIX) ya da UNC ("\\\\sunucu" → "//sunucu")
    /^[A-Za-z]:/.test(p) || // mutlak (Windows sürücü harfi)
    p.split("/").includes(".."); // üst klasöre çıkış
  if (bad) throw new Error(`Vault dışına çıkan yol reddedildi: ${rel}`);
  return p;
}

// Gerçek dosya sistemi adapter'ı (Tauri). Vault kökü mutlak yol; içeride göreli yollar kullanılır.
export function createTauriBackend(root: string): VaultBackend {
  const abs = (rel: string) => `${root}/${safeRel(rel)}`;

  async function walk(dirAbs: string, relDir: string, out: VaultNote[]): Promise<void> {
    const entries = await readDir(dirAbs);
    for (const e of entries) {
      if (e.name.startsWith(".")) continue; // .veridian/.git vb. atla
      const childRel = relDir ? `${relDir}/${e.name}` : e.name;
      if (e.isDirectory) {
        await walk(`${dirAbs}/${e.name}`, childRel, out);
      } else if (e.name.toLowerCase().endsWith(".md")) {
        out.push({ path: childRel, name: e.name.replace(/\.md$/i, ""), folder: relDir, kind: "note" });
      } else if (e.name.toLowerCase().endsWith(".excalidraw")) {
        out.push({ path: childRel, name: e.name.replace(/\.excalidraw$/i, ""), folder: relDir, kind: "draw" });
      }
    }
  }

  return {
    async listNotes() {
      const out: VaultNote[] = [];
      await walk(root, "", out);
      return out;
    },
    // async: safeRel reddi senkron fırlatma değil, reddedilmiş promise olarak çıksın.
    readNote: async (p) => readTextFile(abs(p)),
    /**
     * Notu atomik yaz: önce yan dosyaya (`.tmp`), sonra rename ile yerine koy.
     * Doğrudan yazmada işlem ortasında çökme/pil bitmesi notu yarım bırakır — yani
     * kullanıcının yazdığını siler. Rename tek adımdır: ya eski ya yeni içerik görünür.
     * `.tmp` uzantısı walk()'ın uzantı süzgecine takılmaz, ağaçta görünmez.
     */
    writeNote: async (p, c) => {
      const target = abs(p);
      const tmp = `${target}.tmp`;
      await writeTextFile(tmp, c);
      try {
        await rename(tmp, target); // std::fs::rename — hedefin üzerine yazar
      } catch (err) {
        // Rename olmadıysa not kaybolmasın: doğrudan yazıp yan dosyayı temizle.
        await writeTextFile(target, c);
        await remove(tmp).catch(() => {});
        console.warn("Atomik yazma rename'de başarısız, doğrudan yazıldı:", err);
      }
    },
    readBinary: async (p) => readFile(abs(p)),
    writeBinary: async (p, data) => {
      const dir = safeRel(p).split("/").slice(0, -1).join("/");
      if (dir) await mkdir(abs(dir), { recursive: true });
      await writeFile(abs(p), data);
    },
    exists: async (p) => exists(abs(p)),
    ensureDir: async (d) => {
      if (d) await mkdir(abs(d), { recursive: true });
    },
    rename: async (from, to) => {
      const dir = safeRel(to).split("/").slice(0, -1).join("/");
      if (dir) await mkdir(abs(dir), { recursive: true });
      await rename(abs(from), abs(to));
    },

    trashNote: async (path) => {
      const safePath = safeRel(path);
      await mkdir(abs(TRASH_DIR), { recursive: true });
      const trashName = encodeTrashName(safePath, Date.now());
      await rename(abs(safePath), abs(`${TRASH_DIR}/${trashName}`));
    },
    listTrash: async () => {
      if (!(await exists(abs(TRASH_DIR)))) return [];
      const entries = await readDir(abs(TRASH_DIR));
      const out: TrashEntry[] = [];
      for (const e of entries) {
        if (e.isDirectory) continue;
        const t = toTrashEntry(e.name);
        if (t) out.push(t);
      }
      return out.sort((a, b) => b.deletedAt - a.deletedAt);
    },
    restoreFromTrash: async (trashName) => {
      const t = toTrashEntry(trashName);
      if (!t) throw new Error("Geçersiz çöp kaydı");
      // Hedef doluysa çakışmayı önlemek için ad türet.
      let target = t.originalPath;
      if (await exists(abs(target))) {
        const dot = target.lastIndexOf(".");
        const base = dot > 0 ? target.slice(0, dot) : target;
        const ext = dot > 0 ? target.slice(dot) : "";
        target = `${base} (geri yüklendi ${Date.now()})${ext}`;
      }
      const dir = safeRel(target).split("/").slice(0, -1).join("/");
      if (dir) await mkdir(abs(dir), { recursive: true });
      await rename(abs(`${TRASH_DIR}/${trashName}`), abs(target));
      return target;
    },
    purgeTrashItem: async (trashName) => {
      await remove(abs(`${TRASH_DIR}/${trashName}`));
    },
  };
}
