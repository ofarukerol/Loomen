import { readDir, readTextFile, writeTextFile, exists, mkdir, rename, remove } from "@tauri-apps/plugin-fs";
import type { VaultBackend, VaultNote } from "./types";
import { TRASH_DIR, encodeTrashName, toTrashEntry, type TrashEntry } from "./trash";

// Gerçek dosya sistemi adapter'ı (Tauri). Vault kökü mutlak yol; içeride göreli yollar kullanılır.
export function createTauriBackend(root: string): VaultBackend {
  const abs = (rel: string) => `${root}/${rel}`;

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
    readNote: (p) => readTextFile(abs(p)),
    writeNote: (p, c) => writeTextFile(abs(p), c),
    exists: (p) => exists(abs(p)),
    ensureDir: async (d) => {
      if (d) await mkdir(abs(d), { recursive: true });
    },
    rename: async (from, to) => {
      const dir = to.split("/").slice(0, -1).join("/");
      if (dir) await mkdir(abs(dir), { recursive: true });
      await rename(abs(from), abs(to));
    },

    trashNote: async (path) => {
      await mkdir(abs(TRASH_DIR), { recursive: true });
      const trashName = encodeTrashName(path, Date.now());
      await rename(abs(path), abs(`${TRASH_DIR}/${trashName}`));
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
      const dir = target.split("/").slice(0, -1).join("/");
      if (dir) await mkdir(abs(dir), { recursive: true });
      await rename(abs(`${TRASH_DIR}/${trashName}`), abs(target));
      return target;
    },
    purgeTrashItem: async (trashName) => {
      await remove(abs(`${TRASH_DIR}/${trashName}`));
    },
  };
}
